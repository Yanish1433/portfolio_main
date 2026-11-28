// The clay as ONE lathe-style BufferGeometry with a fixed layout: the outer wall (the 12 editable radii, or every other one for
// small shelf pots), the rim, the inside and the floor. `update()` rewrites positions and normals in place (no allocation), so
// it can run once per frame while the clay is being pulled. UV: x = round the pot (0..1, 0.5 is the "front" = local -z),
// y = height fraction of the outer wall (the inside gets a blank strip), so a logo decal sits at u = 0.5.
import * as THREE from "three";
import { BANDS, innerR } from "./clayProfile";

export const SEG = 32;
export const SEG_LITE = 20;

export function outerIndices(bandStep: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < BANDS; k += bandStep) out.push(k);
  if (out[out.length - 1] !== BANDS - 1) out.push(BANDS - 1);
  return out;
}

export class ClayGeometry {
  readonly geometry = new THREE.BufferGeometry();
  readonly points: number;
  readonly seg: number;
  private readonly idx: number[];
  private readonly pr: Float32Array;
  private readonly py: Float32Array;
  private readonly pv: Float32Array;
  private readonly pnr: Float32Array;
  private readonly pny: Float32Array;
  private readonly sin: Float32Array;
  private readonly cos: Float32Array;
  private readonly pos: Float32Array;
  private readonly nor: Float32Array;

  constructor(seg = SEG, bandStep = 1) {
    this.seg = seg;
    this.idx = outerIndices(bandStep);
    const P = 1 + this.idx.length + 3 + 1;
    this.points = P;
    this.pr = new Float32Array(P);
    this.py = new Float32Array(P);
    this.pv = new Float32Array(P);
    this.pnr = new Float32Array(P);
    this.pny = new Float32Array(P);
    this.sin = new Float32Array(seg + 1);
    this.cos = new Float32Array(seg + 1);
    for (let i = 0; i <= seg; i++) {
      this.sin[i] = Math.sin((i / seg) * Math.PI * 2);
      this.cos[i] = Math.cos((i / seg) * Math.PI * 2);
    }
    const count = P * (seg + 1);
    this.pos = new Float32Array(count * 3);
    this.nor = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const col = new Float32Array(count * 3).fill(1);
    const index = new Uint16Array((P - 1) * seg * 6);
    let t = 0;
    for (let j = 0; j < P - 1; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * (seg + 1) + i;
        const b = a + 1;
        const c = a + seg + 1;
        const d = c + 1;
        index[t++] = a;
        index[t++] = b;
        index[t++] = c;
        index[t++] = b;
        index[t++] = d;
        index[t++] = c;
      }
    }
    const g = this.geometry;
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("normal", new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    this.uvOf = uv;
    this.update(new Array<number>(BANDS).fill(0.25), 0.5);
    g.computeBoundingSphere();
  }

  private readonly uvOf: Float32Array;

  /** Rewrite the vertices for radii `r` (12) and height `h`. Allocation-free. */
  update(r: ArrayLike<number>, h: number): void {
    const { pr, py, pv, pnr, pny, idx, seg } = this;
    const P = this.points;
    let n = 0;
    pr[n] = 0;
    py[n] = 0;
    pv[n] = 0;
    n++;
    for (let q = 0; q < idx.length; q++) {
      const k = idx[q];
      pr[n] = r[k];
      py[n] = (k / (BANDS - 1)) * h;
      pv[n] = k / (BANDS - 1);
      n++;
    }
    pr[n] = innerR(r[BANDS - 1]);
    py[n] = h;
    pv[n] = 0.03;
    n++;
    pr[n] = innerR(r[6]);
    py[n] = h * 0.55;
    pv[n] = 0.03;
    n++;
    pr[n] = innerR(r[1]) * 0.85;
    py[n] = h * 0.18;
    pv[n] = 0.03;
    n++;
    pr[n] = 0;
    py[n] = h * 0.14;
    pv[n] = 0.03;
    for (let j = 0; j < P; j++) {
      const a = j > 0 ? j - 1 : 0;
      const b = j < P - 1 ? j + 1 : P - 1;
      const dr = pr[b] - pr[a];
      const dy = py[b] - py[a];
      const len = Math.hypot(dr, dy) || 1;
      pnr[j] = dy / len;
      pny[j] = -dr / len;
    }
    const { pos, nor, sin, cos } = this;
    let o = 0;
    for (let j = 0; j < P; j++) {
      const rr = pr[j];
      const yy = py[j];
      const nr = pnr[j];
      const ny = pny[j];
      for (let i = 0; i <= seg; i++) {
        pos[o] = rr * sin[i];
        pos[o + 1] = yy;
        pos[o + 2] = rr * cos[i];
        nor[o] = nr * sin[i];
        nor[o + 1] = ny;
        nor[o + 2] = nr * cos[i];
        o += 3;
      }
    }
    // the uv never depends on the radii or the height: written once
    if (!this.uvDone) {
      this.uvDone = true;
      const uv = this.uvOf;
      let u = 0;
      for (let j = 0; j < P; j++)
        for (let i = 0; i <= seg; i++) {
          uv[u++] = i / seg;
          uv[u++] = pv[j];
        }
      this.geometry.attributes.uv.needsUpdate = true;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }

  private uvDone = false;

  /** Centre height of the pot's middle (for glow / sparks). */
  heightOf(h: number) {
    return h * 0.5;
  }
}
