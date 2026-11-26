"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./recruiter.module.css";

/** A clickable suggestion. `message` is sent as if typed; `run` is an action the page performs. */
export type ChatChip = { label: string; message?: string; run?: () => void };
export type ChatTurn = { text: string; chips: ChatChip[] };

export type RobotChatProps = {
  /** Opening message, shown when the panel is first opened. */
  greet: () => ChatTurn;
  /** Answer one visitor message. */
  ask: (message: string) => Promise<ChatTurn>;
};

type Msg = { from: "me" | "bot"; text: string };

function Robot({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" width="32" height="32" aria-hidden="true" focusable="false">
      <line x1="24" y1="4" x2="24" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="4" r="2.5" className={styles.robotAntenna} />
      <rect x="7" y="10" width="34" height="28" rx="10" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="23" r="4" className={styles.robotEye} />
      <circle cx="31" cy="23" r="4" className={styles.robotEye} />
      <path d="M17 31 q7 5 14 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="2" y="20" width="4" height="9" rx="2" fill="currentColor" />
      <rect x="42" y="20" width="4" height="9" rx="2" fill="currentColor" />
    </svg>
  );
}

export function RobotChat({ greet, ask }: RobotChatProps) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chips, setChips] = useState<ChatChip[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const panelId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const greeted = useRef(false);

  function close() {
    setOpen(false);
    btnRef.current?.focus();
  }

  // Greet once, the first time the panel opens.
  useEffect(() => {
    if (!open || greeted.current) return;
    greeted.current = true;
    const turn = greet();
    setMsgs([{ from: "bot", text: turn.text }]);
    setChips(turn.chips);
  }, [open, greet]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, chips]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setMsgs((m) => [...m, { from: "me", text: message }]);
    setChips([]);
    setBusy(true);
    try {
      const turn = await ask(message);
      setMsgs((m) => [...m, { from: "bot", text: turn.text }]);
      setChips(turn.chips);
    } catch {
      setMsgs((m) => [...m, { from: "bot", text: "Something went wrong. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  function pick(chip: ChatChip) {
    if (chip.message) void send(chip.message);
    else chip.run?.();
  }

  return (
    <div className={styles.robotWrap}>
      {open && (
        <div id={panelId} role="dialog" aria-label="Chat with the portfolio robot" className={styles.robotPanel}>
          <div className={styles.robotHead}>
            <Robot />
            <strong>Portfolio Bot</strong>
            <button type="button" className={styles.robotClose} onClick={close} aria-label="Close chat">
              ×
            </button>
          </div>
          <div ref={listRef} className={styles.robotBody}>
            <div className={styles.robotLog} aria-live="polite">
              {msgs.map((m, i) => (
                <p key={i} className={m.from === "me" ? styles.msgMe : styles.msgBot}>
                  {m.text}
                </p>
              ))}
            </div>
            {chips.length > 0 && (
              <ul className={styles.robotSuggest} aria-label="Suggested replies">
                {chips.map((c) => (
                  <li key={c.label}>
                    <button type="button" onClick={() => pick(c)}>
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form
            className={styles.robotForm}
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask something…"
              aria-label="Your message"
            />
            <button type="submit" disabled={busy}>
              Send
            </button>
          </form>
        </div>
      )}
      <button
        ref={btnRef}
        type="button"
        className={styles.robotBtn}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? "Close chat" : "Open chat with the portfolio robot"}
      >
        <Robot />
      </button>
    </div>
  );
}
