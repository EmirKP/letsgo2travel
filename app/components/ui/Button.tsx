import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./ui.module.css";

type ButtonVariant = "primary" | "secondary" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

export default function Button({ children, variant = "primary", size = "md", fullWidth = false, className = "", ...props }: Props) {
  const classes = [styles.button, styles[variant], styles[size], fullWidth ? styles.fullWidth : "", className].filter(Boolean).join(" ");
  return <button className={classes} {...props}>{children}</button>;
}
