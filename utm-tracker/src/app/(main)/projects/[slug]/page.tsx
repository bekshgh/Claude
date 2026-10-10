import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { SmallSample } from "@/components/projects/ProjectList";
import { STATUS_LABEL, fmtDate, fmtMetric, fmtNumber } from "@/components/projects/format";
import { prisma } from "@/lib/db";
import { CHANNEL_GROUPS, CONCENTRATION, THEMES, ZONES, labelOf } from "@/lib/projects/dictionaries";
import { toRow } from "@/lib/projects/rows";
import { getProjectSettings } from "@/lib/projects/settings";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** "Similar to this one": same type, registrations within ±50%. */
function similarQuery(typeKey: string, registrants: number | null) {
  const p = new URLSearchParams({ type: typeKey });
  if (registrants) p.set("regs", `${Math.round(registrants * 0.5)}..${Math.round(registrants * 1.5)}`);
  return p.toString().replace(/%2C/g, ",");
}

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const [project, types, settings] = await Promise.all([
    prisma.project.findUnique({
      where: { slug: params.slug },
      include: { type: true, metrics: true, reports: { orderBy: { updatedAt: "desc" }, select: { id: true, slug: true, title: true, type: true, status: true, updatedAt: true } } },
    }),
    prisma.projectType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    getProjectSettings(prisma),
  ]);
  if (!project) notFound();
  const r = toRow(project);
  const small = r.responses !== null && r.responses < settings.smallSampleN;
  const pct = (v: number | null, d = 0) => fmtMetric(v, { unit: "%", scale: 100, decimals: d });

  const groups: { title: string; items: [string, string][] }[] = [
    {
      title: "Масштаб",
      items: [
        ["Регистрации (уникальные)", r.registrants === null ? "нет данных" : `${fmtNumber(r.registrants)}${r.submissions ? ` (${fmtNumber(r.submissions)} отправок)` : ""}`],
        ["Длительность кампании", fmtMetric(r.campaignDays, { unit: "days" })],
        ["Каналов", fmtMetric(r.channelCount, {})],
        ["Отклики на фидбэк", fmtMetric(r.responses, {})],
        ["Доля откликнувшихся", pct(r.responseRate, 1)],
      ],
    },
    {
      title: "Результаты",
      items: [
        ["Оценка организации", fmtMetric(r.orgScore10, { unit: "/10", decimals: 2 })],
        ["NPS-прокси", r.nps === null ? "нет данных" : `${r.nps > 0 ? "+" : ""}${fmtNumber(r.nps)}`],
        ["Композитный балл", fmtMetric(r.composite10, { unit: "/10", decimals: 2 })],
        ["Самая слабая зона", r.weakestZone ? `${labelOf(ZONES, r.weakestZone)} · ${fmtNumber(r.weakestZoneScore10 ?? 0, 1)}/10` : "нет данных"],
        ["Самая сильная зона", r.strongestZone ? `${labelOf(ZONES, r.strongestZone)} · ${fmtNumber(r.strongestZoneScore10 ?? 0, 1)}/10` : "нет данных"],
        ["Чаще всего хвалили", r.topPraiseTheme ? labelOf(THEMES, r.topPraiseTheme) : "нет данных"],
        ["Чаще всего критиковали", r.topPainTheme ? labelOf(THEMES, r.topPainTheme) : "нет данных"],
      ],
    },
    {
      title: "Привлечение и аудитория",
      items: [
        ["Главная группа каналов", r.topChannelGroup ? `${labelOf(CHANNEL_GROUPS, r.topChannelGroup)} · ${pct(r.topChannelShare)}` : "нет данных"],
        ["Главный канал", r.topChannel ? `${r.topChannel} · ${pct(r.topChannelOwnShare)}` : "нет данных"],
        ["Концентрация каналов", r.concentrationLevel ? `${labelOf(CONCENTRATION, r.concentrationLevel)} · HHI ${fmtNumber(r.hhiGroups ?? 0, 2)}` : "нет данных"],
        ["Пиковый день", r.peakDayShare === null ? "нет данных" : `${pct(r.peakDayShare)} регистраций · ${r.isBursty ? "пиковая" : "ровная"} кампания`],
        ["Главный вуз", r.topUniversityName ? `${r.topUniversityName} · ${pct(r.topUniversityShare)}` : "нет данных"],
        ["Новые в AIESEC", pct(r.newToOrgShare)],
        ["Интерес к стажировкам", pct(r.internshipShare)],
        ["Средний возраст", fmtMetric(r.avgAge, { unit: "years", decimals: 1 })],
        ["Доля дубликатов", pct(r.duplicateRate, 1)],
      ],
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb="Projects"
        title={project.name}
        subtitle={[project.type.name, STATUS_LABEL[project.status], fmtDate(r.startDate), project.city, project.ownerTeam].filter(Boolean).join(" · ")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects?${similarQuery(project.type.key, r.registrants)}`} className="btn-ghost">Похожие на этот →</Link>
            <Link href="/projects" className="btn-ghost">← Все проекты</Link>
          </div>
        }
      />

      {small && (
        <p className="mb-6 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-accent">
          Мало ответов на фидбэк <SmallSample n={r.responses!} /> — оценки этого проекта могут быть случайными.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {groups.map((g) => (
          <section key={g.title} className="card p-5">
            <h2 className="mb-3 font-display text-base font-semibold">{g.title}</h2>
            <dl className="divide-y divide-line text-sm">
              {g.items.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className={v === "нет данных" ? "text-right text-ink-faint" : "num text-right text-ink"}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-3 font-display text-base font-semibold">Отчёты проекта</h2>
        {project.reports.length === 0 ? (
          <p className="text-sm text-ink-faint">
            Отчётов пока нет. Загрузите отчёт в <Link href="/reports" className="text-accent hover:underline">Reports</Link> и выберите этот проект.
          </p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {project.reports.map((rep) => (
              <li key={rep.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <Link href={`/reports/${rep.id}`} className="font-medium text-ink hover:text-accent">{rep.title}</Link>
                <span className="text-xs text-ink-faint">
                  {rep.type === "feedback" ? "Фидбэк" : "Регистрация"} · {rep.status === "published" ? "опубликован" : "черновик"} · {formatDateTime(rep.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {project.metrics && <p className="mt-3 text-xs text-ink-faint">Показатели пересчитаны {formatDateTime(project.metrics.computedAt)} (версия расчёта {project.metrics.metricsVersion}).</p>}
      </section>

      <details className="card mt-6 p-5">
        <summary className="cursor-pointer font-display text-base font-semibold">Редактировать проект</summary>
        <div className="mt-4">
          <ProjectForm
            types={types.map((t) => ({ value: t.key, label: t.name }))}
            initial={{
              id: project.id,
              name: project.name,
              typeKey: project.type.key,
              format: project.format ?? "",
              status: project.status,
              startDate: r.startDate ?? "",
              endDate: r.endDate ?? "",
              city: project.city ?? "",
              venue: project.venue ?? "",
              ownerTeam: project.ownerTeam ?? "",
              tags: project.tags.join(", "),
            }}
          />
        </div>
      </details>
    </>
  );
}
