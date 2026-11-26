// "Diyo", the robot buddy: a small brass lantern-drone built in code.
// One merged geometry (2 groups: brass body, glass screen) + a glow sprite = 3 draw calls.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type EyeState = "open" | "blink" | "happy" | "thinking";

/** Brass with a Newari lattice band; the emissive map lets the lattice holes glow at night. */
function latticeTextures() {
  const W = 512;
  const H = 256;
  const make = () => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return c;
  };
  const base = make();
  const g = base.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#8a5a22");
  grad.addColorStop(0.5, "#c8923e");
  grad.addColorStop(1, "#7a4a1c");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const glow = make();
  const e = glow.getContext("2d")!;
  e.fillStyle = "#000";
  e.fillRect(0, 0, W, H);

  // Copper rims (v = 1 is the top of the lathe profile).
  g.fillStyle = "#6b3418";
  for (const y of [H * 0.22, H * 0.76]) g.fillRect(0, y - 5, W, 10);
  // Lattice band: a diamond grid with a small star in each diamond (jhyal-style).
  const y0 = H * 0.28;
  const y1 = H * 0.7;
  const cell = 32;
  g.save();
  g.beginPath();
  g.rect(0, y0, W, y1 - y0);
  g.clip();
  g.fillStyle = "#3a1e0c";
  g.fillRect(0, y0, W, y1 - y0);
  e.save();
  e.beginPath();
  e.rect(0, y0, W, y1 - y0);
  e.clip();
  for (let x = -cell; x < W + cell; x += cell) {
    for (let y = y0 - cell; y < y1 + cell; y += cell / 2) {
      const cx = x + ((Math.round((y - y0) / (cell / 2)) % 2) * cell) / 2;
      // hole
      g.fillStyle = "#f3c46a";
      e.fillStyle = "#ffffff";
      for (const ctx of [g, e]) {
        ctx.beginPath();
        ctx.moveTo(cx, y - 7);
        ctx.lineTo(cx + 7, y);
        ctx.lineTo(cx, y + 7);
        ctx.lineTo(cx - 7, y);
        ctx.closePath();
        ctx.fill();
      }
      // brass bars between holes
      g.strokeStyle = "#b07a32";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx - cell / 2, y);
      g.lineTo(cx, y - cell / 4);
      g.lineTo(cx + cell / 2, y);
      g.stroke();
    }
  }
  g.restore();
  e.restore();
  // Hammered-brass speckle.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(255,226,160,0.10)" : "rgba(60,30,10,0.10)";
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  const map = new THREE.CanvasTexture(base);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const emissiveMap = new THREE.CanvasTexture(glow);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = THREE.RepeatWrapping;
  return { map, emissiveMap };
}

/** Screen face: a small canvas redrawn only when the eye state changes. */
export function createEyes() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  let last: EyeState | null = null;

  const draw = (state: EyeState) => {
    if (state === last) return;
    last = state;
    const bg = g.createLinearGradient(0, 0, 0, 128);
    bg.addColorStop(0, "#2a2230");
    bg.addColorStop(1, "#0c090e");
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 128);
    // glass highlight
    g.fillStyle = "rgba(255,255,255,0.07)";
    g.beginPath();
    g.ellipse(80, 22, 70, 10, -0.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#8ff5e6";
    g.strokeStyle = "#8ff5e6";
    g.lineCap = "round";
    g.shadowColor = "#8ff5e6";
    g.shadowBlur = 12;
    const eyes = [88, 168];
    for (const x of eyes) {
      g.beginPath();
      if (state === "open") {
        g.roundRect(x - 13, 44, 26, 40, 13);
        g.fill();
      } else if (state === "blink") {
        g.lineWidth = 7;
        g.moveTo(x - 14, 66);
        g.lineTo(x + 14, 66);
        g.stroke();
      } else if (state === "happy") {
        g.lineWidth = 8;
        g.arc(x, 72, 15, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      } else {
        // thinking: eyes glance up-right
        g.roundRect(x - 9, 36, 22, 30, 11);
        g.fill();
      }
    }
    if (state === "thinking") {
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(104 + i * 24, 100, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.shadowBlur = 0;
    tex.needsUpdate = true;
  };
  draw("open");
  return { texture: tex, draw };
}

/** Soft radial glow (sprite, additive). */
export function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,214,140,1)");
  grad.addColorStop(0.35, "rgba(255,170,70,0.45)");
  grad.addColorStop(1, "rgba(255,150,50,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Body + screen as one geometry with two material groups (0 = brass, 1 = screen). ~1.6k tris. */
export function createRobotGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  // Lantern body (lathe, v runs bottom -> top).
  const profile = [
    [0.0, -0.21],
    [0.07, -0.205],
    [0.13, -0.175],
    [0.175, -0.12],
    [0.198, -0.05],
    [0.2, 0.0],
    [0.196, 0.06],
    [0.172, 0.12],
    [0.13, 0.165],
    [0.07, 0.19],
    [0.0, 0.195],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  parts.push(new THREE.LatheGeometry(profile, 28));
  // Little pagoda roof, finial (gajur) and bottom tassel cone.
  const roof = new THREE.ConeGeometry(0.17, 0.08, 28, 1, true);
  roof.translate(0, 0.215, 0);
  parts.push(roof);
  const roofUnder = new THREE.CircleGeometry(0.17, 28);
  roofUnder.rotateX(Math.PI / 2);
  roofUnder.translate(0, 0.175, 0);
  parts.push(roofUnder);
  const finial = new THREE.ConeGeometry(0.025, 0.09, 10);
  finial.translate(0, 0.3, 0);
  parts.push(finial);
  const bead = new THREE.SphereGeometry(0.025, 10, 8);
  bead.translate(0, 0.258, 0);
  parts.push(bead);
  const tassel = new THREE.ConeGeometry(0.045, 0.09, 12);
  tassel.rotateX(Math.PI);
  tassel.translate(0, -0.245, 0);
  parts.push(tassel);
  // Fin-arms.
  for (const side of [-1, 1]) {
    const fin = new THREE.SphereGeometry(0.075, 12, 8);
    fin.scale(0.32, 1, 0.75);
    fin.rotateZ(side * 0.5);
    fin.translate(side * 0.215, -0.04, 0);
    parts.push(fin);
  }
  const body = mergeGeometries(
    parts.map((p) => (p.index ? p.toNonIndexed() : p)),
    false,
  );
  // Glass screen: a sphere patch on the front (+Z), slightly proud of the body.
  const screen = new THREE.SphereGeometry(0.212, 16, 8, Math.PI / 2 - 0.62, 1.24, Math.PI / 2 - 0.4, 0.8).toNonIndexed();
  const merged = mergeGeometries([body!, screen], true)!;
  for (const p of parts) p.dispose();
  screen.dispose();
  body?.dispose();
  merged.computeBoundingSphere();
  return merged;
}

export function createRobotMaterials(env: THREE.Texture | null) {
  const { map, emissiveMap } = latticeTextures();
  const brass = new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: new THREE.Color("#ffae42"),
    emissiveIntensity: 0.2,
    metalness: 0.7,
    roughness: 0.38,
    envMap: env,
    envMapIntensity: 0.9,
    side: THREE.DoubleSide,
  });
  const eyes = createEyes();
  const screen = new THREE.MeshBasicMaterial({ map: eyes.texture, toneMapped: false });
  return { brass, screen, eyes, dispose: () => [map, emissiveMap, eyes.texture, brass, screen].forEach((x) => x.dispose()) };
}
