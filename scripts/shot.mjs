// 用无头 Chromium 渲染若干视角截图，用于检查画面
import { chromium } from 'playwright-core';
import path from 'node:path';

const out = process.argv[2] || 'shots';
const views = JSON.parse(process.argv[3] || '[]');
const w = +(process.env.W || 1280), h = +(process.env.H || 720);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const url = 'file://' + path.resolve('dist/index.html') + '?auto&still' + (process.env.NOHUD ? '&nohud' : '') + '&q=' + (process.env.Q || 'mid');
await page.goto(url);
const t0 = Date.now();
await page.waitForFunction(() => window.__qihu, null, { timeout: 240000 }).catch(() => {});
console.log('loaded in', (Date.now() - t0) / 1000, 's');
await page.waitForTimeout(1500);
for (const v of views) {
  await page.evaluate((v) => {
    const q = window.__qihu;
    if (v.preset) q.setPreset(v.preset);
    if (v.lights !== undefined) q.applyLights(v.lights, v.preset || 'sunset');
    if (v.mode) q.player.setMode(v.mode);
    q.player.teleport(v.x, v.z, v.yaw);
    q.player.pitch = v.pitch ?? -0.04;
    if (v.doors) q.doors.forEach((d) => { d.open = 1; d.pivot.rotation.y = d.sign * Math.PI * 0.5; });
  }, v);
  const tt = Date.now();
  await page.evaluate(() => { window.__qihu.frame(); window.__qihu.frame(); });
  console.log('render ms', Date.now() - tt, await page.evaluate(() => { const i = window.__qihu.renderer.info.render; return `calls ${i.calls} tris ${i.triangles}`; }));
  await page.screenshot({ path: `${out}/${v.name}.png`, timeout: 300000 });
  console.log('shot', v.name);
}
console.log([...new Set(logs)].slice(0, 30).join('\n'));
await browser.close();
