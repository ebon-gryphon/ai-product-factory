import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import zh from '../../../packages/desktop/src/renderer/services/i18n/locales/zh-CN/guid.json';
import en from '../../../packages/desktop/src/renderer/services/i18n/locales/en-US/guid.json';

const fixturePath = path.resolve(__dirname, '../../../../docs/validation/2026-10-21-rea/fixture');
const validationPath = path.resolve(__dirname, '../../../../docs/validation/2026-10-21-rea/screenshots');
function labels(...values: string[]): RegExp {
  return new RegExp(`^(?:${values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`, 'i');
}
const artifactName = labels(zh.production.artifact, en.production.artifact);
const inspectName = labels(zh.rea.inspect, en.rea.inspect, zh.rea.inspectAgain, en.rea.inspectAgain);
const traceName = labels(zh.rea.trace, en.rea.trace);
const downloadName = labels(zh.rea.downloadEvidence, en.rea.downloadEvidence);
const projectName = labels(zh.production.name, en.production.name);
const targetName = new RegExp(`${zh.rea.targetPath}|${en.rea.targetPath}`, 'i');
const saveName = labels(zh.production.saveProject, en.production.saveProject);
const transferName = labels(zh.rea.toProduction, en.rea.toProduction);
const ownedTempDirectories: string[] = [];
let downloadDirectory = '';
let slowFixturePath = '';
function stageName(stage: number): RegExp {
  const key = (['evidence', 'flow', 'architecture', 'reconstruction'] as const)[stage];
  return new RegExp(`^${stage + 1}[.] (?:${zh.rea.stages[key]}|${en.rea.stages[key]})`);
}

type Evidence = {
  evidence_id: string;
  sha256: string;
  bytes: number;
  operation: string;
  candidates: Array<{ node_id: string; kind: string; label: string }>;
};
type SavedProject = {
  id: string;
  name: string;
  brief: string;
  workflow: 'production' | 'rea';
  assistant_id: string;
  run_id: string | null;
  stages: Array<{
    status: string;
    error: string | null;
    versions: Array<{ id: string; source: string; content: string; rea?: Evidence | null }>;
  }>;
};

async function createReaProject(page: Page, name: string, target: string): Promise<SavedProject> {
  await page.evaluate(() => {
    window.location.hash = '#/factory-rea';
  });
  await page.getByRole('button', { name: labels(zh.rea.create, en.rea.create) }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: projectName }).fill(name);
  await dialog.getByRole('textbox', { name: targetName }).fill(target);
  await dialog
    .getByRole('textbox', { name: labels(zh.rea.brief, en.rea.brief) })
    .fill('点击读取笔记后，notes:list 通过哪些模块和 IPC 边界传递？请根据静态证据追踪，并保留无法确认的运行行为。');
  const response = page.waitForResponse(
    (reply) => reply.url().endsWith('/api/factory/projects') && reply.request().method() === 'POST'
  );
  await dialog.getByRole('button', { name: saveName }).click();
  const saved = (await (await response).json()) as { success: boolean; data: SavedProject };
  expect(saved.success).toBe(true);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return saved.data;
}

async function runTool(page: Page, button: RegExp): Promise<void> {
  const start = page.getByRole('button', { name: button });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function readProject(page: Page, id: string): Promise<SavedProject> {
  return page.evaluate(async (projectId) => {
    const port = (window as unknown as { __backendPort: number }).__backendPort;
    const response = await fetch(`http://127.0.0.1:${port}/api/factory/projects/${encodeURIComponent(projectId)}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`Project read failed: ${response.status}`);
    return ((await response.json()) as { data: SavedProject }).data;
  }, id);
}

async function waitForEvidence(page: Page, id: string, stage: number, versions = 1): Promise<SavedProject> {
  await expect
    .poll(
      async () => {
        const project = await readProject(page, id);
        return {
          run: project.run_id,
          count: project.stages[stage].versions.length,
          status: project.stages[stage].status,
        };
      },
      { timeout: 45_000 }
    )
    .toEqual({ run: null, count: versions, status: 'review' });
  return readProject(page, id);
}

async function selectNotesAnchor(page: Page): Promise<void> {
  await page.getByRole('button', { name: stageName(1) }).click();
  await page.getByRole('combobox', { name: labels(zh.rea.featureAnchor, en.rea.featureAnchor) }).click();
  await page
    .getByRole('option', { name: /notes:list/i })
    .first()
    .click();
}

async function downloadEvidence(page: Page, app: ElectronApplication, expected: Evidence): Promise<Buffer> {
  const savedPath = path.join(downloadDirectory, `${randomUUID()}.json`);
  await app.evaluate(({ BrowserWindow }, destination) => {
    const window = BrowserWindow.getAllWindows().find((item) => !item.webContents.getURL().startsWith('devtools:'));
    if (!window) throw new Error('No main window for the native evidence download');
    const state = globalThis as typeof globalThis & {
      __reaDownloads?: Record<string, { seen: boolean; state?: string }>;
    };
    state.__reaDownloads ??= {};
    state.__reaDownloads[destination] = { seen: false };
    window.webContents.session.once('will-download', (_event, item) => {
      state.__reaDownloads![destination].seen = true;
      item.setSavePath(destination);
      item.once('done', (_done, result) => {
        state.__reaDownloads![destination].state = result;
      });
    });
  }, savedPath);
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/rea-evidence/') && response.request().method() === 'GET'
  );
  await page.getByRole('button', { name: downloadName }).click();
  const response = await responsePromise;
  expect(response.status(), response.ok() ? '' : await response.text()).toBe(200);
  try {
    await expect
      .poll(
        async () =>
          stat(savedPath)
            .then((value) => value.size)
            .catch(() => -1),
        { timeout: 20_000 }
      )
      .toBe(expected.bytes);
  } catch (error) {
    const probe = await app.evaluate((_electron, destination) => {
      return (globalThis as typeof globalThis & { __reaDownloads?: Record<string, unknown> }).__reaDownloads?.[
        destination
      ];
    }, savedPath);
    throw new Error(
      `Native evidence download did not complete: ${JSON.stringify(probe)}; UI: ${(await page.locator('.arco-message, .arco-alert').allTextContents()).join(' | ')}`,
      { cause: error }
    );
  }
  const raw = await readFile(savedPath);
  expect(raw.byteLength).toBe(expected.bytes);
  expect(createHash('sha256').update(raw).digest('hex')).toBe(expected.sha256);
  const parsed = JSON.parse(raw.toString('utf8')) as { evidence_id: string; operation: string };
  expect(parsed).toMatchObject({ evidence_id: expected.evidence_id, operation: expected.operation });
  return raw;
}

test.describe('REA product deconstruction', () => {
  test.beforeAll(async () => {
    await mkdir(validationPath, { recursive: true });
    downloadDirectory = await mkdtemp(path.join(os.tmpdir(), 'factory-rea-download-'));
    ownedTempDirectories.push(downloadDirectory);
    slowFixturePath = await mkdtemp(path.join(os.tmpdir(), 'factory-rea-cancellation-'));
    ownedTempDirectories.push(slowFixturePath);
    await cp(fixturePath, slowFixturePath, { recursive: true });
    await Promise.all(
      Array.from({ length: 45 }, (_, index) =>
        writeFile(path.join(slowFixturePath, `padding-${index}.js`), `module.exports = 'inert-fixture-${index}';\n`)
      )
    );
    expect(stageName(1).test('2. 功能追踪 工具证据可查看')).toBe(true);
    expect(stageName(1).test('2. Feature tracing Tool evidence available')).toBe(true);
    expect(labels('SHA-256 (x)').test('SHA-256 (x)')).toBe(true);
    expect(labels('SHA-256 (x)').test('SHA-256 xx')).toBe(false);
  });

  test.afterAll(async () => {
    await Promise.all(ownedTempDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
  });

  test('scans, traces a real feature, downloads verifiable history and transfers saved findings', async ({
    page,
    electronApp,
  }) => {
    test.setTimeout(120_000);
    const name = `REA 功能调查 ${Date.now()}`;
    const source = await createReaProject(page, name, fixturePath);
    const deskName = labels(zh.rea.title, en.rea.title);
    const icons = [
      page.getByRole('button', { name: deskName }).locator('img'),
      page.getByRole('heading', { name: deskName, level: 1 }).locator('img'),
    ];
    await expect
      .poll(() =>
        Promise.all(
          icons.map((icon) => icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
        )
      )
      .toEqual([true, true]);
    expect(source.assistant_id).toBe('');
    await runTool(page, inspectName);
    let project = await waitForEvidence(page, source.id, 0);
    const overview = project.stages[0].versions[0].rea!;
    expect(overview.operation).toBe('analyze_javascript_application');
    expect(overview.candidates.some((candidate) => candidate.label.includes('notes:list'))).toBe(true);
    const rawOverview = await downloadEvidence(page, electronApp, overview);
    const parsedOverview = JSON.parse(rawOverview.toString('utf8')) as { limitations: string[] };
    expect(parsedOverview.limitations.some((item) => item.includes('never executed'))).toBe(true);

    await page.getByRole('button', { name: stageName(1) }).click();
    await expect(page.getByRole('button', { name: traceName })).toBeDisabled();
    await selectNotesAnchor(page);
    await runTool(page, traceName);
    project = await waitForEvidence(page, source.id, 1);
    const firstTrace = project.stages[1].versions[0];
    expect(firstTrace.rea?.operation).toBe('trace_application_feature');
    expect(firstTrace.source).toBe('rea');
    expect((await downloadEvidence(page, electronApp, firstTrace.rea!)).toString('utf8')).toContain('notes:list');
    await page.screenshot({ path: path.join(validationPath, 'rea-evidence-detail.png'), fullPage: true });
    await page.getByRole('heading', { name: labels(zh.rea.title, en.rea.title), level: 1 }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(validationPath, 'rea-feature-trace.png'), fullPage: true });
    const desktopViewport = page.viewportSize() || { width: 1280, height: 900 };
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await expect(page.getByRole('button', { name: traceName })).toBeVisible();
    await page.getByRole('heading', { name: labels(zh.rea.title, en.rea.title), level: 1 }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(validationPath, 'rea-mobile.png'), fullPage: true });
    await page.setViewportSize(desktopViewport);

    await runTool(page, traceName);
    project = await waitForEvidence(page, source.id, 1, 2);
    const latestTrace = project.stages[1].versions[1];
    const versions = page.getByRole('combobox', { name: labels(zh.production.versions, en.production.versions) });
    // The service can finish before the UI's next refresh. Open history only once
    // that new version has arrived, rather than clicking a menu being replaced.
    await expect(versions).toContainText(/^v2 ·/);
    await versions.click();
    await page.getByRole('option', { name: /^v1 ·/ }).click();
    await downloadEvidence(page, electronApp, firstTrace.rea!);
    await page.reload();
    await selectNotesAnchor(page);
    await downloadEvidence(page, electronApp, latestTrace.rea!);
    await expect(page.getByRole('button', { name: /恢复为新版本|Restore as new version/i })).toHaveCount(0);

    await page.getByRole('button', { name: stageName(2) }).click();
    await page.getByRole('textbox', { name: artifactName }).fill('UNSAVED TRANSFER SENTINEL');
    await page.getByRole('button', { name: transferName }).click();
    const transfer = page.getByRole('dialog');
    const productionName = `${name} rebuilt`;
    await transfer.getByRole('textbox', { name: projectName }).fill(productionName);
    const response = page.waitForResponse(
      (reply) => reply.url().endsWith('/api/factory/projects') && reply.request().method() === 'POST'
    );
    await transfer.getByRole('button', { name: labels(zh.rea.createProduction, en.rea.createProduction) }).click();
    const created = (await (await response).json()) as { success: boolean; data: SavedProject };
    expect(created.success).toBe(true);
    await expect.poll(() => new URL(page.url()).hash).toBe(`#/factory?project=${created.data.id}`);
    await expect(page.getByRole('heading', { name: productionName, exact: true })).toBeVisible();
    expect(created.data.brief).toContain(source.id);
    expect(created.data.brief).toContain(latestTrace.id);
    expect(created.data.brief).not.toContain('UNSAVED TRANSFER SENTINEL');
    expect(created.data.run_id).toBeNull();
    expect(created.data.stages.every((stage) => stage.status === 'pending' && stage.versions.length === 0)).toBe(true);
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    await page.evaluate((id) => {
      window.location.hash = `#/factory-rea?project=${id}`;
    }, source.id);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: productionName, exact: true })).toHaveCount(0);
  });

  test('stops the active scan after a tab switch, retries and invalidates changed targets', async ({ page }) => {
    test.setTimeout(120_000);
    const source = await createReaProject(page, `REA cancel and retry ${Date.now()}`, slowFixturePath);
    await runTool(page, inspectName);
    await page.getByRole('button', { name: stageName(1) }).click();
    await expect(page.getByTestId('rea-running-state')).toContainText(/应用概览|Application overview/i);
    const pauseResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/factory/projects/${source.id}/actions`) &&
        response.request().postDataJSON()?.action === 'pause'
    );
    await page.getByRole('button', { name: labels(zh.production.stop, en.production.stop) }).click();
    const paused = await pauseResponse;
    expect(paused.status(), (await paused.text()).slice(0, 1500)).toBe(200);
    await expect
      .poll(
        async () => {
          const project = await readProject(page, source.id);
          return { run: project.run_id, error: project.stages[0].error, count: project.stages[0].versions.length };
        },
        { timeout: 20_000 }
      )
      .toEqual({ run: null, error: 'FACTORY_STOPPED', count: 0 });

    await page.getByRole('button', { name: stageName(0) }).click();
    await runTool(page, inspectName);
    await waitForEvidence(page, source.id, 0);
    await selectNotesAnchor(page);
    await runTool(page, traceName);
    await waitForEvidence(page, source.id, 1);
    await page.getByRole('button', { name: labels(zh.production.edit, en.production.edit) }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: targetName }).fill(fixturePath);
    await dialog.getByRole('button', { name: saveName }).click();
    await expect
      .poll(async () => (await readProject(page, source.id)).stages.slice(0, 2).map((stage) => stage.status))
      .toEqual(['stale', 'stale']);
    await page.getByRole('button', { name: stageName(1) }).click();
    await expect(page.getByRole('button', { name: traceName })).toBeDisabled();
    await expect(page.getByRole('button', { name: transferName })).toBeDisabled();
    await page.screenshot({ path: path.join(validationPath, 'rea-stale-target.png'), fullPage: true });
  });

  test('traces an ASAR and retains its overview when the investigation question changes', async ({
    page,
    electronApp,
  }) => {
    test.setTimeout(120_000);
    const name = `REA ASAR 调查 ${Date.now()}`;
    const source = await createReaProject(page, name, path.join(path.dirname(fixturePath), 'fixture.asar'));
    await runTool(page, inspectName);
    let project = await waitForEvidence(page, source.id, 0);
    const overview = project.stages[0].versions[0];
    const raw = await downloadEvidence(page, electronApp, overview.rea!);
    expect(
      (JSON.parse(raw.toString('utf8')) as { normalized_result: { format: string } }).normalized_result.format
    ).toBe('asar');
    await selectNotesAnchor(page);
    await runTool(page, traceName);
    project = await waitForEvidence(page, source.id, 1);
    const originalTrace = project.stages[1].versions[0];
    const anchor = page.getByRole('combobox', { name: labels(zh.rea.featureAnchor, en.rea.featureAnchor) });
    await expect(anchor).toContainText('notes:list');

    await page.getByRole('button', { name: labels(zh.production.edit, en.production.edit) }).click();
    const dialog = page.getByRole('dialog');
    const question = 'notes:list 的返回值从主进程经过哪些桥接接口到达页面？请说明哪些连接只有静态证据。';
    await dialog.getByRole('textbox', { name: labels(zh.rea.brief, en.rea.brief) }).fill(question);
    await dialog.getByRole('button', { name: saveName }).click();
    await expect
      .poll(async () => {
        const updated = await readProject(page, source.id);
        return { question: updated.brief, statuses: updated.stages.slice(0, 2).map((stage) => stage.status) };
      })
      .toEqual({ question, statuses: ['review', 'stale'] });
    project = await readProject(page, source.id);
    expect(project.stages[0].versions).toHaveLength(1);
    expect(project.stages[0].versions[0].id).toBe(overview.id);
    expect(project.stages[1].versions[0].id).toBe(originalTrace.id);

    await page.getByRole('button', { name: stageName(1) }).click();
    await expect(anchor).not.toContainText('notes:list');
    await expect(page.getByRole('button', { name: traceName })).toBeDisabled();
    await selectNotesAnchor(page);
    await runTool(page, traceName);
    project = await waitForEvidence(page, source.id, 1, 2);
    expect(project.stages[0].versions[0].id).toBe(overview.id);
    expect(project.stages[1].versions[1].rea?.operation).toBe('trace_application_feature');
    await page.getByRole('heading', { name: labels(zh.rea.title, en.rea.title), level: 1 }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(validationPath, 'rea-asar-question.png'), fullPage: true });
  });

  for (const [label, target] of [
    ['missing directory', path.join(fixturePath, 'missing-application')],
    ['unsupported loose JavaScript file', path.join(fixturePath, 'main.js')],
  ]) {
    test(`shows an actionable failure for a ${label} without fabricating evidence`, async ({ page }) => {
      const source = await createReaProject(page, `REA bad target ${Date.now()}`, target);
      await runTool(page, inspectName);
      await expect(page.getByText(/目标路径无效或不支持|The target path is invalid or unsupported/i)).toBeVisible({
        timeout: 20_000,
      });
      const project = await readProject(page, source.id);
      expect(project.stages[0]).toMatchObject({ status: 'failed', error: 'FACTORY_REA_INVALID_TARGET', versions: [] });
      expect(project.run_id).toBeNull();
      await expect(page.getByRole('button', { name: transferName })).toBeDisabled();
    });
  }

  test('explains mocked tool readiness failures and rechecks before enabling a scan', async ({ page }) => {
    const statusRoute = '**/api/factory/rea/status';
    let missingBackend = false;
    let tool = { available: false, version: null as string | null, error: 'FACTORY_REA_UNAVAILABLE' as string | null };
    await page.route(statusRoute, (route) =>
      missingBackend
        ? route.fulfill({ status: 404, json: { success: false, code: 'NOT_FOUND', error: 'Route not found.' } })
        : route.fulfill({ json: { success: true, data: tool } })
    );
    try {
      await createReaProject(page, `REA readiness UI ${Date.now()}`, fixturePath);
      missingBackend = true;
      await page.getByRole('button', { name: labels(zh.rea.checkEnvironment, en.rea.checkEnvironment) }).click();
      await expect(page.getByText(labels(zh.rea.backendOutdated, en.rea.backendOutdated))).toBeVisible();
      await expect(page.getByRole('button', { name: inspectName })).toBeDisabled();
      await expect(page.getByRole('button', { name: labels(zh.rea.create, en.rea.create) })).toBeDisabled();
      missingBackend = false;
      await page.getByRole('button', { name: labels(zh.rea.checkEnvironment, en.rea.checkEnvironment) }).click();
      await expect(page.getByRole('button', { name: inspectName })).toBeDisabled();
      await expect(page.getByText(/配置REA\.command/).first()).toBeVisible();
      tool = { available: false, version: null, error: 'FACTORY_REA_VERSION_MISMATCH' };
      await page.getByRole('button', { name: labels(zh.rea.checkEnvironment, en.rea.checkEnvironment) }).click();
      await expect(page.getByText(/版本.*不匹配|version.*does not match|version.*mismatch/i).first()).toBeVisible();
      tool = { available: true, version: '6.7.0', error: null };
      await page.getByRole('button', { name: labels(zh.rea.checkEnvironment, en.rea.checkEnvironment) }).click();
      await expect(page.getByRole('button', { name: inspectName })).toBeEnabled();
    } finally {
      await page.unroute(statusRoute);
    }
  });
});
