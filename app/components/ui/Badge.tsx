import type { HTMLAttributes, ReactNode } from "react";
import styles from "./ui.module.css";
type Tone = "neutral" | "success" | "warning" | "danger";
type Props = HTMLAttributes<HTMLSpanElement> & { children: ReactNode; tone?: Tone };
export default function Badge({ children, tone = "neutral", className = "", ...props }: Props) {
  return <span className={[styles.badge, styles[tone], className].filter(Boolean).join(" ")} {...props}>{children}</span>;
}
