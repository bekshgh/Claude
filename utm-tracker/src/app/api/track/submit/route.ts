import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CORS, beaconOk, readInput, str } from "@/lib/beacon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public "submit button pressed" endpoint for the on-page snippet.
 *
 * The snippet calls this the moment a visitor presses the form's submit button
 * ("Отправить заявку"), before Tilda validates or sends the form. It is the
 * middle step of the funnel: click → submit → lead.
 *
 * Counted once per click_id; repeated presses (e.g. after a validation error)
 * only bump `attempts`. Like /api/track/conversion, only a click_id matching a
 * real recorded click is accepted, everything else is a no-op.
 */

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function handle(req: NextRequest) {
  const body = await readInput(req);
  const ok = (extra?: Record<string, unknown>) => beaconOk(req, extra);

  const clickId = str(body.click_id) || str(body.clickId);
  if (!clickId) return ok({ ignored: "no_click_id" });

  const click = await prisma.clickEvent.findUnique({
    where: { clickId },
    select: { id: true, trackingLinkId: true },
  });
  if (!click) return ok({ ignored: "unknown_click_id" });

  const formName = (str(body.formname) || str(body.formName))?.slice(0, 200) ?? null;
  const pageUrl = (str(body.pageUrl) || str(body.page_url) || str(body.url))?.slice(0, 2000) ?? null;
  const now = new Date();

  const submit = await prisma.formSubmit.upsert({
    where: { clickEventId: click.id },
    create: {
      trackingLinkId: click.trackingLinkId,
      clickEventId: click.id,
      clickId,
      formName,
      pageUrl,
      submittedAt: now,
      lastAt: now,
    },
    update: { attempts: { increment: 1 }, lastAt: now },
    select: { id: true, attempts: true },
  });

  return ok({ submitId: submit.id, attempts: submit.attempts });
}

export const POST = handle;
export const GET = handle;
