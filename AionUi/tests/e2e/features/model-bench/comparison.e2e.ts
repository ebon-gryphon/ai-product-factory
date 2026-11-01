import { test, expect } from '../../fixtures';
import { httpInvoke } from '../../helpers/httpBridge';
import { startModelServer } from './modelServer';

let server: Awaited<ReturnType<typeof startModelServer>>;
const providerId = `qa-bench-${Date.now()}`;

test.beforeAll(async () => {
  server = await startModelServer();
});
test.afterAll(async () => {
  await server?.close();
});

test.beforeEach(async ({ page }) => {
  await page.evaluate(() => {
    window.location.hash = '#/guid';
  });
  await expect(page.locator('#bench-prompt')).toHaveCount(0);
  await httpInvoke(page, 'POST', '/api/providers', {
    id: providerId,
    platform: 'new-api',
    name: 'QA Local Models',
    base_url: server.url,
    api_key: 'local-fixture-only',
    models: ['qa-good', 'qa-peer'],
    enabled: true,
  });
  await page.evaluate(() => {
    window.location.hash = '#/model-bench';
  });
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'qa-good · QA Local Models', exact: true }).click();
  await page.getByRole('option', { name: 'qa-peer · QA Local Models', exact: true }).click();
  await page.locator('#bench-prompt').click();
});

test.afterEach(async ({ page }) => {
  await httpInvoke(page, 'DELETE', `/api/providers/${providerId}`);
});

test('compares two real backend streams with material, then saves and restores the results', async ({
  page,
  electronApp,
}) => {
  const run = page.getByRole('button', { name: /同时发送|Send to all/i });
  await expect(run).toBeDisabled();
  await page.locator('#bench-prompt').fill('QA compare attached material');
  await page.locator('input[type=file]').setInputFiles({
    name: 'qa-notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Local fixture material 内容'),
  });
  await expect(page.getByText('qa-notes.txt', { exact: true })).toBeVisible();
  await run.click();
  for (const model of ['qa-good', 'qa-peer']) {
    await expect(page.getByRole('region', { name: `${model} · QA Local Models` })).toContainText('中文回答完成');
  }
  expect(server.requests.slice(-2).every((item) => item.prompt.includes('Local fixture material 内容'))).toBe(true);
  await page.getByRole('button', { name: /保存对比|Save comparison/i }).click();
  await expect(page.locator('.arco-message-success')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /对比记录|Saved comparisons/i }).click();
  await page.getByRole('button').filter({ hasText: 'QA compare attached material' }).click();
  await expect(page.getByRole('region', { name: 'qa-good · QA Local Models' })).toContainText('中文回答完成');
  const desktop = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((item) => !item.webContents.getURL().startsWith('devtools:'));
    if (!win) throw new Error('Missing test window');
    const state = { size: win.getContentSize(), minimum: win.getMinimumSize(), zoom: win.webContents.getZoomFactor() };
    win.setMinimumSize(320, 480);
    win.webContents.setZoomFactor(1);
    win.setContentSize(400, 844);
    return state;
  });
  try {
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(400);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.screenshot({ path: '/tmp/ai-factory-qa-20261101-bench-mobile.png', fullPage: true });
  } finally {
    await electronApp.evaluate(({ BrowserWindow }, state) => {
      const win = BrowserWindow.getAllWindows().find((item) => !item.webContents.getURL().startsWith('devtools:'));
      if (!win) throw new Error('Missing test window');
      win.setContentSize(state.size[0], state.size[1]);
      win.setMinimumSize(state.minimum[0], state.minimum[1]);
      win.webContents.setZoomFactor(state.zoom);
    }, desktop);
  }
});

test('a failed model leaves its peer intact and can be retried on its own', async ({ page }) => {
  await page.locator('#bench-prompt').fill('FAIL_ONCE');
  await page.getByRole('button', { name: /同时发送|Send to all/i }).click();
  const peer = page.getByRole('region', { name: 'qa-peer · QA Local Models' });
  const good = page.getByRole('region', { name: 'qa-good · QA Local Models' });
  await expect(peer).toContainText('BENCH_HTTP_502');
  await expect(good).toContainText('中文回答完成');
  await peer.getByRole('button', { name: /重新生成|Run again/i }).click();
  await expect(peer).toContainText('中文回答完成');
  await expect(good).toContainText('中文回答完成');
});

test('stops both active streams and makes the composer usable again', async ({ page }) => {
  await page.locator('#bench-prompt').fill('SLOW');
  await page.getByRole('button', { name: /同时发送|Send to all/i }).click();
  await expect(page.getByRole('region', { name: 'qa-good · QA Local Models' })).toContainText('开始');
  await page.getByRole('button', { name: /全部停止|Stop all/i }).click();
  await expect(page.locator('#bench-prompt')).toBeEnabled();
  for (const model of ['qa-good', 'qa-peer']) {
    await expect(page.getByRole('region', { name: `${model} · QA Local Models` }).getByRole('status')).toContainText(
      /已停止|Stopped/i
    );
  }
});
