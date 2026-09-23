import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../AionUi/package.json', import.meta.url));
const { build } = require('vite');
const result = await build({
  configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)),
  base: './',
  build: {
    write: false,
    target: 'esnext',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const outputs = result.output;
const script = outputs.find((item) => item.type === 'chunk' && item.isEntry).code;
const css = outputs.filter((item) => item.type === 'asset' && item.fileName.endsWith('.css')).map((item) => item.source).join('\n');
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI产品加工厂 · 交互 Demo</title><style>${css.replaceAll('</style', '<\\/style')}</style></head>
<body style="margin:0"><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`;
await writeFile(new URL('../demo.html', import.meta.url), html);
console.log('Created docs/demo.html — self-contained offline demo.');
