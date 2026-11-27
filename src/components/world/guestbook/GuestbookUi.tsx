"use client";

// DOM side of the guestbook: the "Leave a note" button, the small form, and the card for a tapped flag.
// Everything a visitor typed is rendered as React text nodes (never innerHTML).
import { useEffect, useRef, useState } from "react";
import { cooldownLeft, MESSAGE_MAX, minutes, NAME_MAX, postNote, readLast, validate, writeLast } from "@/lib/guestbook";
import { WaxSeal, btnClass, cardClass, fieldClass, floatClass, pillClass, useInk } from "../ui/book";
import { guestbookEnabled, loadNotes, useGuestbook } from "./store";

const pill = pillClass("h-11 sm:h-10");
const field = fieldClass();

function Form() {
  const close = useGuestbook((s) => s.closeForm);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [trap, setTrap] = useState(""); // honeypot: real visitors never see or fill it
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  useInk(paper, "guestbook:form");

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
      <div ref={paper} className={cardClass(`relative box-border w-full max-w-[min(26rem,calc(100vw-32px))] p-4 pl-6 ${floatClass}`)} role="dialog" aria-modal="true" aria-label="Leave a note">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#8f3320]">
            Leave a note <span lang="ne" className="font-medium opacity-70" style={{ fontFamily: "Mukta, sans-serif" }}>सन्देश</span>
          </h2>
          <button type="button" onClick={close} aria-label="Close" className="rounded-full px-2 text-xl leading-none text-[#8f3320] hover:opacity-70">
            ×
          </button>
        </div>
        {done ? (
          <div className="mt-3 text-sm" role="status">
            <WaxSeal fly />
            <p className="mt-2 text-center">Thank you! Your flag will fly once Yanish approves it.</p>
            <button type="button" onClick={close} className={btnClass(true, "mt-3")}>
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
              <p className="text-sm font-semibold text-[#8a1c10]" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className={btnClass(false)}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={btnClass(true)}>
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
  const paper = useRef<HTMLDivElement>(null);
  useInk(paper, `guestbook:card:${card?.name ?? ""}:${card?.message.length ?? 0}`, !!card);
  if (!card) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-30 flex justify-center px-4">
      <div ref={paper} className={cardClass(`pointer-events-auto relative box-border w-full max-w-[min(24rem,calc(100vw-32px))] [overflow-wrap:anywhere] p-4 pl-6 ${floatClass}`)} role="dialog" aria-label={`Note from ${card.name}`}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-semibold text-[#8f3320]">{card.name}</p>
          <button type="button" onClick={() => setCard(null)} aria-label="Close note" className="rounded-full px-2 text-xl leading-none text-[#8f3320] hover:opacity-70">
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
