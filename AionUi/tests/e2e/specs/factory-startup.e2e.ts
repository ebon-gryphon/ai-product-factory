import { test, expect } from '../fixtures';

test.describe('Factory desktop startup', () => {
  test('renderer reaches the real backend health and system APIs', async ({ page }) => {
    await page.waitForFunction(() => {
      return (window as unknown as { __backendPort?: number }).__backendPort! > 0;
    });
    const responses = await page.evaluate(async () => {
      const port = (window as unknown as { __backendPort: number }).__backendPort;
      return Promise.all(
        ['/health', '/api/system/info'].map(async (route) => {
          const response = await fetch(`http://127.0.0.1:${port}${route}`);
          return { status: response.status, body: await response.json() };
        })
      );
    });
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses[1].body.success).toBe(true);
  });

  test('all four stages append their briefs without losing existing input', async ({ page }) => {
    await page.evaluate(() => {
      window.location.hash = '#/guid';
    });
    const draft = page.locator('textarea').first();
    await expect(draft).toBeVisible();
    await draft.fill('Factory startup acceptance draft');
    const stages = [
      { title: /产品定义|Define product/i, text: /MVP/ },
      { title: /原型设计|Design prototype/i, text: /交互原型|prototype/i },
      { title: /开发拆解|Plan development/i, text: /接口契约|API contract/i },
      { title: /验收交付|Verify delivery/i, text: /缺陷清单|defect/i },
    ];
    for (const stage of stages) {
      await page.getByRole('button', { name: stage.title }).click();
      await expect(draft).toHaveValue(stage.text);
      await expect(draft).toHaveValue(/Factory startup acceptance draft/);
    }
    await page.screenshot({ path: 'tests/e2e/results/factory-desktop.png' });
    await draft.fill('');
  });
});

test('production projects persist artifacts and invalidate downstream revisions', async ({ page }) => {
  await page.evaluate(() => {
    window.location.hash = '#/factory';
  });
  await page.getByRole('button', { name: /新建生产项目|New project/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').first().fill('Factory persistence acceptance');
  await dialog.locator('textarea').fill('A personal task tracker with add, complete and delete.');
  await dialog.getByRole('button', { name: /保存项目|Save project/i }).click();
  await expect(page.getByRole('heading', { name: 'Factory persistence acceptance' })).toBeVisible();
  const artifact = page.getByRole('textbox', { name: /成果正文|Deliverable content/i });
  await artifact.fill('Requirements version one');
  await page.getByRole('button', { name: /保存为新版本|Save new version/i }).click();
  await expect(page.getByRole('button', { name: /保存为新版本|Save new version/i })).toBeDisabled();
  await page.reload();
  await expect(artifact).toHaveValue('Requirements version one');
  await page.getByRole('button', { name: /2\. 原型设计|2\. Design prototype/i }).click();
  await artifact.fill(
    '```html\n<!doctype html><html><body><h1>Prototype acceptance</h1>' +
      '<form id="localForm"><input aria-label="Task"><button>Add locally</button></form><output id="result"></output>' +
      '<script>document.querySelector("form").addEventListener("submit",e=>{e.preventDefault();document.querySelector("output").textContent=document.querySelector("input").value})</script>' +
      '</body></html>\n```'
  );
  await page.getByRole('button', { name: /保存为新版本|Save new version/i }).click();
  await expect(page.getByRole('button', { name: /保存为新版本|Save new version/i })).toBeDisabled();
  await page.getByRole('button', { name: /预览原型|Preview prototype/i }).click();
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts allow-forms');
  await expect(page.locator('iframe')).toHaveAttribute('srcdoc', /form-action 'none'/);
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Prototype acceptance' })).toBeVisible();
  await page.frameLocator('iframe').getByRole('textbox', { name: 'Task' }).fill('Local form works');
  await page.frameLocator('iframe').getByRole('button', { name: 'Add locally' }).click();
  await expect(page.frameLocator('iframe').locator('output')).toHaveText('Local form works');
  await page.getByRole('button', { name: /1\. 产品定义|1\. Define product/i }).click();
  await artifact.fill('Requirements version two');
  await page.getByRole('button', { name: /保存为新版本|Save new version/i }).click();
  await expect(page.getByRole('button', { name: /2\. 原型设计|2\. Design prototype/i })).toContainText(
    /成果已过期|Stale/i
  );
  await page.screenshot({ path: 'tests/e2e/results/factory-production.png' });
});

test('production permission warning opens the running stage rather than the selected stage', async ({ page }) => {
  const projectId = 'permission-routing-fixture';
  const activeId = 'factory-active-conversation';
  const projectRoute = `**/api/factory/projects/${projectId}`;
  const confirmationRoute = `**/api/conversations/${activeId}/confirmations`;
  await page.route(projectRoute, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          id: projectId,
          name: 'Permission routing test',
          brief: 'Synthetic permission state',
          assistant_id: 'assistant',
          workspace: '',
          model: null,
          archived: false,
          revision: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
          run_id: 'active-run',
          checks: [],
          stages: [
            { status: 'review', versions: [], conversation_id: 'prior-conversation', error: null },
            { status: 'review', versions: [], conversation_id: 'prior-prototype', error: null },
            { status: 'running', versions: [], conversation_id: activeId, error: null },
            { status: 'pending', versions: [], conversation_id: null, error: null },
          ],
        },
      },
    })
  );
  await page.route(confirmationRoute, (route) =>
    route.fulfill({ json: { success: true, data: [{ id: 'permission' }] } })
  );
  try {
    await page.evaluate((id) => {
      window.location.hash = `#/factory?project=${id}`;
    }, projectId);
    await expect(
      page.getByText(/任务正在等待工具授权或问题回答|This task is waiting for a tool permission/i)
    ).toBeVisible();
    await page.getByRole('button', { name: /打开正在执行的会话|Open active conversation/i }).click();
    await expect(page).toHaveURL(new RegExp(`/conversation/${activeId}$`));
  } finally {
    await page.unroute(projectRoute);
    await page.unroute(confirmationRoute);
    await page.evaluate(() => {
      window.location.hash = '#/factory';
    });
  }
});
