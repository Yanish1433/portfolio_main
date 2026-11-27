// Imperative three.js bits of the dance: a Nepal flag on a wooden pole in Lakhey's right hand and a soft
// flag-coloured aura behind him. Both exist in the draw list ONLY while dancing (+1 call each, no more).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FLAG_BLUE, FLAG_BORDER, FLAG_CRIMSON, FLAG_HEIGHT, flagEmblems, nepalFlagShape } from "./nepalFlag";
import { GRIP_AXIS, GRIP_OFFSET, popScale, stepPop, waveAmp } from "./danceMath";

const POLE_LEN = 1.25; // m, world units
const POLE_BELOW = 0.3; // part of the pole below the fist
const FLAG_W = 0.42; // m, flag width (height = 1.219 x)
const FLAG_SEGS_X = 14;
const FLAG_SEGS_Y = 17;

// --- Flag ------------------------------------------------------------------

/** The flag drawn once on a canvas (alpha outside the pennants); both sides of the cloth share it. */
export function drawFlagTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = Math.round(W * FLAG_HEIGHT);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const px = (x: number, y: number): [number, number] => [x * W, H - y * W]; // flag y up -> canvas y down
  const path = () => {
    g.beginPath();
    nepalFlagShape().forEach(([x, y], i) => {
      const [cx, cy] = px(x, y);
      if (i === 0) g.moveTo(cx, cy);
      else g.lineTo(cx, cy);
    });
    g.closePath();
  };
  g.clearRect(0, 0, W, H);
  g.save();
  path();
  g.clip();
  g.fillStyle = FLAG_CRIMSON;
  g.fillRect(0, 0, W, H);
  g.lineJoin = "miter";
  g.lineWidth = FLAG_BORDER * W * 2; // half of it falls outside the clip
  g.strokeStyle = FLAG_BLUE;
  path();
  g.stroke();
  g.restore();
  const { moon, sun } = flagEmblems();
  // Moon: a white crescent (disc minus an offset disc) with a small bowl at its heart.
  {
    const [cx, cy] = px(moon.cx, moon.cy);
    const r = moon.r * W;
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = FLAG_CRIMSON;
    g.beginPath();
    g.arc(cx, cy - r * 0.38, r * 0.86, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(cx, cy + r * 0.12, r * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  // Sun: twelve-pointed.
  {
    const [cx, cy] = px(sun.cx, sun.cy);
    const R = sun.r * W;
    g.fillStyle = "#ffffff";
    g.beginPath();
    for (let i = 0; i < sun.rays * 2; i++) {
      const a = (i / (sun.rays * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? R : R * 0.62;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
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
varying float vKind;
void main() {
  vec3 p = position;
  vec3 n = normal;
  if (aKind > 0.5) {
    float t = clamp((p.x - 0.012) / uW, 0.0, 1.0);
    float w = pow(t, 1.25); // 0 at the pole, full at the free edge
    float ph = p.x * 14.0 - uTime * 6.0 + p.y * 4.0;
    float ph2 = ph * 2.1 - uTime * 3.3 + p.y * 7.0;
    float z = uAmp * w * (sin(ph) + 0.3 * sin(ph2));
    float dzdx = uAmp * w * (14.0 * cos(ph) + 0.3 * 2.1 * 14.0 * cos(ph2));
    float dzdy = uAmp * w * (4.0 * cos(ph) + 0.3 * 7.0 * cos(ph2));
    p.z += z;
    p.x -= abs(z) * 0.12 * w;
    p.y -= uAmp * 0.25 * w * (0.5 + 0.5 * sin(ph - 1.0));
    n = normalize(vec3(-dzdx, -dzdy, 1.0));
  }
  vUv = uv;
  vKind = aKind;
  vCol = aColor;
  vN = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FLAG_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uLight;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vCol;
varying float vKind;
void main() {
  vec3 base = vCol;
  if (vKind > 0.5) {
    vec4 tex = texture2D(uMap, vUv);
    if (tex.a < 0.5) discard;
    base = tex.rgb;
  }
  vec3 n = normalize(gl_FrontFacing ? vN : -vN); // the back face is lit like the front
  vec3 L = normalize(vec3(0.35, 0.65, 0.7));
  float d = dot(n, L) * 0.5 + 0.5; // wrapped, soft
  float shade = (0.55 + 0.6 * d * d) * uLight;
  if (vKind > 0.5) shade += 0.12 * pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 6.0); // faint silk sheen
  gl_FragColor = vec4(base * shade, 1.0);
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
  const top = POLE_LEN - POLE_BELOW;
  // Pole (thin wood) and finial (small gold ball); y = 0 is the fist.
  const pole = new THREE.CylinderGeometry(0.011, 0.014, POLE_LEN, 8, 1);
  pole.translate(0, -POLE_BELOW + POLE_LEN / 2, 0);
  parts.push(paint(pole, "#6b4423", 0));
  const ball = new THREE.SphereGeometry(0.024, 10, 8);
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
      const u = mat.uniforms;
      u.uTime.value = time;
      // The cloth unfurls as the pop lands. Reduced motion: no wave at all.
      u.uAmp.value = o.reduced ? 0 : waveAmp(handSpeed) * Math.min(1, pop * 1.4);
      u.uLight.value = 1 - 0.4 * o.night;
    },
    dispose() {
      bone.remove(wrapper);
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}

// --- Aura -------------------------------------------------------------------

const AURA_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const AURA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uStrength;
uniform vec3 uCrimson;
uniform vec3 uBlue;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
void main() {
  vec2 uv = vUv - 0.5;
  float r = length(uv) * 2.0;
  float edge = 1.0 - smoothstep(0.5, 1.0, r);
  float hole = smoothstep(0.1, 0.4, r); // calm centre: the character's face stays clear
  float rise = smoothstep(0.0, 0.3, vUv.y);
  float t = uTime;
  vec2 q = vec2(uv.x * 2.6, uv.y * 2.0 - t * 0.16);
  float warp = fbm(q * 1.4 + vec2(t * 0.1, -t * 0.07));
  float swirl = uv.x * 6.5 + warp * 5.0 + sin(uv.y * 3.2 + t * 0.35) * 1.4 - t * 0.35;
  float band = sin(swirl) * 0.5 + 0.5;
  float ribbon = smoothstep(0.55, 0.95, band);
  float split = smoothstep(-0.25, 0.25, sin(uv.x * 4.2 + warp * 3.5 + uv.y * 2.0 + t * 0.2));
  vec3 col = mix(uBlue, uCrimson, split);
  float a = (0.14 * warp + 0.75 * ribbon * (0.5 + warp)) * edge * hole * rise * uStrength;
  gl_FragColor = vec4(col * 1.4, a);
}
`;

export type DanceAura = ReturnType<typeof createDanceAura>;

const _dir = new THREE.Vector3();

export function createDanceAura(scene: THREE.Object3D) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uCrimson: { value: new THREE.Color(FLAG_CRIMSON) },
      uBlue: { value: new THREE.Color("#2a5fe0") }, // a brighter take on the flag blue so it glows
    },
    vertexShader: AURA_VERT,
    fragmentShader: AURA_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  let mounted = false;
  let time = 0;
  return {
    /** `center`: the avatar's world position (chest height). Frozen time under reduced motion. */
    update(dt: number, weight: number, camera: THREE.Camera, center: THREE.Vector3, o: { reduced: boolean; night: number }) {
      if (weight <= 0.003) {
        if (mounted) {
          scene.remove(mesh);
          mounted = false;
        }
        return;
      }
      if (!mounted) {
        scene.add(mesh);
        mounted = true;
      }
      if (!o.reduced) time += dt;
      _dir.copy(center).sub(camera.position).normalize();
      mesh.position.copy(center).addScaledVector(_dir, 1.6);
      mesh.quaternion.copy(camera.quaternion);
      mesh.scale.setScalar(4.4);
      mat.uniforms.uTime.value = o.reduced ? 3.1 : time;
      mat.uniforms.uStrength.value = weight * (0.75 + 0.55 * o.night) * (o.reduced ? 0.7 : 1);
    },
    dispose() {
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}
