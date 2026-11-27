// Pure data of the pigeons (no React): the bird mesh with its wing/head attributes, the shader hooks and the perches.
import * as THREE from "three";
import { HOUSES, PAGODA, POND } from "../zones";
import { seeded } from "./geom";
import { buildHouse } from "./kit";

const PART_BODY = 0;
const PART_HEAD = 2;

// ------------------------------------------------------------------ geometry

/** One bird, facing +z, ~250 tris: tapered body, iridescent neck, head with an orange eye, beak, legs, tail and two hinged wings. */
export function buildPigeonGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const wing: number[] = [];
  const add = (g: THREE.BufferGeometry, part: number, shade: (x: number, y: number, z: number, i: number) => THREE.Color, flat = false) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.attributes.normal || flat) ng.computeVertexNormals();
    const p = ng.attributes.position;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(ng.attributes.normal.getX(i), ng.attributes.normal.getY(i), ng.attributes.normal.getZ(i));
      const c = shade(p.getX(i), p.getY(i), p.getZ(i), i);
      col.push(c.r, c.g, c.b);
      wing.push(part);
    }
  };
  const C = (hex: string) => new THREE.Color(hex);
  const flat = (hex: string) => () => C(hex);

  // body: blue-grey back, paler belly, white rump patch, a soft darker breast
  const body = new THREE.SphereGeometry(0.09, 8, 5).scale(0.95, 0.84, 1.45).rotateX(-0.22).translate(0, 0.125, 0);
  add(body, PART_BODY, (x, y, z) => {
    if (z < -0.07 && y > 0.12) return C("#e8ecf2"); // rump
    if (y < 0.115) return C("#b9c2d0");
    return C("#7f8fa8").lerp(C("#9aa8bf"), THREE.MathUtils.clamp((z + 0.1) * 4, 0, 1));
  });
  // neck: a short cone that shimmers green and magenta (iridescent patch drawn with vertex colours)
  const neck = new THREE.CylinderGeometry(0.043, 0.066, 0.1, 7, 1, true).rotateX(0.52).translate(0, 0.208, 0.108);
  add(neck, PART_HEAD, (x, y, z) => {
    const a = Math.atan2(x, z - 0.108);
    const t = 0.5 + 0.5 * Math.sin(a * 2.2 + y * 38);
    return C("#2f8f78").lerp(C("#9a4f9f"), t).lerp(C("#5a6f8c"), THREE.MathUtils.clamp(0.75 - (y - 0.16) * 6, 0, 0.6));
  });
  // head, beak (grey with a white cere), eyes (orange iris)
  const head = new THREE.SphereGeometry(0.038, 7, 5).scale(0.92, 0.95, 1.12).translate(0, 0.252, 0.142);
  add(head, PART_HEAD, (x, y) => (y > 0.258 ? C("#7a8aa3") : C("#6a7b96")));
  add(new THREE.ConeGeometry(0.011, 0.045, 4).rotateX(Math.PI / 2).translate(0, 0.246, 0.2), PART_HEAD, (x, y, z) => (z < 0.185 ? C("#f1eee6") : C("#3b3430")));
  for (const s of [-1, 1]) add(new THREE.OctahedronGeometry(0.0085, 0).translate(s * 0.031, 0.26, 0.151), PART_HEAD, flat("#e0551f"));
  // legs and feet (pink)
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.0045, 0.0045, 0.075, 3, 1, true).translate(s * 0.032, 0.045, 0.005), PART_BODY, flat("#c0606c"));
    add(new THREE.BoxGeometry(0.03, 0.006, 0.05).translate(s * 0.032, 0.004, 0.018), PART_BODY, flat("#b34f5e"));
  }
  // tail: a fanned dark plate with a black end band
  const tail = new THREE.PlaneGeometry(0.1, 0.15, 1, 2).rotateX(-Math.PI / 2 + 0.18).translate(0, 0.118, -0.215);
  add(tail, PART_BODY, (x, y, z) => (z < -0.255 ? C("#1b1f28") : C("#4a5566")));
  // wings (drawn spread; the shader folds them back): 3 spanwise x 4 chordwise quads each, tapering to a tip,
  // with the typical pigeon pattern: pale coverts, two black bars, dark primaries
  const rowCols = ["#8794ab", "#1f2430", "#a3afc2", "#222936", "#394150"];
  for (const side of [-1, 1]) {
    const verts: number[] = [];
    const cols: number[] = [];
    const sh = new THREE.Vector3(side * 0.05, 0.17, 0);
    const span = 0.2;
    const grid: THREE.Vector3[][] = [];
    for (let i = 0; i <= 3; i++) {
      const u = i / 3;
      const lead = 0.06 - u * 0.04;
      const trail = -0.115 - u * 0.05 + u * u * 0.05;
      const row: THREE.Vector3[] = [];
      for (let j = 0; j <= 4; j++) row.push(new THREE.Vector3(sh.x + side * u * span, sh.y - u * 0.012, lead + (trail - lead) * (j / 4)));
      grid.push(row);
    }
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        const a = grid[i][j];
        const b = grid[i + 1][j];
        const c = grid[i + 1][j + 1];
        const d = grid[i][j + 1];
        const q = side > 0 ? [a, d, c, a, c, b] : [a, b, c, a, c, d];
        for (const v of q) verts.push(v.x, v.y, v.z);
        const cc = C(rowCols[j]).lerp(C("#2b323f"), i === 2 ? 0.35 : 0);
        for (let n = 0; n < 6; n++) cols.push(cc.r, cc.g, cc.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    let k = 0;
    add(g, side, () => new THREE.Color(cols[k * 3], cols[k * 3 + 1], cols[k++ * 3 + 2]));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute("aWing", new THREE.Float32BufferAttribute(wing, 1));
  return out;
}

/** Own material (never the shared clay): lit, vertex-coloured, with the wing hinge and head bob in the vertex shader. */
export function buildPigeonMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aWing;\nattribute vec3 aAnim;")
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
        if (aWing > 0.5 || aWing < -0.5) {
          if (abs(aWing) < 1.5) {
            float side = sign(aWing);
            vec3 sh = vec3(side * 0.05, 0.17, 0.0);
            vec3 o = transformed - sh;
            float f = aAnim.y;                       // 0 spread (flying) .. 1 folded (on the ground)
            float yaw = side * 1.42 * f;
            float c = cos(yaw), s = sin(yaw);
            o = vec3(o.x * c + o.z * s, o.y, -o.x * s + o.z * c);
            float ang = (sin(aAnim.x) * 0.8 + 0.12) * (1.0 - f) - 0.95 * f;
            float ca = cos(ang * side), sa = sin(ang * side);
            o = vec3(o.x * ca - o.y * sa, o.x * sa + o.y * ca, o.z);
            transformed = sh + o;
          }
        }
        if (aWing > 1.5) transformed.z += sin(aAnim.x) * 0.02 * aAnim.z;`,
      );
  };
  m.customProgramCacheKey = () => "pigeon-wing";
  return m;
}

// ------------------------------------------------------------------ perches

export type Spot = { x: number; y: number; z: number; kind: "ground" | "pond" | "temple" | "roof"; roam: number };

/** Where birds can rest. Roof perches come from the HOUSES data (the real ridge of each roof). */
export function pigeonSpots(): Spot[] {
  const spots: Spot[] = [];
  const r = seeded(5);
  // the plaza in front of the Ghar (the Ghar sits at z 3.4..7)
  for (let i = 0; i < 9; i++) spots.push({ x: (r() - 0.5) * 9, y: 0, z: 7.9 + r() * 3.2, kind: "ground", roam: 1.1 });
  // the pond's stone rim (coping is 0.14 m high)
  const hx = (POND.w - 0.4) / 2;
  const hz = (POND.d - 0.4) / 2;
  for (const [dx, dz] of [[-hx + 0.2, hz + 0.15], [0, hz + 0.15], [hx - 0.2, hz + 0.15], [-hx - 0.1, 0], [hx + 0.1, 0.4], [-hx + 0.5, -hz - 0.1]] as const)
    spots.push({ x: POND.x + dx, y: 0.14, z: POND.z + dz, kind: "pond", roam: 0.15 });
  // the pagoda's plinth ledges, each step a little higher
  let y = 0;
  const top = PAGODA.base * 0.5;
  const inset = (PAGODA.base - top) / 4 / 2;
  for (let i = 0; i < 4; i++) {
    const wi = PAGODA.base - i * inset * 2;
    const hi = 1.0 - i * 0.06;
    y += hi;
    const ledge = (wi - inset) / 2;
    for (const [px, pz] of [[-ledge * 0.7, ledge], [ledge * 0.7, ledge], [-ledge, -ledge * 0.5], [ledge, ledge * 0.3]] as const)
      spots.push({ x: PAGODA.x + px, y: y + 0.02, z: PAGODA.z + pz, kind: "temple", roam: 0.2 });
  }
  // roof ridges: the long top of each house's hip roof
  HOUSES.forEach((h, idx) => {
    if (idx % 2 === 1 && idx > 6) return;
    const top = buildHouse(h).height;
    const half = h.w * 0.45 * 0.5;
    const cs = Math.cos(h.rot);
    const sn = Math.sin(h.rot);
    for (const u of [-half * 0.7, half * 0.7]) spots.push({ x: h.x + u * cs, y: top, z: h.z - u * sn, kind: "roof", roam: 0.05 });
  });
  return spots;
}

