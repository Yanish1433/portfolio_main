"use client";

// Pathshala surfaces: the education scroll (paper + moving roller), certificate faces + seals on the
// easels, and the course book spines on one InstancedMesh, all sharing one atlas. Nothing empty is
// drawn: no certificates means no easels or seals, no courses means no shelf.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { playerPos, pointerClaim } from "../input";
import { register, themeTargets } from "../nepal/themeState";
import { HALL } from "./content";
import { drawCertificate, drawScroll, drawSpine, uvRect } from "./atlas";
import { EASELS, SCROLL, SHELF } from "./pathshalaLayout";
import { at, makeAtlas, merge, quad, useAnisotropy, useFontsSettled, type Atlas } from "./three";
import { courseInfo, visitByVisitor } from "./visit";

const SPINE_PX: [number, number] = [112, 336];
const SCROLL_PX = 1000;
/** Unroll when the avatar comes this close to the scroll's ring. */
const UNROLL_R = 5.5;
const STAMP_R = 5;

function usePathshalaAtlas() {
  return useMemo(() => {
    const sizes: [number, number][] = [];
    // cell order: [scroll], easels..., books...
    if (SCROLL) sizes.push([SCROLL_PX, Math.round((SCROLL_PX * SCROLL.h) / SCROLL.w)]);
    for (const e of EASELS) sizes.push([480, Math.round((480 * e.h) / e.w)]);
    if (SHELF) for (const b of SHELF.books) sizes.push([SPINE_PX[0], Math.round((SPINE_PX[0] * b.h) / b.w)]);
    const atlas = makeAtlas(sizes.length ? sizes : [[4, 4]]);
    const nS = SCROLL ? 1 : 0;
    const nE = EASELS.length;
    const redraw = () => {
      if (SCROLL) drawScroll(atlas.g, atlas.rects[0], HALL.education.slice(0, SCROLL.rows.length), SCROLL.headerH / SCROLL.h, SCROLL.rowH / SCROLL.h);
      HALL.certificates.forEach((c, i) => drawCertificate(atlas.g, atlas.rects[nS + i], c));
      HALL.courses.forEach((c, i) => drawSpine(atlas.g, atlas.rects[nS + nE + i], c, i));
      atlas.tex.needsUpdate = true;
    };
    redraw();
    return { atlas, redraw, nS, nE };
  }, []);
}

/** Certificate faces on the easels: one merged mesh (not mounted at all with no certificates). */
function EaselFaces({ atlas, first }: { atlas: Atlas; first: number }) {
  const built = useMemo(() => {
    const { canvas, rects } = atlas;
    const geos = EASELS.map((e, i) => {
      const m = at(e.x, 0, e.z, e.yaw).multiply(at(0, 0.86 + e.h / 2, 0.024));
      return quad(e.w, e.h, m, uvRect(rects[first + i], canvas.width, canvas.height));
    });
    const geo = merge(geos);
    const mat = new THREE.MeshStandardMaterial({ map: atlas.tex, emissiveMap: atlas.tex, emissive: "#ffffff", emissiveIntensity: 0.06, roughness: 0.85 });
    return { geo, mat };
  }, [atlas, first]);
  useEffect(() => register(themeTargets.glows, { mat: built.mat, day: 0.06, night: 0.42 }), [built.mat]);
  useEffect(
    () => () => {
      built.geo.dispose();
      built.mat.dispose();
    },
    [built],
  );
  return <mesh geometry={built.geo} material={built.mat} receiveShadow />;
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * The education scroll: ONE paper mesh (an atlas cell) revealed from the top by a discard in its
 * fragment shader, plus the bottom roller that travels down with the edge (2 draw calls). It
 * unrolls the first time the avatar comes near and then stays open. Reduced motion: open from the
 * start, nothing animates.
 */
function ScrollPaper({ atlas, reducedMotion }: { atlas: Atlas; reducedMotion: boolean }) {
  const sc = SCROLL!;
  const roller = useRef<THREE.Mesh>(null);
  const t = useRef(reducedMotion ? 1 : 0);
  const opened = useRef(reducedMotion);
  const built = useMemo(() => {
    const { canvas, rects } = atlas;
    const geo = quad(sc.w, sc.h, at(0, -sc.h / 2, 0), uvRect(rects[0], canvas.width, canvas.height));
    const uniforms = { uReveal: { value: reducedMotion ? 1 : 0.04 }, uH: { value: sc.h } };
    const mat = new THREE.MeshStandardMaterial({ map: atlas.tex, emissiveMap: atlas.tex, emissive: "#ffffff", emissiveIntensity: 0.06, roughness: 0.9, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uReveal = uniforms.uReveal;
      shader.uniforms.uH = uniforms.uH;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying float vLocalY;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocalY = position.y;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vLocalY;\nuniform float uReveal;\nuniform float uH;")
        .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (vLocalY < -uH * uReveal) discard;");
    };
    mat.customProgramCacheKey = () => "scrollReveal";
    const rollerGeo = new THREE.CylinderGeometry(0.055, 0.055, sc.w + 0.14, 10).rotateZ(Math.PI / 2);
    const rollerMat = new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.8 });
    return { geo, mat, uniforms, rollerGeo, rollerMat };
  }, [atlas, sc, reducedMotion]);
  useEffect(() => register(themeTargets.glows, { mat: built.mat, day: 0.06, night: 0.4 }), [built.mat]);
  useEffect(
    () => () => {
      built.geo.dispose();
      built.mat.dispose();
      built.rollerGeo.dispose();
      built.rollerMat.dispose();
    },
    [built],
  );
  const apply = (reveal: number) => {
    built.uniforms.uReveal.value = reveal;
    if (roller.current) roller.current.position.y = sc.top - sc.h * reveal;
  };
  useFrame((_, dt) => {
    if (reducedMotion) {
      if (t.current !== 1 || built.uniforms.uReveal.value !== 1) {
        t.current = 1;
        apply(1);
      }
      return;
    }
    if (!opened.current && Math.hypot(playerPos.x - sc.ring[0], playerPos.z - sc.ring[1]) < UNROLL_R) opened.current = true;
    if (opened.current && t.current < 1) {
      t.current = Math.min(1, t.current + Math.min(dt, 0.1) / 1.4);
      apply(0.04 + 0.96 * easeOut(t.current));
    }
  });
  const start = reducedMotion ? 1 : 0.04;
  return (
    <>
      <mesh geometry={built.geo} material={built.mat} position={[sc.x, sc.top, sc.z + 0.05]} receiveShadow />
      <mesh ref={roller} geometry={built.rollerGeo} material={built.rollerMat} position={[sc.x, sc.top - sc.h * start, sc.z + 0.06]} />
    </>
  );
}

/** A red seal (disc + pale ring) with vertex colours: one tiny merged geometry shared by every instance. */
function sealGeometry() {
  const disc = new THREE.CircleGeometry(1, 20).toNonIndexed();
  const ring = new THREE.RingGeometry(0.58, 0.72, 20).toNonIndexed().translate(0, 0, 0.004);
  const geo = merge([disc, ring]);
  const dn = new THREE.CircleGeometry(1, 20).toNonIndexed().attributes.position.count;
  const red = new THREE.Color("#a8322a");
  const pale = new THREE.Color("#f3d9c8");
  const cols: number[] = [];
  for (let i = 0; i < geo.attributes.position.count; i++) (i < dn ? red : pale).toArray(cols, cols.length);
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  return geo;
}

/**
 * Certificate seals: one InstancedMesh. Each seal stamps in (drops from big with a short turn)
 * the first time the avatar comes near its easel. Reduced motion: already stamped. Only mounted
 * when there are certificates.
 */
function Seals({ reducedMotion }: { reducedMotion: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const n = EASELS.length;
  const built = useMemo(() => {
    const geo = sealGeometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: "#3a0d08", emissiveIntensity: 0.4 });
    return { geo, mat };
  }, []);
  /** Seconds since each seal was stamped (Infinity = not yet). */
  const age = useRef<number[]>(Array.from({ length: n }, () => (reducedMotion ? 99 : -1)));
  const m = useMemo(() => new THREE.Matrix4(), []);
  const write = () => {
    const im = mesh.current;
    if (!im) return;
    EASELS.forEach((e, i) => {
      const a = age.current[i];
      const k = a < 0 ? 0 : easeOut(a / 0.45);
      const base = 0.075 * e.h;
      const scale = a < 0 ? 0.0001 : base * (1 + (1 - k) * 1.3);
      const spin = (1 - k) * 1.2;
      m.copy(at(e.x, 0, e.z, e.yaw))
        .multiply(at(0.35 * e.w, 0.86 + 0.15 * e.w, 0.05))
        .multiply(new THREE.Matrix4().makeRotationZ(spin))
        .scale(new THREE.Vector3(scale, scale, scale));
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  };
  useEffect(write);
  useEffect(
    () => () => {
      built.geo.dispose();
      built.mat.dispose();
    },
    [built],
  );
  useFrame((_, dt) => {
    if (reducedMotion) return;
    let changed = false;
    EASELS.forEach((e, i) => {
      if (age.current[i] < 0 && Math.hypot(playerPos.x - e.x, playerPos.z - e.z) < STAMP_R) age.current[i] = 0;
      if (age.current[i] >= 0 && age.current[i] < 0.6) {
        age.current[i] += Math.min(dt, 0.1);
        changed = true;
      }
    });
    if (changed) write();
  });
  return <instancedMesh ref={mesh} args={[built.geo, built.mat, n]} />;
}

/** Book spines: one InstancedMesh; aUvRect picks each book's atlas cell. Hover lifts a book (instant under reduced motion). Only mounted when there are courses. */
function Books({ atlas, first, reducedMotion }: { atlas: Atlas; first: number; reducedMotion: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const shelf = SHELF!;
  const books = shelf.books;
  const n = books.length;
  const built = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const uv = geo.attributes.uv;
    // BoxGeometry faces: +x, -x, +y, -y, +z (spine), -z. Non-spine faces sample the cell's plain margin.
    for (let i = 0; i < uv.count; i++) if (i < 16 || i >= 20) uv.setXY(i, 0.03, 0.5);
    const rects = new Float32Array(Math.max(1, n) * 4);
    books.forEach((_, i) => rects.set(uvRect(atlas.rects[first + i], atlas.canvas.width, atlas.canvas.height), i * 4));
    geo.setAttribute("aUvRect", new THREE.InstancedBufferAttribute(rects, 4));
    const mat = new THREE.MeshStandardMaterial({ map: atlas.tex, emissiveMap: atlas.tex, emissive: "#ffffff", emissiveIntensity: 0.04, roughness: 0.7 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec4 aUvRect;")
        .replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>
          #ifdef USE_MAP
            vMapUv = aUvRect.xy + uv * aUvRect.zw;
          #endif
          #ifdef USE_EMISSIVEMAP
            vEmissiveMapUv = aUvRect.xy + uv * aUvRect.zw;
          #endif`,
        );
    };
    mat.customProgramCacheKey = () => "bookUv";
    return { geo, mat };
  }, [atlas, first, n, books]);
  const lift = useRef(new Float32Array(Math.max(1, n)));
  const hovered = useRef(-1);
  const dirty = useRef(true);
  const m = useMemo(() => new THREE.Matrix4(), []);

  const write = () => {
    const im = mesh.current;
    if (!im) return;
    books.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.y + lift.current[i], shelf.z + shelf.d / 2 - b.d / 2 - 0.02), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  };
  useEffect(write);
  useEffect(() => register(themeTargets.glows, { mat: built.mat, day: 0.04, night: 0.3 }), [built.mat]);
  useEffect(
    () => () => {
      built.geo.dispose();
      built.mat.dispose();
    },
    [built],
  );
  useFrame((_, dt) => {
    let changed = dirty.current;
    for (let i = 0; i < n; i++) {
      const want = i === hovered.current ? 0.06 : 0;
      const cur = lift.current[i];
      if (cur === want) continue;
      const next = reducedMotion ? want : THREE.MathUtils.damp(cur, want, 14, Math.min(dt, 0.1));
      lift.current[i] = Math.abs(next - want) < 0.001 ? want : next;
      changed = true;
    }
    if (changed) {
      dirty.current = false;
      write();
    }
  });
  const hover = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined && hovered.current !== e.instanceId) hovered.current = e.instanceId;
    document.body.style.cursor = "pointer";
  };
  return (
    <instancedMesh
      ref={mesh}
      args={[built.geo, built.mat, n]}
      receiveShadow
      onPointerMove={hover}
      onPointerOver={hover}
      onPointerOut={() => {
        hovered.current = -1;
        document.body.style.cursor = "";
      }}
      onPointerDown={(e) => pointerClaim.claim(e.pointerId)}
      onClick={(e) => {
        e.stopPropagation();
        const c = e.instanceId !== undefined ? HALL.courses[e.instanceId] : undefined;
        if (c) visitByVisitor(courseInfo(c.id));
      }}
    />
  );
}

export default function Pathshala({ reducedMotion }: { reducedMotion: boolean }) {
  const { atlas, redraw, nS, nE } = usePathshalaAtlas();
  useAnisotropy(atlas.tex);
  useFontsSettled(redraw);
  useEffect(() => () => atlas.tex.dispose(), [atlas]);
  return (
    <>
      {SCROLL && <ScrollPaper atlas={atlas} reducedMotion={reducedMotion} />}
      {nE > 0 && <EaselFaces atlas={atlas} first={nS} />}
      {nE > 0 && <Seals reducedMotion={reducedMotion} />}
      {SHELF && <Books atlas={atlas} first={nS + nE} reducedMotion={reducedMotion} />}
    </>
  );
}
