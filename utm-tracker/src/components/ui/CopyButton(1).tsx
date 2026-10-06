"use client";
import { useState } from "react";

export function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      className={`text-xs font-medium text-ink-faint transition hover:text-accent ${className}`}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}
