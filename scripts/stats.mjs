import { chromium } from 'playwright-core';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('file://' + path.resolve('dist/index.html') + '?auto&still&q=' + (process.env.Q || 'mid'));
await page.waitForFunction(() => window.__qihu, null, { timeout: 240000 });
const res = await page.evaluate(() => {
  const out = [];
  window.__qihu.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const tri = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const n = o.isInstancedMesh ? o.count : 1;
    let p = o; const names = []; while (p) { if (p.name) names.push(p.name); p = p.parent; }
    out.push({ name: (names.join('/') || '-') + ' ' + (o.material.name || o.material.type) + (o.material.map ? ' map' : ''), tri: tri * n, inst: n, per: tri });
  });
  out.sort((a, b) => b.tri - a.tri);
  const total = out.reduce((s, o) => s + o.tri, 0);
  return { total, top: out.slice(0, 25), meshes: out.length };
});
console.log('total tris', res.total, 'meshes', res.meshes);
for (const o of res.top) console.log(Math.round(o.tri), o.inst, Math.round(o.per), o.name);
await browser.close();
