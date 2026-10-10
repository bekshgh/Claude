"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "draft" | "published";
type Visibility = "private" | "link" | "public";

const VIS_LABEL: Record<Visibility, string> = {
  private: "Приватный — только админы",
  link: "По ссылке — кто знает ссылку (не индексируется)",
  public: "Публичный — может попасть в поиск",
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
    if (!res?.ok) setError("Не удалось сохранить. Попробуйте ещё раз.");
    router.refresh();
  }

  async function remove() {
    setBusy("delete");
    const res = await fetch(`/api/reports/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError("Не удалось удалить.");
    router.push("/reports");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {status === "draft" ? (
          <button className="btn-primary" disabled={!!busy} onClick={() => patch({ status: "published" }, "publish")}>
            {busy === "publish" ? "Публикую…" : "Опубликовать"}
          </button>
        ) : (
          <button className="btn-ghost" disabled={!!busy} onClick={() => patch({ status: "draft" }, "unpublish")}>
            {busy === "unpublish" ? "Снимаю…" : "Снять с публикации"}
          </button>
        )}
        <a href={`/report/${slug}`} target="_blank" rel="noreferrer" className="btn-ghost">Открыть страницу ↗</a>
        <button
          className="btn-ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(`${window.location.origin}/report/${slug}`).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Скопировано" : "Копировать ссылку"}
        </button>
      </div>

      <div className="max-w-md">
        <label className="label" htmlFor="rep-vis">Видимость</label>
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
        <p className="hint">Черновики видны только админам при любой видимости.</p>
      </div>

      <div className="border-t border-line pt-4">
        {!confirm ? (
          <button className="btn-danger" onClick={() => setConfirm(true)}>Удалить отчёт</button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-muted">Удалить без возможности восстановления?</span>
            <button className="btn-danger" disabled={!!busy} onClick={remove}>{busy === "delete" ? "Удаляю…" : "Да, удалить"}</button>
            <button className="btn-ghost" onClick={() => setConfirm(false)}>Отмена</button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
