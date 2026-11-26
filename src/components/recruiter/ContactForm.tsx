"use client";

import { useState } from "react";
import styles from "./recruiter.module.css";

/** Simple contact form: opens the visitor's email app via mailto: (no backend yet). */
export function ContactForm({ to }: { to: string }) {
  const [status, setStatus] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "");
    const email = String(data.get("email") ?? "");
    const message = String(data.get("message") ?? "");
    const subject = `Hello from ${name}`;
    const body = `${message}\n\n— ${name} (${email})`;
    const recipient = to.includes("@") ? to : "";
    window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setStatus("Opening your email app…");
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <label className={styles.field}>
        <span>Name</span>
        <input name="name" type="text" autoComplete="name" required />
      </label>
      <label className={styles.field}>
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label className={styles.field}>
        <span>Message</span>
        <textarea name="message" rows={5} required />
      </label>
      <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>
        Send message
      </button>
      <p className={styles.formStatus} role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}
