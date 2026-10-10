/**
 * The browser script Tilda pages load via
 *   <script src="https://<tracker>/t.js" async></script>
 *
 * Served from the tracker itself (see app/t.js/route.ts), so fixing or
 * improving it only needs a tracker deploy: nothing has to be re-pasted into
 * Tilda, and the tracker address is never stale.
 *
 * It does two jobs:
 *   1. Copies click_id + UTM from the URL into hidden fields of every form
 *      (and remembers them in a cookie so they survive navigation).
 *   2. Reports a conversion when a form is submitted successfully. Three
 *      independent signals are used, because Tilda setups differ:
 *        a) Tilda's success-callback (chained after any existing one);
 *        b) Tilda's success message box becoming visible;
 *        c) a "tildaform:aftersuccess" event, if the page fires one.
 *      Whichever fires first sends the conversion; it is sent once per page,
 *      and the server stores at most one lead per click_id anyway.
 */
export function buildTrackerScript(origin: string): string {
  const tracker = JSON.stringify(origin.replace(/\/+$/, ""));
  return `(function () {
  if (window.__tlLoaded) return;
  window.__tlLoaded = true;

  var TRACKER = ${tracker};
  var FIELDS = ["click_id","utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
  var p = new URLSearchParams(window.location.search);

  FIELDS.forEach(function (name) {
    var v = p.get(name);
    if (v) { try { document.cookie = "tl_" + name + "=" + encodeURIComponent(v) + ";path=/;max-age=2592000;SameSite=Lax"; } catch (e) {} }
  });
  function cookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )tl_" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function val(name) { return p.get(name) || cookie(name) || ""; }

  // 1. Hidden fields.
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

  // 2. Conversion.
  var sent = false;
  function send(form, via) {
    var clickId = val("click_id");
    if (!clickId || sent) return;
    sent = true;
    var data = { click_id: clickId, pageUrl: location.href, via: via,
      formname: (form && form.getAttribute && (form.getAttribute("name") || form.getAttribute("data-formactiontype"))) || "" };
    FIELDS.forEach(function (n) { if (n !== "click_id") data[n] = val(n); });
    var url = TRACKER + "/api/track/conversion";
    var json = JSON.stringify(data);
    try { if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([json], { type: "text/plain" }))) return; } catch (e) {}
    try { fetch(url, { method: "POST", body: json, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain" } }); return; } catch (e) {}
    try { new Image().src = url + "?" + new URLSearchParams(data).toString(); } catch (e) {}
  }
  function formOf(x) { return (x && x[0]) ? x[0] : x; }

  // 2a. Tilda success-callback, chained after any callback the form already has.
  window.tlConversion = function ($form) { send(formOf($form), "callback"); };
  window.tlConversionChain = function ($form) {
    try {
      var form = formOf($form);
      var prev = form && form.getAttribute && form.getAttribute("data-tl-prev");
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

  // 2b. Tilda's "thank you" box becomes visible only after a successful submit.
  function visible(el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }
  function checkSuccess() {
    if (sent) return;
    var boxes = document.querySelectorAll(".js-successbox, .t-form__successbox");
    for (var i = 0; i < boxes.length; i++) {
      if (visible(boxes[i])) { send(boxes[i].closest ? boxes[i].closest("form") : null, "successbox"); return; }
    }
  }
  if (window.MutationObserver) {
    var pending = false;
    var observer = new MutationObserver(function () {
      if (sent) { observer.disconnect(); return; }
      if (pending) return;
      pending = true;
      setTimeout(function () { pending = false; checkSuccess(); }, 200);
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
  }

  // 2c. Custom event, if the page or Tilda dispatches one.
  function onEvent(e) { send(e && e.target && e.target.tagName === "FORM" ? e.target : null, "event"); }
  document.addEventListener("tildaform:aftersuccess", onEvent);
  window.addEventListener("tildaform:aftersuccess", onEvent);

  function init() { fill(); attach(); }
  init();
  window.addEventListener("load", init);
  setTimeout(init, 1500);
  setTimeout(init, 4000);
})();
`;
}
