"use client";

// Real progress bar for /town: drei's useProgress (assets loaded / total), never backwards, held at 95 %
// until the first frames have drawn (store `loaded`), then a cross-fade out. Same art as app/town/loading.tsx.
import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { useWorld } from "@/store/world";
import { todAt } from "@/lib/time/clock";
import { LoadingArt } from "./LoadingArt";
import { barValue, tipAt, TIPS } from "./progress";

export default function LoadingOverlay() {
  const ready = useWorld((s) => s.loaded);
  const minutes = useWorld((s) => s.minutes);
  const loaded = useProgress((p) => p.loaded);
  const total = useProgress((p) => p.total);
  const prev = useRef(0);
  const pct = barValue(loaded, total, prev.current, ready);
  useEffect(() => {
    prev.current = pct;
  });

  const [tip, setTip] = useState(0);
  const [gone, setGone] = useState(false);

  // Tips rotate client-side only (the server render always shows the first one).
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 2600);
    return () => clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => setGone(true), 450);
    return () => clearTimeout(id);
  }, [ready]);

  if (gone) return null;
  return <LoadingArt pct={pct} tip={tipAt(tip)} fading={ready} tod={todAt(minutes)} />;
}
