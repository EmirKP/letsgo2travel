import type { HTMLAttributes, ReactNode } from "react";
import styles from "./ui.module.css";

type Props = HTMLAttributes<HTMLDivElement> & { children: ReactNode; interactive?: boolean };
export default function Card({ children, interactive = false, className = "", ...props }: Props) {
  return <div className={[styles.card, interactive ? styles.interactive : "", className].filter(Boolean).join(" ")} {...props}>{children}</div>;
}
