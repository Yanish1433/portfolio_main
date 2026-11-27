"use client";

// Body of the About panel (rendered inside halls/InfoPanel's shell).
import { profile } from "@/content/profile";
import { runAction } from "../robot/actions";
import { useWorld } from "@/store/world";
import { ctaPlan, initials } from "./aboutView";
import { useState } from "react";
import { chipClass, LoktaButton, pagerClass } from "../ui/lokta";
import { pageLabel, paginate } from "../ui/lokta/paginate";

const ICONS: [RegExp, string][] = [
  [/3d|game|play|world/i, "🧊"],
  [/fast|speed|perform|quick/i, "⚡"],
  [/tool|automat|time|save/i, "🛠️"],
  [/design|interface|ui|ux|friendly/i, "🎨"],
  [/ai|learn|data/i, "🧠"],
  [/api|server|back|database/i, "🗄️"],
];
const iconFor = (t: string) => ICONS.find(([re]) => re.test(t))?.[1] ?? "✦";

export function PortraitCard({ photo, size = 88 }: { photo: string | null; size?: number }) {
  const box = { width: size, height: Math.round(size * 1.1) };
  if (photo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt={`Portrait of ${profile.name}`} style={box} className="shrink-0 rounded-xl border-2 border-[#c9a227] object-cover shadow" />;
  return (
    <div
      role="img"
      aria-label={`Portrait card of ${profile.name}`}
      style={{ ...box, background: "linear-gradient(135deg,#e9a14a,#c9622f 55%,#8e2f26)", fontSize: size * 0.4 }}
      className="flex shrink-0 items-center justify-center rounded-xl border-2 border-[#c9a227] font-semibold text-[#fff4dc] shadow"
    >
      {initials(profile.name)}
    </div>
  );
}

export default function AboutBody({ photo, night, headingId, linkBtn }: { photo: string | null; night: boolean; headingId: string; linkBtn: (primary: boolean) => string }) {
  const about = profile.about;
  const [page, setPage] = useState(0);
  void night;
  // Presentation only: story paragraphs split into short pages; loves + fun facts are the last page.
  const storyPages = paginate(about?.story ?? []);
  const hasExtras = !!about && (about.loves.length > 0 || (about.funFacts?.length ?? 0) > 0);
  const total = storyPages.length + (hasExtras ? 1 : 0);
  const cur = Math.min(page, Math.max(total - 1, 0));
  const onExtras = hasExtras && cur === storyPages.length;
  const ctas = about?.cta ?? [];
  const disabled = `inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#8f3320]/50 px-4 py-2 text-sm font-semibold opacity-70`;
  return (
    <>
      <div className="flex items-start gap-3">
        <PortraitCard photo={photo} />
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="pr-9 text-xl font-semibold leading-tight">{profile.name}</h2>
          <p className="mt-0.5 text-sm opacity-80">{profile.title}</p>
        </div>
      </div>
      {about && storyPages.length > 0 && !onExtras && (
        <div key={cur} className="mt-3 space-y-2 leading-relaxed" data-about-story>
          {storyPages[cur].map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
      {about && onExtras && about.loves.length > 0 && (
        <section className="mt-3" aria-label="What I love building">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">What I love building</h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {about.loves.map((l) => (
              <li key={l} className={chipClass()}>
                <span aria-hidden="true">{iconFor(l)}</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {onExtras && about?.funFacts && about.funFacts.length > 0 && (
        <section className="mt-3" aria-label="Fun facts">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">Fun facts</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {about.funFacts.map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden="true" className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rotate-45 bg-current opacity-60" />
                <span className="min-w-0">{f}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {total > 1 && (
        <div className={pagerClass}>
          <LoktaButton aria-label="Previous page" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
            <span aria-hidden="true">◀</span>
          </LoktaButton>
          <span className="text-sm font-semibold" role="status" aria-live="polite">
            {pageLabel(cur, total)}
          </span>
          <LoktaButton aria-label="Next page" disabled={cur >= total - 1} onClick={() => setPage(cur + 1)}>
            <span aria-hidden="true">▶</span>
          </LoktaButton>
        </div>
      )}
      {ctas.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-about-cta>
          {ctas.map((c, i) => {
            const plan = ctaPlan(c, profile.links);
            if (plan.type === "link")
              return (
                <a key={c.label} href={plan.href} {...(plan.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={linkBtn(i === 0)}>
                  {c.label}
                </a>
              );
            if (plan.type === "soon")
              return (
                <button key={c.label} type="button" disabled aria-disabled="true" className={disabled} data-cta-soon>
                  {c.label} <span className="text-xs font-normal">· coming soon</span>
                </button>
              );
            return (
              <button
                key={c.label}
                type="button"
                className={linkBtn(i === 0)}
                onClick={() => {
                  useWorld.getState().closeInfo(true);
                  runAction(plan.type === "resume" ? { type: "showResume" } : { type: "walkTo", zone: "mailbox" });
                }}
              >
                {c.label}
                {plan.type === "walkMailbox" && <span className="text-xs font-normal opacity-80">· to the mailbox</span>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
