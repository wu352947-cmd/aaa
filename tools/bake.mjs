// Usage: node bake.mjs <glb> <job.json>
// job.json: [{out, fn: 'front'|'bake', args: [...]}]  each fn returns a PNG data URL
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [glb, jobFile] = process.argv.slice(2);
const root = path.dirname(new URL(import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${server.address().port}/bake.html`);
await page.waitForFunction(() => window.ready);
console.log('bbox', JSON.stringify(await page.evaluate(u => window.load(u), '/' + glb)));
for (const j of JSON.parse(fs.readFileSync(jobFile, 'utf8'))) {
  const url = await page.evaluate(([fn, args]) => window[fn](...args), [j.fn, j.args]);
  fs.writeFileSync(path.join(root, j.out), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', j.out);
}
await browser.close();
server.close();
