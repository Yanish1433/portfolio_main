"use client";

// Lokta paper & wood kit: the one look for every panel and form in the town (presentation only).
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import s from "./lokta.module.css";

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");

export const btnClass = (primary: boolean, extra?: string) => cx(s.btn, primary ? s.primary : s.ghost, extra);
export const chipClass = (extra?: string) => cx(s.chip, extra);
export const pillClass = (extra?: string) => cx(s.pill, extra);
export const fieldClass = (extra?: string) => cx(s.field, extra);
export const wellClass = (extra?: string) => cx(s.well, extra);
export const labelClass = s.label;
export const errClass = s.err;
export const floatClass = s.float;
export const cardClass = (extra?: string) => cx(s.card, s.cardIn, extra);
export const rowClass = (extra?: string) => cx(s.row, extra);
export const pagerClass = s.pager;

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  night?: boolean;
  /** small line above the title: Devanagari (real strings only), then English */
  ne?: string;
  kind?: string;
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
};

/** Wood frame + lokta paper + gold/red border + scroll area. Unrolls on mount (see the CSS). */
export const LoktaPanel = forwardRef<HTMLDivElement, PanelProps>(function LoktaPanel({ night = false, ne, kind, onClose, closeLabel = "Close (Esc)", className, children, ...rest }, ref) {
  return (
    <div ref={ref} data-night={night} className={cx(s.frame, className)} {...rest}>
      <div className={s.paper}>
        <div className={cx(s.scroll, "info-panel-scroll")}>
          {(ne || kind) && (
            <p className={s.eyebrow}>
              {ne && <span lang="ne">{ne}</span>}
              {kind}
            </p>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className={s.close}>
              <span aria-hidden="true">×</span>
            </button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
});

export function LoktaButton({ primary = false, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button type="button" {...p} className={btnClass(primary, className)} />;
}
export const LoktaInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function LoktaInput({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={fieldClass(className)} />;
});
export function LoktaTextarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={fieldClass(className)} />;
}
export function LoktaChip({ className, ...p }: HTMLAttributes<HTMLElement>) {
  return <span {...p} className={chipClass(className)} />;
}

/** Red wax seal + folded "Thank you"; plays on the existing success state only. */
export function WaxSeal({ children }: { children?: ReactNode }) {
  return (
    <div className={s.thanks}>
      <div className={s.seal} aria-hidden="true">
        ✦
      </div>
      {children && <div className="mt-2 text-center">{children}</div>}
    </div>
  );
}
