"use client";

// Instanced props: bells, diyo oil lamps, lanterns, skill pots, marigold
// garlands, trees, pigeons and fireflies. Each kind is one draw call.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { playerPos } from "../input";
import { DHARA, TEA_STALL, TREES } from "../zones";
import { potGeo } from "../skills/potGeo";
import { lathe, sag, seeded } from "./geom";
import { getMaterials } from "./materials";
import { getTextures } from "./textures";
import { buildTown, TOWN_RADIUS } from "./Town";
import { register, themeState, themeTargets } from "./themeState";

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

function useInstances(mesh: React.RefObject<THREE.InstancedMesh | null>, items: { p: THREE.Vector3; s?: number | THREE.Vector3; r?: number; c?: THREE.ColorRepresentation }[]) {
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    items.forEach((it, i) => {
      _q.setFromEuler(_e.set(0, it.r ?? 0, 0));
      if (it.s instanceof THREE.Vector3) _s.copy(it.s);
      else _s.setScalar(it.s ?? 1);
      _m.compose(it.p, _q, _s);
      m.setMatrixAt(i, _m);
      if (it.c !== undefined) m.setColorAt(i, _c.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [mesh, items]);
}

// ------------------------------------------------------------------ geometry

/** Shared materials use vertexColors; give instanced geometry a white colour attribute. */
function white<G extends THREE.BufferGeometry>(g: G): G {
  const n = g.attributes.position.count;
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}

const bellGeo = white(lathe([[0, 0.14], [0.03, 0.13], [0.05, 0.06], [0.06, 0], [0, 0]], 5));
const bowlGeo = white(lathe([[0, 0], [0.07, 0.0], [0.1, 0.035], [0.09, 0.05], [0, 0.03]], 6));
const flameGeo = new THREE.ConeGeometry(0.028, 0.09, 5, 1, true).translate(0, 0.09, 0);
const lanternGeo = (() => {
  const g = new THREE.CylinderGeometry(0.11, 0.13, 0.32, 6);
  return white(g);
})();
const beadGeo = white(new THREE.OctahedronGeometry(0.06, 0));
const trunkGeo = white(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6).translate(0, 0.8, 0));
const canopyGeo = white(new THREE.IcosahedronGeometry(1.25, 1).scale(1, 0.85, 1).translate(0, 2.4, 0));

export default function Props({ lite, reducedMotion }: { lite: boolean; reducedMotion: boolean }) {
  const town = useMemo(buildTown, []);
  const mats = getMaterials();

  // ---- bells
  const bells = useMemo(() => town.anchors.bells.map((p) => ({ p })), [town]);
  const bellRef = useRef<THREE.InstancedMesh>(null);
  useInstances(bellRef, useMemo(() => bells.map((b) => ({ p: b.p, c: "#e0b860" })), [bells]));

  // ---- diyos (bowl + flame + halo); fewer on mobile
  const diyos = useMemo(() => {
    const all = [...town.anchors.diyos];
    return (lite ? all.filter((_, i) => i % 2 === 0) : all).map((p) => ({ p }));
  }, [town, lite]);
  const bowlRef = useRef<THREE.InstancedMesh>(null);
  const flameRef = useRef<THREE.InstancedMesh>(null);
  useInstances(bowlRef, useMemo(() => diyos.map((d) => ({ p: d.p, c: "#a65a36" })), [diyos]));
  useInstances(flameRef, diyos);

  // ---- lanterns
  const lanterns = useMemo(() => {
    const l = [...town.anchors.lanterns, new THREE.Vector3(TEA_STALL.x - 1.25, 2.0, TEA_STALL.z - 1.15), new THREE.Vector3(TEA_STALL.x - 1.25, 2.0, TEA_STALL.z + 1.15)];
    return l.map((p) => ({ p }));
  }, [town]);
  const lanternRef = useRef<THREE.InstancedMesh>(null);
  const lanternCoreRef = useRef<THREE.InstancedMesh>(null);
  useInstances(lanternRef, useMemo(() => lanterns.map((l) => ({ p: l.p, c: "#5a3a28" })), [lanterns]));
  useInstances(
    lanternCoreRef,
    useMemo(() => lanterns.map((l) => ({ p: l.p, s: new THREE.Vector3(0.75, 0.7, 0.75) })), [lanterns]),
  );

  // ---- decorative stacks of drying pots (the skill pots are skills/SkillPots.tsx)
  const pots = useMemo(() => {
    const out: { p: THREE.Vector3; s: number; r: number; c: string }[] = [];
    const r = seeded(77);
    // stacked pyramids of drying pots around the square and the tea stall
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
    stack(18.7, -6.7, 3);
    stack(18.6, 0.9, 2);
    if (!lite) {
      stack(TEA_STALL.x + 0.5, TEA_STALL.z + 1.9, 2);
      stack(-14, 8.0, 2);
    }
    return out;
  }, [lite]);
  const potRef = useRef<THREE.InstancedMesh>(null);
  useInstances(potRef, pots);

  // ---- marigold garlands (orange/yellow beads with a green leaf now and then)
  const beads = useMemo(() => {
    const out: { p: THREE.Vector3; c: string }[] = [];
    for (const g of town.anchors.garlands) {
      sag(g.a, g.b, g.drop, 0.1).forEach((p, i) => out.push({ p, c: i % 9 === 4 ? "#4f7a2c" : i % 3 === 0 ? "#ffc21a" : "#f2860f" }));
    }
    return out;
  }, [town]);
  const beadRef = useRef<THREE.InstancedMesh>(null);
  useInstances(beadRef, beads);

  // ---- trees: a few in town + scattered on the terraces
  const trees = useMemo(() => {
    const out: { p: THREE.Vector3; s: number; c: string; r: number }[] = TREES.map(([x, z, s]) => ({ p: new THREE.Vector3(x, 0, z), s, c: "#5d8a3c", r: 0 }));
    const r = seeded(31);
    const greens = ["#5d8a3c", "#6f9a44", "#4f7d36", "#7aa24c"];
    const count = lite ? 18 : 42;
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const rad = TOWN_RADIUS + 3 + r() * 24;
      // approx terrace height at that radius (mirrors Town terrainGeometry)
      const y = -1.4 - Math.max(0, (rad - TOWN_RADIUS) / 3.4) * 1.55;
      out.push({ p: new THREE.Vector3(Math.sin(a) * rad, y, Math.cos(a) * rad), s: 0.7 + r() * 0.6, c: greens[i % greens.length], r: r() * 6 });
    }
    return out;
  }, [lite]);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  useInstances(trunkRef, useMemo(() => trees.map((t) => ({ p: t.p, s: t.s, r: t.r, c: "#5a3e2c" })), [trees]));
  useInstances(canopyRef, trees);

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

  const clayMat = mats.clay;
  return (
    <group>
      <instancedMesh ref={bellRef} args={[bellGeo, mats.gold, bells.length]} />
      <instancedMesh ref={bowlRef} args={[bowlGeo, clayMat, diyos.length]} />
      <instancedMesh ref={flameRef} args={[flameGeo, mats.flame, diyos.length]} />
      <instancedMesh ref={lanternRef} args={[lanternGeo, mats.wood, lanterns.length]} />
      <instancedMesh ref={lanternCoreRef} args={[lanternGeo, mats.flame, lanterns.length]} />
      <instancedMesh ref={potRef} args={[potGeo, clayMat, pots.length]} receiveShadow />
      <instancedMesh ref={beadRef} args={[beadGeo, clayMat, beads.length]} />
      <instancedMesh ref={trunkRef} args={[trunkGeo, mats.wood, trees.length]} castShadow />
      <instancedMesh ref={canopyRef} args={[canopyGeo, mats.terrain, trees.length]} castShadow receiveShadow />
      <points geometry={halos.d} material={mats.halo} frustumCulled={false} />
      <points geometry={halos.l} material={lanternHalo} frustumCulled={false} />
      <Pigeons count={lite ? 12 : 26} />
      {!lite && <Fireflies />}
    </group>
  );
}

// ------------------------------------------------------------------ pigeons

/** One merged low-poly pigeon (~120 tris), facing +z: round body, small head, beak, folded wings, tail. Vertex colours carry the look. */
const pigeonGeo = (() => {
  const part = (g: THREE.BufferGeometry, hex: string, shade?: (y: number, z: number) => string) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute("uv");
    const pos = ng.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      _c.set(shade ? shade(pos.getY(i), pos.getZ(i)) : hex);
      col.set([_c.r, _c.g, _c.b], i * 3);
    }
    ng.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return ng;
  };
  const body = new THREE.SphereGeometry(0.1, 8, 5).scale(0.9, 0.85, 1.4).rotateX(-0.25).translate(0, 0.12, 0);
  const head = new THREE.SphereGeometry(0.045, 6, 4).translate(0, 0.225, 0.115);
  const beak = new THREE.ConeGeometry(0.014, 0.045, 4).rotateX(Math.PI / 2).translate(0, 0.222, 0.17);
  const wingL = new THREE.SphereGeometry(0.08, 6, 4).scale(0.3, 0.55, 1.35).rotateX(-0.2).translate(0.085, 0.14, -0.03);
  const wingR = wingL.clone().scale(-1, 1, 1);
  const tail = new THREE.ConeGeometry(0.035, 0.12, 4).rotateX(-Math.PI / 2 - 0.35).translate(0, 0.1, -0.2);
  const parts = [
    // soft blue-grey back, lighter belly
    part(body, "", (y) => (y < 0.115 ? "#c4ccd8" : "#7d8fa8")),
    // slightly darker, glossy neck/head
    part(head, "#5f7391"),
    part(beak, "#3b3330"),
    // folded wings: blue-grey with dark tips at the back
    part(wingL, "", (_y, z) => (z < -0.09 ? "#38414f" : "#6b7d97")),
    part(wingR, "", (_y, z) => (z < -0.09 ? "#38414f" : "#6b7d97")),
    part(tail, "#3d4756"),
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  for (const p of parts) {
    p.computeVertexNormals();
    pos.push(...(p.attributes.position.array as Float32Array));
    nor.push(...(p.attributes.normal.array as Float32Array));
    col.push(...(p.attributes.color.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return out;
})();

/** Pigeons peck around the square and flutter away when the avatar gets close. They sleep at night. */
function Pigeons({ count }: { count: number }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const birds = useMemo(() => {
    const r = seeded(5);
    return Array.from({ length: count }, () => {
      // around the front of the pagoda and the main axis
      const hx = (r() - 0.5) * 9;
      const hz = 3 + r() * 7;
      return { home: new THREE.Vector3(hx, 0, hz), pos: new THREE.Vector3(hx, 0, hz), vel: new THREE.Vector3(), mode: 0, timer: r() * 3, heading: r() * 6, phase: r() * 6 };
    });
  }, [count]);
  // Per-bird tint on top of the vertex colours (a few darker, a few paler birds).
  const tints = useMemo(() => {
    const r = seeded(9);
    return birds.map(() => _c.setScalar(0.82 + r() * 0.3).clone());
  }, [birds]);
  useLayoutEffect(() => {
    birds.forEach((_, i) => body.current?.setColorAt(i, tints[i]));
    if (body.current?.instanceColor) body.current.instanceColor.needsUpdate = true;
  }, [birds, tints]);
  useEffect(() => (group.current ? register(themeTargets.dayOnly, group.current) : undefined), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    if (!body.current) return;
    if (themeState.t > 0.5) return; // asleep (group hidden by ThemeDriver)
    const time = state.clock.elapsedTime;
    birds.forEach((b, i) => {
      const dx = b.pos.x - playerPos.x;
      const dz = b.pos.z - playerPos.z;
      const near = Math.hypot(dx, dz) < 2.4;
      if (b.mode === 0) {
        b.timer -= dt;
        if (b.timer < 0) {
          // hop to a nearby spot
          b.timer = 1 + Math.random() * 3;
          b.heading += (Math.random() - 0.5) * 2;
        }
        if (near) {
          const l = Math.hypot(dx, dz) || 1;
          b.vel.set((dx / l) * 3.2, 3.6 + Math.random(), (dz / l) * 3.2);
          b.mode = 1;
          b.timer = 2.5 + Math.random() * 2;
        }
      } else if (b.mode === 1) {
        b.vel.y -= 0.4 * dt;
        b.pos.addScaledVector(b.vel, dt);
        b.heading = Math.atan2(b.vel.x, b.vel.z);
        b.timer -= dt;
        if (b.timer < 0) b.mode = 2;
      } else {
        // glide back home once the avatar has moved on
        const tx = b.home.x - b.pos.x;
        const tz = b.home.z - b.pos.z;
        const away = Math.hypot(b.home.x - playerPos.x, b.home.z - playerPos.z) > 4;
        const d = Math.hypot(tx, tz);
        if (!away) {
          b.pos.y += (6 - b.pos.y) * dt;
        } else if (d < 0.15 && b.pos.y < 0.05) {
          b.pos.y = 0;
          b.mode = 0;
        } else {
          const sp = Math.min(3, d * 2 + 0.5);
          if (d > 0.01) {
            b.pos.x += (tx / d) * sp * dt;
            b.pos.z += (tz / d) * sp * dt;
            b.heading = Math.atan2(tx, tz);
          }
          b.pos.y = Math.max(0, b.pos.y - (b.pos.y / Math.max(d, 0.4)) * sp * dt);
        }
      }
      const flying = b.mode !== 0 && b.pos.y > 0.02;
      const peck = b.mode === 0 ? Math.max(0, Math.sin(time * 5 + b.phase)) * 0.3 : 0;
      // Flying: nose up a touch and a quick wing-beat flutter as a roll; the wings stay folded.
      const roll = flying ? Math.sin(time * 26 + b.phase) * 0.18 : 0;
      _q.setFromEuler(_e.set(flying ? -0.25 : peck, b.heading, roll, "YXZ"));
      _m.compose(b.pos, _q, _s.setScalar(1));
      body.current!.setMatrixAt(i, _m);
    });
    body.current.instanceMatrix.needsUpdate = true;
  });

  const mats = getMaterials();
  return (
    <group ref={group}>
      <instancedMesh ref={body} args={[pigeonGeo, mats.clay, count]} frustumCulled={false} />
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
