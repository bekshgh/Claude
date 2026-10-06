"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/ui/CopyButton";
import { formatNumber, relativeTime } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "";

export type LinkRow = {
  id: string;
  name: string;
  slug: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmContent: string | null;
  campaignName: string | null;
  clicks: number;
  leads: number;
  cr: number;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
};

export function LinksTable({ links }: { links: LinkRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [campaign, setCampaign] = useState("");
  const [source, setSource] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const campaigns = useMemo(() => Array.from(new Set(links.map((l) => l.campaignName).filter(Boolean))) as string[], [links]);
  const sources = useMemo(() => Array.from(new Set(links.map((l) => l.utmSource).filter(Boolean))) as string[], [links]);
  const archivedCount = links.filter((l) => l.isArchived).length;

  const filtered = links.filter((l) => {
    if (!showArchived && l.isArchived) return false;
    if (q && !`${l.name} ${l.slug} ${l.utmContent ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (campaign && l.campaignName !== campaign) return false;
    if (source && l.utmSource !== source) return false;
    return true;
  });

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/links/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this link and all its click data? This cannot be undone.")) return;
    await fetch(`/api/links/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Search links…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-[180px]" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="">All campaigns</option>
          {campaigns.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input max-w-[160px]" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {sources.map((s) => <option key={s}>{s}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-accent" />
          Show archived ({archivedCount})
        </label>
        <Link href="/links/new" className="btn-primary ml-auto">+ Create link</Link>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3.5 font-medium">Description</th>
                <th className="px-5 py-3.5 font-medium">Short URL</th>
                <th className="px-5 py-3.5 font-medium">Campaign / source</th>
                <th className="px-5 py-3.5 text-right font-medium">Clicks</th>
                <th className="px-5 py-3.5 text-right font-medium">Leads</th>
                <th className="px-5 py-3.5 text-right font-medium">CR%</th>
                <th className="px-5 py-3.5 font-medium">Created</th>
                <th className="px-5 py-3.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-ink-faint">No links match your filters.</td></tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className={`transition hover:bg-bg-hover/50 ${l.isArchived ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-ink">{l.name}</p>
                    {l.utmContent && <p className="text-xs text-ink-faint">{l.utmContent}</p>}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-clicks">/r/{l.slug}</span>
                      <CopyButton value={`${BASE}/r/${l.slug}`} />
                      <a
                        href={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${BASE}/r/${l.slug}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-ink-faint hover:text-accent"
                        title="Download QR code"
                      >
                        QR
                      </a>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-ink-muted">
                    <span className="text-ink">{l.campaignName || "—"}</span>
                    <span className="text-ink-faint"> / {l.utmSource || "—"} / {l.utmMedium || "—"}</span>
                  </td>
                  <td className="num px-5 py-3.5 text-right text-ink">{formatNumber(l.clicks)}</td>
                  <td className="num px-5 py-3.5 text-right text-leads">{formatNumber(l.leads)}</td>
                  <td className="num px-5 py-3.5 text-right text-ink-muted">{l.clicks ? `${l.cr.toFixed(1)}%` : "—"}</td>
                  <td className="px-5 py-3.5 text-xs text-ink-faint">{relativeTime(l.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-3 text-xs">
                      <a href={`${BASE}/r/${l.slug}`} target="_blank" rel="noreferrer" className="text-ink-faint hover:text-ink">Open</a>
                      <button onClick={() => patch(l.id, { isActive: !l.isActive })} className="text-ink-faint hover:text-ink">
                        {l.isActive ? "Pause" : "Resume"}
                      </button>
                      <button onClick={() => patch(l.id, { isArchived: !l.isArchived })} className="text-ink-faint hover:text-ink">
                        {l.isArchived ? "Restore" : "Archive"}
                      </button>
                      <button onClick={() => remove(l.id)} className="text-danger hover:opacity-80">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
