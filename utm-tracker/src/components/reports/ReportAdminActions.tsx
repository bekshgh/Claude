"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "draft" | "published";
type Visibility = "private" | "link" | "public";

const VIS_LABEL: Record<Visibility, string> = {
  private: "Private — admins only",
  link: "Link — anyone with the link (not indexed)",
  public: "Public — may appear in search engines",
};

export function ReportAdminActions({
  id,
  slug,
  status,
  visibility,
}: {
  id: string;
  slug: string;
  status: Status;
  visibility: Visibility;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  async function patch(data: Partial<{ status: Status; visibility: Visibility }>, key: string) {
    setBusy(key);
    setError(null);
    const res = await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) setError("Could not save. Please try again.");
    router.refresh();
  }

  async function remove() {
    setBusy("delete");
    const res = await fetch(`/api/reports/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError("Could not delete.");
    router.push("/reports");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {status === "draft" ? (
          <button className="btn-primary" disabled={!!busy} onClick={() => patch({ status: "published" }, "publish")}>
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
        ) : (
          <button className="btn-ghost" disabled={!!busy} onClick={() => patch({ status: "draft" }, "unpublish")}>
            {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
          </button>
        )}
        <a href={`/report/${slug}`} target="_blank" rel="noreferrer" className="btn-ghost">Open page ↗</a>
        <button
          className="btn-ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(`${window.location.origin}/report/${slug}`).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <div className="max-w-md">
        <label className="label" htmlFor="rep-vis">Visibility</label>
        <select
          id="rep-vis"
          className="input"
          value={visibility}
          disabled={!!busy}
          onChange={(e) => patch({ visibility: e.target.value as Visibility }, "vis")}
        >
          {(Object.keys(VIS_LABEL) as Visibility[]).map((v) => (
            <option key={v} value={v}>{VIS_LABEL[v]}</option>
          ))}
        </select>
        <p className="hint">Drafts are visible to admins only, whatever the visibility.</p>
      </div>

      <div className="border-t border-line pt-4">
        {!confirm ? (
          <button className="btn-danger" onClick={() => setConfirm(true)}>Delete report</button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-muted">Delete permanently?</span>
            <button className="btn-danger" disabled={!!busy} onClick={remove}>{busy === "delete" ? "Deleting…" : "Yes, delete"}</button>
            <button className="btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
