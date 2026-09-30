// Assemble dist-artifact/{game.js, *.css} into one self-contained HTML page (no doctype/head/body:
// the hosting page provides the document skeleton). Output: artifact/beneath-the-keel.html
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';

const dir = 'dist-artifact';
const files = await readdir(dir);
const js = await readFile(`${dir}/game.js`, 'utf8');
const cssFile = files.find((f) => f.endsWith('.css'));
const css = cssFile ? await readFile(`${dir}/${cssFile}`, 'utf8') : '';
const fonts =
  'https://fonts.googleapis.com/css2?family=IM+Fell+English+SC&family=Nanum+Gothic+Coding:wght@400;700&family=Nanum+Myeongjo:wght@400;700;800&family=Nanum+Pen+Script&display=swap';
const safeJs = js.replace(/<\/script/gi, '<\\/script');
const html = `<title>용골 아래</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<style>${css}</style>
<div id="app"></div>
<noscript>이 게임은 JavaScript와 WebGL이 필요합니다.</noscript>
<script>${safeJs}</script>
`;
await mkdir('artifact', { recursive: true });
await writeFile('artifact/beneath-the-keel.html', html);
console.log(`artifact/beneath-the-keel.html  ${(html.length / 1024).toFixed(0)} KiB (css ${cssFile ?? 'none'})`);
