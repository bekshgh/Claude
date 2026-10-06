import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { CodeBlock } from "@/components/CodeBlock";
import { CopyButton } from "@/components/ui/CopyButton";
import { WebhookTester } from "@/components/WebhookTester";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://aieseckz.vercel.app";

function buildSnippet(base: string): string {
  return `<script>
// Trackline — one snippet does two jobs:
//   1. copy click_id + UTM from the URL into hidden fields of every form;
//   2. report a conversion when a Tilda form is submitted successfully,
//      so leads are counted even without a server-side webhook.
(function () {
  var TRACKER = "${base}";
  var FIELDS = ["click_id","utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
  var p = new URLSearchParams(window.location.search);

  // Persist the params to a cookie so they survive a redirect to a thank-you page.
  FIELDS.forEach(function (name) {
    var v = p.get(name);
    if (v) { try { document.cookie = "tl_" + name + "=" + encodeURIComponent(v) + ";path=/;max-age=86400;SameSite=Lax"; } catch (e) {} }
  });
  function cookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )tl_" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function val(name) { return p.get(name) || cookie(name) || ""; }

  // 1. Fill hidden fields.
  function fill() {
    document.querySelectorAll("form").forEach(function (form) {
      FIELDS.forEach(function (name) {
        var v = val(name);
        if (!v) return;
        var input = form.querySelector('input[name="' + name + '"]');
        if (!input) { input = document.createElement("input"); input.type = "hidden"; input.name = name; form.appendChild(input); }
        input.value = v;
      });
    });
  }
  fill();
  window.addEventListener("load", fill);
  setTimeout(fill, 1500);

  // 2. Report the conversion on a successful submit.
  var done = {};
  window.tlConversion = function ($form) {
    try {
      var clickId = val("click_id");
      if (!clickId || done[clickId]) return;
      done[clickId] = true;
      var form = ($form && $form[0]) ? $form[0] : $form;
      var data = { click_id: clickId, pageUrl: location.href,
        formname: (form && (form.getAttribute("name") || form.getAttribute("data-formactiontype"))) || "" };
      FIELDS.forEach(function (n) { if (n !== "click_id") data[n] = val(n); });
      var url = TRACKER + "/api/track/conversion";
      var json = JSON.stringify(data);
      if (navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([json], { type: "text/plain" })); }
      else { fetch(url, { method: "POST", body: json, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain" } }); }
    } catch (e) {}
  };
  // Chain our callback after any existing success-callback the form already has.
  window.tlConversionChain = function ($form) {
    try {
      var form = ($form && $form[0]) ? $form[0] : $form;
      var prev = form && form.getAttribute("data-tl-prev");
      if (prev) { var fn = prev.indexOf("window.") === 0 ? window[prev.slice(7)] : window[prev]; if (typeof fn === "function") fn($form); }
    } catch (e) {}
    window.tlConversion($form);
  };
  function attach() {
    if (!window.jQuery) return;
    window.jQuery(".t-form").each(function () {
      var cur = window.jQuery(this).data("success-callback");
      if (cur === "window.tlConversion" || cur === "window.tlConversionChain") return;
      if (cur) { this.setAttribute("data-tl-prev", cur); window.jQuery(this).data("success-callback", "window.tlConversionChain"); }
      else { window.jQuery(this).data("success-callback", "window.tlConversion"); }
    });
  }
  attach();
  window.addEventListener("load", attach);
  setTimeout(attach, 1500);
  setTimeout(attach, 3000);
})();
</script>`;
}

const PAYLOAD_EXAMPLE = `{
  "name": "Askarov Eldos",
  "email": "eldos@example.com",
  "phone": "+7 700 123 4567",
  "formname": "ICY application",
  "click_id": "clk_9f1c…",        // ← forwarded by the snippet
  "utm_source": "instagram",
  "utm_medium": "social",
  "utm_campaign": "icy_s26",
  "utm_content": "story_may30",
  "pageUrl": "https://aieseckz.tilda.ws/apply"
}`;

export default async function WebhookPage() {
  const logs = await prisma.webhookLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const endpoint = `${BASE}/api/webhooks/tilda-lead`;
  const last = logs[0];

  return (
    <>
      <PageHeader breadcrumb="Integration" title="Webhook settings" subtitle="Connect your form so every submission becomes an attributed lead." />

      {/* status */}
      <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-sm text-ink-muted">Integration status</p>
          <p className="mt-1 font-display text-lg font-semibold">
            {last ? "Receiving events" : "Waiting for first event"}
          </p>
        </div>
        {last ? (
          <div className="text-right">
            <Pill label={last.status} tone={last.status} />
            <p className="mt-1 text-xs text-ink-faint">last: {formatDateTime(last.createdAt)}</p>
          </div>
        ) : (
          <Pill label="not connected yet" tone="default" />
        )}
      </div>

      {/* endpoint + secret */}
      <div className="card mb-6 p-6">
        <h2 className="font-display text-lg font-semibold">1 · Your webhook URL <span className="text-xs font-normal text-ink-faint">(optional backup)</span></h2>
        <p className="mt-1 text-sm text-ink-muted">Optional. The snippet below already counts leads on its own. Add this webhook only if you also want a 100% server-side channel: paste it into your form platform → Form settings → Webhook. Safe to use alongside the snippet — leads sharing a click_id are never double-counted.</p>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-bg-base px-4 py-3">
          <code className="flex-1 break-all text-sm text-accent">{endpoint}</code>
          <CopyButton value={endpoint} />
        </div>
        <p className="hint">Tilda must also send the secret. Add header <code className="text-ink-muted">X-Webhook-Secret</code> or append <code className="text-ink-muted">?secret=YOUR_SECRET</code> to the URL. The secret is set in your environment variable <code className="text-ink-muted">WEBHOOK_SECRET</code>.</p>
      </div>

      {/* snippet */}
      <div className="card mb-6 p-6">
        <h2 className="font-display text-lg font-semibold">2 · Add this snippet to your page</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">
          Insert via an HTML block or Site settings → More → HTML code for the &lt;head&gt;. One snippet, pasted once, works for every project page. It copies <code className="text-ink-muted">click_id</code> and UTM into hidden form fields <strong>and</strong> reports a conversion when a Tilda form is submitted — so leads are counted even without the webhook above.
        </p>
        <CodeBlock code={buildSnippet(BASE)} label="paste into your page" />
      </div>

      {/* fields */}
      <div className="card mb-6 p-6">
        <h2 className="font-display text-lg font-semibold">3 · Fields your form should send</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">The snippet adds the hidden ones automatically. Your visible form fields stay as they are.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["name", "visitor name"], ["email", "visitor email"], ["phone", "visitor phone"],
            ["click_id", "hidden — links lead to its click (most important)"],
            ["utm_source / medium / campaign / content / term", "hidden — fallback attribution"],
          ].map(([f, d]) => (
            <div key={f} className="rounded-xl border border-line bg-bg-base px-4 py-3">
              <code className="text-sm text-clicks">{f}</code>
              <p className="mt-0.5 text-xs text-ink-faint">{d}</p>
            </div>
          ))}
        </div>
        <p className="hint mt-4 rounded-xl border border-accent/30 bg-accent/5 p-3 text-accent">
          ⚡ Why <code>click_id</code> matters: with it, attribution is <strong>exact</strong>. Without it we fall back to UTM + time matching and mark the lead as <strong>estimated</strong>.
        </p>
      </div>

      {/* example payload */}
      <div className="card mb-6 p-6">
        <h2 className="font-display text-lg font-semibold">Example payload we receive</h2>
        <div className="mt-3"><CodeBlock code={PAYLOAD_EXAMPLE} label="POST body" /></div>
      </div>

      {/* test */}
      <div className="card mb-6 p-6">
        <h2 className="font-display text-lg font-semibold">4 · Test it</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">Fires a sample lead at your own endpoint and shows the response. A new lead should appear in Leads.</p>
        <WebhookTester />
      </div>

      {/* recent events */}
      <div className="card overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold">Recent webhook events</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Message</th>
                <th className="px-6 py-3 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.length === 0 && <tr><td colSpan={3} className="px-6 py-10 text-center text-ink-faint">No webhook events yet.</td></tr>}
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-bg-hover/40">
                  <td className="px-6 py-3"><Pill label={l.status} tone={l.status} /></td>
                  <td className="px-6 py-3 text-ink-muted">{l.message || "—"}</td>
                  <td className="px-6 py-3 text-right text-xs text-ink-faint">{formatDateTime(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
