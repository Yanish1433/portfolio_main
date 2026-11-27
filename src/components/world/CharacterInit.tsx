"use client";

import { useEffect } from "react";
import type { CharacterId } from "./characters";
import { clearSavedCharacter, useWorld } from "@/store/world";

/**
 * Lakhey is the only character: once the loading screen has faded the visitor spawns straight in
 * (one setCharacter call, which also bumps spawnSeq so the first visit still opens with the spawn dance).
 * An old stored choice ("clay" / "astro") is cleared. Without the model file nothing spawns, as before.
 */
export default function CharacterInit({ available }: { available: CharacterId[] }) {
  const loaded = useWorld((s) => s.loaded);
  useEffect(() => {
    if (!loaded) return;
    clearSavedCharacter();
    const st = useWorld.getState();
    if (!st.character && available.includes("lakhey")) st.setCharacter("lakhey");
  }, [loaded, available]);
  return null;
}
