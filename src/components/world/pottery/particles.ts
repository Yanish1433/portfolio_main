// One pooled point-sprite buffer for everything that flies: slip splashes, kiln sparks + glow, the band marker, confetti.
// Fixed size, no allocation after construction. Slot 0 is the kiln glow; slots 1..RING are the keyboard band marker.
import * as THREE from "three";

export const MAX = 160;
export const RING = 14;
const FIRST_FREE = 1 + RING;

/** Prayer-flag colours: blue, white, red, green, yellow (as linear-ish additive colours). */
export const FLAG_COLOURS: [number, number, number][] = [
  [0.1, 0.35, 1.4],
  [1.2, 1.2, 1.2],
  [1.5, 0.15, 0.15],
  [0.15, 1.1, 0.3],
  [1.5, 1.1, 0.15],
];

export class Particles {
  readonly geometry = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly alpha = new Float32Array(MAX);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX); // seconds left (0 = free)
  private readonly span = new Float32Array(MAX);
  private readonly grav = new Float32Array(MAX);
  private readonly kind = new Uint8Array(MAX); // 0 free, 1 splash, 2 spark, 3 confetti
  private cursor = FIRST_FREE;
  /** True while anything is alive (the mesh can be hidden otherwise). */
  alive = 0;

  constructor() {
    const g = this.geometry;
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(14, 1, 4.5), 30);
  }

  private take(): number {
    for (let n = 0; n < MAX - FIRST_FREE; n++) {
      const i = FIRST_FREE + ((this.cursor - FIRST_FREE + n) % (MAX - FIRST_FREE));
      if (this.life[i] <= 0) {
        this.cursor = i + 1;
        return i;
      }
    }
    return -1;
  }

  private spawn(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, r: number, g: number, b: number, grav: number) {
    const i = this.take();
    if (i < 0) return;
    this.kind[i] = kind;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.span[i] = life;
    this.size[i] = size;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.alpha[i] = 1;
    this.grav[i] = grav;
  }

  /** A fleck of wet slip thrown off the spinning clay (pale clay colour, falls). */
  splash(x: number, y: number, z: number, tx: number, tz: number, r = Math.random) {
    const sp = 0.5 + r() * 0.9;
    this.spawn(1, x, y, z, tx * sp + (r() - 0.5) * 0.3, 0.5 + r() * 0.8, tz * sp + (r() - 0.5) * 0.3, 0.45 + r() * 0.35, 0.016 + r() * 0.014, 0.85 * 0.9, 0.72 * 0.9, 0.55 * 0.9, 5.5);
  }

  /** A glowing ember rising from the kiln pot. */
  spark(x: number, y: number, z: number, r = Math.random) {
    this.spawn(2, x + (r() - 0.5) * 0.4, y, z + (r() - 0.5) * 0.4, (r() - 0.5) * 0.25, 0.35 + r() * 0.5, (r() - 0.5) * 0.25, 0.8 + r() * 0.7, 0.02 + r() * 0.018, 1.6, 0.55 + r() * 0.3, 0.12, -0.15);
  }

  /** Prayer-flag confetti burst. */
  confetti(x: number, y: number, z: number, count: number, r = Math.random) {
    for (let n = 0; n < count; n++) {
      const c = FLAG_COLOURS[n % FLAG_COLOURS.length];
      const a = r() * Math.PI * 2;
      const up = 1.8 + r() * 2.4;
      const out = 0.5 + r() * 1.7;
      this.spawn(3, x, y, z, Math.cos(a) * out, up, Math.sin(a) * out, 1.4 + r() * 1.2, 0.03 + r() * 0.025, c[0], c[1], c[2], 4.2);
    }
  }

  /** The kiln glow (slot 0): `a` 0..1, size in metres. */
  glow(x: number, y: number, z: number, a: number, size: number) {
    this.pos[0] = x;
    this.pos[1] = y;
    this.pos[2] = z;
    this.size[0] = size;
    this.alpha[0] = a;
    this.col[0] = 1.6;
    this.col[1] = 0.5;
    this.col[2] = 0.1;
    if (a > 0) this.alive = Math.max(this.alive, 1);
  }

  /** The keyboard band marker: a ring of soft dots round the pot at height y (hidden when a = 0). */
  marker(x: number, y: number, z: number, radius: number, spin: number, a: number) {
    for (let n = 0; n < RING; n++) {
      const i = 1 + n;
      const ang = (n / RING) * Math.PI * 2 + spin;
      this.pos[i * 3] = x + Math.sin(ang) * radius;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z + Math.cos(ang) * radius;
      this.size[i] = 0.03;
      this.alpha[i] = a * 0.7;
      this.col[i * 3] = 1.1;
      this.col[i * 3 + 1] = 0.85;
      this.col[i * 3 + 2] = 0.3;
    }
    if (a > 0) this.alive = Math.max(this.alive, 1);
  }

  /** Advance everything by dt; returns how many free-flying particles are alive. */
  step(dt: number): number {
    let n = 0;
    for (let i = FIRST_FREE; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.kind[i] = 0;
        continue;
      }
      n++;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.span[i];
      this.alpha[i] = this.kind[i] === 3 ? Math.min(1, f * 3) : f;
      if (this.kind[i] === 3) {
        // confetti flutters and slows
        this.vel[i * 3] *= 1 - 1.2 * dt;
        this.vel[i * 3 + 2] *= 1 - 1.2 * dt;
      }
    }
    this.alive = n;
    const g = this.geometry.attributes;
    g.position.needsUpdate = true;
    g.aColor.needsUpdate = true;
    g.aSize.needsUpdate = true;
    g.aAlpha.needsUpdate = true;
    return n;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.kind.fill(0);
    this.alive = 0;
    const g = this.geometry.attributes;
    g.aAlpha.needsUpdate = true;
  }
}
