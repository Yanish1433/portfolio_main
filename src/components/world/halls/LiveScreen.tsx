"use client";

// Living screens: the stand nearest the avatar (within LIVE_R m, and on screen) plays its demo
// clip as a muted, looping VideoTexture over its poster. At most ONE <video> exists at a time:
// a clip is only requested when its stand becomes the nearest, and is fully released (pause,
// drop src, load(), dispose the texture) when another stand wins or the avatar walks away.
// While a case study is open the clip pauses. Not mounted on phones or with ?perf=low.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useWorld } from "@/store/world";
import { playerPos } from "../input";
import { register, themeTargets } from "../nepal/themeState";
import { HALL } from "./content";
import { STANDS, type Stand } from "./layout";
import { pickLiveScreen, videoUrl, type ScreenCandidate } from "./showcaseView";
import { debugHidden } from "./spots";

const LIVE_R = 6;
const CHECK_S = 0.25;

type Live = { key: string; stand: Stand; video: HTMLVideoElement; tex: THREE.VideoTexture; ready: boolean };

/** Stands that have a clip. */
const CANDIDATES = STANDS.flatMap((stand) => {
  if (stand.spot.kind !== "project") return [];
  const p = HALL.projects[stand.projects[0]];
  const src = p ? videoUrl(p) : null;
  return src ? [{ stand, src, id: p.id }] : [];
});

const _v = new THREE.Vector3();

function release(l: Live | null) {
  if (!l) return;
  l.video.pause();
  l.video.removeAttribute("src");
  l.video.load();
  l.tex.dispose();
}

export default function LiveScreen() {
  const camera = useThree((s) => s.camera);
  const live = useRef<Live | null>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const last = useRef(-1);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, color: new THREE.Color(0.84, 0.84, 0.84) }), []);
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
    const l: Live = { key: c.stand.spot.key, stand: c.stand, video, tex, ready: false };
    video.addEventListener("loadedmetadata", () => {
      // cover-fit the clip into the screen (crop the long side)
      const va = video.videoWidth / Math.max(1, video.videoHeight);
      const sa = c.stand.screen.w / c.stand.screen.h;
      if (va > sa) {
        tex.repeat.set(sa / va, 1);
        tex.offset.set((1 - sa / va) / 2, 0);
      } else {
        tex.repeat.set(1, va / sa);
        tex.offset.set(0, (1 - va / sa) / 2);
      }
    });
    video.addEventListener("playing", () => {
      if (live.current !== l) return;
      l.ready = true;
      mat.map = tex;
      mat.needsUpdate = true;
    });
    if (!useWorld.getState().cinema) video.play().catch(() => undefined);
    return l;
  };

  const switchTo = (key: string | null) => {
    if ((live.current?.key ?? null) === key) return;
    release(live.current);
    live.current = null;
    mat.map = null;
    mat.needsUpdate = true;
    const c = key ? CANDIDATES.find((k) => k.stand.spot.key === key) : undefined;
    if (c) live.current = start(c);
  };

  // pause while a case study is open (the 3D loop is paused too), resume after
  useEffect(
    () =>
      useWorld.subscribe((s, prev) => {
        if (!!s.cinema === !!prev.cinema || !live.current) return;
        if (s.cinema) live.current.video.pause();
        else live.current.video.play().catch(() => undefined);
      }),
    [],
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
        return v ? { key: live.current!.key, ready: live.current!.ready, time: v.currentTime, paused: v.paused, src: v.currentSrc } : null;
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
      const list: ScreenCandidate[] = CANDIDATES.map(({ stand }) => {
        _v.set(stand.x, stand.screen.y, stand.z).project(camera);
        return {
          id: stand.spot.key,
          dist: Math.hypot(playerPos.x - stand.x, playerPos.z - stand.z),
          onScreen: _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05,
        };
      });
      switchTo(pickLiveScreen(list, LIVE_R));
    }
    const m = mesh.current;
    const l = live.current;
    if (!m) return;
    m.visible = !!l?.ready && !debugHidden.has("live");
    if (l?.ready) {
      const sc = l.stand.screen;
      m.position.set(l.stand.x, sc.y, l.stand.z + 0.034);
      m.scale.set(sc.w, sc.h, 1);
    }
  });

  return <mesh ref={mesh} geometry={geo} material={mat} visible={false} />;
}
