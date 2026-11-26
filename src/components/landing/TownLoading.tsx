import { PagodaRoof } from "./Ornaments";
import { DHAKA_URL } from "./art";
import s from "./townLoading.module.css";

/** The title card shown while the 3D town opens: light, no 3D, so the hand-off from the landing page feels instant. */
export function TownLoading() {
  return (
    <div className={s.card} role="status" aria-live="polite" style={{ "--dhaka": DHAKA_URL } as React.CSSProperties}>
      <PagodaRoof className={s.roof} />
      <p className={s.ne} lang="ne">भक्तपुर</p>
      <h1 className={s.title}>Opening the 3D town…</h1>
      <p className={s.sub}>Yanish Gurung · portfolio</p>
      <div className={s.bar} aria-hidden="true" />
    </div>
  );
}
