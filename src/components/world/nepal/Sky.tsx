"use client";

// Sky dome that follows the camera: golden-hour / moonlit gradient, a faint
// Himalaya silhouette with snow caps, sun glow, moon and stars. The game
// camera looks 45° down, so the true horizon is never on screen; instead the
// mountains sit on a "virtual horizon" a fixed angle below the top edge of the
// view, so they always peek out above the valley when the far edge is visible.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export const skyUniforms = {
  uT: { value: 0 },
  uHorizon: { value: -0.5 },
  uDayTop: { value: new THREE.Color("#8fb6dc") },
  uDayHorizon: { value: new THREE.Color("#ffd49a") },
  uNightTop: { value: new THREE.Color("#040919") },
  uNightHorizon: { value: new THREE.Color("#1d2c5c") },
  uFog: { value: new THREE.Color("#f2cfa4") },
};

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const fragment = /* glsl */ `
uniform float uT;
uniform float uHorizon;
uniform vec3 uDayTop, uDayHorizon, uNightTop, uNightHorizon, uFog;
varying vec3 vDir;

float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }

// ridge line in degrees above the virtual horizon, by azimuth (radians)
float ridge(float a) {
  float h = 0.0;
  h += pow(noise1(a * 3.0 + 1.3), 1.6) * 5.2;
  h += noise1(a * 9.0 + 4.0) * 1.6;
  h += abs(noise1(a * 23.0) - 0.5) * 1.1;
  return h + 0.4;
}

void main() {
  vec3 d = normalize(vDir);
  float elev = degrees(asin(clamp(d.y, -1.0, 1.0)));
  float h = elev - degrees(uHorizon);       // degrees above the virtual horizon
  float az = atan(d.x, -d.z);                // 0 = north

  // sky gradient
  float k = clamp(h / 14.0, 0.0, 1.0);
  vec3 day = mix(uDayHorizon, uDayTop, pow(k, 0.7));
  vec3 night = mix(uNightHorizon, uNightTop, pow(k, 0.6));
  vec3 col = mix(day, night, uT);

  // sun glow by day (low in the west-southwest), moon by night (north-east)
  vec3 sunDir = normalize(vec3(-0.75, 0.0, -0.66));
  float sa = max(dot(normalize(vec3(d.x, 0.0, d.z)), sunDir), 0.0);
  col += vec3(1.0, 0.62, 0.28) * pow(sa, 10.0) * (1.0 - k) * 0.55 * (1.0 - uT);
  float moonAz = 0.55;
  vec2 mp = vec2((az - moonAz) * 57.3, h - 9.0);
  float md = length(mp);
  col = mix(col, vec3(0.95, 0.96, 1.0), smoothstep(1.35, 1.15, md) * uT);
  col += vec3(0.55, 0.65, 1.0) * exp(-md * 0.45) * 0.35 * uT;

  // stars
  vec2 sg = vec2(az * 120.0, h * 2.2);
  vec2 cell = floor(sg);
  float st = hash2(cell);
  float tw = step(0.985, st) * smoothstep(0.22, 0.0, length(fract(sg) - 0.5)) * clamp(h / 3.0, 0.0, 1.0);
  col += vec3(tw) * uT * 0.9 * step(2.5, md);

  // Himalaya silhouette with snow caps
  float r = ridge(az);
  if (h < r) {
    float depth = clamp((r - h) / 4.0, 0.0, 1.0);
    float snowLine = r - 1.1 - noise1(az * 31.0) * 0.9;
    vec3 rockDay = vec3(0.56, 0.61, 0.72);
    vec3 snowDay = vec3(1.0, 0.93, 0.86);
    vec3 rockNight = vec3(0.12, 0.16, 0.27);
    vec3 snowNight = vec3(0.62, 0.69, 0.86);
    float facet = noise1(az * 60.0) * 0.12;
    vec3 rock = mix(rockDay, rockNight, uT) * (0.92 + facet);
    vec3 snow = mix(snowDay, snowNight, uT) * (0.9 + facet);
    vec3 m = h > snowLine ? snow : rock;
    // haze toward the base so it melts into the valley fog
    col = mix(m, uFog, smoothstep(0.2, 1.0, depth) * 0.85 + 0.1);
  }
  // valley haze below the virtual horizon
  col = mix(col, uFog, smoothstep(0.0, -3.0, h));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const _v = new THREE.Vector3();

export default function Sky() {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        vertexShader: vertex,
        fragmentShader: fragment,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false,
      }),
    [],
  );
  useFrame(({ camera }) => {
    if (!mesh.current) return;
    mesh.current.position.copy(camera.position);
    // elevation of the top-centre ray of the view, minus a margin
    _v.set(0, 1, 0.5).unproject(camera).sub(camera.position).normalize();
    skyUniforms.uHorizon.value = Math.asin(_v.y) - THREE.MathUtils.degToRad(11);
  });
  return (
    <mesh ref={mesh} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[150, 32, 16]} />
    </mesh>
  );
}
