"use client";

import { useEffect, useRef } from "react";

// Kleine, wiederverwendbare Textarea, die ihre Höhe automatisch an den
// Inhalt anpasst (Issue #45: "lange [Felder]: Inline-Textarea mit
// auto-grow"). Kein externes Paket nötig -- scrollHeight-Messung reicht.

export function AutoGrowTextarea({
  value,
  onChange,
  onKeyDown,
  onBlur,
  ariaLabel,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  ariaLabel: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      rows={1}
      className={className ?? "w-full resize-none overflow-hidden rounded-md border border-primary bg-surface p-1 text-sm text-ink outline-none"}
    />
  );
}
