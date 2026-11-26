// Server only (uses fs): the About photo, if the file really exists. No client 404 probe.
import fs from "node:fs";
import path from "node:path";
import { profile } from "./profile";

export function aboutPhoto(): string | null {
  const exists = (u: string) => fs.existsSync(path.join(process.cwd(), "public", u.replace(/^\/+/, "")));
  const set = profile.about?.photo?.trim();
  if (set) {
    if (/^https?:\/\//i.test(set)) return set;
    if (exists(set)) return set;
  }
  return exists("/showcase/about/photo.webp") ? "/showcase/about/photo.webp" : null;
}
