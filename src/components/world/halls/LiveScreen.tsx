"use client";

// Living screens: a project stand's demo clip plays ONLY while the avatar stands on that stand's
// ring (ring radius + 0.3 m; showcaseView.videoStateFor). Leaving the ring pauses the clip and the
// poster shows again; coming back restarts it from 0 (same element, no reload). At most ONE <video>
// exists at a time: entering another stand releases the previous clip (pause, drop src, load(),
// dispose the texture), and a clip left behind is released after RELEASE_AFTER_S seconds.
// Desktop autoplays on the ring. Phones / ?perf=low (autoplay=false): tapping the screen while on
// the ring plays it (muted, inline); the same stop-on-leave rule applies. It pauses while a project video is open.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorld } from "@/store/world";
import { playerPos } from "../input";
import { register, themeTargets } from "../nepal/themeState";
import { HALL } from "./content";
import { STANDS, type Stand } from "./layout";
import { videoStateFor, videoUrl } from "./showcaseView";
import { debugHidden } from "./spots";

const CHECK_S = 0.25;
const RELEASE_AFTER_S = 8;

type Live = { key: string; stand: Stand; video: HTMLVideoElement; tex: THREE.VideoTexture; ready: boolean; /** avatar is on the ring */ on: boolean; leftAt: number };

/** Stands that have a clip. */
const CANDIDATES = STANDS.flatMap((stand) => {
  if (stand.spot.kind !== "project") return [];
  const p = HALL.projects[stand.projects[0]];
  const src = p ? videoUrl(p) : null;
  return src ? [{ stand, src, id: p.id }] : [];
});

function release(l: Live | null) {
  if (!l) return;
  l.video.pause();
  l.video.removeAttribute("src");
  l.video.load();
  l.tex.dispose();
}

export default function LiveScreen({ autoplay }: { autoplay: boolean }) {
  const live = useRef<Live | null>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const tap = useRef<THREE.Mesh>(null);
  const last = useRef(-1);
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ toneMapped: false, color: new THREE.Color(0.84, 0.84, 0.84) });
    // letterbox: outside the clip's UV range, draw a dark bar instead of smearing the edge pixels
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
#ifdef USE_MAP
if (vMapUv.x < 0.0 || vMapUv.x > 1.0 || vMapUv.y < 0.0 || vMapUv.y > 1.0) diffuseColor.rgb = vec3(0.03);
#endif`,
      );
    };
    return m;
  }, []);
  // a unit quad, scaled and moved onto the chosen screen
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  useEffect(() => register(themeTargets.glows, { mat, day: 0.84, night: 1.12 }), [mat]);

  const start = (c: (typeof CANDIDATES)[number]) => {
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = c.src;
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    const l: Live = { key: c.stand.spot.key, stand: c.stand, video, tex, ready: false, on: true, leftAt: 0 };
    video.addEventListener("loadedmetadata", () => {
      // contain-fit the clip into the screen: the whole site stays visible, and the
      // unused band (UV outside 0..1) is painted dark by the material's shader patch
      const va = video.videoWidth / Math.max(1, video.videoHeight);
      const sa = c.stand.screen.w / c.stand.screen.h;
      if (va > sa) {
        tex.repeat.set(1, va / sa);
        tex.offset.set(0, (1 - va / sa) / 2);
      } else {
        tex.repeat.set(sa / va, 1);
        tex.offset.set((1 - sa / va) / 2, 0);
      }
    });
    video.addEventListener("playing", () => {
      if (live.current !== l) return;
      l.ready = true;
      mat.map = tex;
      mat.needsUpdate = true;
    });
    if (autoplay && !useWorld.getState().cinema) video.play().catch(() => undefined);
    return l;
  };

  /** The avatar is on ring `key` (or on none). */
  const enter = (key: string | null, now: number) => {
    const l = live.current;
    if (l && l.key === key) {
      if (!l.on) {
        // back on the same ring: restart from 0 (no reload)
        l.on = true;
        l.ready = false;
        l.video.currentTime = 0;
        if (autoplay && !useWorld.getState().cinema) l.video.play().catch(() => undefined);
      }
      return;
    }
    if (l && l.on) {
      // left the ring: stop, the poster shows again
      l.on = false;
      l.leftAt = now;
      l.ready = false;
      l.video.pause();
    }
    if (key === null) {
      if (l && now - l.leftAt > RELEASE_AFTER_S) {
        release(l);
        live.current = null;
        mat.map = null;
        mat.needsUpdate = true;
      }
      return;
    }
    release(l);
    live.current = null;
    mat.map = null;
    mat.needsUpdate = true;
    const c = CANDIDATES.find((k) => k.stand.spot.key === key);
    if (c) {
      live.current = start(c);
      if (!autoplay) useWorld.getState().showToast("Tap the screen to play the demo");
    }
  };

  const playNow = () => {
    const l = live.current;
    if (!l || !l.on || useWorld.getState().cinema) return;
    l.video.currentTime = 0;
    l.video.play().catch(() => undefined);
  };

  // pause while a project video is open (the 3D loop is paused too), resume after
  useEffect(
    () =>
      useWorld.subscribe((s, prev) => {
        if (!!s.cinema === !!prev.cinema || !live.current) return;
        if (s.cinema) live.current.video.pause();
        else if (autoplay && live.current.on) live.current.video.play().catch(() => undefined);
      }),
    [autoplay],
  );

  // ?debug: which stand is live and its clip (automated checks read currentTime)
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && !new URLSearchParams(window.location.search).has("debug")) return;
    const w = window as unknown as { __live?: unknown };
    w.__live = {
      current: () => live.current?.key ?? null,
      /** Videos decoding right now: the live clip (it isn't in the DOM) plus any <video> on the page. */
      playing: () => {
        const all = [...Array.from(document.querySelectorAll("video")), ...(live.current ? [live.current.video] : [])];
        return all.filter((v) => !v.paused && !!v.currentSrc).length;
      },
      state: () => {
        const v = live.current?.video;
        return v ? { key: live.current!.key, on: live.current!.on, ready: live.current!.ready, time: v.currentTime, paused: v.paused, src: v.currentSrc } : null;
      },
    };
    return () => {
      delete w.__live;
    };
  }, []);

  useEffect(
    () => () => {
      release(live.current);
      live.current = null;
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (now - last.current >= CHECK_S && CANDIDATES.length) {
      last.current = now;
      enter(videoStateFor([playerPos.x, playerPos.z], CANDIDATES.map(({ stand }) => ({ key: stand.spot.key, ring: stand.spot.ring }))), now);
    }
    const m = mesh.current;
    const l = live.current;
    if (!m) return;
    m.visible = !!l?.ready && l.on && !debugHidden.has("live");
    if (l?.ready) {
      const sc = l.stand.screen;
      m.position.set(l.stand.x, sc.y, l.stand.z + 0.034);
      m.scale.set(sc.w, sc.h, 1);
    }
    // phones: an invisible tap target over the screen while the avatar is on the ring
    const t = tap.current;
    if (t) {
      t.visible = !!l?.on;
      if (l) {
        const sc = l.stand.screen;
        t.position.set(l.stand.x, sc.y, l.stand.z + 0.36); // in front of the stand's click box (it reaches z + 0.3)
        t.scale.set(sc.w, sc.h, 1);
      }
    }
  });

  return (
    <>
      <mesh ref={mesh} geometry={geo} material={mat} visible={false} />
      {!autoplay && (
        <mesh
          ref={tap}
          geometry={geo}
          visible={false}
          onClick={(e) => {
            e.stopPropagation();
            playNow();
          }}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}
