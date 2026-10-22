// 将 dist/index.html（单文件构建）转换为可直接发布的页面片段：
// 去掉 doctype/html/head/body 外壳，保留 title、样式、字体与内联脚本。
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.resolve('dist/index.html'), 'utf8');
const out = process.argv[2] || path.resolve('dist/artifact.html');

const title = (src.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
const fonts = [...src.matchAll(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/g)].map((m) => m[0]).join('\n');
const styles = [...src.matchAll(/<style[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const scripts = [...src.matchAll(/<script type="module"[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0].replace(/ crossorigin/, ''));
const body = (src.match(/<body>([\s\S]*?)<\/body>/) || ['', ''])[1].replace(/<script[\s\S]*?<\/script>/g, '');

const html = [title, '<meta name="theme-color" content="#0f1513">', fonts, styles, body.trim(), ...scripts].join('\n');
fs.writeFileSync(out, html);
console.log('artifact written:', out, (html.length / 1024).toFixed(0) + ' KB');
