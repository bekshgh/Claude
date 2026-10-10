"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectSettings } from "@/lib/projects/settings";

type Field = { key: keyof ProjectSettings; label: string; help: string; percent?: boolean; step?: number };

const FIELDS: Field[] = [
  { key: "minResponses", label: "Достаточно откликов, n ≥", help: "Фильтр «Только с достаточным числом откликов» и вид «Лучшие»." },
  { key: "minResponseRate", label: "…и доля откликнувшихся ≥", help: "Вместе с порогом n.", percent: true, step: 0.1 },
  { key: "smallSampleN", label: "Малая выборка, если n <", help: "Бейдж «малая выборка»; такие оценки не ранжируются вместе с остальными." },
  { key: "burstyPeakShare", label: "Пиковая кампания: за один день >", help: "Доля регистраций за самый сильный день.", percent: true },
  { key: "attentionZone10", label: "«Требуют внимания»: слабая зона <", help: "Балл из 10.", step: 0.1 },
  { key: "attentionResponseRate", label: "«Требуют внимания»: отклик <", help: "Доля откликнувшихся.", percent: true, step: 0.1 },
  { key: "noFeedbackDays", label: "«Нет фидбэка»: проведён больше, дней", help: "Сколько ждать фидбэк после проекта." },
  { key: "relativeMinProjects", label: "Относительные фильтры: минимум проектов типа", help: "Меньше — фильтр отключается." },
];

/** Thresholds behind presets and badges, editable without a deploy. */
export function ThresholdsForm({ initial }: { initial: ProjectSettings }) {
  const router = useRouter();
  const [v, setV] = useState(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(f.percent ? +(initial[f.key] * 100).toFixed(2) : initial[f.key])])),
  );
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const body = Object.fromEntries(FIELDS.map((f) => [f.key, f.percent ? Number(v[f.key]) / 100 : Number(v[f.key])]));
    const res = await fetch("/api/settings/projects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setState(res?.ok ? "saved" : "error");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={`th-${f.key}`}>{f.label}{f.percent ? ", %" : ""}</label>
            <input id={`th-${f.key}`} type="number" className="input" min={0} step={f.step ?? 1} required value={v[f.key]}
              onChange={(e) => (setState("idle"), setV({ ...v, [f.key]: e.target.value }))} />
            <p className="hint">{f.help}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={state === "busy"}>{state === "busy" ? "Сохраняю…" : "Сохранить пороги"}</button>
        {state === "saved" && <span className="text-sm text-leads">Сохранено ✓</span>}
        {state === "error" && <span role="alert" className="text-sm text-danger">Проверьте значения</span>}
      </div>
    </form>
  );
}
