"use client";

// The game's on-screen controls (book-kit look): shaping hints + "Fire it!", the firing line, and the result card.
import { btnClass, cardClass, LINK_ARROW, pillClass } from "@/components/book";
import { potteryCtl, usePottery } from "./potteryStore";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export default function PotteryHud() {
  const phase = usePottery((s) => s.phase);
  const result = usePottery((s) => s.result);
  const band = usePottery((s) => s.band);

  return (
    <div className="pointer-events-none flex w-full justify-center" onPointerDown={stop} onPointerUp={stop} onClick={stop}>
      {phase === "shape" && (
        <div className={cardClass("pointer-events-auto w-full max-w-md !p-3 text-center")} role="group" aria-label="Pottery wheel">
          <p className="text-sm font-semibold">Shape your pot 🏺</p>
          <p className="mt-1 text-xs opacity-80">
            {band === null ? "Drag the clay: right = wider, left = narrower, up = taller." : `Height band ${band + 1} of 12 selected. ← → wider / narrower · Shift+↑↓ taller / shorter.`}
          </p>
          <p className="mt-0.5 hidden text-[11px] opacity-60 sm:block">Keys: ↑ ↓ pick a height · ← → shape it · Enter fires · Esc leaves</p>
          <div className="mt-2 flex justify-center gap-2">
            <button type="button" className={btnClass(true)} onClick={() => potteryCtl.fire?.()}>
              Fire it! 🔥
            </button>
            <button type="button" className={btnClass(false)} onClick={() => potteryCtl.exit?.()}>
              Leave
            </button>
          </div>
        </div>
      )}
      {phase === "firing" && (
        <div className={cardClass("pointer-events-auto !px-4 !py-2 text-center text-sm")} role="status" aria-live="polite">
          Firing in the kiln… 🔥
        </div>
      )}
      {phase === "result" && result && (
        <div className={cardClass("pointer-events-auto w-full max-w-md !p-3 text-center")} role="status" aria-live="polite">
          <p className="text-base font-semibold">You made a {result.skill} pot!</p>
          {result.project ? (
            <p className="mt-1 text-sm">
              {result.skill}: used in{" "}
              <button type="button" className="font-semibold underline decoration-[#8a2a1a] underline-offset-2" onClick={() => potteryCtl.openProject?.(result.project!.id)}>
                {result.project.name} {LINK_ARROW}
              </button>
            </p>
          ) : null}
          <p className="mt-2 text-xs opacity-80">
            {result.collected} / {result.total} skills collected
          </p>
          <div className="mx-auto mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-black/15" aria-hidden>
            <div className="h-full rounded-full bg-[#c9772a] transition-[width] duration-700" style={{ width: `${Math.round((100 * result.collected) / Math.max(1, result.total))}%` }} />
          </div>
          {result.master && <p className={pillClass("mt-2 inline-block")}>Master potter 🏺 every skill collected!</p>}
          <div className="mt-2 flex justify-center gap-2">
            <button type="button" className={btnClass(true)} onClick={() => potteryCtl.place?.()}>
              Put it on the shelf
            </button>
            <button type="button" className={btnClass(false)} onClick={() => potteryCtl.exit?.()}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
