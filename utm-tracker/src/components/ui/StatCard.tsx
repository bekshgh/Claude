import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "clicks" | "submits" | "leads" | "accent";
}) {
  const dot =
    accent === "clicks" ? "bg-clicks" : accent === "submits" ? "bg-submits" : accent === "leads" ? "bg-leads" : accent === "accent" ? "bg-accent" : "bg-ink-faint";
  return (
    <div className="card p-5 transition hover:border-line/80">
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </div>
      <div className="num mt-3 text-4xl font-bold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-faint">{sub}</div>}
    </div>
  );
}
