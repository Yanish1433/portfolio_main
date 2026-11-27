"use client";

// Baked props: bells, diyo oil lamps, lanterns, decorative pots and marigold garlands, plus the
// pigeons (Pigeons.tsx, one instanced mesh) and the fireflies.
import { useEffect, useMemo } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { DHARA, TEA_STALL } from "../zones";
import { lathe, sag, seeded } from "./geom";
import { getMaterials } from "./materials";
import { getTextures } from "./textures";
import { buildTown } from "./Town";
import Pigeons from "./Pigeons";
import { register, themeState, themeTargets } from "./themeState";

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

type Inst = { p: THREE.Vector3; s?: number | THREE.Vector3; r?: number; c?: THREE.ColorRepresentation };

/**
 * Bakes repeated props into ONE static geometry (position, normal, colour): the instances never
 * move, so merging them costs the same triangles as instancing but shares a single draw call
 * with every other kind that uses the same material.
 */
function bake(parts: { geo: THREE.BufferGeometry; items: Inst[] }[]): THREE.BufferGeometry | null {
  const list: THREE.BufferGeometry[] = [];
  for (const { geo, items } of parts) {
    const base = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(base.attributes)) if (!["position", "normal", "color"].includes(k)) base.deleteAttribute(k);
    const n = base.attributes.position.count;
    if (!base.attributes.color) base.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    for (const it of items) {
      const g = base.clone();
      _q.setFromEuler(_e.set(0, it.r ?? 0, 0));
      if (it.s instanceof THREE.Vector3) _s.copy(it.s);
      else _s.setScalar(it.s ?? 1);
      g.applyMatrix4(_m.compose(it.p, _q, _s));
      if (it.c !== undefined) {
        _c.set(it.c);
        const col = g.attributes.color as THREE.BufferAttribute;
        for (let i = 0; i < n; i++) col.setXYZ(i, col.getX(i) * _c.r, col.getY(i) * _c.g, col.getZ(i) * _c.b);
      }
      list.push(g);
    }
  }
  if (!list.length) return null;
  const out = mergeGeometries(list, false);
  out.computeBoundingSphere();
  return out;
}

// ------------------------------------------------------------------ geometry

/** Shared materials use vertexColors; give instanced geometry a white colour attribute. */
function white<G extends THREE.BufferGeometry>(g: G): G {
  const n = g.attributes.position.count;
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}

// decorative clay pot (0.6 m wide, 0.58 m tall at scale 1)
const potGeo = white(lathe([[0, 0], [0.18, 0], [0.27, 0.12], [0.3, 0.26], [0.22, 0.42], [0.13, 0.5], [0.15, 0.56], [0.13, 0.58]], 10));
const bellGeo = white(lathe([[0, 0.14], [0.03, 0.13], [0.05, 0.06], [0.06, 0], [0, 0]], 5));
const bowlGeo = white(lathe([[0, 0], [0.07, 0.0], [0.1, 0.035], [0.09, 0.05], [0, 0.03]], 6));
const flameGeo = new THREE.ConeGeometry(0.028, 0.09, 5, 1, true).translate(0, 0.09, 0);
const lanternGeo = (() => {
  const g = new THREE.CylinderGeometry(0.11, 0.13, 0.32, 6);
  return white(g);
})();
const beadGeo = white(new THREE.OctahedronGeometry(0.06, 0));

export default function Props({ lite, reducedMotion }: { lite: boolean; reducedMotion: boolean }) {
  const town = useMemo(buildTown, []);
  const mats = getMaterials();

  const bells = useMemo(() => town.anchors.bells.map((p) => ({ p })), [town]);

  // ---- diyos (bowl + flame + halo); fewer on mobile
  const diyos = useMemo(() => {
    const all = [...town.anchors.diyos];
    return (lite ? all.filter((_, i) => i % 2 === 0) : all).map((p) => ({ p }));
  }, [town, lite]);

  // ---- lanterns
  const lanterns = useMemo(() => {
    const l = [...town.anchors.lanterns, new THREE.Vector3(TEA_STALL.x - 1.25, 2.0, TEA_STALL.z - 1.15), new THREE.Vector3(TEA_STALL.x - 1.25, 2.0, TEA_STALL.z + 1.15)];
    return l.map((p) => ({ p }));
  }, [town]);

  // ---- decorative stacks of drying pots around the tea stall (the skills are the prayer wheels, wheels/WheelGallery.tsx)
  const pots = useMemo(() => {
    const out: { p: THREE.Vector3; s: number; r: number; c: string }[] = [];
    const r = seeded(77);
    // stacked pyramids of drying pots
    const stack = (x: number, z: number, layers: number) => {
      for (let l = 0; l < layers; l++) {
        const n = layers - l;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++)
            out.push({
              p: new THREE.Vector3(x + (i - (n - 1) / 2) * 0.42, 0.02 + l * 0.42, z + (j - (n - 1) / 2) * 0.42),
              s: 0.55,
              r: r() * 6,
              c: r() > 0.5 ? "#b8693f" : "#9b5434",
            });
      }
    };
    if (!lite) {
      stack(TEA_STALL.x + 0.5, TEA_STALL.z + 1.9, 2);
      stack(-14, 8.0, 2);
    }
    return out;
  }, [lite]);

  // ---- marigold garlands (orange/yellow beads with a green leaf now and then)
  const beads = useMemo(() => {
    const out: { p: THREE.Vector3; c: string }[] = [];
    for (const g of town.anchors.garlands) {
      sag(g.a, g.b, g.drop, 0.1).forEach((p, i) => out.push({ p, c: i % 9 === 4 ? "#4f7a2c" : i % 3 === 0 ? "#ffc21a" : "#f2860f" }));
    }
    return out;
  }, [town]);

  // Every static little prop that used its own InstancedMesh is baked into ONE clay mesh (+ one
  // unlit "flame" mesh): bells, oil-lamp bowls, lantern bodies, pots and garland beads.
  const clayGeo = useMemo(
    () =>
      bake([
        { geo: bellGeo, items: bells.map((b) => ({ p: b.p, c: "#e0b860" })) },
        { geo: bowlGeo, items: diyos.map((d) => ({ p: d.p, c: "#a65a36" })) },
        { geo: lanternGeo, items: lanterns.map((l) => ({ p: l.p, c: "#5a3a28" })) },
        { geo: potGeo, items: pots },
        { geo: beadGeo, items: beads },
      ]),
    [bells, diyos, lanterns, pots, beads],
  );
  const flameGeos = useMemo(
    () =>
      bake([
        { geo: flameGeo, items: diyos },
        { geo: lanternGeo, items: lanterns.map((l) => ({ p: l.p, s: new THREE.Vector3(0.75, 0.7, 0.75) })) },
      ]),
    [diyos, lanterns],
  );

  // ---- halos (additive glow sprites) for diyos and lanterns
  const halos = useMemo(() => {
    const d = new THREE.BufferGeometry().setFromPoints(diyos.map((x) => x.p.clone().add(new THREE.Vector3(0, 0.12, 0))));
    const l = new THREE.BufferGeometry().setFromPoints(lanterns.map((x) => x.p));
    return { d, l };
  }, [diyos, lanterns]);
  const lanternHalo = useMemo(() => {
    const m = mats.halo.clone();
    m.size = 2.0;
    return m;
  }, [mats]);
  useEffect(() => {
    const offs = [
      register(themeTargets.halos, { mat: mats.halo, day: 0, night: 0.9 }),
      register(themeTargets.halos, { mat: lanternHalo, day: 0, night: 0.75 }),
    ];
    // lamps that may receive one of the pooled point lights
    themeTargets.lampAnchors.length = 0;
    themeTargets.lampAnchors.push(...lanterns.map((l) => l.p), ...town.lanePosts.filter((_, i) => i % 3 === 0));
    return () => offs.forEach((f) => f());
  }, [mats, lanternHalo, lanterns, town]);

  // gentle flame flicker
  useFrame((state) => {
    if (reducedMotion) return;
    const k = 1 + Math.sin(state.clock.elapsedTime * 9) * 0.06 + Math.sin(state.clock.elapsedTime * 23) * 0.03;
    mats.halo.size = 0.7 * k;
  });

  return (
    <group>
      {clayGeo && <mesh geometry={clayGeo} material={mats.clay} receiveShadow />}
      {flameGeos && <mesh geometry={flameGeos} material={mats.flame} />}
      <points geometry={halos.d} material={mats.halo} frustumCulled={false} />
      <points geometry={halos.l} material={lanternHalo} frustumCulled={false} />
      <Pigeons count={lite ? 12 : 22} reducedMotion={reducedMotion} />
      {!lite && <Fireflies />}
    </group>
  );
}

// ------------------------------------------------------------------ fireflies

/** ≤ 60 faint fireflies drifting around the water spout at night. */
function Fireflies() {
  const N = 40;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  const seeds = useMemo(() => {
    const r = seeded(42);
    return Array.from({ length: N }, () => [r() * 6, r() * 6, r() * 6, 0.6 + r()]);
  }, []);
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        map: getTextures().glow,
        color: "#d8ff7a",
        size: 0.32,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => register(themeTargets.halos, { mat, day: 0, night: 1 }), [mat]);
  useFrame((state) => {
    if (themeState.t < 0.05) return;
    const t = state.clock.elapsedTime;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    seeds.forEach(([a, b, c, s], i) => {
      pos.setXYZ(
        i,
        DHARA.x + Math.sin(t * 0.3 * s + a) * 3.2,
        0.4 + (Math.sin(t * 0.5 * s + b) * 0.5 + 0.5) * 1.6,
        DHARA.z + Math.cos(t * 0.27 * s + c) * 2.6,
      );
    });
    pos.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}
