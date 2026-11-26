// Pure helpers for the contact form (Web3Forms). Shared by Recruiter Mode and the world mailbox.

export const WEB3FORMS_URL = "https://api.web3forms.com/submit";
export const MIN_MESSAGE = 10;

export type ContactFields = { name: string; email: string; message: string };
export type ContactErrors = Partial<Record<keyof ContactFields, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field errors, or an empty object when the form is good to send. */
export function validateContact(f: ContactFields): ContactErrors {
  const errors: ContactErrors = {};
  if (!f.name.trim()) errors.name = "Please tell me your name.";
  if (!f.email.trim()) errors.email = "Please add your email so I can reply.";
  else if (!EMAIL.test(f.email.trim())) errors.email = "That email doesn't look right.";
  const len = f.message.trim().length;
  if (!len) errors.message = "Please write a message.";
  else if (len < MIN_MESSAGE) errors.message = `Please write at least ${MIN_MESSAGE} characters.`;
  return errors;
}

/** The JSON body for Web3Forms. `botcheck` is the honeypot (a hidden checkbox humans never tick). */
export function buildPayload(key: string, f: ContactFields, botcheck = false): Record<string, string | boolean> {
  const name = f.name.trim();
  return {
    access_key: key,
    name,
    email: f.email.trim(),
    message: f.message.trim(),
    subject: `Portfolio message from ${name}`,
    botcheck,
  };
}

/** Web3Forms answers { success: true } with a 2xx status. */
export const isSuccess = (ok: boolean, json: unknown): boolean => ok && !!json && typeof json === "object" && (json as { success?: unknown }).success === true;
