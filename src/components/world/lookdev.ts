// Character look-dev: reflections, lacquer, sharper textures and a fresnel rim
// term (a "backlight" without adding a scene light). Applied once per loaded
// material; ThemeDriver drives the per-frame values (env intensity, rim colour).
import * as THREE from "three";
import { getEnvironment } from "./nepal/materials";

/** One shared uniforms object for every character material's rim term. */
export const charRim = {
  uRimColor: { value: new THREE.Color("#ffcf8a") },
  uRimInt: { value: 0.35 },
};

/** Day -> night envMapIntensity per material name (all three characters). */
const ENV: Record<string, [number, number]> = {
  // Lower than the brief's 0.9 / 0.5: RoomEnvironment is white, and with the clearcoat
  // it washed the red lacquer out to pink from the 45° camera.
  Mask: [0.45, 0.3],
  Metal: [1.2, 0.7],
  Skin: [0.35, 0.35],
  Tunic: [0.25, 0.25],
  Robe: [0.25, 0.25],
  Hair: [0.15, 0.15],
  Clay: [0.3, 0.22],
  Suit: [0.3, 0.22],
  Trim: [0.4, 0.3],
  Visor: [1.0, 0.6],
  Screen: [0.2, 0.2],
};
const ENV_DEFAULT: [number, number] = [0.3, 0.22];

/** Character materials whose env intensity follows the theme. */
export const charMaterials: { mat: THREE.MeshStandardMaterial; day: number; night: number }[] = [];

/** original material -> look-dev'd material (clones share materials, so this runs once each). */
const swapped = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();

function addRim(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = charRim.uRimColor;
    shader.uniforms.uRimInt = charRim.uRimInt;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uRimColor;\nuniform float uRimInt;")
      .replace(
        "#include <opaque_fragment>",
        "outgoingLight += uRimColor * uRimInt * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);\n#include <opaque_fragment>",
      );
  };
  mat.customProgramCacheKey = () => "charRim";
}

function sharpen(mat: THREE.Material, anisotropy: number) {
  for (const v of Object.values(mat)) {
    // Only image textures: re-uploading a render-target texture (the PMREM envMap) throws.
    if (v instanceof THREE.Texture && !v.isRenderTargetTexture && v.image && v.anisotropy !== anisotropy) {
      v.anisotropy = anisotropy;
      v.needsUpdate = true;
    }
  }
}

/** The painted mask as lacquer: MeshPhysicalMaterial + clearcoat, maps passed explicitly. */
function lacquer(src: THREE.MeshStandardMaterial): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    name: src.name,
    color: src.color.clone(),
    map: src.map,
    normalMap: src.normalMap,
    normalScale: src.normalScale.clone(),
    roughnessMap: src.roughnessMap,
    roughness: src.roughness,
    metalnessMap: src.metalnessMap,
    metalness: src.metalness,
    aoMap: src.aoMap,
    aoMapIntensity: src.aoMapIntensity,
    emissive: src.emissive.clone(),
    emissiveMap: src.emissiveMap,
    emissiveIntensity: src.emissiveIntensity,
    side: src.side,
    transparent: src.transparent,
    alphaTest: src.alphaTest,
    clearcoat: 0.5,
    clearcoatRoughness: 0.12,
  });
  return m;
}

function lookdevMaterial(src: THREE.Material, gl: THREE.WebGLRenderer): THREE.Material {
  if (!(src as THREE.MeshStandardMaterial).isMeshStandardMaterial) return src;
  const cached = swapped.get(src);
  if (cached) return cached;
  const std = src as THREE.MeshStandardMaterial;
  const mat: THREE.MeshStandardMaterial = std.name === "Mask" ? lacquer(std) : std;
  if (std.name === "Metal") {
    mat.metalness = 1;
    mat.roughness = 0.25;
  }
  sharpen(mat, Math.min(8, gl.capabilities.getMaxAnisotropy()));
  mat.envMap = getEnvironment(gl);
  const [day, night] = ENV[std.name] ?? ENV_DEFAULT;
  mat.envMapIntensity = day;
  addRim(mat);
  mat.userData.lookdev = true;
  mat.needsUpdate = true;
  charMaterials.push({ mat, day, night });
  swapped.set(src, mat);
  return mat;
}

/** Apply the look-dev to a (cloned) character scene. */
export function applyLookdev(scene: THREE.Object3D, gl: THREE.WebGLRenderer) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => lookdevMaterial(m, gl))
      : lookdevMaterial(mesh.material, gl);
  });
}

/** Forget (and dispose the replacements of) a disposed glTF's materials. */
export function releaseLookdev(materials: THREE.Material[]) {
  for (const src of materials) {
    const m = swapped.get(src);
    if (!m) continue;
    swapped.delete(src);
    const i = charMaterials.findIndex((c) => c.mat === m);
    if (i >= 0) charMaterials.splice(i, 1);
    if (m !== src) m.dispose();
  }
}
