// About a dozen shared materials for the whole town. Theme-driven values
// (window glow, gold emissive, flames, glows) are written straight onto these
// objects by ThemeDriver each frame; no React re-render is involved.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { MatKey } from "./geom";
import { getTextures } from "./textures";

/**
 * Screen-space see-through circle around the avatar: fragments of buildings
 * that are closer to the camera than the avatar are dithered away, so the
 * fixed 45° camera never loses the player behind the pagoda.
 * xy = avatar in drawing-buffer pixels, z = radius px, w = avatar view depth.
 */
export const occlusion = { value: new THREE.Vector4(-1e5, -1e5, 1, 0) };
export const timeUniform = { value: 0 };

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
  float r = length(gl_FragCoord.xy - uOccl.xy) / max(uOccl.z, 1.0);
  if (r < 1.0 && viewDepth < uOccl.w - 1.2) {
    float fade = smoothstep(1.0, 0.55, r) * 0.82;
    if (occlBayer(gl_FragCoord.xy) < fade) discard;
  }
}
`;

function withOcclusion<T extends THREE.MeshStandardMaterial>(m: T, extraVertex?: (s: string) => string): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOccl = occlusion;
    shader.uniforms.uTime = timeUniform;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${DITHER}`)
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n occlDiscard(vViewPosition.z);");
    if (extraVertex) shader.vertexShader = extraVertex(shader.vertexShader);
  };
  m.customProgramCacheKey = () => `occl${extraVertex ? "-wave" : ""}`;
  return m;
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
