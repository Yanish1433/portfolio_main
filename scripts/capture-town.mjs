// Town overview thumbnails for the landing "Explore my 3D world" door: public/landing/town-{morning,day,evening,night}.webp
//
// Re-run after the island / waterfall upgrades (20a, 20b):
//   1. start the app (production `next start` or `next dev`) on any port, e.g. 3152
//   2. node scripts/capture-town.mjs --base http://localhost:3152 [--out public/landing] [--lock <dir>]
//
// How: opens /town?flyin=0&debug&time=HH:MM, waits for the store's `loaded` + a little for shadows, injects CSS that hides
// every HTML overlay (the canvas stays), sets the fixed debug camera (window.__world.cam, no world/** changes needed),
// takes a 1600x1000 screenshot and converts it with sharp (already in node_modules) to ~960 px WebP, <= 90 KB each.
// Tune the camera in POSE below if the town changes size. WebGL: headed Chromium + ANGLE/D3D11 (falls back to --use-gl=swiftshader).
//   --pose x,y,z,lx,ly,lz   override the camera for a quick experiment
//   --only day              capture one look
//   --lock <dir>            RAM lock: mkdir <dir> (waits while it exists), removed at the end
//   --pw <dir>              folder holding node_modules/playwright (default: newest ~/AppData/Local/npm-cache/_npx/*, or the repo's)
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3152").replace(/\/$/, "");
const OUT = path.resolve(arg("out", "public/landing"));
const LOCK = arg("lock", "");
const ONLY = arg("only", "");
const MAX_KB = 90;
/** Eagle view: from the south and above, the whole floating island (wall, pagoda, palace, halls) with a little sky. */
const POSE = (arg("pose", "") ? arg("pose").split(",").map(Number) : [0, 40, 56, 0, -5, 0]);
const LOOKS = [
  ["morning", "07:00"],
  ["day", "12:00"],
  ["evening", "18:05"],
  ["night", "21:30"],
];
// Hide every HTML overlay: the 3D canvas is the only thing that stays.
const HIDE = `*:not(canvas):not(:has(canvas)) { visibility: hidden !important; }
canvas { visibility: visible !important; }
nextjs-portal { display: none !important; }`;

function loadDeps() {
  const roots = [];
  if (arg("pw", "")) roots.push(path.resolve(arg("pw")));
  roots.push(process.cwd());
  const npx = path.join(homedir(), "AppData/Local/npm-cache/_npx");
  if (existsSync(npx)) {
    for (const d of readdirSync(npx).map((n) => path.join(npx, n)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)) roots.push(d);
  }
  for (const r of roots) {
    try {
      const req = createRequire(path.join(r, "noop.js"));
      return { chromium: req("playwright").chromium, sharp: createRequire(path.join(process.cwd(), "noop.js"))("sharp") };
    } catch {
      /* try the next folder */
    }
  }
  throw new Error("playwright not found: pass --pw <folder containing node_modules/playwright>");
}

async function withLock(fn) {
  if (!LOCK) return fn();
  for (;;) {
    try {
      mkdirSync(LOCK);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
  }
}

async function launch(chromium) {
  const tries = [
    { headless: false, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] },
    { headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] },
    { headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  ];
  for (const o of tries) {
    const b = await chromium.launch({ ...o, args: [...o.args, "--window-size=1600,1000"] });
    const p = await b.newPage();
    const ok = await p.evaluate(() => !!document.createElement("canvas").getContext("webgl2")).catch(() => false);
    await p.close();
    if (ok) return b;
    await b.close();
  }
  throw new Error("BLOCKED: webgl capture (no Chromium flag set gave a WebGL2 context)");
}

await withLock(async () => {
  const { chromium, sharp } = loadDeps();
  mkdirSync(OUT, { recursive: true });
  const browser = await launch(chromium);
  try {
    for (const [name, time] of LOOKS) {
      if (ONLY && ONLY !== name) continue;
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
      await page.goto(`${BASE}/town?flyin=0&debug&time=${time}`, { waitUntil: "load", timeout: 180000 });
      await page.waitForFunction(() => window.__store?.getState?.().loaded === true && window.__world, null, { timeout: 180000 });
      await page.waitForTimeout(2000); // the player rig mounts a moment after `loaded`
      await page.addStyleTag({ content: HIDE });
      await page.evaluate(([p]) => window.__world.cam({ pos: p.slice(0, 3), look: p.slice(3) }), [POSE]);
      await page.waitForTimeout(7000); // ThemeDriver eases the shown time toward ?time=; wait for it + shadows
      const png = await page.screenshot({ type: "png" });
      let q = 82;
      let buf;
      do {
        buf = await sharp(png).resize({ width: 960 }).webp({ quality: q, effort: 6 }).toBuffer();
        q -= 6;
      } while (buf.length > MAX_KB * 1024 && q > 30);
      writeFileSync(path.join(OUT, `town-${name}.webp`), buf);
      console.log(`town-${name}.webp  ${time}  ${(buf.length / 1024).toFixed(1)} KB`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
