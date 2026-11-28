// Imperative three.js bits of the dance: a Nepal flag on a wooden pole in Lakhey's right hand and a soft
// glowing Nepal flag of light behind him. Both exist in the draw list ONLY while dancing (+1 call each, no more).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FLAG_BLUE, FLAG_CRIMSON, FLAG_HEIGHT, FLAG_WHITE, flagDesign, flagPolys } from "./nepalFlag";
import { IMPACT_TIMES } from "./impactTimes";
import { registerWarm } from "./danceWarm";
export { createDanceAura, type DanceAura } from "./danceAura";
export { danceClock, prewarmDance } from "./danceWarm";
import { GRIP_AXIS, GRIP_OFFSET, popScale, stepPop, waveAmp } from "./danceMath";

export const POLE_LEN = 2.0; // m, world units, whole pole
export const POLE_BELOW_GRIP = 1.0; // m, from the grip down to the bottom tip (reaches the ground)
export { IMPACT_TIMES };
const FLAG_SHOW_DELAY = 0.3; // s, the flag pops in this long after the dance starts
const FLAG_W = 0.6; // m, cloth width (outer, bordered); height = 1.219 x
const FLAG_SEGS_X = 18;
const FLAG_SEGS_Y = 22;

// --- Flag ------------------------------------------------------------------

/** The flag drawn once on a 1024 px tall canvas (alpha outside the cloth); both sides share it. */
export function drawFlagTexture(): THREE.CanvasTexture {
  const H = 1024;
  const W = Math.round(H / FLAG_HEIGHT);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const polys = flagPolys(flagDesign());
  const fill = (pts: readonly (readonly [number, number])[], color: string) => {
    g.fillStyle = color;
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const cx = x * W;
      const cy = H - y * W; // flag y up -> canvas y down
      if (i === 0) g.moveTo(cx, cy);
      else g.lineTo(cx, cy);
    });
    g.closePath();
    g.fill();
  };
  g.clearRect(0, 0, W, H);
  fill(polys.outer, FLAG_BLUE);
  fill(polys.inner, FLAG_CRIMSON);
  for (const w of polys.white) fill(w, FLAG_WHITE);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

const FLAG_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aKind;
uniform float uTime;
uniform float uAmp;
uniform float uW;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vCol;
varying vec3 vPos;
varying float vKind;
varying float vFold;
// Three diagonal fold waves travelling from the pole outward.
const vec2 D0 = vec2(0.92, -0.38);
const vec2 D1 = vec2(0.80, 0.60);
const vec2 D2 = vec2(0.97, -0.24);
void main() {
  vec3 p = position;
  vec3 n = normal;
  float fold = 0.0;
  if (aKind > 0.5) {
    float t = clamp((p.x - 0.012) / uW, 0.0, 1.0);
    float w = pow(t, 1.5); // 0 at the pole, growing toward the free edge
    float dw = 1.5 * sqrt(t) / uW;
    float f0 = 17.0; float f1 = 26.0; float f2 = 38.0;
    float ph0 = dot(D0, p.xy) * f0 - uTime * 5.2;
    float ph1 = dot(D1, p.xy) * f1 - uTime * 6.6;
    float ph2 = dot(D2, p.xy) * f2 - uTime * 8.4;
    float a0 = 1.0; float a1 = 0.45; float a2 = 0.22;
    float s = a0 * sin(ph0) + a1 * sin(ph1) + a2 * sin(ph2);
    float dsx = a0 * f0 * D0.x * cos(ph0) + a1 * f1 * D1.x * cos(ph1) + a2 * f2 * D2.x * cos(ph2);
    float dsy = a0 * f0 * D0.y * cos(ph0) + a1 * f1 * D1.y * cos(ph1) + a2 * f2 * D2.y * cos(ph2);
    float amp = uAmp * 0.55;
    float z = amp * w * s;
    float dzdx = amp * (dw * s + w * dsx);
    float dzdy = amp * w * dsy;
    p.z += z;
    p.x -= abs(z) * 0.1 * w;
    n = normalize(vec3(-dzdx, -dzdy, 1.0));
    fold = s;
  }
  vUv = uv;
  vKind = aKind;
  vCol = aColor;
  vFold = fold;
  vN = normalize(normalMatrix * n);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const FLAG_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uLight;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vCol;
varying vec3 vPos;
varying float vKind;
varying float vFold;
void main() {
  vec3 base = vCol;
  if (vKind > 0.5) {
    vec4 tex = texture2D(uMap, vUv);
    if (tex.a < 0.5) discard;
    base = tex.rgb;
  }
  vec3 n = normalize(gl_FrontFacing ? vN : -vN); // both sides lit alike
  vec3 L = normalize(vec3(0.35, 0.65, 0.7));
  float d = dot(n, L) * 0.5 + 0.5; // wrapped, soft
  float shade = (0.72 + 0.4 * d) * uLight; // gentle range: the crimson stays true
  vec3 col = base * shade;
  if (vKind > 0.5) {
    vec3 V = normalize(-vPos);
    vec3 H = normalize(L + V);
    col += vec3(0.07) * pow(max(dot(n, H), 0.0), 18.0) * uLight; // soft sheen
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function flagGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, color: string, kind: number) => {
    const n = g.attributes.position.count;
    const col = new THREE.Color(color);
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.toArray(a, i * 3);
    g.setAttribute("aColor", new THREE.BufferAttribute(a, 3));
    g.setAttribute("aKind", new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
    return g;
  };
  const top = POLE_LEN - POLE_BELOW_GRIP;
  // Pole (thin wood) and finial (small gold ball); y = 0 is the fist.
  const pole = new THREE.CylinderGeometry(0.012, 0.016, POLE_LEN, 8, 1);
  pole.translate(0, -POLE_BELOW_GRIP + POLE_LEN / 2, 0);
  parts.push(paint(pole, "#6b4423", 0));
  const ball = new THREE.SphereGeometry(0.026, 10, 6);
  ball.translate(0, top + 0.02, 0);
  parts.push(paint(ball, "#d4a72c", 0));
  // Cloth: x from the pole to the fly, hanging down from just below the finial.
  const h = FLAG_W * FLAG_HEIGHT;
  const cloth = new THREE.PlaneGeometry(FLAG_W, h, FLAG_SEGS_X, FLAG_SEGS_Y);
  cloth.translate(FLAG_W / 2 + 0.012, top - 0.03 - h / 2, 0);
  parts.push(paint(cloth, "#ffffff", 1));
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

// Dust puff: one flat quad with a soft expanding ring, only in the scene while it plays.
const PUFF_LIFE = 0.7;
const PUFF_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const PUFF_FRAG = /* glsl */ `
uniform float uT; // 0..1
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float ring = smoothstep(0.28, 0.0, abs(r - (0.25 + 0.7 * uT)));
  float a = ring * (1.0 - uT) * 0.55;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.78, 0.72, 0.64), a);
}
`;

export type DanceFlag = ReturnType<typeof createDanceFlag>;

export function createDanceFlag(bone: THREE.Object3D) {
  const tex = drawFlagTexture();
  const geo = flagGeometry();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex },
      uTime: { value: 0 },
      uAmp: { value: 0.08 },
      uW: { value: FLAG_W },
      uLight: { value: 1 },
    },
    vertexShader: FLAG_VERT,
    fragmentShader: FLAG_FRAG,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const puffMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: PUFF_VERT,
    fragmentShader: PUFF_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const puffGeo = new THREE.PlaneGeometry(1, 1);
  puffGeo.rotateX(-Math.PI / 2); // lies flat on the ground
  const puff = new THREE.Mesh(puffGeo, puffMat);
  puff.frustumCulled = false;
  puff.renderOrder = 2;
  let puffAge = -1; // < 0: idle (not in the scene, no draw call)
  let root: THREE.Object3D | null = null;
  let lastDance = -1;
  const tip = new THREE.Vector3();
  const stopPuff = () => {
    puffAge = -1;
    puff.removeFromParent();
  };
  const holder = new THREE.Group(); // pops (scale)
  holder.add(mesh);
  const wrapper = new THREE.Object3D(); // cancels the rig's scale so the pole stays in world metres
  wrapper.position.set(...GRIP_OFFSET);
  wrapper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...GRIP_AXIS).normalize());
  wrapper.add(holder);
  let pop = 0;
  let mounted = false;
  let scaled = false;
  let hasPrev = false;
  let handSpeed = 0;
  let time = 0;
  const prev = new THREE.Vector3();
  const cur = new THREE.Vector3();
  const ws = new THREE.Vector3();

  const startPuff = () => {
    if (!root) {
      root = bone;
      while (root.parent) root = root.parent;
    }
    bone.updateWorldMatrix(true, false);
    mesh.updateWorldMatrix(true, false);
    tip.set(0, -POLE_BELOW_GRIP, 0);
    mesh.localToWorld(tip);
    root.worldToLocal(tip);
    puff.position.copy(tip);
    puff.scale.setScalar(0.7);
    if (!puff.parent) root.add(puff);
    puffAge = 0;
    puffMat.uniforms.uT.value = 0;
  };
  const tickPuff = (dt: number) => {
    puffAge += dt;
    if (puffAge >= PUFF_LIFE) {
      stopPuff();
      return;
    }
    puffMat.uniforms.uT.value = puffAge / PUFF_LIFE;
  };

  const unregister = registerWarm(() => {
    const wasMounted = mounted;
    if (!wasMounted) bone.add(wrapper);
    const scene = (() => { let r: THREE.Object3D = bone; while (r.parent) r = r.parent; return r; })();
    scene.add(puff);
    return () => {
      puff.removeFromParent();
      if (!wasMounted) bone.remove(wrapper);
    };
  });

  return {
    /** Per frame. `on`: flag wanted (dancing, follow camera, ...). */
    update(dt: number, on: boolean, o: { reduced: boolean; night: number }) {
      pop = stepPop(pop, on, dt);
      if (pop <= 0) {
        if (mounted) {
          bone.remove(wrapper);
          mounted = false;
        }
        hasPrev = false;
        time = 0;
        lastDance = -1;
        if (puffAge >= 0) tickPuff(dt);
        return;
      }
      if (!mounted) {
        if (!scaled) {
          bone.updateWorldMatrix(true, false);
          bone.getWorldScale(ws);
          wrapper.scale.set(1 / (ws.x || 1), 1 / (ws.y || 1), 1 / (ws.z || 1));
          scaled = true;
        }
        bone.add(wrapper);
        mounted = true;
      }
      holder.scale.setScalar(Math.max(popScale(pop, on), 1e-4));
      // Hand speed (world m/s) from the bone's own world position.
      bone.getWorldPosition(cur);
      if (hasPrev && dt > 1e-4) {
        const v = cur.distanceTo(prev) / dt;
        handSpeed += (v - handSpeed) * (1 - Math.exp(-dt * 8));
      }
      prev.copy(cur);
      hasPrev = true;
      time += dt;
      const dance = time + FLAG_SHOW_DELAY;
      if (!o.reduced) {
        for (const t of IMPACT_TIMES) if (t > lastDance && t <= dance) startPuff();
      }
      lastDance = dance;
      if (puffAge >= 0) tickPuff(dt);
      const u = mat.uniforms;
      u.uTime.value = time;
      // The cloth unfurls as the pop lands. Reduced motion: no wave at all.
      u.uAmp.value = o.reduced ? 0 : waveAmp(handSpeed) * Math.min(1, pop * 1.4);
      u.uLight.value = 1 - 0.4 * o.night;
    },
    dispose() {
      unregister();
      stopPuff();
      puffGeo.dispose();
      puffMat.dispose();
      bone.remove(wrapper);
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}

