import { expect, test } from '@playwright/test';

test.describe('车站无障碍通道复核器', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('默认 5×5：求解展示总秒数、转弯数与逐步累计费用', async ({ page }) => {
    // 默认全部为 1 秒通行格，起点 (0,0)，终点 (4,4)，初始朝东。
    // 最优：4 次向东再 4 次向南，基础 8 秒 + 1 次转弯 5 秒 = 13。
    await page.getByTestId('solve-button').click();

    await expect(page.getByTestId('result-ok')).toBeVisible();
    await expect(page.getByTestId('total-seconds')).toHaveText('13');
    await expect(page.getByTestId('total-turns')).toHaveText('1');

    // 起点行 + 8 个步骤行
    await expect(page.locator('[data-testid^="step-row-"]')).toHaveCount(9);
    // 逐步累计：前四步向东 1,2,3,4；第五步向南加转弯费 5 => 10，随后 11,12,13
    await expect(page.getByTestId('cumulative-1')).toHaveText('1');
    await expect(page.getByTestId('cumulative-4')).toHaveText('4');
    await expect(page.getByTestId('cumulative-5')).toHaveText('10');
    await expect(page.getByTestId('cumulative-8')).toHaveText('13');

    // 网格上 9 个格（含起点）高亮为路线
    await expect(page.locator('.cell.in-path')).toHaveCount(9);
    // 终点格标记
    await expect(page.getByTestId('cell-4-4')).toHaveClass(/is-end/);
  });

  test('封闭终点邻格后不可达：旧路线立即消失并给出可达格数证据', async ({ page }) => {
    await page.getByTestId('solve-button').click();
    await expect(page.getByTestId('result-ok')).toBeVisible();

    // 用阻断格工具封住终点 (4,4) 的两个邻格 (3,4)、(4,3)
    await page.getByTestId('tool-blocked').click();
    await page.getByTestId('cell-3-4').click();
    // 第一次编辑后旧路线必须立即消失（无需再点求解）
    await expect(page.getByTestId('result-empty')).toBeVisible();
    await page.getByTestId('cell-4-3').click();

    await page.getByTestId('solve-button').click();

    await expect(page.getByTestId('result-fail')).toBeVisible();
    // 25 格中 2 格阻断，终点孤岛 1 格 => 从起点可达 22 格
    await expect(page.getByTestId('reachable-count')).toHaveText(/22/);
    await expect(page.locator('.cell.in-reach')).toHaveCount(22);
    await expect(page.getByTestId('cell-4-4')).not.toHaveClass(/in-reach/);
    // 失败时不残留路线高亮
    await expect(page.locator('.cell.in-path')).toHaveCount(0);
  });

  test('非法耗时定位到具体格并清空结果，修正后可重新求解', async ({ page }) => {
    // 选中 (2,2)（展示为第 3 行第 3 列），把耗时改成 0
    await page.getByTestId('cell-2-2').click();
    await page.getByTestId('inspector-cost').fill('0');

    await page.getByTestId('solve-button').click();

    const errorPanel = page.getByTestId('error-panel');
    await expect(errorPanel).toBeVisible();
    await expect(errorPanel).toContainText('第 3 行第 3 列');
    await expect(page.getByTestId('cell-2-2')).toHaveClass(/has-error/);
    // 非法时结果区为空
    await expect(page.getByTestId('result-empty')).toBeVisible();

    // 点击错误条目定位到该格
    await page.locator('[data-testid^="error-locate-2-2-"]').first().click();
    await expect(page.getByTestId('cell-2-2')).toHaveClass(/is-selected/);

    // 修正为合法耗时后求解成功
    await page.getByTestId('inspector-cost').fill('12');
    await page.getByTestId('solve-button').click();
    await expect(page.getByTestId('result-ok')).toBeVisible();
    await expect(page.getByTestId('total-seconds')).toHaveText('13');
  });

  test('电梯乘用：固定 8 秒、同组首次等待只收一次、朝向不变', async ({ page }) => {
    // 调整为 1×5：起 (0,0)，E1(0,1) 组1 等待10，(0,2) 阻断，E2(0,3) 组1 等待10，终 (0,4)
    await page.getByTestId('rows-input').fill('1');
    await page.getByTestId('cols-input').fill('5');
    await page.getByTestId('apply-size').click();

    await page.getByTestId('tool-elevator').click();
    await page.getByTestId('cell-0-1').click();
    await page.getByTestId('cell-0-3').click();

    await page.getByTestId('cell-0-1').click();
    await page.getByTestId('inspector-wait').fill('10');
    await page.getByTestId('cell-0-3').click();
    await page.getByTestId('inspector-wait').fill('10');

    await page.getByTestId('tool-blocked').click();
    await page.getByTestId('cell-0-2').click();

    await page.getByTestId('tool-end').click();
    await page.getByTestId('cell-0-4').click();

    await page.getByTestId('solve-button').click();

    await expect(page.getByTestId('result-ok')).toBeVisible();
    // 步入 E1 基础 0；乘用 8 + 首等 10；步入终点 1 => 19，全程无转弯
    await expect(page.getByTestId('total-seconds')).toHaveText('19');
    await expect(page.getByTestId('total-turns')).toHaveText('0');

    const rideRow = page.getByTestId('step-row-2');
    await expect(rideRow).toContainText('电梯');
    // 列为：# / 方式 / 到达 / 朝向 / 基础耗时 / 转弯费 / 电梯费 / 累计
    await expect(rideRow.locator('td').nth(6)).toHaveText('18');
    await expect(rideRow.locator('td').nth(5)).toHaveText('0');
    await expect(page.getByTestId('cumulative-2')).toHaveText('18');
    await expect(page.getByTestId('cumulative-3')).toHaveText('19');
  });

  test('初始朝向可点选，影响第一步转弯费', async ({ page }) => {
    // 朝西时第一步转向东 +5，之后东转南再 +5：总 8+10=18，转弯 2 次
    await page.getByTestId('heading-3').click();
    await page.getByTestId('solve-button').click();
    await expect(page.getByTestId('result-ok')).toBeVisible();
    await expect(page.getByTestId('cumulative-1')).toHaveText('6');
    await expect(page.getByTestId('total-seconds')).toHaveText('18');
    await expect(page.getByTestId('total-turns')).toHaveText('2');
  });
});
