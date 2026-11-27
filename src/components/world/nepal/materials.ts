// About a dozen shared materials for the whole town. Theme-driven values
// (window glow, gold emissive, flames, glows) are written straight onto these
// objects by ThemeDriver each frame; no React re-render is involved.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { MatKey } from "./geom";
import { getTextures } from "./textures";
import { leafAtlasPixels } from "./trees";

/**
 * Screen-space see-through circle around the avatar: fragments of buildings
 * that are closer to the camera than the avatar are dithered away, so the
 * fixed 45° camera never loses the player behind the pagoda.
 * xy = avatar in drawing-buffer pixels, z = radius px, w = avatar view depth.
 */
export const occlusion = { value: new THREE.Vector4(-1e5, -1e5, 1, 0) };
export const timeUniform = { value: 0 };
/** 0..1: how wet the paving is (weather/WeatherLayer.tsx writes it). Shared object, so no recompiles. */
export const wetUniform = { value: 0 };

const DITHER = /* glsl */ `
uniform vec4 uOccl;
float occlBayer(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float b[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (b[i] + 0.5) / 16.0;
}
void occlDiscard(float viewDepth) {
  // How far this fragment is in front of the avatar along the camera ray. Roofs that sit much
  // closer to the camera than the avatar clear a wider circle, so a big foreground roof
  // doesn't swallow the part of the scene the avatar is looking at.
  float gap = uOccl.w - viewDepth - 1.2;
  if (gap <= 0.0) return;
  float rad = uOccl.z * (1.0 + min(gap / 4.0, 2.0));
  float r = length(gl_FragCoord.xy - uOccl.xy) / max(rad, 1.0);
  if (r < 1.0) {
    float fade = smoothstep(1.0, 0.55, r) * 0.82;
    if (occlBayer(gl_FragCoord.xy) < fade) discard;
  }
}
`;

function withOcclusion<T extends THREE.MeshStandardMaterial>(m: T, extraVertex?: (s: string) => string, cacheKey?: string): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOccl = occlusion;
    shader.uniforms.uTime = timeUniform;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${DITHER}`)
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n occlDiscard(vViewPosition.z);");
    if (extraVertex) shader.vertexShader = extraVertex(shader.vertexShader);
  };
  m.customProgramCacheKey = () => `occl${extraVertex ? `-${cacheKey ?? "wave"}` : ""}`;
  return m;
}

/** Wet look for paving / brick: darker albedo, lower roughness, driven by the shared uWet uniform (chains any existing patch; the cache key is fixed). */
function addWet(m: THREE.MeshStandardMaterial, key: string) {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.uWet = wetUniform;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uWet;")
      .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb *= 1.0 - 0.32 * uWet;")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, roughnessFactor * 0.42, uWet);");
  };
  m.customProgramCacheKey = () => `${prevKey.call(m)}-wet-${key}`;
}

/** Banner cloth: free end flutters, top edge (uv.y = 1) stays fixed. */
const wave = (s: string) =>
  s
    .replace("#include <common>", "#include <common>\nuniform float uTime;")
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float wv = (1.0 - uv.y);
      float ph = position.x * 0.9 + position.z * 0.7;
      transformed.x += sin(uTime * 2.1 + ph + uv.y * 4.0) * 0.12 * wv;
      transformed.z += cos(uTime * 1.7 + ph * 1.3 + uv.y * 3.0) * 0.09 * wv;`,
    );

/** Crown sway: the whole crown moves with height, each leaf card (aCentre, aFlut) also flutters on its own. */
const sway = (s: string) =>
  s
    .replace("#include <common>", "#include <common>\nuniform float uTime;\nattribute float aFlut;\nattribute vec3 aCentre;")
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float hgt = max(aCentre.y - 1.2, 0.0) * 0.22;
      float wph = aCentre.x * 0.55 + aCentre.z * 0.47;
      vec3 sw = vec3(sin(uTime * 0.9 + wph) * 0.05 + sin(uTime * 1.7 + wph * 2.1) * 0.02, 0.0, cos(uTime * 0.8 + wph * 1.3) * 0.04) * hgt;
      float cph = aCentre.x * 3.1 + aCentre.y * 2.3 + aCentre.z * 2.7;
      vec3 offc = position - aCentre;
      // each card twists a little about its centre and bobs: the corners move by different amounts
      transformed += sw;
      transformed += normalize(normal) * sin(uTime * (2.6 + fract(cph) * 1.6) + cph + dot(offc, vec3(5.0, 7.0, 6.0))) * 0.045 * aFlut;
      transformed.y += sin(uTime * 3.3 + cph * 1.7) * 0.015 * aFlut;`,
    );

/** Leaf fragment: bent normals are not flipped on the back face, and light shines through the leaves toward the camera. */
const leafFragment = (s: string) =>
  s
    .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n normal = normalize(vNormal);\n#endif")
    .replace(
      "#include <opaque_fragment>",
      `#if NUM_DIR_LIGHTS > 0
      {
        // fake translucency: the sun behind the leaf, seen from the camera, glows through it (tinted by the leaf colour)
        vec3 lv = normalize(vViewPosition);
        float back = pow(clamp(dot(directionalLights[0].direction, -lv), 0.0, 1.0), 2.5);
        outgoingLight += diffuseColor.rgb * directionalLights[0].color * back * 0.7 * (0.55 + 0.45 * diffuseColor.g);
      }
      #endif
      #if NUM_HEMI_LIGHTS > 0
      // leaves are thin: some sky light always gets through (scales with the day / night hemisphere light)
      outgoingLight += diffuseColor.rgb * (hemisphereLights[0].skyColor + hemisphereLights[0].groundColor) * 0.28;
      #endif
      #include <opaque_fragment>`,
    );

export const LEAF_ALPHA = 0.42;
let leafAtlas: THREE.DataTexture | null = null;
/** The generated 2x2 leaf atlas (trees.ts): alpha-cut leaf clusters, no photograph. */
export function getLeafAtlas() {
  if (!leafAtlas) {
    const size = 512;
    const t = new THREE.DataTexture(leafAtlasPixels(size), size, size, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    t.needsUpdate = true;
    leafAtlas = t;
  }
  return leafAtlas;
}

/** Shadow-pass material for the chautari tree: same alpha cut as the leaves, so the cards cast leaf-shaped shadows. */
export function createLeafDepthMaterial() {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: getLeafAtlas(), alphaTest: LEAF_ALPHA, side: THREE.DoubleSide });
}

function leafMaterial() {
  const m = withOcclusion(
    new THREE.MeshStandardMaterial({ vertexColors: true, map: getLeafAtlas(), alphaTest: LEAF_ALPHA, alphaToCoverage: true, roughness: 0.78, side: THREE.DoubleSide }),
    sway,
    "sway",
  );
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.fragmentShader = leafFragment(shader.fragmentShader);
  };
  m.customProgramCacheKey = () => "occl-leaf-cards";
  return m;
}

/** Lit-from-inside windows: aLit picks which ones glow; uT blends day->night. */
function windowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 },
      uDay: { value: new THREE.Color("#2a1a12") },
      uNight: { value: new THREE.Color("#ffb45c").multiplyScalar(2.2) },
      uOff: { value: new THREE.Color("#0a0710") },
      uOccl: occlusion,
    },
    vertexShader: /* glsl */ `
      attribute float aLit;
      varying float vLit;
      varying float vDepth;
      varying vec2 vUv;
      void main() {
        vLit = aLit;
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uT;
      uniform vec3 uDay;
      uniform vec3 uNight;
      uniform vec3 uOff;
      varying float vLit;
      varying float vDepth;
      varying vec2 vUv;
      ${DITHER}
      void main() {
        occlDiscard(vDepth);
        float edge = smoothstep(0.0, 0.25, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        vec3 night = mix(uOff, uNight * (0.75 + 0.25 * edge), vLit);
        gl_FragColor = vec4(mix(uDay, night, uT), 1.0);
        #include <colorspace_fragment>
      }`,
    toneMapped: false,
  });
}

let envTex: THREE.Texture | null = null;
/** A small room environment so gold and water have something to reflect. */
export function getEnvironment(gl: THREE.WebGLRenderer) {
  if (!envTex) {
    const pm = new THREE.PMREMGenerator(gl);
    envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  return envTex;
}

export type Materials = ReturnType<typeof createMaterials>;

function createMaterials() {
  const t = getTextures();
  t.lattice.repeat.set(1.6, 1.6);
  const std = (p: THREE.MeshStandardMaterialParameters) => withOcclusion(new THREE.MeshStandardMaterial({ vertexColors: true, ...p }));
  const mats = {
    brick: std({ map: t.brick.map, bumpMap: t.brick.bump, bumpScale: 1.2, roughness: 0.92 }),
    wood: std({ map: t.wood.map, bumpMap: t.wood.bump, bumpScale: 1.5, roughness: 0.78, color: "#ffffff" }),
    roof: std({ map: t.roof.map, bumpMap: t.roof.bump, bumpScale: 1.5, roughness: 0.82 }),
    plain: std({ roughness: 0.92 }),
    gold: std({ color: "#d4a62a", metalness: 0.75, roughness: 0.32, emissive: "#ff9a2e", emissiveIntensity: 0 }),
    lattice: std({ map: t.lattice, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, vertexColors: false }),
    window: windowMaterial(),
    clay: std({ roughness: 0.85, color: "#ffffff" }),
    cloth: withOcclusion(
      new THREE.MeshStandardMaterial({ vertexColors: true, map: t.cloth, side: THREE.DoubleSide, roughness: 0.95 }),
      wave,
    ),
    leaf: leafMaterial(),
    water: new THREE.MeshStandardMaterial({ color: "#2f6170", roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.88 }),
    slab: new THREE.MeshStandardMaterial({ map: t.slab.map, bumpMap: t.slab.bump, bumpScale: 1.5, roughness: 0.9 }),
    ground: new THREE.MeshStandardMaterial({ map: t.ground.map, bumpMap: t.ground.bump, bumpScale: 1.3, roughness: 0.95 }),
    terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
    /** Flames, lantern cores, sparks: plain unlit colour, pushed > 1 at night for bloom. */
    flame: new THREE.MeshBasicMaterial({ color: "#ffb347", toneMapped: false }),
    /** Additive light halos (Points). */
    halo: new THREE.PointsMaterial({
      map: t.glow,
      color: "#ffae4a",
      size: 0.7,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  };
  // Ground wear: soft dust / moss patches and a darker, mossier foot against the town wall, so the
  // herringbone isn't one flat tone. Pure shader maths on the world position (no extra texture).
  mats.ground.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGp;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGp = position.xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vGp;
float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), f.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), f.x), f.y); }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
{
  float n = gn(vGp * 0.28) * 0.55 + gn(vGp * 1.1) * 0.3 + gn(vGp * 4.0) * 0.15;
  vec3 tint = mix(vec3(0.86, 0.82, 0.78), vec3(1.08, 1.04, 0.98), n);
  float rr = length(vGp);
  float foot = smoothstep(21.0, 26.2, rr);
  tint = mix(tint, tint * vec3(0.7, 0.76, 0.6), foot * (0.55 + 0.45 * gn(vGp * 0.9)));
  diffuseColor.rgb *= tint;
}`,
      );
  };
  mats.ground.customProgramCacheKey = () => "ground-wear";
  for (const [k, m] of [["ground", mats.ground], ["slab", mats.slab], ["brick", mats.brick]] as const) addWet(m, k);
  return mats;
}

let cache: Materials | null = null;
export function getMaterials(): Materials {
  if (!cache) cache = createMaterials();
  return cache;
}

export const materialFor = (key: MatKey): THREE.Material => getMaterials()[key];

/** Keys whose merged meshes cast shadows. */
export const CASTS: Record<MatKey, boolean> = {
  brick: true,
  wood: true,
  roof: true,
  plain: true,
  gold: true,
  lattice: false,
  window: false,
  clay: true,
  cloth: false,
  water: false,
  slab: false,
};
