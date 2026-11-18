// Renders scene.js in headless Chromium and writes the canvas layers as PNGs.
// Usage: node render.js [mode]   (mode: "final" (default) | "specimen")
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const FONTS = {
  'Anton': '@fontsource/anton/files/anton-latin-400-normal.woff2',
  'Monoton': '@fontsource/monoton/files/monoton-latin-400-normal.woff2',
  'Righteous': '@fontsource/righteous/files/righteous-latin-400-normal.woff2',
  'Russo One': '@fontsource/russo-one/files/russo-one-latin-400-normal.woff2',
  'Bungee': '@fontsource/bungee/files/bungee-latin-400-normal.woff2',
  'Tilt Neon': '@fontsource/tilt-neon/files/tilt-neon-latin-400-normal.woff2',
  'Yellowtail': '@fontsource/yellowtail/files/yellowtail-latin-400-normal.woff2',
  'Kaushan Script': '@fontsource/kaushan-script/files/kaushan-script-latin-400-normal.woff2',
};

(async () => {
  const mode = process.argv[2] || 'final';
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const faces = Object.entries(FONTS).map(([family, rel]) => {
    const b64 = fs.readFileSync(path.join(__dirname, 'node_modules', rel)).toString('base64');
    return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }).join('\n');
  const script = fs.readFileSync(path.join(__dirname, 'scene.js'), 'utf8');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${faces}</style></head>
<body style="margin:0;background:#000"><script>${script}</script></body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[page error]', e));
  await page.setContent(html);
  await page.evaluate(async (families) => {
    await Promise.all(families.map((f) => document.fonts.load(`100px '${f}'`)));
  }, Object.keys(FONTS));
  const layers = await page.evaluate((m) => window.renderAll(m), mode);
  for (const [name, url] of Object.entries(layers)) {
    const file = path.join(outDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', file);
  }
  await browser.close();
})();
