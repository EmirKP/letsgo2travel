import { useId } from "react";
import { Icon } from "./Icon";
import { useI18n } from "../lib/i18n";

type DateTimeFieldProps = {
  type: "date" | "time" | "datetime-local";
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

function localDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

function visibleValue(value: string, type: DateTimeFieldProps["type"], locale: "tr" | "en") {
  if (!value) return "";
  if (type === "time") return value.slice(0, 5);
  const date = localDate(value);
  if (!date) return value;
  const formattedDate = new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
  return type === "datetime-local" && value.includes("T")
    ? `${formattedDate} · ${value.split("T")[1].slice(0, 5)}`
    : formattedDate;
}

export function DateTimeField({ type, label, value, onChange, min, max, required = false, disabled = false, className = "" }: DateTimeFieldProps) {
  const inputId = useId();
  const { copy, locale } = useI18n();
  const display = visibleValue(value || "", type, locale);
  const placeholder = type === "time"
    ? copy("Saat seç", "Choose time")
    : type === "datetime-local"
      ? copy("Tarih ve saat seç", "Choose date and time")
      : copy("Tarih seç", "Choose date");

  return <label className={`date-time-field ${disabled ? "disabled" : ""} ${className}`.trim()} htmlFor={inputId}>
    <span className="date-time-label">{label}{required && <em className="required-mark"> · {copy("zorunlu", "required")}</em>}</span>
    <span className={`date-time-control ${display ? "has-value" : ""}`}>
      <Icon name={type === "time" ? "clock" : "calendar"} size={20} />
      <strong>{display || placeholder}</strong>
      <Icon name="chevron" size={16} />
      <input
        id={inputId}
        type={type}
        value={value || ""}
        min={min}
        max={max}
        required={required}
        aria-required={required || undefined}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  </label>;
}
