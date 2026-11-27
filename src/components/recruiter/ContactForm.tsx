"use client";

import { useId, useState } from "react";
import styles from "./recruiter.module.css";
import { btnClass, errClass, fieldClass, labelClass, WaxSeal } from "@/components/world/ui/book";
import { buildPayload, isSuccess, validateContact, WEB3FORMS_URL, type ContactErrors } from "./contactSubmit";

type Status = "idle" | "sending" | "success" | "error";

/**
 * Contact form (Web3Forms). One component for Recruiter Mode and the world mailbox.
 * The access key is public by design (NEXT_PUBLIC_WEB3FORMS_KEY, needed at build time).
 */
export function ContactForm({ githubUrl, variant = "page", night = false }: { githubUrl?: string; variant?: "page" | "panel"; night?: boolean }) {
  void night; // the book page is the same by day and night; the frame glows at night
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

  const panel = variant === "panel"; // the world mailbox: handwritten book page (presentation only)
  const locked = status === "sending" || status === "success";
  const err = (k: keyof ContactErrors) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `${uid}-${k}` } : {});
  const fieldError = (k: keyof ContactErrors) =>
    errors[k] ? (
      <span id={`${uid}-${k}`} className={panel ? errClass : undefined} style={panel ? undefined : { color: "var(--accent)", fontWeight: 500, fontSize: "0.8rem" }}>
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
    <form className={panel ? "flex flex-col gap-3" : styles.form} onSubmit={onSubmit} noValidate data-contact-form>
      {panel && status === "success" && <WaxSeal />}
      <label className={panel ? "block" : styles.field}>
        <span className={panel ? labelClass : undefined}>Name</span>
        <input className={panel ? fieldClass() : undefined} name="name" type="text" autoComplete="name" required disabled={locked} {...err("name")} />
        {fieldError("name")}
      </label>
      <label className={panel ? "block" : styles.field}>
        <span className={panel ? labelClass : undefined}>Email</span>
        <input className={panel ? fieldClass() : undefined} name="email" type="email" autoComplete="email" required disabled={locked} {...err("email")} />
        {fieldError("email")}
      </label>
      <label className={panel ? "block" : styles.field}>
        <span className={panel ? labelClass : undefined}>Message</span>
        <textarea className={panel ? fieldClass() : undefined} name="message" rows={variant === "panel" ? 3 : 5} required minLength={10} disabled={locked} {...err("message")} />
        {fieldError("message")}
      </label>
      {/* honeypot: bots tick it, people never see it */}
      <input type="checkbox" name="botcheck" tabIndex={-1} autoComplete="off" style={{ display: "none" }} aria-hidden="true" />
      <button type="submit" className={panel ? btnClass(true) : `${styles.btn} ${styles.btnPrimary}`} disabled={locked}>
        {status === "sending" ? "Sending…" : status === "error" ? "Try again" : "Send message"}
      </button>
      <p className={styles.formStatus} role="status" aria-live="polite" data-contact-status={status} style={panel ? { color: "#2b1d14", fontWeight: 600 } : undefined}>
        {statusText}
      </p>
    </form>
  );
}
