"use client";

// The potter's corner (step22). Idle cost: 1 draw call (one merged mesh: wheel, shelf, clay pile, drying pots and the saved shelf pots). The game itself (clay on the wheel, sprites, HUD, logos) is lazy-loaded the first
// time someone presses "Make a pot"; only its hidden meshes exist at load so their shaders are compiled by prewarmPottery().
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { themeTargets, register } from "../nepal/themeState";
import { useWorld } from "@/store/world";
import { danceClock } from "../dance/danceWarm";
import { buildPotsGeometry } from "./cornerGeo";
import { createClayMaterial } from "./clayMaterial";
import { canvasTexture, createRig, rigRef, type Rig } from "./rig";
import { ATLAS } from "./cornerGeo";
import { usePottery } from "./potteryStore";
import { registerPotteryWarm } from "./potteryWarm";
import { loadSave } from "./save";

const PotteryGame = lazy(() => import("./PotteryGame"));

export default function Pottery({ reducedMotion, lite }: { reducedMotion: boolean; lite: boolean }) {
  const rig = useMemo<Rig>(() => createRig(lite), [lite]);
  const pots = usePottery((s) => s.save.pots);
  // skill -> brand hex arrives with the lazy logo table; until then the shelf pots are plain terracotta, then they re-glaze once
  const [hexFor, setHexFor] = useState<null | ((skill: string) => string | null)>(null);
  const potsGeo = useMemo(() => buildPotsGeometry(pots, hexFor ?? undefined), [pots, hexFor]);
  const atlas = useMemo(() => canvasTexture(ATLAS.cells * ATLAS.cellW, ATLAS.cellH), []);
  const potsMat = useMemo(() => {
    const m = createClayMaterial({ lite, map: atlas.tex ?? new THREE.Texture(), wet: 0.18, decal: 1 });
    m.userData.clay.uGloss.value = 1;
    return m;
  }, [lite, atlas]);
  // sharp logos at a distance + on the slant: anisotropic filtering (the atlas keeps its default mipmaps)
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  useEffect(() => {
    if (atlas.tex) {
      atlas.tex.anisotropy = Math.min(maxAniso, 8);
      atlas.tex.needsUpdate = true;
    }
  }, [atlas, maxAniso]);
  // the medallion's self-light: day/night scaled by the theme driver (it writes a proxy material's emissiveIntensity; the uniform reads it, no per-frame work here)
  useEffect(() => {
    const proxy = new THREE.MeshStandardMaterial();
    proxy.emissiveIntensity = 0.22;
    const u = potsMat.userData.clay.uDecalGlow;
    Object.defineProperty(u, "value", { get: () => proxy.emissiveIntensity, configurable: true });
    const off = register(themeTargets.glows, { mat: proxy, day: 0.22, night: 0.12 });
    return () => {
      off();
      Object.defineProperty(u, "value", { value: 0, writable: true, configurable: true });
      proxy.dispose();
    };
  }, [potsMat]);

  useEffect(() => {
    rigRef.current = rig;
    return () => {
      if (rigRef.current === rig) rigRef.current = null;
      rig.dispose();
    };
  }, [rig]);
  useEffect(() => () => potsGeo?.dispose(), [potsGeo]);
  useEffect(
    () => () => {
      potsMat.dispose();
      atlas.tex?.dispose();
    },
    [potsMat, atlas],
  );

  // the saved shelf (localStorage, versioned; corrupt data resets)
  useEffect(() => {
    usePottery.getState().set({ save: loadSave(), loaded: true });
  }, []);

  // saved pots wear their skill logos: draw the atlas once the shelf has pots (the logo paths load lazily)
  useEffect(() => {
    if (!pots.length || !atlas.canvas || !atlas.tex) return;
    let alive = true;
    void import("./logoDraw").then((m) => {
      if (!alive || !atlas.canvas || !atlas.tex) return;
      m.drawAtlas(atlas.canvas, pots);
      atlas.tex.needsUpdate = true;
      setHexFor(() => m.hexFor);
    });
    return () => {
      alive = false;
    };
  }, [pots, atlas]);

  // compile the clay + sprite shaders during loading (Warmup calls prewarmPottery once the avatar is in)
  useEffect(
    () =>
      registerPotteryWarm(() => {
        rig.clay.visible = true;
        rig.points.visible = true;
        return () => {
          rig.clay.visible = false;
          rig.points.visible = false;
        };
      }),
    [rig],
  );

  // "Make a pot" = the generic zone path (E or the card button toggles panelOpen in the pottery zone). Not in eagle / 360 / cinema, not mid-dance.
  const open = useWorld((s) => s.activeZone === "pottery" && s.panelOpen);
  const follow = useWorld((s) => s.cameraMode === "follow" && !s.cinema);
  const allowed = follow && !danceClock.active;
  useEffect(() => {
    if (open && !allowed) useWorld.getState().setPanelOpen(false);
  }, [open, allowed]);

  return (
    <>
      {potsGeo && <mesh geometry={potsGeo} material={potsMat} receiveShadow name="pottery-pots" />}
      <primitive object={rig.clay} onPointerDown={(e: Parameters<NonNullable<Rig["onDown"]>>[0]) => rig.onDown?.(e)} />
      <primitive object={rig.points} />
      {open && allowed && (
        <Suspense fallback={null}>
          <PotteryGame rig={rig} reducedMotion={reducedMotion} />
        </Suspense>
      )}
    </>
  );
}
