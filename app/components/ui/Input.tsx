import type { InputHTMLAttributes } from "react";
import styles from "./ui.module.css";
type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };
export default function Input({ label, error, id, className = "", ...props }: Props) {
  const inputId = id ?? props.name;
  return <label className={styles.field} htmlFor={inputId}><span className={styles.label}>{label}</span><input id={inputId} className={[styles.input, error ? styles.inputError : "", className].filter(Boolean).join(" ")} aria-invalid={Boolean(error)} aria-describedby={error && inputId ? `${inputId}-error` : undefined} {...props}/>{error ? <span id={inputId ? `${inputId}-error` : undefined} className={styles.error}>{error}</span> : null}</label>;
}
