#!/usr/bin/env node
// Headless renderer: drives web/index.html in Chromium (SwiftShader WebGL2) and
// captures deterministic frames.
//
//   node render.js --stills 1.6,2.5 --out frames/look        # PNG stills at times (s)
//   node render.js --frames 0:900 --workers 3 --chunk 60 --out frames/final  # lossless 1s chunks
//   node render.js --events audio/events.json                 # dump animation events
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let playwright;
try {
  playwright = require('playwright');
} catch (e) {
  playwright = require('/opt/node22/lib/node_modules/playwright');
}

const ROOT = __dirname;
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, [])
);

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json',
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end();
      }
      fs.readFile(p, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function openPage(port) {
  const browser = await playwright.chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    const t = m.text();
    if (!t.includes('GPU stall') && !t.includes('GL Driver Message')) console.log('[page]', t);
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/web/index.html`);
  await page.waitForFunction('window.ready === true || !!window.initError', null, { timeout: 300000, polling: 250 });
  const err = await page.evaluate('window.initError');
  if (err) throw new Error(err);
  return { browser, page };
}

async function grab(page) {
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 }, animations: 'allow', caret: 'initial', timeout: 120000 });
}

async function stills(port, times, out) {
  fs.mkdirSync(out, { recursive: true });
  const { browser, page } = await openPage(port);
  for (const t of times) {
    const t0 = Date.now();
    await page.evaluate((tt) => window.renderTime(tt), t);
    const buf = await grab(page);
    const name = path.join(out, `t${t.toFixed(3).padStart(7, '0')}.png`);
    fs.writeFileSync(name, buf);
    console.log(name, `${Date.now() - t0}ms`);
  }
  await browser.close();
}

async function renderChunk(page, a, b, outFile, label) {
  const tmp = outFile + '.part.mkv';
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'png', '-i', '-',
    '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'rgb24', tmp,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const tStart = Date.now();
  for (let i = a; i < b; i++) {
    await page.evaluate((fi) => window.renderFrame(fi), i);
    const buf = await grab(page);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  fs.renameSync(tmp, outFile);
  const el = (Date.now() - tStart) / 1000;
  console.log(`${label} chunk ${a}-${b} done in ${el.toFixed(0)}s (${(el / (b - a)).toFixed(2)}s/frame)`);
}

(async () => {
  const srv = await serve();
  const port = srv.address().port;
  try {
    if (args.events) {
      const { browser, page } = await openPage(port);
      const ev = await page.evaluate('window.getEvents()');
      fs.mkdirSync(path.dirname(args.events), { recursive: true });
      fs.writeFileSync(args.events, JSON.stringify(ev, null, 1));
      console.log('events', ev.length, '->', args.events);
      await browser.close();
    }
    if (args.stills) {
      const times = String(args.stills).split(',').map(Number);
      await stills(port, times, args.out || 'frames/stills');
    }
    if (args.frames) {
      // Work queue of fixed-size chunks so individual seconds can be re-rendered later.
      const [a, b] = String(args.frames).split(':').map(Number);
      const workers = Number(args.workers || 1);
      const size = Number(args.chunk || 60);
      const out = args.out || 'frames/final';
      fs.mkdirSync(out, { recursive: true });
      const queue = [];
      for (let s0 = a; s0 < b; s0 += size) queue.push([s0, Math.min(b, s0 + size)]);
      const runWorker = async (w) => {
        const { browser, page } = await openPage(port);
        while (queue.length) {
          const [s0, e0] = queue.shift();
          const f = path.join(out, `chunk_${String(s0).padStart(4, '0')}_${String(e0).padStart(4, '0')}.mkv`);
          await renderChunk(page, s0, e0, f, `[w${w}]`);
        }
        await browser.close();
      };
      await Promise.all(Array.from({ length: workers }, (_, w) => runWorker(w)));
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    srv.close();
  }
})();
