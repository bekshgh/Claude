# Trackline — UTM / Link Tracker

Production-ready link tracker that creates UTM-tagged short links, counts clicks
**server-side**, forwards a `click_id` to your form (Tilda / Tally), and attributes
the resulting lead back to the exact click via a secure webhook.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · PostgreSQL · Prisma · Zod · Recharts · Vercel-ready.

---

## 1. What it does (the funnel)

```
short link click  →  /r/{slug}  →  302 redirect to Tilda (+ click_id & UTM)
                         │                         │
                   ClickEvent saved          form submitted
                         │                         │
                         └──── webhook ◄───── /api/webhooks/tilda-lead
                                  │
                          Lead created & attributed:
                          exact (click_id) │ estimated (UTM+time) │ unknown
```

The critical path — **click → Tilda → webhook → lead → analytics** — is implemented
end to end. Clicks are counted on the server (resilient to ad-blockers), and a click
is never blocked by a database error.

---

## 2. Pages

| Page | Route | Purpose |
|---|---|---|
| Dashboard | `/` | Totals, funnel, breakdowns, recent activity, webhook health |
| Links | `/links` | All links, search / filter / archive / delete |
| Create link | `/links/new` | Step-by-step form with live URL preview |
| Analytics | `/analytics` | By source / campaign / content, charts, per-link CR |
| Leads | `/leads` | Attributed leads with status pills |
| Campaigns | `/campaigns` | Manage campaigns |
| Webhook | `/webhooks` | Endpoint URL, Tilda JS snippet, payload, tester, event log |
| Guideline | `/guide` | 20-step beginner guide (in Russian) |
| Settings | `/settings` | Config, environment status, data overview |

---

## 3. Data model (Prisma)

`User` · `Campaign` · `TrackingLink` · `ClickEvent` · `Lead` · `WebhookLog`.

Key points:
- `ClickEvent.clickId` is **unique** and forwarded to Tilda — this enables exact attribution.
- `Lead.attributionStatus` is `exact | estimated | unknown`.
- `Lead.dedupeKey` is **unique** — repeated webhooks never create duplicate leads.
- IPs are stored only as a salted hash (`ipHash`); raw IPs are never persisted.

---

## 4. Run locally

Requires Node 18+ and a PostgreSQL database.

```bash
# 1. install
npm install

# 2. configure environment
cp .env.example .env
#   then fill in DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_BASE_URL,
#   WEBHOOK_SECRET and IP_HASH_SALT

# 3. create the schema
npm run db:push          # or: npm run db:migrate  (creates a migration)

# 4. (optional) load demo data that matches the reference dashboard
npm run db:seed

# 5. start
npm run dev              # http://localhost:3000
```

> No local Postgres? Use a free hosted one (Neon / Supabase / Vercel Postgres) and
> paste its connection strings into `.env`.

---

## 5. Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Pooled PostgreSQL connection (app runtime) |
| `DIRECT_URL` | ✅ | Direct connection used by Prisma migrations |
| `NEXT_PUBLIC_BASE_URL` | ✅ | Public URL of this tracker, no trailing slash |
| `WEBHOOK_SECRET` | ✅ | Shared secret authorising the Tilda webhook |
| `IP_HASH_SALT` | ➖ | Salt for hashing visitor IPs |

---

## 6. Deploy to Vercel

1. Push this repo to GitHub and **Import** it in Vercel.
2. Add a PostgreSQL database (Vercel Postgres / Neon / Supabase).
3. In **Project → Settings → Environment Variables**, add all five variables above.
   Set `NEXT_PUBLIC_BASE_URL` to your real Vercel domain.
4. The build runs `prisma generate && next build` automatically.
5. After the first deploy, run migrations against production:
   ```bash
   npm run db:deploy        # prisma migrate deploy
   ```
   (Run locally with the production `DATABASE_URL`/`DIRECT_URL`, or as a one-off job.)

---

## 7. Tilda setup

**a) Forward `click_id` + UTM into the form.** In Tilda add a *T123 / HTML* block (or
Site Settings → More → HTML code in `<head>`) with the snippet shown on the **Webhook**
page. It reads `click_id` and the five UTM params from the URL and injects them as
hidden inputs into every form on the page (it re-runs after load because Tilda renders
forms late).

**b) Point the webhook at this app.** Tilda → Form → *Webhook*:
```
URL: https://<your-domain>/api/webhooks/tilda-lead?secret=<WEBHOOK_SECRET>
```
The secret may also be sent as the header `X-Webhook-Secret`.

**c) Make sure the form posts these fields:** `name`, `email`, `phone`, `click_id`,
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`.

---

## 8. Webhook endpoint

`POST /api/webhooks/tilda-lead`

- Accepts JSON **or** `application/x-www-form-urlencoded` (Tilda's default).
- Authorised via `X-Webhook-Secret` header, `?secret=` query, or `secret`/`token` in body.
- Handles Tilda's "test" ping gracefully.
- Validates with Zod, normalises fields, deduplicates, resolves attribution, logs the event.

Statuses recorded in `WebhookLog`: `success`, `failed`, `missing_click_id`,
`duplicated`, `unauthorized`.

---

## 9. Test checklist

- [ ] Create a link in `/links/new` and copy the short URL.
- [ ] Open the short URL → you're redirected to the destination with `?click_id=…&utm_*` appended.
- [ ] A click appears in **Dashboard → Recent clicks**.
- [ ] Fire the built-in tester on `/webhooks` → a lead appears in `/leads` as **exact**.
- [ ] Submit the Tilda form for real with the snippet installed → exact attribution.
- [ ] Submit without `click_id` → lead is created as **estimated** (or **unknown**).
- [ ] Send the same webhook twice → only one lead exists (deduplicated).
- [ ] Call the endpoint with a wrong secret → `401`, logged as `unauthorized`.

---

## 10. Post-MVP ideas

- Authentication + multi-user workspaces and roles.
- Bot/click-fraud filtering and rate limiting on `/r/{slug}`.
- Geo/IP enrichment via an edge geolocation provider.
- CSV / Sheets export and scheduled email digests.
- Per-link QR code generation.
- Configurable attribution window and last-touch vs first-touch models.
- Server-Sent Events for live dashboard updates.

---

Built to be clean, typed and extensible. The whole attribution chain lives in
`src/lib/attribution.ts`, `src/app/r/[slug]/route.ts` and
`src/app/api/webhooks/tilda-lead/route.ts`.
