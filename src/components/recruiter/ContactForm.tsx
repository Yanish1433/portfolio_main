"use client";

import { useId, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./recruiter.module.css";
import { buildPayload, isSuccess, validateContact, WEB3FORMS_URL, type ContactErrors } from "./contactSubmit";

type Status = "idle" | "sending" | "success" | "error";

// The form is also used inside the 3D world, outside the Recruiter Mode theme variables.
const panelVars = (night: boolean): CSSProperties =>
  (night
    ? { "--text": "#f8e9cc", "--card": "rgba(255,255,255,0.08)", "--line": "rgba(229,193,88,0.4)", "--accent": "#e5c158", "--accent-ink": "#2a1c22", "--accent-hover": "#f3d98a", "--muted": "#d9c9a6" }
    : { "--text": "#3a2419", "--card": "#fffdf7", "--line": "rgba(156,59,34,0.35)", "--accent": "#9c3b22", "--accent-ink": "#ffffff", "--accent-hover": "#b5482c", "--muted": "#6b4a3a" }) as CSSProperties;

/**
 * Contact form (Web3Forms). One component for Recruiter Mode and the world mailbox.
 * The access key is public by design (NEXT_PUBLIC_WEB3FORMS_KEY, needed at build time).
 */
export function ContactForm({ githubUrl, variant = "page", night = false }: { githubUrl?: string; variant?: "page" | "panel"; night?: boolean }) {
  const key = process.env.NEXT_PUBLIC_WEB3FORMS_KEY;
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<ContactErrors>({});
  const [serverMsg, setServerMsg] = useState("");
  const uid = useId();

  if (!key) {
    return (
      <p className={styles.formStatus} role="status" data-contact-unset>
        Contact form is not set up yet.
        {githubUrl && (
          <>
            {" "}You can find me on{" "}
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              GitHub
            </a>
            .
          </>
        )}
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending" || status === "success") return;
    const data = new FormData(e.currentTarget);
    const fields = { name: String(data.get("name") ?? ""), email: String(data.get("email") ?? ""), message: String(data.get("message") ?? "") };
    const found = validateContact(fields);
    setErrors(found);
    if (Object.keys(found).length) return;
    setStatus("sending");
    setServerMsg("");
    try {
      const res = await fetch(WEB3FORMS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(buildPayload(key as string, fields, data.get("botcheck") === "on")),
      });
      const json = await res.json().catch(() => null);
      if (isSuccess(res.ok, json)) setStatus("success");
      else {
        setServerMsg(json && typeof json.message === "string" ? json.message : "");
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const locked = status === "sending" || status === "success";
  const err = (k: keyof ContactErrors) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `${uid}-${k}` } : {});
  const fieldError = (k: keyof ContactErrors) =>
    errors[k] ? (
      <span id={`${uid}-${k}`} style={{ color: "var(--accent)", fontWeight: 500, fontSize: "0.8rem" }}>
        {errors[k]}
      </span>
    ) : null;

  const statusText =
    status === "sending"
      ? "Sending…"
      : status === "success"
        ? "Thank you! Yanish will reply soon."
        : status === "error"
          ? `Sorry, that didn't go through${serverMsg ? ` (${serverMsg})` : ""}. Your message is still here: please try again.`
          : "";

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate style={variant === "panel" ? { ...panelVars(night), gap: 10, color: "var(--text)" } : undefined} data-contact-form>
      <label className={styles.field}>
        <span>Name</span>
        <input name="name" type="text" autoComplete="name" required disabled={locked} {...err("name")} />
        {fieldError("name")}
      </label>
      <label className={styles.field}>
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required disabled={locked} {...err("email")} />
        {fieldError("email")}
      </label>
      <label className={styles.field}>
        <span>Message</span>
        <textarea name="message" rows={variant === "panel" ? 3 : 5} required minLength={10} disabled={locked} {...err("message")} />
        {fieldError("message")}
      </label>
      {/* honeypot: bots tick it, people never see it */}
      <input type="checkbox" name="botcheck" tabIndex={-1} autoComplete="off" style={{ display: "none" }} aria-hidden="true" />
      <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={locked}>
        {status === "sending" ? "Sending…" : status === "error" ? "Try again" : "Send message"}
      </button>
      <p className={styles.formStatus} role="status" aria-live="polite" data-contact-status={status}>
        {statusText}
      </p>
    </form>
  );
}
