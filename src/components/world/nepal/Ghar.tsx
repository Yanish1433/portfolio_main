"use client";

// The photo in the Ghar's carved window (one quad = 1 draw call) plus an invisible click box over
// the house. With no photo it shows a generated portrait card (initials on a warm painted panel).
import { use, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { profile } from "@/content/profile";
import { GHAR } from "../zones";
import { gharWindow } from "./kit";
import { initials } from "../about/aboutView";
import { loadLabelFonts, FONT_FAMILY } from "./LabelSprites";
import { pointerClaim } from "../input";
import { useWorld } from "@/store/world";
import { visitGhar } from "../about/visitGhar";

function portraitCanvas(text: string): HTMLCanvasElement {
  const W = 288;
  const H = 320;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#e9a14a");
  bg.addColorStop(0.55, "#c9622f");
  bg.addColorStop(1, "#8e2f26");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // painted sun and hills
  g.fillStyle = "rgba(255,226,150,0.55)";
  g.beginPath();
  g.arc(W * 0.7, H * 0.3, 44, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(90,30,20,0.35)";
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(0, H * 0.78);
  g.quadraticCurveTo(W * 0.3, H * 0.6, W * 0.55, H * 0.78);
  g.quadraticCurveTo(W * 0.8, H * 0.62, W, H * 0.74);
  g.lineTo(W, H);
  g.fill();
  g.strokeStyle = "rgba(255,226,150,0.9)";
  g.lineWidth = 6;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `600 130px "${FONT_FAMILY}", sans-serif`;
  g.lineWidth = 8;
  g.strokeStyle = "rgba(70,20,14,0.6)";
  g.strokeText(text, W / 2, H * 0.5);
  g.fillStyle = "#fff4dc";
  g.fillText(text, W / 2, H * 0.5);
  return c;
}

export default function Ghar({ photo }: { photo: string | null }) {
  use(loadLabelFonts());
  const win = useMemo(() => gharWindow(GHAR), []);
  const card = useMemo(() => {
    const t = new THREE.CanvasTexture(portraitCanvas(initials(profile.name)));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const [tex, setTex] = useState<THREE.Texture>(card);

  useEffect(() => {
    if (!photo) return;
    let dead = false;
    new THREE.TextureLoader().load(
      photo,
      (t) => {
        if (dead) return t.dispose();
        t.colorSpace = THREE.SRGBColorSpace;
        // cover-fit into the frame
        const img = t.image as { width: number; height: number };
        const want = win.photoW / win.photoH;
        const have = img.width / img.height;
        if (have > want) {
          t.repeat.set(want / have, 1);
          t.offset.set((1 - want / have) / 2, 0);
        } else {
          t.repeat.set(1, have / want);
          t.offset.set(0, (1 - have / want) / 2);
        }
        setTex(t);
      },
      undefined,
      () => undefined, // keep the portrait card
    );
    return () => {
      dead = true;
    };
  }, [photo, win]);

  const pos: [number, number, number] = [GHAR.x, win.y, GHAR.z + win.z + win.photoZ];
  const cursor = (v: string) => () => {
    document.body.style.cursor = v;
  };
  const h = 6.2;
  return (
    <group>
      <mesh position={pos}>
        <planeGeometry args={[win.photoW, win.photoH]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.28} roughness={0.9} />
      </mesh>
      {/* tap the house to walk up to it */}
      <mesh
        position={[GHAR.x, h / 2, GHAR.z]}
        onPointerOver={(e) => {
          e.stopPropagation();
          cursor("pointer")();
        }}
        onPointerOut={cursor("")}
        onPointerDown={(e) => pointerClaim.claim(e.pointerId)}
        onClick={(e) => {
          e.stopPropagation();
          useWorld.getState().interrupt();
          visitGhar();
        }}
      >
        <boxGeometry args={[GHAR.w + 0.4, h, GHAR.d + 0.4]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}

