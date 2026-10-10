/**
 * Shared dictionaries that make different projects comparable. Reports name
 * things in their own words ("Coffee-zone location", "TG Mailing #1"); filters
 * only ever see these keys. Matching is by keywords in RU / KK / EN.
 */

export interface DictEntry {
  key: string;
  label: string; // ru, shown in the UI
  match: RegExp; // against the label used in a report
}

function lookup(dict: DictEntry[], text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/ё/g, "е");
  return dict.find((d) => d.match.test(t))?.key ?? null;
}

export const labelOf = (dict: DictEntry[], key: string | null | undefined) =>
  dict.find((d) => d.key === key)?.label ?? key ?? "—";

/* ─── Zones: rated areas of the event (feedback score table) ─────── */
// Order matters: the first match wins ("Coffee-zone location" is logistics, not food).
export const ZONES: DictEntry[] = [
  { key: "networking", label: "Нетворкинг", match: /network|нетворк|знакомств|таныс/ },
  { key: "speakers", label: "Спикеры и контент", match: /speaker|content|session|спикер|контент|лектор|баяндамашы/ },
  { key: "logistics", label: "Логистика и площадка", match: /location|venue|logistic|room|площадк|локаци|помещ|логистик|орын/ },
  { key: "communication", label: "Коммуникация", match: /telegram|chat|communicat|announce|коммуникац|чат|телеграм|рассылк|хабарла/ },
  { key: "food", label: "Еда и напитки", match: /coffee|food|drink|catering|lunch|кофе|еда|напит|обед|тамақ|сусын/ },
  { key: "timing", label: "Тайминг", match: /timing|schedule|punctual|agenda|тайминг|расписан|время|кесте/ },
  { key: "support", label: "Поддержка организаторов", match: /support|organi[sz]er|поддержк|организатор|ұйымдастыр/ },
];

/** Zone of a rated metric, or null for the overall / composite rows. */
export function zoneOf(metricLabel: string): string | null {
  if (/^\s*(overall|общ|жалпы)|composite|nps/i.test(metricLabel)) return null;
  return lookup(ZONES, metricLabel);
}

/* ─── Canonical open-answer themes ──────────────────────────────── */
export const THEMES: DictEntry[] = [
  { key: "networking", label: "Нетворкинг", match: /network|нетворк|знакомств|общени|таныс|passive format/ },
  // Before "speakers": "Schedule delays / speaker time cut" is about timing.
  { key: "timing", label: "Тайминг и расписание", match: /timing|schedule|delay|agenda|start-time|punctual|расписан|задерж|тайминг|опоздан|адженд|кесте/ },
  { key: "speakers", label: "Спикеры и контент", match: /speaker|content|topic|q&a|спикер|контент|тем[аы]|лектор|баяндамашы/ },
  { key: "interactive", label: "Интерактив и активности", match: /interactiv|game|energi[sz]|workshop|activit|quiz|monopoly|интерактив|игр|воркшоп|активност|ойын/ },
  { key: "logistics", label: "Логистика и площадка", match: /venue|logistic|space|queue|entry|wi-?fi|площадк|логистик|место|очеред|вход|орын/ },
  { key: "food", label: "Еда и напитки", match: /coffee|food|drink|water|lemonade|catering|кофе|еда|напит|вод[аы]|тамақ|сусын|су\b/ },
  { key: "communication", label: "Коммуникация и Telegram", match: /telegram|chat|bot|spam|announce|communicat|чат|телеграм|бот|спам|анонс|хабарла/ },
  { key: "team", label: "Команда и атмосфера", match: /team|atmosphere|friendly|organi[sz]ation|structure|команд|атмосфер|организац|ұйым/ },
  { key: "prizes", label: "Призы и подарки", match: /gift|prize|merch|подар|приз|мерч|сыйлық/ },
];

export const suggestTheme = (rawLabel: string) => lookup(THEMES, rawLabel);

/* ─── Channel groups ────────────────────────────────────────────── */
export const CHANNEL_GROUPS: DictEntry[] = [
  { key: "telegram", label: "Telegram", match: /telegram|\btg\b/ },
  { key: "instagram", label: "Instagram", match: /instagram|\big\b/ },
  { key: "email", label: "Email", match: /e-?mail|почт/ },
  { key: "offline", label: "Offline", match: /offline|qr|poster|офлайн|постер/ },
  { key: "partners", label: "Partners", match: /partner|партн/ },
  { key: "direct", label: "Direct / Other", match: /direct|other|untagged|прям|друг/ },
];

export const channelGroupOf = (label: string) => lookup(CHANNEL_GROUPS, label);

/* ─── Study stage of the audience ───────────────────────────────── */
export const STAGES: DictEntry[] = [
  { key: "y1_2", label: "Y1–2", match: /early|y1|y2|1[–-]2/ },
  { key: "y3_4", label: "Y3–4", match: /senior|y3|y4|3[–-]4/ },
  { key: "grad", label: "Магистратура и выше", match: /grad|master|phd|магистр/ },
  { key: "pre_uni", label: "Школьники и другое", match: /pre-?uni|school|foundation|college|other|школ/ },
];

export const stageOf = (label: string) => lookup(STAGES, label);

export const CONCENTRATION: DictEntry[] = [
  { key: "low", label: "Низкая", match: /low|низк/ },
  { key: "moderate", label: "Умеренная", match: /moderate|умерен/ },
  { key: "high", label: "Высокая", match: /high|высок/ },
];
