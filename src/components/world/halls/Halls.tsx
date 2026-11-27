"use client";

// Project Dalan + Pathshala, the parts that aren't merged into the town:
// - posters + brass plates: one atlas CanvasTexture, one mesh (1 draw call)
// - plaque faces + certificates: one atlas, one mesh (1 draw call); book spines share that atlas
//   on one InstancedMesh (1 draw call) with a per-instance UV rectangle
// - walk-up rings: one merged mesh (+1 small highlight ring while a panel is open)
// - click targets: one invisible merged mesh (material.visible = false: raycast only, never drawn)
// - the walk-up logic (open at < OPEN_R, close beyond CLOSE_R) and the hall entry line
import { use, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { profile } from "@/content/profile";
import { useWorld } from "@/store/world";
import { avatarMotion, playerPos, pointerClaim } from "../input";
import { FONT_FAMILY, loadLabelFonts } from "../nepal/LabelSprites";
import { register, themeTargets } from "../nepal/themeState";
import { robotMotion, useRobot } from "../robot/robotStore";
import { accentAt, HALL, LEAD_ID, projectPoster } from "./content";
import { leadFirst } from "@/content/showcase";
import type { MediaFiles } from "./showcaseView";
import LiveScreen from "./LiveScreen";
import FlagshipHalo from "./FlagshipHalo";
import { drawMorePoster, drawPlate, drawPoster, uvRect } from "./atlas";
import { roadZ, ROAD_W, ROAD_Y } from "./Dioramas";
import { debugHidden } from "./spots";
import Dioramas, { dioramaDebug } from "./Dioramas";
import { CLICK_BOXES, CLOSE_R, DIORAMAS, OPEN_R, OPEN_SPEED, RINGS, SHELF, SPOTS, STANDS, spotByKey, type Spot } from "./layout";
import { at, cursor, makeAtlas, merge, quad, useAnisotropy, useFontsSettled } from "./three";
import { defaultInfo, visitByVisitor, visitState } from "./visit";
import Pathshala from "./Pathshala";
import Workshop from "./Workshop";

// --- Project posters --------------------------------------------------------

// step13b: the screens are ~2x bigger, so the poster cell is ~1.7x wider (two still fit an atlas row)
const POSTER_PX = 1000;
const PLATE_PX: [number, number] = [768, 144];
const RIBBON_PX: [number, number] = [420, 72];
export const plateW = (w: number) => Math.min(1.6, w - 0.32);
export const PLATE_H = 0.27;

/** "Flagship" ribbon: crimson cloth with gold edges and lettering. */
function drawRibbon(g: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }) {
  const { x, y, w, h } = r;
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "#c0392b");
  grad.addColorStop(1, "#7f1d14");
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  g.fillStyle = "#e9c86e";
  g.fillRect(x, y + 4, w, 4);
  g.fillRect(x, y + h - 8, w, 4);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `600 ${Math.round(h * 0.5)}px "${FONT_FAMILY}", system-ui, sans-serif`;
  g.fillStyle = "#fff1c9";
  g.fillText("★ FLAGSHIP ★", x + w / 2, y + h / 2 + 2);
  g.textAlign = "start";
  g.textBaseline = "alphabetic";
}

/** A quad turned about its facing axis (the ribbon crosses the screen's top-left corner). */
function tilted(w: number, h: number, x: number, y: number, z: number, roll: number, uv: [number, number, number, number]) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll), new THREE.Vector3(1, 1, 1));
  return quad(w, h, m, uv);
}

function ProjectScreens({ files }: { files: MediaFiles }) {
  const built = useMemo(() => {
    const sizes: [number, number][] = [];
    for (const s of STANDS) {
      const aspect = s.screen.w / s.screen.h;
      sizes.push([POSTER_PX, Math.round(POSTER_PX / aspect)], PLATE_PX);
    }
    const flagIdx = STANDS.findIndex((s) => s.flagship);
    if (flagIdx >= 0) sizes.push(RIBBON_PX);
    const roadCell = sizes.length;
    if (DIORAMAS.length) sizes.push([16, 16]);
    const atlas = makeAtlas(sizes.length ? sizes : [[4, 4]]);
    const ribbonRect = flagIdx >= 0 ? atlas.rects[STANDS.length * 2] : null;
    const roadRect = DIORAMAS.length ? atlas.rects[roadCell] : null;
    const images = new Map<number, HTMLImageElement>();
    const drawStand = (i: number) => {
      const s = STANDS[i];
      const poster = atlas.rects[i * 2];
      const plate = atlas.rects[i * 2 + 1];
      atlas.g.clearRect(poster.x, poster.y, poster.w, poster.h);
      if (s.spot.kind === "more") {
        drawMorePoster(atlas.g, poster, s.projects.map((k) => HALL.projects[k]));
        drawPlate(atlas.g, plate, "More projects");
      } else {
        const p = HALL.projects[s.projects[0]];
        drawPoster(atlas.g, poster, p, accentAt(s.projects[0]), images.get(i));
        drawPlate(atlas.g, plate, p.name);
      }
    };
    const redraw = () => {
      STANDS.forEach((_, i) => drawStand(i));
      if (ribbonRect) drawRibbon(atlas.g, ribbonRect);
      if (roadRect) {
        // the dioramas' glowing road: a flat warm gold (sampled from the middle of the cell)
        atlas.g.fillStyle = "#ffcf6a";
        atlas.g.fillRect(roadRect.x, roadRect.y, roadRect.w, roadRect.h);
      }
      atlas.tex.needsUpdate = true;
    };
    redraw();
    const geos: THREE.BufferGeometry[] = [];
    const { canvas } = atlas;
    STANDS.forEach((s, i) => {
      const sc = s.screen;
      geos.push(quad(sc.w, sc.h, at(s.x, sc.y, s.z + 0.03), uvRect(atlas.rects[i * 2], canvas.width, canvas.height)));
      geos.push(quad(plateW(s.w), PLATE_H, at(s.x, sc.y - sc.h / 2 - 0.2, s.z + 0.066), uvRect(atlas.rects[i * 2 + 1], canvas.width, canvas.height)));
      if (s.flagship && ribbonRect) {
        const rw = Math.min(0.78, sc.w * 0.42);
        const rh = rw * (RIBBON_PX[1] / RIBBON_PX[0]);
        // across the top-left corner, in front of the screen (and of a playing clip)
        geos.push(tilted(rw, rh, s.x - sc.w / 2 + rw * 0.3, sc.y + sc.h / 2 - rw * 0.3, s.z + 0.05, Math.PI / 4, uvRect(ribbonRect, canvas.width, canvas.height)));
      }
    });
    if (roadRect) {
      // inset UVs so filtering never reaches the neighbouring cells
      const [u, v, du, dv] = uvRect(roadRect, canvas.width, canvas.height);
      const uv: [number, number, number, number] = [u + du * 0.3, v + dv * 0.3, du * 0.4, dv * 0.4];
      const flat = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
      for (const { d } of DIORAMAS) {
        const x0 = d.x + d.blocks[0].x;
        const x1 = d.x + d.blocks[d.blocks.length - 1].x;
        const len = Math.max(0.08, x1 - x0);
        geos.push(quad(len, ROAD_W, flat.clone().premultiply(at((x0 + x1) / 2, d.top + ROAD_Y, roadZ(d))), uv));
      }
    }
    const geo = geos.length ? merge(geos) : new THREE.BufferGeometry();
    const mat = new THREE.MeshBasicMaterial({ map: atlas.tex, toneMapped: false });
    return { atlas, geo, mat, images, drawStand, redraw };
  }, []);
  useAnisotropy(built.atlas.tex);
  useFontsSettled(built.redraw);

  // Poster images (fallback order in content.ts): drawn into the stand's atlas cell.
  useEffect(() => {
    let live = true;
    STANDS.forEach((s, i) => {
      if (s.spot.kind !== "project") return;
      const url = projectPoster(HALL.projects[s.projects[0]], files);
      if (!url) return;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (!live) return;
        built.images.set(i, img);
        built.drawStand(i);
        built.atlas.tex.needsUpdate = true;
      };
      img.src = url;
    });
    return () => {
      live = false;
    };
  }, [files, built]);

  // Soft glow, brighter at night (ThemeDriver drives it; bloom picks up the > 1 values).
  useEffect(() => register(themeTargets.glows, { mat: built.mat, day: 0.84, night: 1.12 }), [built.mat]);
  useEffect(
    () => () => {
      built.geo.dispose();
      built.mat.dispose();
      built.atlas.tex.dispose();
    },
    [built],
  );
  return <mesh geometry={built.geo} material={built.mat} />;
}

// --- Rings, click targets ---------------------------------------------------

function SpotRings() {
  const built = useMemo(() => {
    const geos = RINGS.map((ring) => {
      const g = new THREE.RingGeometry(0.42, 0.5, 32);
      g.rotateX(-Math.PI / 2);
      g.translate(ring[0], 0.045, ring[1]);
      return g;
    });
    const geo = geos.length ? merge(geos) : new THREE.BufferGeometry();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffcf5a").multiplyScalar(1.2), transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false });
    const hiMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe08a").multiplyScalar(1.5), transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false });
    const hiGeo = new THREE.RingGeometry(0.4, 0.56, 32).rotateX(-Math.PI / 2);
    return { geo, mat, hiGeo, hiMat };
  }, []);
  const hi = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!hi.current) return;
    const info = useWorld.getState().info;
    const spot = info ? spotByKey(info.spot) : undefined;
    hi.current.visible = !!spot;
    if (spot) hi.current.position.set(spot.ring[0], 0.05, spot.ring[1]);
  });
  useEffect(
    () => () => {
      built.geo.dispose();
      built.mat.dispose();
      built.hiGeo.dispose();
      built.hiMat.dispose();
    },
    [built],
  );
  return (
    <>
      <mesh geometry={built.geo} material={built.mat} renderOrder={1} />
      <mesh ref={hi} geometry={built.hiGeo} material={built.hiMat} visible={false} renderOrder={2} />
    </>
  );
}

/** Within this many metres of a stand, opening its video also flies the camera into the screen. */
const FLY_NEAR_M = 9;

/** One invisible mesh of boxes over the stands, plaques and easels. Clicking one walks there and opens it. */
function ClickTargets() {
  const built = useMemo(() => {
    const boxes = CLICK_BOXES;
    const geos = boxes.map((b) => new THREE.BoxGeometry(b.w, b.h, b.d).applyMatrix4(at(b.spot.x + (b.dx ?? 0), b.y, b.spot.z + (b.dz ?? 0), b.spot.yaw)));
    const geo = boxes.length ? merge(geos) : new THREE.BufferGeometry();
    // 12 triangles per box
    const boxOfFace = (face: number) => boxes[Math.floor(face / 12)];
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    return { geo, mat, boxOfFace };
  }, []);
  useEffect(
    () => () => {
      built.geo.dispose();
      built.mat.dispose();
    },
    [built],
  );
  return (
    <mesh
      geometry={built.geo}
      material={built.mat}
      onPointerOver={(e) => {
        e.stopPropagation();
        cursor("pointer")();
      }}
      onPointerOut={cursor("")}
      onPointerDown={(e) => pointerClaim.claim(e.pointerId)}
      onClick={(e) => {
        e.stopPropagation();
        const box = e.faceIndex != null ? built.boxOfFace(e.faceIndex) : undefined;
        const spot = box?.spot;
        const base = spot ? defaultInfo(spot) : null;
        if (!base) return;
        const ref = box?.item ? { ...base, id: box.item } : base;
        // A click on a project stand (not its diorama) opens the demo video. The camera flies into the
        // screen only when the visitor is already near; from across the hall the video just opens.
        if (spot?.kind === "project" && box?.part !== "diorama" && ref.kind === "project") {
          const w = useWorld.getState();
          w.interrupt();
          w.openCinema(ref.id, Math.hypot(playerPos.x - spot.ring[0], playerPos.z - spot.ring[1]) < FLY_NEAR_M);
          return;
        }
        void visitByVisitor(ref);
      }}
    />
  );
}

// --- Walk-up logic + entry line ---------------------------------------------

const ENTRY_COOLDOWN_S = 45;

function HallLogic() {
  const last = useRef(0);
  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (now - last.current < 0.1) return;
    last.current = now;
    const w = useWorld.getState();
    if (w.pickerOpen || !w.character) return;
    const px = playerPos.x;
    const pz = playerPos.z;
    const dist = (s: Spot) => Math.hypot(px - s.ring[0], pz - s.ring[1]);
    // close when the avatar walks away (unless it's walking there right now)
    const open = w.info ? spotByKey(w.info.spot) : undefined;
    if (open && visitState.key !== open.key && dist(open) > CLOSE_R) w.closeInfo(false);
    const dismissed = w.infoDismissed ? spotByKey(w.infoDismissed) : undefined;
    if (dismissed && dist(dismissed) > CLOSE_R) w.clearInfoDismissed();
    if (visitState.key || avatarMotion.speed > OPEN_SPEED) return;
    let best: Spot | null = null;
    let bestD = OPEN_R;
    for (const s of SPOTS) {
      const d = dist(s);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (!best || best.key === useWorld.getState().info?.spot || best.key === useWorld.getState().infoDismissed) return;
    const ref = defaultInfo(best);
    if (ref) useWorld.getState().openInfo(ref);
  });

  // Entering the hall's main ring: one short robot line (not during a tour or a robot-led walk).
  useEffect(() => {
    let lastSaid = -Infinity;
    return useWorld.subscribe((s, prev) => {
      if (s.activeZone === prev.activeZone || s.activeZone !== "project-hall") return;
      if (s.tourActive || robotMotion.leading || visitState.key || !s.character) return;
      const t = performance.now() / 1000;
      if (t - lastSaid < ENTRY_COOLDOWN_S) return;
      lastSaid = t;
      const ordered = leadFirst(HALL.projects, LEAD_ID);
      const first = ordered[0];
      const name = profile.name.split(" ")[0];
      useRobot.getState().say(
        HALL.projects.length
          ? `Here's everything ${name} has built: walk up to any stand.`
          : `The stands are waiting for ${name}'s first project. Check back soon!`,
        first
          ? [
              ...ordered.slice(0, 2).map((p) => ({ label: `Open ${p.name}`, action: { type: "openProject" as const, projectId: p.id } })),
              { label: "Show me around", message: "Show me around" },
            ]
          : [{ label: "Show me around", message: "Show me around" }],
      );
    });
  }, []);
  return null;
}

/** ?debug (or dev): window.__halls for automated checks (layout, screen positions for real clicks). */
function DebugHook() {
  const { camera, gl } = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && !new URLSearchParams(window.location.search).has("debug")) return;
    const w = window as unknown as { __halls?: unknown };
    w.__halls = {
      lead: LEAD_ID,
      counts: { projects: HALL.projects.length, stands: STANDS.length, spots: SPOTS.length, courses: HALL.courses.length },
      /** Clear the robot's speech bubble (clean screenshots). */
      hideBubble: () => useRobot.getState().hide(),
      spots: () => SPOTS.map((s) => ({ key: s.key, x: s.x, z: s.z, ring: s.ring })),
      stands: () => STANDS.map((s) => ({ key: s.spot.key, x: s.x, z: s.z, w: s.w, flagship: s.flagship, screen: s.screen, ring: s.spot.ring })),
      dioramas: dioramaDebug,
      /** Hide/show a showcase layer ("halo", "live", "packets", "labels") to measure its cost. */
      hide: (part: string, on = true) => (on ? debugHidden.add(part) : debugHidden.delete(part)),
      books: () => (SHELF?.books ?? []).map((b) => ({ x: b.x, y: b.y, z: SHELF!.z + SHELF!.d / 2 - 0.02 })),
      /** World point -> CSS px in the canvas. */
      screen: (x: number, y: number, z: number) => {
        const v = new THREE.Vector3(x, y, z).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
    };
    return () => {
      delete w.__halls;
    };
  }, [camera, gl]);
  return null;
}

/** Suspends until the label font is ready (the atlases need it). */
export default function Halls({
  thumbs,
  posters = [],
  liveVideo,
  reducedMotion,
}: {
  thumbs: string[];
  posters?: string[];
  /** Clips autoplay on the ring (off on phones and with ?perf=low: tap the screen instead). */
  liveVideo: boolean;
  reducedMotion: boolean;
}) {
  use(loadLabelFonts());
  const files = useMemo<MediaFiles>(() => ({ thumbs: new Set(thumbs), showcasePosters: new Set(posters) }), [thumbs, posters]);
  return (
    <group>
      <ProjectScreens files={files} />
      <FlagshipHalo reducedMotion={reducedMotion} />
      <Dioramas reducedMotion={reducedMotion} />
      <LiveScreen autoplay={liveVideo} />
      <Pathshala reducedMotion={reducedMotion} />
      <Workshop />
      <SpotRings />
      <ClickTargets />
      <HallLogic />
      <DebugHook />
    </group>
  );
}
