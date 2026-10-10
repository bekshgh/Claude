"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ProjectFormValue {
  id?: string;
  name: string;
  typeKey: string;
  format: string;
  status: string;
  startDate: string;
  endDate: string;
  city: string;
  venue: string;
  ownerTeam: string;
  tags: string;
}

export const EMPTY_PROJECT: ProjectFormValue = {
  name: "", typeKey: "", format: "", status: "planned", startDate: "", endDate: "", city: "", venue: "", ownerTeam: "", tags: "",
};

/** Create / edit a project. Types come from the dictionary; a new type can be added inline. */
export function ProjectForm({ initial, types }: { initial: ProjectFormValue; types: { value: string; label: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [typeList, setTypeList] = useState(types);
  const [newType, setNewType] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const field = (k: keyof ProjectFormValue) => ({
    value: v[k] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value }),
  });

  async function addType() {
    if (!newType?.trim()) return;
    const res = await fetch("/api/project-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newType.trim() }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Не удалось добавить тип");
    setTypeList([...typeList, { value: body.key, label: body.name }]);
    setV({ ...v, typeKey: body.key });
    setNewType(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      name: v.name,
      typeKey: v.typeKey,
      format: v.format || null,
      status: v.status,
      startDate: v.startDate || null,
      endDate: v.endDate || null,
      city: v.city,
      venue: v.venue,
      ownerTeam: v.ownerTeam,
      tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    const res = await fetch(v.id ? `/api/projects/${v.id}` : "/api/projects", {
      method: v.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(body.error === "Validation failed" ? "Проверьте поля: название (2+ символа) и тип обязательны." : body.error ?? "Не удалось сохранить");
    router.push(`/projects/${body.slug}`);
    router.refresh();
  }

  async function remove() {
    if (!v.id) return;
    await fetch(`/api/projects/${v.id}`, { method: "DELETE" });
    router.push("/projects");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="p-name">Название</label>
          <input id="p-name" className="input" required minLength={2} maxLength={120} placeholder="ÖZGE Forum S'26" {...field("name")} />
        </div>
        <div>
          <label className="label" htmlFor="p-type">Тип проекта</label>
          {newType === null ? (
            <div className="flex gap-2">
              <select id="p-type" className="input" required {...field("typeKey")}>
                <option value="" disabled>Выберите тип</option>
                {typeList.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button type="button" className="btn-ghost shrink-0 py-2 text-xs" onClick={() => setNewType("")}>+ тип</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input className="input" autoFocus placeholder="Например: Воркшоп" value={newType} onChange={(e) => setNewType(e.target.value)} aria-label="Название нового типа" />
              <button type="button" className="btn-primary shrink-0 py-2 text-xs" onClick={addType}>Добавить</button>
              <button type="button" className="btn-ghost shrink-0 py-2 text-xs" onClick={() => setNewType(null)}>✕</button>
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="p-status">Статус</label>
          <select id="p-status" className="input" {...field("status")}>
            <option value="planned">Планируется</option>
            <option value="registration">Идёт регистрация</option>
            <option value="done">Проведён</option>
            <option value="archived">В архиве</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-start">Дата начала</label>
          <input id="p-start" type="date" className="input" {...field("startDate")} />
        </div>
        <div>
          <label className="label" htmlFor="p-end">Дата окончания</label>
          <input id="p-end" type="date" className="input" {...field("endDate")} />
        </div>
        <div>
          <label className="label" htmlFor="p-format">Формат</label>
          <select id="p-format" className="input" {...field("format")}>
            <option value="">Не указан</option>
            <option value="offline">Офлайн</option>
            <option value="online">Онлайн</option>
            <option value="hybrid">Гибрид</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-city">Город</label>
          <input id="p-city" className="input" maxLength={80} placeholder="Astana" {...field("city")} />
        </div>
        <div>
          <label className="label" htmlFor="p-venue">Площадка</label>
          <input id="p-venue" className="input" maxLength={120} {...field("venue")} />
        </div>
        <div>
          <label className="label" htmlFor="p-team">Команда-владелец</label>
          <input id="p-team" className="input" maxLength={80} placeholder="AIESEC NU" {...field("ownerTeam")} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="p-tags">Теги</label>
          <input id="p-tags" className="input" placeholder="IT, Women in tech" {...field("tags")} />
          <p className="hint">Через запятую.</p>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Сохраняю…" : v.id ? "Сохранить" : "Создать проект"}</button>
        {v.id && (!confirmDelete ? (
          <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>Удалить проект</button>
        ) : (
          <>
            <span className="text-sm text-ink-muted">Отчёты останутся, но отвяжутся от проекта. Удалить?</span>
            <button type="button" className="btn-danger" onClick={remove}>Да, удалить</button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>Отмена</button>
          </>
        ))}
      </div>
    </form>
  );
}
