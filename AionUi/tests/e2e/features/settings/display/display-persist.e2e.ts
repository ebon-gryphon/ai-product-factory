/**
 * Display Settings Persistence E2E Tests
 *
 * Verifies that display settings survive a page reload — i.e. they are
 * persisted to the store, not just held in component state.
 */

import { test, expect } from '../../../fixtures';
import { goToSettings, waitForSettle } from '../../../helpers';

const PERCENT_RE = /^\d{2,3}%$/;

function fontSizeControlLocator(page: import('@playwright/test').Page) {
  return page.locator('.font-scale-slider').locator('..');
}

function percentLabel(page: import('@playwright/test').Page) {
  return fontSizeControlLocator(page).locator('..').locator('span').filter({ hasText: PERCENT_RE });
}

function plusButton(page: import('@playwright/test').Page) {
  return fontSizeControlLocator(page).locator('button:has-text("+")');
}

function resetButton(page: import('@playwright/test').Page) {
  return fontSizeControlLocator(page)
    .locator('..')
    .locator('..')
    .locator('button')
    .filter({ hasNotText: /^[+-]$/ })
    .last();
}

async function currentPercent(page: import('@playwright/test').Page): Promise<number> {
  const text = await percentLabel(page).textContent();
  return parseInt(text!.replace('%', ''), 10);
}

async function reloadAndGoToDisplay(page: import('@playwright/test').Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (document.body.textContent?.length ?? 0) > 50, { timeout: 15_000 });
  await goToSettings(page, 'display');
  await waitForSettle(page);
}

test.describe('Display settings persistence across reload', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await goToSettings(page, 'display');
    await waitForSettle(page);
  });

  test('theme persists after reload', async ({ page }) => {
    await expect(page.getByTestId('theme-card-light')).toBeVisible();
    const initialSelection = await page
      .locator('[data-testid^="theme-card-"][data-active="true"]')
      .getAttribute('data-testid');

    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(initialTheme).toBeTruthy();

    const targetTheme = initialTheme === 'light' ? 'dark' : 'light';
    const targetButton = page.getByTestId(`theme-card-${targetTheme}`);
    await targetButton.click();

    await page.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      targetTheme,
      { timeout: 5_000 }
    );

    await reloadAndGoToDisplay(page);

    const afterReload = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(afterReload).toBe(targetTheme);

    // Restore original theme
    expect(initialSelection).toBeTruthy();
    await page.getByTestId(initialSelection!).click();
    await page.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      initialTheme,
      { timeout: 5_000 }
    );
  });

  test('zoom scale persists after reload in both the control and the native window', async ({ page, electronApp }) => {
    const label = percentLabel(page);
    await expect(label).toBeVisible({ timeout: 5_000 });

    const baseline = await currentPercent(page);

    const plus = plusButton(page);
    if (await plus.isDisabled()) {
      test.skip(true, 'zoom already at max — cannot increase');
      return;
    }
    await plus.click();
    await expect.poll(() => currentPercent(page)).toBeGreaterThan(baseline);
    // Two increments avoid 100%, where a lost native zoom would be invisible.
    await plus.click();
    await expect.poll(() => currentPercent(page)).toBe(baseline + 10);

    const afterClick = await currentPercent(page);
    const readNativeZoom = () =>
      electronApp.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find((item) => !item.webContents.getURL().startsWith('devtools:'));
        if (!window) throw new Error('No main window to check actual rendered zoom');
        return window.webContents.getZoomFactor();
      });
    await expect.poll(readNativeZoom).toBeCloseTo(afterClick / 100);
    expect(afterClick).toBeGreaterThan(baseline);

    await reloadAndGoToDisplay(page);

    const afterReload = await currentPercent(page);
    expect(afterReload).toBe(afterClick);
    await expect.poll(readNativeZoom).toBeCloseTo(afterClick / 100);

    // Restore via reset button
    const reset = resetButton(page);
    await expect(reset).toBeVisible({ timeout: 5_000 });
    if (await reset.isEnabled()) {
      await reset.click();
      await waitForSettle(page, 1_000);
    }
  });

  test('CSS theme selection persists after reload', async ({ page }) => {
    const cards = page.locator('[data-testid^="theme-card-"]');
    await cards.first().waitFor({ state: 'visible', timeout: 15_000 });

    const cardCount = await cards.count();
    if (cardCount < 2) {
      test.skip(true, 'fewer than 2 CSS theme presets — cannot switch');
      return;
    }

    // Find current active card index
    const activeId = await page.locator('[data-testid^="theme-card-"][data-active="true"]').getAttribute('data-testid');
    const activeIndex = await cards.evaluateAll((elements) =>
      elements.findIndex((element) => element.getAttribute('data-active') === 'true')
    );

    const targetIndex = activeIndex <= 0 ? 1 : 0;
    const targetCard = cards.nth(targetIndex);
    await targetCard.click();

    await page.locator('.arco-message-success').first().waitFor({ state: 'visible', timeout: 5_000 });

    // Assert the selected theme, rather than depending on presentation classes.
    await expect(targetCard).toHaveAttribute('data-active', 'true');

    await reloadAndGoToDisplay(page);

    // Verify the same card is still active after reload
    await cards.first().waitFor({ state: 'visible', timeout: 15_000 });
    await expect(cards.nth(targetIndex)).toHaveAttribute('data-active', 'true');

    // Restore original active theme
    if (activeId) {
      await page.getByTestId(activeId).click();
      await page
        .locator('.arco-message-success')
        .first()
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => {});
    }
  });
});
