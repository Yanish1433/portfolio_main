"use client";

// Pathshala text surfaces: plaque faces + certificates on one atlas mesh (1 draw call), and
// the course book spines on one InstancedMesh sharing that atlas (1 draw call).
import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { pointerClaim } from "../input";
import { register, themeTargets } from "../nepal/themeState";
import { HALL } from "./content";
import { drawCertificate, drawPlaque, drawSpine, uvRect } from "./atlas";
import { EASELS, PLAQUES, SHELF } from "./pathshalaLayout";
import { at, makeAtlas, merge, quad, useAnisotropy, useFontsSettled, type Atlas } from "./three";
import { courseInfo, visitByVisitor } from "./visit";

const SPINE_PX: [number, number] = [112, 336];

function usePathshalaAtlas() {
  return useMemo(() => {
    const sizes: [number, number][] = [];
    for (const p of PLAQUES) {
      const fw = p.w - 0.16;
      const fh = p.h * 0.7;
      sizes.push([440, Math.round((440 * fh) / fw)]);
    }
    for (const e of EASELS) sizes.push([480, Math.round((480 * e.h) / e.w)]);
    for (const b of SHELF.books) sizes.push([SPINE_PX[0], Math.round((SPINE_PX[0] * b.h) / b.w)]);
    const atlas = makeAtlas(sizes.length ? sizes : [[4, 4]]);
    const nP = PLAQUES.length;
    const nE = EASELS.length;
    const redraw = () => {
      HALL.education.forEach((e, i) => drawPlaque(atlas.g, atlas.rects[i], e));
      HALL.certificates.forEach((c, i) => drawCertificate(atlas.g, atlas.rects[nP + i], c));
      HALL.courses.forEach((c, i) => drawSpine(atlas.g, atlas.rects[nP + nE + i], c, i));
      atlas.tex.needsUpdate = true;
    };
    redraw();
    return { atlas, redraw, nP, nE };
  }, []);
}

function PathshalaFaces({ atlas }: { atlas: Atlas }) {
  const built = useMemo(() => {
    const { canvas, rects } = atlas;
    const geos: THREE.BufferGeometry[] = [];
    PLAQUES.forEach((p, i) => geos.push(quad(p.w - 0.16, p.h * 0.7, at(p.x, 0.2 + p.h * 0.43, p.z + 0.074), uvRect(rects[i], canvas.width, canvas.height))));
    EASELS.forEach((e, i) => {
      const m = at(e.x, 0, e.z, e.yaw).multiply(at(0, 0.86 + e.h / 2, 0.024));
      geos.push(quad(e.w, e.h, m, uvRect(rects[PLAQUES.length + i], canvas.width, canvas.height)));
    });
    const geo = geos.length ? merge(geos) : new THREE.BufferGeometry();
    const mat = new THREE.MeshStandardMaterial({ map: atlas.tex, emissiveMap: atlas.tex, emissive: "#ffffff", emissiveIntensity: 0.06, roughness: 0.85 });
    return { geo, mat };
  }, [atlas]);
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

/** Book spines: one InstancedMesh; aUvRect picks each book's atlas cell. Hover lifts a book (instant under reduced motion). */
function Books({ atlas, first, reducedMotion }: { atlas: Atlas; first: number; reducedMotion: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const n = SHELF.books.length;
  const built = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const uv = geo.attributes.uv;
    // BoxGeometry faces: +x, -x, +y, -y, +z (spine), -z. Non-spine faces sample the cell's plain margin.
    for (let i = 0; i < uv.count; i++) if (i < 16 || i >= 20) uv.setXY(i, 0.03, 0.5);
    const rects = new Float32Array(Math.max(1, n) * 4);
    SHELF.books.forEach((_, i) => rects.set(uvRect(atlas.rects[first + i], atlas.canvas.width, atlas.canvas.height), i * 4));
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
  }, [atlas, first, n]);
  const lift = useRef(new Float32Array(Math.max(1, n)));
  const hovered = useRef(-1);
  const dirty = useRef(true);
  const m = useMemo(() => new THREE.Matrix4(), []);

  const write = () => {
    const im = mesh.current;
    if (!im) return;
    SHELF.books.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.y + lift.current[i], SHELF.z + SHELF.d / 2 - b.d / 2 - 0.02), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
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
  if (!n) return null;
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
  const { atlas, redraw, nP, nE } = usePathshalaAtlas();
  useAnisotropy(atlas.tex);
  useFontsSettled(redraw);
  useEffect(() => () => atlas.tex.dispose(), [atlas]);
  return (
    <>
      <PathshalaFaces atlas={atlas} />
      <Books atlas={atlas} first={nP + nE} reducedMotion={reducedMotion} />
    </>
  );
}

