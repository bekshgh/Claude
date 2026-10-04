// Load the renderer page and print console output / errors until init finishes.
const http = require('http');
const fs = require('fs');
const path = require('path');
let playwright;
try {
  playwright = require('playwright');
} catch (e) {
  playwright = require('/opt/node22/lib/node_modules/playwright');
}

const ROOT = path.resolve(__dirname, '..');
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) {
      res.writeHead(404);
      return res.end();
    }
    const ext = path.extname(p);
    const type = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' }[ext];
    res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' });
    res.end(d);
  });
});

srv.listen(0, '127.0.0.1', async () => {
  const browser = await playwright.chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => {
    const t = m.text();
    if (!t.includes('GPU stall') && !t.includes('GL Driver')) console.log('[console]', m.type(), t.slice(0, 600));
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack));
  page.on('response', (r) => {
    if (r.status() >= 400) console.log('[http]', r.status(), r.url());
  });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${srv.address().port}/web/index.html`);
  for (let i = 0; i < 150; i++) {
    const st = await page.evaluate('({ ready: window.ready, err: window.initError })');
    if (st.ready || st.err) {
      console.log('state after', ((Date.now() - t0) / 1000).toFixed(1), 's:', JSON.stringify(st).slice(0, 3000));
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (process.argv[2]) {
    const t = Number(process.argv[2]);
    const t1 = Date.now();
    await page.evaluate((tt) => window.renderTime(tt), t);
    console.log('rendered', t, (Date.now() - t1) + 'ms');
  }
  await browser.close();
  srv.close();
});
