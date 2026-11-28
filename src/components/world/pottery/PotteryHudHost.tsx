"use client";

// Mounts the pottery HUD in the Overlay's bottom dock while the game is open. The HUD itself is lazy (first "Make a pot").
import { lazy, Suspense } from "react";
import { useWorld } from "@/store/world";

const PotteryHud = lazy(() => import("./PotteryHud"));

export default function PotteryHudHost() {
  const open = useWorld((s) => s.activeZone === "pottery" && s.panelOpen);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <PotteryHud />
    </Suspense>
  );
}
