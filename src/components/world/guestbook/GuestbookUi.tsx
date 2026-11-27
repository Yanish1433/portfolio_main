"use client";

// DOM side of the guestbook: the "Leave a note" button, the small form, and the card for a tapped flag.
// Everything a visitor typed is rendered as React text nodes (never innerHTML).
import { useEffect, useRef, useState } from "react";
import { cooldownLeft, MESSAGE_MAX, minutes, NAME_MAX, postNote, readLast, validate, writeLast } from "@/lib/guestbook";
import { guestbookEnabled, loadNotes, useGuestbook } from "./store";

const pill =
  "pointer-events-auto flex h-11 items-center gap-1.5 rounded-full bg-white/80 px-3 text-sm font-medium text-[#4a3228] shadow backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227] sm:h-10";
const field = "w-full rounded-lg border border-[#5a3d33]/25 bg-white px-3 py-2 text-sm text-[#4a3228] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]";

function Form() {
  const close = useGuestbook((s) => s.closeForm);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [trap, setTrap] = useState(""); // honeypot: real visitors never see or fill it
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    const left = cooldownLeft(readLast(), Date.now());
    if (left > 0) return setError(`Thank you! You can leave another note in about ${minutes(left)} min.`);
    const v = validate(name, message);
    if (!v.ok) return setError(v.error);
    if (trap) return setDone(true); // a bot: pretend it worked, send nothing
    setBusy(true);
    const r = await postNote(v.name, v.message);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    writeLast(Date.now());
    setDone(true);
    void loadNotes(true);
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onKeyDown={(e) => e.nativeEvent.stopPropagation()} onKeyUp={(e) => e.nativeEvent.stopPropagation()}>
      <div className="box-border w-full max-w-[min(26rem,calc(100vw-32px))] rounded-2xl border border-white/60 bg-[#fff8ec] p-4 text-[#4a3228] shadow-xl" role="dialog" aria-modal="true" aria-label="Leave a note">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Leave a note <span lang="ne" className="font-medium opacity-70" style={{ fontFamily: "Mukta, sans-serif" }}>सन्देश</span>
          </h2>
          <button type="button" onClick={close} aria-label="Close" className="rounded-full px-2 text-xl leading-none opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]">
            ×
          </button>
        </div>
        {done ? (
          <div className="mt-3 text-sm" role="status">
            <p>Thank you! Your flag will fly once Yanish approves it.</p>
            <button type="button" onClick={close} className="mt-3 rounded-full bg-[#d9775b] px-5 py-2 text-sm font-semibold text-white shadow hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-3 space-y-3" noValidate>
            <label className="block text-sm">
              Your name
              <input ref={first} className={`${field} mt-1`} value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX + 20} autoComplete="off" />
            </label>
            <label className="block text-sm">
              Your note <span className="opacity-60">({Array.from(message).length}/{MESSAGE_MAX})</span>
              <textarea className={`${field} mt-1 h-24 resize-none`} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MESSAGE_MAX + 40} />
            </label>
            {/* honeypot */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
              </label>
            </div>
            <p className="text-xs opacity-75">Your name and note will be public after approval. No links, please.</p>
            {error && (
              <p className="text-sm font-medium text-[#9c2b1a]" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="rounded-full px-4 py-2 text-sm font-medium opacity-80 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="rounded-full bg-[#d9775b] px-5 py-2 text-sm font-semibold text-white shadow hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227] disabled:opacity-60">
                {busy ? "Sending…" : "Hang my flag"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Card() {
  const card = useGuestbook((s) => s.card);
  const setCard = useGuestbook((s) => s.setCard);
  if (!card) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-30 flex justify-center px-4">
      <div className="pointer-events-auto box-border w-full max-w-[min(24rem,calc(100vw-32px))] [overflow-wrap:anywhere] rounded-2xl border border-white/60 bg-[#fff8ec]/95 p-4 text-[#4a3228] shadow-xl backdrop-blur" role="dialog" aria-label={`Note from ${card.name}`}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-semibold">{card.name}</p>
          <button type="button" onClick={() => setCard(null)} aria-label="Close note" className="rounded-full px-2 text-xl leading-none opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]">
            ×
          </button>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm">{card.message}</p>
      </div>
    </div>
  );
}

/** The HUD pill plus the form and the note card. The pill hides when the build has no Supabase env. */
export default function GuestbookButton() {
  const open = useGuestbook((s) => s.formOpen);
  const openForm = useGuestbook((s) => s.openForm);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(guestbookEnabled());
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        useGuestbook.getState().setCard(null);
        useGuestbook.getState().closeForm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      {enabled && (
        <button type="button" className={pill} onClick={openForm} aria-label="Leave a note, सन्देश" title="Leave a note / सन्देश">
          <span aria-hidden="true">🎏</span>
          <span className="hidden 2xl:inline">
            Leave a note / <span lang="ne" style={{ fontFamily: "Mukta, sans-serif" }}>सन्देश</span>
          </span>
        </button>
      )}
      <Card />
      {open && enabled && <Form />}
    </>
  );
}
