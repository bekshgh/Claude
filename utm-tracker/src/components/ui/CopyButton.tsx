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
      className={`inline-flex items-center rounded-md border border-line bg-bg-raised px-2 py-0.5 text-xs font-medium text-ink-muted transition hover:border-accent hover:text-accent ${className}`}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}
