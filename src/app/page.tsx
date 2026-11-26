import fs from "node:fs";
import path from "node:path";
import WorldClient from "@/components/world/WorldClient";
import { CHARACTERS, type CharacterId } from "@/components/world/characters";

// Check the models and thumbnails on every request so dropping in a .glb / .webp needs no rebuild.
export const dynamic = "force-dynamic";

/** Project ids with a public/projects/<id>.webp thumbnail (shown on their stand's screen). */
function projectThumbs(): string[] {
  try {
    return fs
      .readdirSync(path.join(process.cwd(), "public", "projects"))
      .filter((f) => f.toLowerCase().endsWith(".webp"))
      .map((f) => f.slice(0, -".webp".length));
  } catch {
    return [];
  }
}

/** Project ids with a public/showcase/<id>/poster.webp (the stand screen and cinema hero use it). */
function showcasePosters(): string[] {
  try {
    const dir = path.join(process.cwd(), "public", "showcase");
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "poster.webp")))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export default function Home() {
  const available: CharacterId[] = CHARACTERS.filter((c) =>
    fs.existsSync(path.join(process.cwd(), "public", c.file)),
  ).map((c) => c.id);
  return (
    <main>
      <WorldClient characters={available} thumbs={projectThumbs()} posters={showcasePosters()} />
    </main>
  );
}
