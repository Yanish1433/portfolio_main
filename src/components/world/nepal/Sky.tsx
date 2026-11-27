"use client";

// Sky sphere that follows the camera: golden-hour / moonlit three-stop gradient above the true
// horizon (y = 0), drifting clouds, sun glow, moon and stars, and below it a sea of clouds floating
// under the island (a cloud floor traced analytically in the shader, so it has real parallax). One
// mesh, no extra draw calls; every colour is a uniform that ThemeDriver blends between day and night.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CLOUD_Y } from "./islandGeo";

export const skyUniforms = {
  uT: { value: 0 },
  uTime: { value: 0 },
  /** Unit vector toward the sun (driven by ThemeDriver from the time of day). */
  uSunDir: { value: new THREE.Vector3(-0.75, 0.2, -0.66).normalize() },
  uDayTop: { value: new THREE.Color("#3f78c0") },
  uDayMid: { value: new THREE.Color("#8fbbe3") },
  uDayHorizon: { value: new THREE.Color("#f6dcc0") },
  uNightTop: { value: new THREE.Color("#030717") },
  uNightMid: { value: new THREE.Color("#0c1736") },
  uNightHorizon: { value: new THREE.Color("#22346a") },
  uCloudDay: { value: new THREE.Color("#fff4e6") },
  uCloudDayShade: { value: new THREE.Color("#e9b99a") },
  uCloudNight: { value: new THREE.Color("#5a6aa0") },
  uFog: { value: new THREE.Color("#f2cfa4") },
  /** Weather hooks (weather/Weather.tsx): rain greys the sky and thickens clouds, mist hazes the horizon. */
  uGrey: { value: 0 },
  uMist: { value: 0 },
};

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const fragment = /* glsl */ `
#define CLOUD_Y ${CLOUD_Y.toFixed(1)}
uniform float uT;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uDayTop, uDayMid, uDayHorizon, uNightTop, uNightMid, uNightHorizon, uFog;
uniform float uGrey, uMist;
uniform vec3 uCloudDay, uCloudDayShade, uCloudNight;
varying vec3 vDir;

float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
float noise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise2(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float elev = degrees(asin(clamp(d.y, -1.0, 1.0)));
  float h = elev;                            // degrees above the true horizon (the island has no ridge to hide it)
  float az = atan(d.x, -d.z);                // 0 = north

  // sky gradient: warm haze at the horizon, clear blue overhead (three stops)
  float k = clamp(h / 34.0, 0.0, 1.0);
  vec3 day = mix(mix(uDayHorizon, uDayMid, smoothstep(0.0, 0.22, k)), uDayTop, smoothstep(0.18, 0.9, k));
  vec3 night = mix(mix(uNightHorizon, uNightMid, smoothstep(0.0, 0.2, k)), uNightTop, smoothstep(0.15, 0.85, k));
  vec3 col = mix(day, night, uT);

  // sun: soft low glow in the west-north-west by day
  vec3 sunDir = normalize(uSunDir);
  float sd = max(dot(d, sunDir), 0.0);
  col += vec3(1.0, 0.7, 0.38) * (pow(sd, 6.0) * 0.28 + pow(sd, 40.0) * 0.45) * (1.0 - uT);
  col += vec3(1.0, 0.95, 0.8) * smoothstep(0.9988, 0.9996, sd) * (1.0 - uT);

  // moon by night (north-east), stars
  float moonAz = 0.55;
  vec2 mp = vec2((az - moonAz) * 57.3, h - 9.0);
  float md = length(mp);
  col = mix(col, vec3(0.95, 0.96, 1.0), smoothstep(1.35, 1.15, md) * uT);
  col += vec3(0.55, 0.65, 1.0) * exp(-md * 0.45) * 0.35 * uT;
  vec2 sg = vec2(az * 120.0, h * 2.2);
  vec2 cell = floor(sg);
  float st = hash2(cell);
  float tw = step(0.985, st) * smoothstep(0.22, 0.0, length(fract(sg) - 0.5)) * clamp(h / 3.0, 0.0, 1.0);
  col += vec3(tw) * uT * 0.9 * step(2.5, md);

  // drifting clouds (only where the sky is in view above the horizon)
  if (elev > 0.0) {
    vec2 cp = d.xz / (d.y + 0.14) * 1.25 + vec2(uTime * 0.006, uTime * 0.002);
    float f = fbm(cp);
    float cover = smoothstep(0.5 - 0.22 * uGrey, 0.78 - 0.18 * uGrey, f) * smoothstep(0.5, 9.0, h);
    float lightSide = clamp(0.72 + (fbm(cp + vec2(0.06, 0.04)) - f) * 4.0, 0.0, 1.0);
    vec3 cday = mix(uCloudDayShade, uCloudDay, lightSide);
    vec3 cc = mix(cday, uCloudNight * (0.7 + 0.5 * lightSide), uT);
    col = mix(col, cc, cover * mix(0.7, 0.45, uT));
  }

  // sea of clouds under the island: trace the ray onto a cloud floor at y = CLOUD_Y
  if (d.y < -0.0004) {
    float tt = (cameraPosition.y - CLOUD_Y) / -d.y;
    vec2 cp = (cameraPosition.xz + d.xz * tt) * 0.011 + vec2(uTime * 0.0035, uTime * 0.0012);
    float f = fbm(cp) * 0.72 + fbm(cp * 2.7 + 5.0) * 0.28;
    float cover = smoothstep(0.36, 0.5, f);
    float lit = clamp(0.62 + (fbm(cp + vec2(0.05, 0.035)) - fbm(cp)) * 6.0 + (f - 0.5) * 0.9, 0.0, 1.0);
    vec3 topDay = mix(vec3(0.66, 0.73, 0.88), vec3(1.0, 0.97, 0.92), lit);
    vec3 moonDir = normalize(vec3(0.5, 0.2, -0.84));
    float sheen = pow(max(dot(d * vec3(1.0, -1.0, 1.0), moonDir), 0.0), 6.0);
    vec3 topNight = uCloudNight * (0.55 + 0.7 * lit) + vec3(0.5, 0.6, 1.0) * sheen * 0.28 * cover;
    vec3 top = mix(topDay, topNight, uT);
    vec3 gap = mix(vec3(0.34, 0.52, 0.78), uNightMid * 0.6, uT);
    vec3 sea = mix(gap, top, cover);
    // sun glow on the cloud tops by day
    float sg2 = pow(max(dot(normalize(vec3(d.x, -d.y * 0.4, d.z)), sunDir), 0.0), 8.0);
    sea += vec3(1.0, 0.72, 0.42) * sg2 * 0.18 * cover * (1.0 - uT);
    // far clouds melt into the haze colour that the island's fog also uses
    col = mix(uFog, sea, smoothstep(900.0, 160.0, tt));
  } else {
    // haze right on the horizon (same colour as the fog)
    col = mix(col, uFog, smoothstep(2.2, 0.0, h));
  }
  // weather: rain desaturates and darkens, mist melts the lower sky toward the fog colour
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, vec3(lum) * mix(vec3(0.82, 0.88, 0.96), vec3(0.85, 0.9, 1.0), uT) * 0.88, uGrey * 0.75);
  col = mix(col, uFog, uMist * (1.0 - smoothstep(0.0, 40.0, elev)) * 0.8);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

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
  useFrame(({ camera, clock }) => {
    if (!mesh.current) return;
    mesh.current.position.copy(camera.position);
    skyUniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh ref={mesh} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[150, 48, 24]} />
    </mesh>
  );
}
