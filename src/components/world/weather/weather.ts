// Pure weather schedule: no three.js, no React. Time in seconds -> blend factors 0..1.
export type Kind = "clear" | "mist" | "rain";
export type Factors = { mist: number; rain: number; wet: number };

/** clear (most of the time) -> mist -> clear -> light rain -> clear, each ~2-3 min. */
export const CYCLE: { kind: Kind; dur: number }[] = [
  { kind: "clear", dur: 150 },
  { kind: "mist", dur: 150 },
  { kind: "clear", dur: 120 },
  { kind: "rain", dur: 180 },
  { kind: "clear", dur: 150 },
];
export const CYCLE_LEN = CYCLE.reduce((a, c) => a + c.dur, 0);
/** Seconds to blend in / out of a state. */
export const BLEND = 25;
/** Seconds the ground takes to dry after the rain stops. */
export const DRY = 70;

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Deterministic factors at time `t` (seconds, any epoch). wet lags rain: puddles linger while the ground dries. */
export function weatherAt(t: number): Factors {
  const s = ((t % CYCLE_LEN) + CYCLE_LEN) % CYCLE_LEN;
  let mist = 0;
  let rain = 0;
  let wet = 0;
  let a = 0;
  for (const seg of CYCLE) {
    const b = a + seg.dur;
    if (seg.kind !== "clear") {
      const up = smooth(a, a + BLEND, s);
      const down = 1 - smooth(b - BLEND, b, s);
      if (seg.kind === "mist") mist = Math.max(mist, up * down);
      else {
        rain = Math.max(rain, up * down);
        wet = Math.max(wet, up * (1 - smooth(b, b + DRY, s)));
      }
    }
    a = b;
  }
  return { mist, rain, wet };
}

export function parseForce(v: string | null | undefined): Kind | null {
  return v === "clear" || v === "rain" || v === "mist" ? v : null;
}

export type OffRules = { reducedMotion: boolean; lite: boolean; cinema: boolean; debug: boolean; forced: Kind | null };

/** Everything clear: reduced motion, lite devices and the video overlay always; ?debug unless a ?weather= was asked for. */
export function weatherOff(o: OffRules): boolean {
  if (o.reducedMotion || o.lite || o.cinema) return true;
  return o.debug && !o.forced;
}

export const CLEAR: Factors = { mist: 0, rain: 0, wet: 0 };

export function targetWeather(t: number, o: OffRules): Factors {
  if (weatherOff(o)) return CLEAR;
  if (o.forced === "clear") return CLEAR;
  if (o.forced === "rain") return { mist: 0, rain: 1, wet: 1 };
  if (o.forced === "mist") return { mist: 1, rain: 0, wet: 0 };
  return weatherAt(t);
}

/** Move `cur` toward `target` by at most rate*dt (a ramp, never a snap). */
export function approach(cur: number, target: number, dt: number, rate: number): number {
  const step = rate * dt;
  return cur + Math.min(step, Math.max(-step, target - cur));
}
