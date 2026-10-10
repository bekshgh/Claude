// Alias of /api/track/conversion: a press of the submit button ("Отправить
// заявку") counts as a lead. Kept so snippets already pasted on Tilda pages,
// which report presses here, keep working.
export { OPTIONS, POST, GET } from "../conversion/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
