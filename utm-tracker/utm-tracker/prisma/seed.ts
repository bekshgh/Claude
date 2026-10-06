/* eslint-disable no-console */
import { PrismaClient, AttributionStatus, WebhookStatus } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

// ── helpers ─────────────────────────────────────────────────────
function clickId() {
  return "clk_" + crypto.randomBytes(16).toString("hex");
}
function hashIp(ip: string) {
  return crypto.createHash("sha256").update(ip + "seed-salt").digest("hex").slice(0, 32);
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const DAYS = 14;
// weight per day (oldest → newest) — mimics the spike around the last days
const DAY_WEIGHTS = [3, 4, 5, 6, 6, 5, 7, 8, 6, 9, 22, 16, 18, 11];
const COUNTRIES = ["KZ", "KZ", "KZ", "KZ", "US", "US", "IE", "RU", "DE"];
const DEVICES = ["mobile", "mobile", "mobile", "desktop", "tablet"];
const BROWSERS = ["Chrome", "Safari", "Firefox", "Edge"];
const OSES = ["iOS", "Android", "Windows", "macOS"];

const FIRST = ["Askar", "Amina", "Banu", "Alibek", "Aruzhan", "Yerkezhan", "Yerniyaz", "Dilyara", "Dastan", "Indira", "Nursultan", "Aizhan", "Daniyar", "Madina", "Arman", "Saule", "Timur", "Aigerim", "Bekzat", "Zarina"];
const LAST = ["Askarov", "Nurkhat", "Zhabagi", "Bissembayev", "Abaigazhy", "Abil", "Ashimbek", "Abaikyzy", "Burkitbayev", "Amanova", "Sultanov", "Kenzhebek", "Tulegenov", "Serikova", "Bolat"];

function makeName() {
  return `${pick(LAST)} ${pick(FIRST)}`;
}
function makeEmail(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12) + randInt(1, 999);
  return `${slug}@${pick(["gmail.com", "icloud.com", "mail.ru", "gmail.com"])}`;
}
function makePhone() {
  return "+7" + randInt(700, 778) + randInt(1000000, 9999999);
}

// timestamp inside the DAYS window, weighted toward recent days
function weightedTimestamp(): Date {
  const total = DAY_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let dayIndex = 0;
  for (let i = 0; i < DAY_WEIGHTS.length; i++) {
    r -= DAY_WEIGHTS[i];
    if (r <= 0) {
      dayIndex = i;
      break;
    }
  }
  const daysAgo = DAYS - 1 - dayIndex;
  const base = Date.now() - daysAgo * 86_400_000;
  const jitter = randInt(8, 22) * 3_600_000 + randInt(0, 59) * 60_000; // within the day
  return new Date(base - 86_400_000 + jitter);
}

// link definitions (source, medium, content, target clicks, target leads)
const LINKS: Array<{
  name: string;
  slug: string;
  source: string;
  medium: string;
  content: string;
  clicks: number;
  leads: number;
  destination: string;
}> = [
  { name: "ICY_Spring'26_telegram-announcement-2", slug: "telegram-announcement-2", source: "telegram", medium: "social", content: "telegram_announcement-2", clicks: 208, leads: 181, destination: "https://tally.so/r/ZjvPBV" },
  { name: "ICY_Spring'26_tapter", slug: "tapter", source: "telegram", medium: "social", content: "tapter", clicks: 188, leads: 96, destination: "https://tally.so/r/ZjvPBV" },
  { name: "ICY_Spring'26_email-mailing", slug: "email-mailing", source: "email", medium: "email", content: "mailing", clicks: 288, leads: 82, destination: "https://tally.so/r/ZjvPBV" },
  { name: "ICY_Spring'26_telegram-announcement-1", slug: "telegram-announcement-1", source: "telegram", medium: "social", content: "telegram_announcement-1", clicks: 34, leads: 27, destination: "https://tally.so/r/ZjvPBV" },
  { name: "ICY_Spring'26_inst-stories-1", slug: "inst-stories-1", source: "instagram", medium: "social", content: "story_may30", clicks: 53, leads: 10, destination: "https://tally.so/r/ZjvPBV" },
  { name: "ICY_Spring'26_inst-target", slug: "inst-target", source: "instagram", medium: "cpc", content: "inst-target", clicks: 1280, leads: 3, destination: "https://tally.so/r/ZjvPBV" },
  { name: "ICY_Spring'26_inst-target-2", slug: "inst-target-2", source: "instagram", medium: "cpc", content: "inst-target-2", clicks: 459, leads: 0, destination: "https://tally.so/r/ZjvPBV" },
  { name: "ICY_Spring'26_infopartners", slug: "infopartners", source: "referral", medium: "referral", content: "infopartners", clicks: 24, leads: 3, destination: "https://tally.so/r/ZjvPBV" },
  { name: "ICY_Spring'26_offline-posters-qr", slug: "offline-posters-qr", source: "qr", medium: "offline", content: "offline_posters-qr", clicks: 12, leads: 0, destination: "https://tally.so/r/ZjvPBV" },
  { name: "ICY_Spring'26_offline-banners", slug: "offline-banners", source: "qr", medium: "offline", content: "offline-banners", clicks: 6, leads: 0, destination: "https://tally.so/r/ZjvPBV" },
  { name: "ICY_Spring'26_telegram-bio", slug: "telegram-bio", source: "telegram", medium: "bio", content: "telegram_bio", clicks: 521, leads: 21, destination: "https://tally.so/r/ZjvPBV" },
  // archived examples
  { name: "ICY_Spring'26_inst-stories-old", slug: "inst-stories-old", source: "instagram", medium: "social", content: "story_may15", clicks: 0, leads: 0, destination: "https://tally.so/r/ZjvPBV" },
  { name: "ICY_Spring'26_test-link", slug: "test-link", source: "website", medium: "referral", content: "test", clicks: 0, leads: 0, destination: "https://tally.so/r/ZjvPBV" },
];

async function main() {
  console.log("🧹 Clearing existing data…");
  await prisma.webhookLog.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.clickEvent.deleteMany();
  await prisma.trackingLink.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();

  console.log("👤 Creating demo user + campaign…");
  const user = await prisma.user.create({
    data: { email: "demo@trackline.app", name: "Demo Workspace" },
  });

  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      name: "icy_s26",
      label: "ICY S'26",
      description: "ICY S'26",
      funnel: "Projects",
      season: "spring 2026",
      type: "Event",
      status: "active",
    },
  });

  let totalClicks = 0;
  let totalLeads = 0;

  for (const def of LINKS) {
    const archived = def.slug === "inst-stories-old" || def.slug === "test-link";
    const link = await prisma.trackingLink.create({
      data: {
        userId: user.id,
        campaignId: campaign.id,
        name: def.name,
        slug: def.slug,
        destinationUrl: def.destination,
        utmSource: def.source,
        utmMedium: def.medium,
        utmCampaign: "icy_s26",
        utmContent: def.content,
        tags: [def.source],
        isArchived: archived,
        isActive: !archived,
        createdAt: new Date(Date.now() - randInt(5, 14) * 86_400_000),
      },
    });

    // ── clicks ──
    const ipPool = new Set<string>();
    const clickRows: {
      trackingLinkId: string;
      clickId: string;
      timestamp: Date;
      userAgent: string;
      ipHash: string;
      referrer: string | null;
      country: string;
      device: string;
      browser: string;
      os: string;
      isUnique: boolean;
      rawParams: object;
    }[] = [];

    for (let i = 0; i < def.clicks; i++) {
      const ts = weightedTimestamp();
      const ip = `${randInt(1, 255)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(0, 255)}`;
      const ih = hashIp(ip);
      const isUnique = !ipPool.has(ih);
      ipPool.add(ih);
      clickRows.push({
        trackingLinkId: link.id,
        clickId: clickId(),
        timestamp: ts,
        userAgent: "Mozilla/5.0 (seed)",
        ipHash: ih,
        referrer: def.source === "instagram" ? "https://instagram.com/" : null,
        country: pick(COUNTRIES),
        device: pick(DEVICES),
        browser: pick(BROWSERS),
        os: pick(OSES),
        isUnique,
        rawParams: { utm_source: def.source, utm_campaign: "icy_s26", utm_content: def.content },
      });
    }
    if (clickRows.length) {
      await prisma.clickEvent.createMany({ data: clickRows });
    }
    totalClicks += clickRows.length;

    // ── leads (exact attribution via real click rows) ──
    const createdClicks = await prisma.clickEvent.findMany({
      where: { trackingLinkId: link.id },
      select: { id: true, clickId: true, timestamp: true },
      take: def.leads + 5,
      orderBy: { timestamp: "desc" },
    });

    for (let i = 0; i < def.leads; i++) {
      const click = createdClicks[i % Math.max(createdClicks.length, 1)];
      const name = makeName();
      const submittedAt = click ? new Date(click.timestamp.getTime() + randInt(2, 90) * 60_000) : weightedTimestamp();
      // ~12% of matched leads fall back to estimated (no click_id captured)
      const estimated = !click || Math.random() < 0.12;
      await prisma.lead.create({
        data: {
          trackingLinkId: link.id,
          clickEventId: estimated ? null : click?.id ?? null,
          clickId: estimated ? null : click?.clickId ?? null,
          name,
          email: makeEmail(name),
          phone: Math.random() < 0.6 ? makePhone() : null,
          formName: "ICY S'26 Application",
          pageUrl: def.destination,
          utmSource: def.source,
          utmMedium: def.medium,
          utmCampaign: "icy_s26",
          utmContent: def.content,
          submittedAt,
          sourcePayload: { name, source: def.source, click_id: estimated ? null : click?.clickId },
          attributionStatus: estimated ? AttributionStatus.estimated : AttributionStatus.exact,
          dedupeKey: "seed:" + crypto.randomBytes(10).toString("hex"),
        },
      });
      totalLeads++;
    }
  }

  // ── 18 "direct / no campaign" leads with unknown attribution ──
  console.log("📭 Adding unattributed (direct) leads…");
  for (let i = 0; i < 18; i++) {
    const name = makeName();
    await prisma.lead.create({
      data: {
        name,
        email: makeEmail(name),
        phone: Math.random() < 0.5 ? makePhone() : null,
        formName: "ICY S'26 Application",
        pageUrl: "https://tally.so/r/ZjvPBV",
        submittedAt: weightedTimestamp(),
        sourcePayload: { name, note: "no click_id, no utm" },
        attributionStatus: AttributionStatus.unknown,
        dedupeKey: "seed:" + crypto.randomBytes(10).toString("hex"),
      },
    });
    totalLeads++;
  }

  // ── webhook log samples ──
  console.log("🪝 Adding webhook log samples…");
  const statuses: WebhookStatus[] = [
    WebhookStatus.success,
    WebhookStatus.success,
    WebhookStatus.success,
    WebhookStatus.missing_click_id,
    WebhookStatus.duplicated,
    WebhookStatus.unauthorized,
  ];
  for (let i = 0; i < 12; i++) {
    const status = pick(statuses);
    await prisma.webhookLog.create({
      data: {
        provider: "tilda",
        status,
        message:
          status === WebhookStatus.success
            ? "Lead created · exact attribution"
            : status === WebhookStatus.missing_click_id
            ? "No click_id — fell back to UTM matching"
            : status === WebhookStatus.duplicated
            ? "Duplicate webhook ignored"
            : status === WebhookStatus.unauthorized
            ? "Bad secret token"
            : "Error",
        payload: { name: makeName(), formname: "ICY S'26 Application" },
        createdAt: weightedTimestamp(),
      },
    });
  }

  console.log(`✅ Seed complete — ${totalClicks} clicks, ${totalLeads} leads across ${LINKS.length} links.`);
  console.log(`   Campaign: ${campaign.label} (${campaign.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
