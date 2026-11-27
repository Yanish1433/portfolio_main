"use client";

// Realistic pigeons: ONE InstancedMesh (one draw call, ~250 tris per bird). Wings hinge at the shoulder and
// the neck/head bob in the vertex shader, driven by one per-instance attribute (flap phase, fold, walk bob);
// the CPU only writes the instance matrix and those three floats. Birds walk and peck on the ground,
// rest on rooftop ridges, the temple's ledges and the pond rim, take off with a wing-flap flurry when the
// avatar comes close (or now and then, by themselves), glide to another spot and land again.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { playerPos } from "../input";
import { seeded } from "./geom";
import { buildPigeonMaterial, buildPigeonGeometry, pigeonSpots, type Spot } from "./pigeonData";
import { register, themeState, themeTargets } from "./themeState";

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _p = new THREE.Vector3();

// ------------------------------------------------------------------ flock

type Bird = {
  pos: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  spot: number;
  home: number;
  /** 0 on a spot, 1 in flight. */
  mode: number;
  t: number;
  dur: number;
  rest: number;
  heading: number;
  phase: number;
  fold: number;
  bob: number;
  walkT: number;
  wander: THREE.Vector2;
  goal: THREE.Vector2;
  peck: number;
  arch: number;
};

const ease = (t: number) => t * t * (3 - 2 * t);

/** Pigeons peck around the square, rest on roofs and ledges, and flutter away when the avatar gets close. They sleep at night. */
export default function Pigeons({ count, reducedMotion = false }: { count: number; reducedMotion?: boolean }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const spots = useMemo(pigeonSpots, []);
  const geo = useMemo(() => {
    const g = buildPigeonGeometry();
    g.setAttribute("aAnim", new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, [count]);
  const mat = useMemo(buildPigeonMaterial, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  const birds = useMemo<Bird[]>(() => {
    const r = seeded(11);
    const byKind = (k: Spot["kind"]) => spots.map((s, i) => [s, i] as const).filter(([s]) => s.kind === k).map(([, i]) => i);
    const pools: number[][] = [byKind("ground"), byKind("pond"), byKind("temple"), byKind("roof")];
    // flock shares: ground 8/26, pond 5/26, temple 5/26, roofs 8/26
    const share = [0.31, 0.19, 0.19, 0.31];
    const list: Bird[] = [];
    for (let i = 0; i < count; i++) {
      let acc = 0;
      const u = (i + 0.5) / count;
      let k = 0;
      for (; k < 4; k++) {
        acc += share[k];
        if (u < acc) break;
      }
      const pool = pools[Math.min(k, 3)];
      const home = pool[Math.floor(r() * pool.length)];
      const s = spots[home];
      list.push({
        pos: new THREE.Vector3(s.x, s.y, s.z),
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        spot: home,
        home,
        mode: 0,
        t: 0,
        dur: 1,
        rest: r() * 8,
        heading: r() * 6.28,
        phase: r() * 6.28,
        fold: 1,
        bob: 0,
        walkT: r() * 2,
        wander: new THREE.Vector2(),
        goal: new THREE.Vector2(),
        peck: 0,
        arch: 1,
      });
    }
    return list;
  }, [count, spots]);

  const tints = useMemo(() => {
    const r = seeded(9);
    return birds.map(() => _c.setScalar(0.84 + r() * 0.28).clone());
  }, [birds]);
  useLayoutEffect(() => {
    birds.forEach((_, i) => body.current?.setColorAt(i, tints[i]));
    if (body.current?.instanceColor) body.current.instanceColor.needsUpdate = true;
  }, [birds, tints]);
  useEffect(() => (group.current ? register(themeTargets.dayOnly, group.current) : undefined), []);

  useFrame((state, dtRaw) => {
    const mesh = body.current;
    if (!mesh) return;
    if (themeState.t > 0.5) return; // asleep (group hidden by ThemeDriver)
    const dt = Math.min(dtRaw, 0.05);
    const time = state.clock.elapsedTime;
    const anim = geo.attributes.aAnim as THREE.InstancedBufferAttribute;
    const takeOff = (b: Bird, target: number, scared: boolean) => {
      const to = spots[target];
      b.from.copy(b.pos);
      b.to.set(to.x + (to.roam ? (Math.random() - 0.5) * to.roam : 0), to.y, to.z + (to.roam ? (Math.random() - 0.5) * to.roam : 0));
      const dist = Math.hypot(b.to.x - b.from.x, b.to.z - b.from.z);
      b.spot = target;
      b.mode = 1;
      b.t = 0;
      b.dur = THREE.MathUtils.clamp(dist / (scared ? 6.5 : 4.5) + 0.7, 0.9, 4.5);
      b.arch = Math.min(0.9 + dist * 0.16, 3.4) + Math.max(0, b.from.y - b.to.y) * 0.1;
      b.heading = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
    };
    const pickAway = (b: Bird, minPlayer: number) => {
      for (let n = 0; n < 12; n++) {
        const idx = Math.floor(Math.random() * spots.length);
        const s = spots[idx];
        if (idx === b.spot) continue;
        if (Math.hypot(s.x - playerPos.x, s.z - playerPos.z) < minPlayer) continue;
        if (Math.hypot(s.x - b.pos.x, s.z - b.pos.z) < 2.5) continue;
        return idx;
      }
      return b.home;
    };

    birds.forEach((b, i) => {
      const dxp = b.pos.x - playerPos.x;
      const dzp = b.pos.z - playerPos.z;
      const dp = Math.hypot(dxp, dzp);
      if (b.mode === 0) {
        const s = spots[b.spot];
        const scareR = s.kind === "roof" ? 1.2 : 2.5;
        if (dp < scareR && !reducedMotion) {
          takeOff(b, pickAway(b, 6), true);
        } else {
          b.rest -= dt;
          if (b.rest < 0) {
            b.rest = 14 + Math.random() * 30;
            // go home if we are elsewhere, otherwise (sometimes) drift to another spot of the same kind
            if (b.spot !== b.home && Math.hypot(spots[b.home].x - playerPos.x, spots[b.home].z - playerPos.z) > 5) takeOff(b, b.home, false);
            else if (Math.random() < 0.35 && !reducedMotion) {
              const same = spots.map((q, j) => [q, j] as const).filter(([q, j]) => q.kind === spots[b.home].kind && j !== b.spot);
              if (same.length) takeOff(b, same[Math.floor(Math.random() * same.length)][1], false);
            }
          }
          // ground birds wander within their roam circle: walk (head bobs), pause, peck
          if (b.mode === 0 && s.roam > 0.3) {
            b.walkT -= dt;
            if (b.walkT < 0) {
              b.walkT = 0.8 + Math.random() * 2.4;
              if (Math.random() < 0.55) {
                const a = Math.random() * 6.28;
                const rr = Math.random() * s.roam;
                b.goal.set(s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr);
              } else b.goal.set(b.pos.x, b.pos.z);
            }
            const gx = b.goal.x - b.pos.x;
            const gz = b.goal.y - b.pos.z;
            const gd = Math.hypot(gx, gz);
            if (gd > 0.04) {
              const sp = Math.min(0.45, gd * 2);
              b.pos.x += (gx / gd) * sp * dt;
              b.pos.z += (gz / gd) * sp * dt;
              let dh = Math.atan2(gx, gz) - b.heading;
              dh = Math.atan2(Math.sin(dh), Math.cos(dh));
              b.heading += dh * Math.min(1, dt * 6);
              b.bob = THREE.MathUtils.damp(b.bob, 1, 10, dt);
              b.phase += dt * 11;
              b.peck = THREE.MathUtils.damp(b.peck, 0, 12, dt);
            } else {
              b.bob = THREE.MathUtils.damp(b.bob, 0, 10, dt);
              b.peck = Math.max(0, Math.sin(time * 5 + i * 1.7)) > 0.5 ? Math.sin(time * 5 + i * 1.7) * 0.5 : b.peck * 0.9;
            }
          } else {
            // perched: an occasional look about
            b.bob = 0;
            b.peck = 0;
            b.heading += Math.sin(time * 0.6 + i) * dt * 0.4;
          }
          b.pos.y = s.y;
          b.fold = THREE.MathUtils.damp(b.fold, 1, 12, dt);
        }
      } else {
        // flight: a lifted arc from `from` to `to`, wings beating hard at take-off and landing, gliding between
        b.t += dt / b.dur;
        const u = Math.min(1, b.t);
        const h = ease(u);
        b.pos.x = b.from.x + (b.to.x - b.from.x) * h;
        b.pos.z = b.from.z + (b.to.z - b.from.z) * h;
        b.pos.y = b.from.y + (b.to.y - b.from.y) * h + Math.sin(Math.PI * Math.min(1, u * 1.05)) * b.arch;
        const hard = u < 0.3 || u > 0.78 ? 1 : 0.42;
        b.phase += dt * (hard > 0.9 ? 30 : 16);
        const tgtFold = u < 0.07 || u > 0.93 ? 0.5 : 0;
        b.fold = THREE.MathUtils.damp(b.fold, tgtFold, 18, dt);
        b.bob = 0;
        b.peck = 0;
        if (u >= 1) {
          b.mode = 0;
          b.pos.set(b.to.x, b.to.y, b.to.z);
          b.rest = 18 + Math.random() * 30;
          b.goal.set(b.to.x, b.to.z);
        }
      }
      const flying = b.mode === 1;
      const u = Math.min(1, b.t);
      const pitch = flying ? -0.45 * (1 - ease(Math.min(1, u * 3.5))) + 0.5 * ease(Math.max(0, (u - 0.8) * 5)) : b.peck;
      _q.setFromEuler(_e.set(pitch, b.heading, 0, "YXZ"));
      _p.copy(b.pos);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      anim.setXYZ(i, b.phase, b.fold, b.bob);
    });
    mesh.instanceMatrix.needsUpdate = true;
    anim.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <instancedMesh ref={body} args={[geo, mat, count]} frustumCulled={false} castShadow={false} />
    </group>
  );
}
