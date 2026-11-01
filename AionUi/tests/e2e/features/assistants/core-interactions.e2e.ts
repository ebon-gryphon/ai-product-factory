/**
 * Assistant management acceptance for the tabbed home and full-page editor.
 * The legacy highlight-query case is retained separately from CRUD acceptance.
 */
import { test, expect } from '../../fixtures';
import zh from '../../../../packages/desktop/src/renderer/services/i18n/locales/zh-CN/settings.json';
import en from '../../../../packages/desktop/src/renderer/services/i18n/locales/en-US/settings.json';
import {
  clickCreateAssistant,
  closeAssistantEditor,
  duplicateAssistant,
  deleteAssistant,
  httpGet,
  fillAssistantDescription,
  fillAssistantName,
  goToAssistantSettings,
  openAssistantEditor,
  saveAssistant,
  takeScreenshot,
  toggleAssistantEnabled,
  waitForAssistantEditorClose,
} from '../../helpers';

async function selectExplicitAgent(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTestId('select-assistant-agent').click();
  await page.locator('.arco-select-option:not(.arco-select-option-disabled)').first().click();
}

test.describe('Assistant Settings Core Interactions (P0)', () => {
  test.setTimeout(90_000);

  test('P0-1: create assistant opens full-page editor and save returns to list', async ({ page }) => {
    await goToAssistantSettings(page);

    const name = `P0 create ${Date.now()}`;
    await clickCreateAssistant(page);
    await expect(page.locator('[data-testid="assistant-editor-page"]')).toBeVisible({ timeout: 5_000 });
    await selectExplicitAgent(page);

    await fillAssistantName(page, name);
    await fillAssistantDescription(page, 'Created by P0-1');
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    await expect(page.locator('[data-testid^="assistant-card-"]').filter({ hasText: name }).first()).toBeVisible({
      timeout: 10_000,
    });
    await takeScreenshot(page, 'assistants/p0-1/01-create-roundtrip.png');
  });

  test('P0-2: card body opens editor, switch toggles in place, builtin duplicate opens create-mode editor', async ({
    page,
  }) => {
    await goToAssistantSettings(page);

    await page.getByTestId('settings-tab-mine').click();
    const firstCard = page.locator('[data-testid^="assistant-card-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    const firstId = ((await firstCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');

    await firstCard.click();
    await expect(page.locator('[data-testid="assistant-editor-page"]')).toBeVisible({ timeout: 5_000 });
    await takeScreenshot(page, 'assistants/p0-2/01-card-opens-editor.png');

    await closeAssistantEditor(page);

    const switchElement = page.locator(`[data-testid="switch-enabled-${firstId}"]`);
    const checkedBefore = await switchElement.getAttribute('aria-checked').catch(() => null);
    await toggleAssistantEnabled(page, firstId);
    if (checkedBefore !== null) {
      await expect(page.locator('[data-testid="assistant-editor-page"]')).toBeHidden({ timeout: 5_000 });
    }
    await takeScreenshot(page, 'assistants/p0-2/02-switch-stays-in-list.png');

    await toggleAssistantEnabled(page, firstId);
    await page.getByTestId('settings-tab-official').click();
    const builtinCard = page.locator('[data-testid^="official-card-"]').first();
    await expect(builtinCard).toBeVisible({ timeout: 10_000 });
    const builtinId = ((await builtinCard.getAttribute('data-testid')) ?? '').replace('official-card-', '');
    await duplicateAssistant(page, builtinId);
    await expect(page.locator('[data-testid="btn-save-assistant"]')).toContainText(/Create|创建/i);
    const copyName = `P0 duplicated ${Date.now()}`;
    await fillAssistantName(page, copyName);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);
    const copy = page.locator('[data-testid^="assistant-card-"]').filter({ hasText: copyName });
    await expect(copy).toBeVisible();
    const copyId = (await copy.getAttribute('data-testid'))!.replace('assistant-card-', '');
    const catalog = await httpGet<Array<{ id: string; source: string }>>(page, '/api/assistants');
    expect(catalog.find((item) => item.id === copyId)?.source).toBe('user');
    expect(catalog.some((item) => item.id === builtinId && item.source === 'builtin')).toBe(true);
    await openAssistantEditor(page, copyId);
    await deleteAssistant(page);
  });

  test('P0-3: delete modal shows preview card for custom assistant', async ({ page }) => {
    await goToAssistantSettings(page);

    const name = `P0 delete ${Date.now()}`;
    const desc = 'Delete preview test';
    await clickCreateAssistant(page);
    await selectExplicitAgent(page);
    await fillAssistantName(page, name);
    await fillAssistantDescription(page, desc);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const targetCard = page.locator('[data-testid^="assistant-card-"]').filter({ hasText: name }).first();
    const targetId = ((await targetCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');
    await openAssistantEditor(page, targetId);

    await page.locator('[data-testid="btn-delete-assistant"]').click();
    const modal = page.locator('[data-testid="modal-delete-assistant"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal).toContainText(name);
    await expect(modal).toContainText(desc);
    await takeScreenshot(page, 'assistants/p0-3/01-delete-preview.png');

    await modal.locator('.arco-btn-status-danger').click();
    await expect(modal).toBeHidden();
    await expect(page.getByTestId('assistant-home-shell')).toBeVisible();
    await expect(targetCard).toBeHidden({ timeout: 10_000 });
    await takeScreenshot(page, 'assistants/p0-3/02-deleted.png');
  });

  test('P0-5: required name prevents creation and keeps the editor open', async ({ page }) => {
    await goToAssistantSettings(page);
    await clickCreateAssistant(page);
    await fillAssistantName(page, '   ');
    await saveAssistant(page);
    await expect(page.getByTestId('assistant-editor-page')).toBeVisible();
    await expect(page.getByText(/名称不能为空|Name is required/i)).toBeVisible();
    await closeAssistantEditor(page);
  });

  test('P0-6: renaming a custom assistant updates the saved list entry', async ({ page }) => {
    await goToAssistantSettings(page);
    const original = `P0 rename ${Date.now()}`;
    const renamed = `${original} updated`;
    await clickCreateAssistant(page);
    await selectExplicitAgent(page);
    await fillAssistantName(page, original);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);
    const card = page.locator('[data-testid^="assistant-card-"]').filter({ hasText: original });
    await expect(card).toBeVisible();
    const id = (await card.getAttribute('data-testid'))!.replace('assistant-card-', '');
    await openAssistantEditor(page, id);
    await fillAssistantName(page, renamed);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);
    await expect(page.getByTestId(`assistant-card-${id}`)).toContainText(renamed);
    await openAssistantEditor(page, id);
    await expect(page.getByTestId('input-assistant-name')).toHaveValue(renamed);
    await deleteAssistant(page);
  });

  test('P0-7: custom assistant name and description survive a renderer reload', async ({ page }) => {
    await goToAssistantSettings(page);
    const name = `P0 persist ${Date.now()}`;
    const description = 'Saved assistant acceptance description';
    await clickCreateAssistant(page);
    await selectExplicitAgent(page);
    await fillAssistantName(page, name);
    await fillAssistantDescription(page, description);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);
    await page.reload();
    await page.getByTestId('settings-tab-mine').click();
    const card = page.locator('[data-testid^="assistant-card-"]').filter({ hasText: name });
    await expect(card).toContainText(description);
    const id = (await card.getAttribute('data-testid'))!.replace('assistant-card-', '');
    await openAssistantEditor(page, id);
    await expect(page.getByTestId('input-assistant-name')).toHaveValue(name);
    await expect(page.getByTestId('input-assistant-desc')).toHaveValue(description);
    await deleteAssistant(page);
  });

  test('P0-8: a missing default engine explains how to configure an assistant', async ({ page }) => {
    await goToAssistantSettings(page);
    await clickCreateAssistant(page);
    const name = `P0 no engine ${Date.now()}`;
    await fillAssistantName(page, name);
    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/api/assistants') && response.request().method() === 'POST'
    );
    await saveAssistant(page);
    const response = await responsePromise;
    const error = await response.json();
    console.log(`[Assistant empty engine response] ${JSON.stringify({ status: response.status(), error })}`);
    expect(response.status()).toBe(400);
    await expect(page.getByTestId('assistant-editor-page')).toBeVisible();
    await expect(
      page
        .getByText(zh.assistantAgentOrProviderRequired, { exact: true })
        .or(page.getByText(en.assistantAgentOrProviderRequired, { exact: true }))
    ).toBeVisible();
    await expect(page.getByTestId('input-assistant-name')).toHaveValue(name);
    await selectExplicitAgent(page);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);
    const created = page.locator('[data-testid^="assistant-card-"]').filter({ hasText: name });
    await expect(created).toBeVisible();
    const id = (await created.getAttribute('data-testid'))!.replace('assistant-card-', '');
    await openAssistantEditor(page, id);
    await deleteAssistant(page);
  });

  test('P0-4: highlight query parameter still highlights and clears', async ({ page }) => {
    await goToAssistantSettings(page);

    const firstCard = page.locator('[data-testid^="assistant-card-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    const targetId = ((await firstCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');

    await page.evaluate((id) => {
      window.location.hash = `/settings/assistants?highlight=${id}`;
    }, targetId);

    const targetCard = page.locator(`[data-testid="assistant-card-${targetId}"]`);
    await expect(targetCard).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    const highlightedClasses = await targetCard.getAttribute('class');
    expect(highlightedClasses).toContain('border-primary-5');
    expect(highlightedClasses).toContain('bg-primary-1');

    await page.waitForTimeout(2200);
    const clearedClasses = await targetCard.getAttribute('class');
    expect(clearedClasses).not.toContain('border-primary-5');
    expect(page.url()).not.toContain('highlight=');
    await takeScreenshot(page, 'assistants/p0-4/01-highlight-cleared.png');
  });
});
