"use client";

import { useState, useMemo } from "react";
import { Pill } from "@/components/ui/Pill";
import { formatDateTime } from "@/lib/utils";

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  attributionStatus: string;
  submittedAt: string;
  campaign: string | null;
  slug: string | null;
};

export function LeadsWithTabs({ leads }: { leads: Lead[] }) {
  const campaigns = useMemo(() => {
    const all = leads.map((l) => l.campaign).filter(Boolean) as string[];
    return ["all", ...Array.from(new Set(all))];
  }, [leads]);

  const [tab, setTab] = useState("all");

  const filtered = tab === "all" ? leads : leads.filter((l) => l.campaign === tab);

  return (
    <>
      {/* Campaign tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {campaigns.map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`rounded-xl px-4 py-1.5 text-sm font-medium transition ${
              tab === c
                ? "bg-accent text-black"
                : "bg-bg-raised text-ink-muted hover:text-ink"
            }`}
          >
            {c === "all" ? "All campaigns" : c}
            <span className="ml-1.5 text-xs opacity-70">
              ({c === "all" ? leads.length : leads.filter((l) => l.campaign === c).length})
            </span>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3.5 font-medium">Lead</th>
                <th className="px-5 py-3.5 font-medium">Contact</th>
                <th className="px-5 py-3.5 font-medium">Source / campaign</th>
                <th className="px-5 py-3.5 font-medium">Attribution</th>
                <th className="px-5 py-3.5 font-medium">Link</th>
                <th className="px-5 py-3.5 text-right font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-ink-faint">
                    No leads for this campaign yet.
                  </td>
                </tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-bg-hover/40">
                  <td className="px-5 py-3.5 font-medium text-ink">{l.name || "Unnamed"}</td>
                  <td className="px-5 py-3.5 text-ink-muted">
                    <div>{l.email || "—"}</div>
                    <div className="text-xs text-ink-faint">{l.phone || ""}</div>
                  </td>
                  <td className="px-5 py-3.5 text-ink-muted">
                    {l.utmSource || "—"}
                    <span className="text-ink-faint"> / {l.campaign || "—"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <Pill label={l.attributionStatus} tone={l.attributionStatus} />
                  </td>
                  <td className="px-5 py-3.5 text-clicks">{l.slug ? `/r/${l.slug}` : "—"}</td>
                  <td className="px-5 py-3.5 text-right text-xs text-ink-faint">
                    {formatDateTime(l.submittedAt)}
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
