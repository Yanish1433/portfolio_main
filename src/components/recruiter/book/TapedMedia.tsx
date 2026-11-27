"use client";

// A project's media as a taped photo. The clip plays only while its page is the open page (and only after a tap);
// turning away pauses and rewinds it. preload="none": nothing downloads until play. While it plays, the dim pagoda
// behind the book pauses (one video at a time).
import { useEffect, useRef, useState } from "react";
import { BOOK_VIDEO_EVENT, usePageActive } from "./active";
import s from "./recruiterBook.module.css";

type Props = { name: string; year: number; video: string | null; poster: string | null; shot: string | null };

export function TapedMedia({ name, year, video, poster, shot }: Props) {
  const active = usePageActive();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const still = poster ?? shot;

  const tell = (on: boolean) => window.dispatchEvent(new CustomEvent(BOOK_VIDEO_EVENT, { detail: on }));
  const stop = () => {
    const v = ref.current;
    if (v && !v.paused) v.pause();
    setPlaying(false);
    tell(false);
  };

  useEffect(() => {
    if (!active && playing) {
      const v = ref.current;
      if (v) {
        v.pause();
        v.currentTime = 0;
      }
      setPlaying(false);
      window.dispatchEvent(new CustomEvent(BOOK_VIDEO_EVENT, { detail: false }));
    }
  }, [active, playing]);
  useEffect(
    () => () => {
      window.dispatchEvent(new CustomEvent(BOOK_VIDEO_EVENT, { detail: false }));
    },
    [],
  );

  const play = () => {
    const v = ref.current;
    if (!v || !active) return;
    void v.play().then(() => {
      setPlaying(true);
      tell(true);
    }, () => {});
  };

  return (
    <figure className={s.taped}>
      {video ? (
        <video ref={ref} src={video} poster={still ?? undefined} muted loop playsInline preload="none" controls={playing} onPause={() => playing && stop()} aria-label={`${name} demo video`} />
      ) : still ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={still} alt={`${name}, a picture of the project`} loading="lazy" decoding="async" />
      ) : (
        <span className={s.mark} aria-hidden="true">
          {name.slice(0, 2)}
        </span>
      )}
      {video && !playing && (
        <button type="button" className={s.playBtn} onClick={play} disabled={!active} aria-label={`Play the ${name} demo video`}>
          <span aria-hidden="true">▶</span>
        </button>
      )}
      <figcaption>{year}</figcaption>
    </figure>
  );
}
