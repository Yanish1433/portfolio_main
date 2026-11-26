// Glowing threads from a pot to the project stands that used its skill: pure geometry (no three.js).
// All arcs share ONE buffer: positions, `u` (0..1 along each arc, drives the dash shader) and indices.

export type V3 = [number, number, number];

/** The threads fade out after this long (seconds), or as soon as another pot is chosen. */
export const THREAD_SECONDS = 8;
const FADE_IN = 0.35;
const FADE_OUT = 1.2;

/** 0..1 opacity of the threads `age` seconds after the pot was chosen. */
export function threadAlpha(age: number): number {
  if (age < 0 || age >= THREAD_SECONDS) return 0;
  return Math.min(1, age / FADE_IN, (THREAD_SECONDS - age) / FADE_OUT);
}

/** Points along a quadratic arc from a to b whose middle is lifted by about 2.2 m + 12% of the distance. */
export function arcPoints(a: V3, b: V3, segments = 36): V3[] {
  const dist = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 2.2 + dist * 0.12, (a[2] + b[2]) / 2];
  const out: V3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * mid[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * mid[1] + t * t * b[1],
      u * u * a[2] + 2 * u * t * mid[2] + t * t * b[2],
    ]);
  }
  return out;
}

export type ThreadBuffers = { positions: Float32Array; u: Float32Array; indices: Uint16Array; triangles: number };

/** A thin tube (a few radial sides) along each arc, all merged into one set of buffers. */
export function threadBuffers(from: V3, targets: V3[], opts: { radius?: number; radial?: number; segments?: number } = {}): ThreadBuffers {
  const radius = opts.radius ?? 0.03;
  const radial = opts.radial ?? 5;
  const segments = opts.segments ?? 36;
  const rings = segments + 1;
  const verts = targets.length * rings * radial;
  const positions = new Float32Array(verts * 3);
  const u = new Float32Array(verts);
  const indices = new Uint16Array(targets.length * segments * radial * 6);
  let vi = 0;
  let ii = 0;
  for (const to of targets) {
    const pts = arcPoints(from, to, segments);
    const base = vi;
    for (let i = 0; i < rings; i++) {
      const p = pts[i];
      const q = pts[Math.min(i + 1, rings - 1)];
      const r = pts[Math.max(i - 1, 0)];
      // unit tangent
      let tx = q[0] - r[0];
      let ty = q[1] - r[1];
      let tz = q[2] - r[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      // n1 = tangent x up(0,1,0), n2 = tangent x n1 (the arc lies near a vertical plane, so "up" is a safe helper)
      let n1x = -tz;
      let n1z = tx;
      let nl = Math.hypot(n1x, n1z);
      if (nl < 1e-4) {
        n1x = 1;
        n1z = 0;
        nl = 1;
      }
      n1x /= nl;
      n1z /= nl;
      const n2x = ty * n1z;
      const n2y = tz * n1x - tx * n1z;
      const n2z = -ty * n1x;
      for (let k = 0; k < radial; k++) {
        const ang = (k / radial) * Math.PI * 2;
        const c = Math.cos(ang) * radius;
        const s = Math.sin(ang) * radius;
        positions[vi * 3] = p[0] + n1x * c + n2x * s;
        positions[vi * 3 + 1] = p[1] + n2y * s;
        positions[vi * 3 + 2] = p[2] + n1z * c + n2z * s;
        u[vi] = i / segments;
        vi++;
      }
    }
    for (let i = 0; i < segments; i++) {
      for (let k = 0; k < radial; k++) {
        const a = base + i * radial + k;
        const b = base + i * radial + ((k + 1) % radial);
        const c = base + (i + 1) * radial + k;
        const d = base + (i + 1) * radial + ((k + 1) % radial);
        indices[ii++] = a;
        indices[ii++] = c;
        indices[ii++] = b;
        indices[ii++] = b;
        indices[ii++] = c;
        indices[ii++] = d;
      }
    }
  }
  return { positions, u, indices, triangles: indices.length / 3 };
}
