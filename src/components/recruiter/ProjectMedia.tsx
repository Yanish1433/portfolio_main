"use client";

// A project card's media: the poster, and a click plays the demo video full screen.
// The player (ProjectVideo) is the same one the 3D town uses, loaded only on first click so
// /recruiter's first-load JS does not grow.
import dynamic from "next/dynamic";
import { useState } from "react";
import type { VideoProject } from "@/components/world/halls/ProjectVideo";
import styles from "./recruiter.module.css";

const ProjectVideo = dynamic(() => import("@/components/world/halls/ProjectVideo"), { ssr: false });

export function ProjectMedia({ project }: { project: VideoProject }) {
  const [open, setOpen] = useState(false);
  const playable = !!project.video || !!project.poster || project.screenshots.length > 0;
  const mark = (
    <span className={styles.cardMediaMark} aria-hidden="true">
      {project.name.slice(0, 2)}
    </span>
  );
  if (!playable) return mark;
  return (
    <>
      <button type="button" className={styles.cardPlay} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {project.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.cardVideo} src={project.poster} alt="" loading="lazy" />
        ) : (
          mark
        )}
        <span className={styles.playBadge} aria-hidden="true">
          ▶
        </span>
        <span className={styles.srOnly}>{project.video ? `Play the ${project.name} demo video` : `See ${project.name} screenshots`}</span>
      </button>
      {open && <ProjectVideo project={project} onClose={() => setOpen(false)} />}
    </>
  );
}
