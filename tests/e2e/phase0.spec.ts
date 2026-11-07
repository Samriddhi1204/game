import { expect, test, type Page } from '@playwright/test';
import { collectProblems } from './helpers';

const scene = (page: Page) => page.locator('html').getAttribute('data-scene');

async function landscape(page: Page): Promise<void> {
  const v = page.viewportSize();
  if (v && v.height > v.width) await page.setViewportSize({ width: v.height, height: v.width });
}

test('loads with no console errors, tap to start reaches Map, canvas is 16:9', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'TapToStart');

  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  expect(box.width / box.height).toBeCloseTo(960 / 540, 1);

  if (test.info().project.name === 'mobile') {
    await page.touchscreen.tap(450, 200);
  } else {
    await page.mouse.click(640, 360);
  }
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'Map');
  expect(problems).toEqual([]);
});

test('portrait shows the rotate overlay and pauses; landscape resumes', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'TapToStart');
  await expect(page.locator('#rotate')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-paused', 'false');

  const v = page.viewportSize();
  if (!v) throw new Error('no viewport');
  await page.setViewportSize({ width: 412, height: 915 });
  await expect(page.locator('#rotate')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-paused', 'true');

  await page.setViewportSize({ width: v.width, height: v.height });
  await expect(page.locator('#rotate')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-paused', 'false');
  expect(problems).toEqual([]);
});

test('a thrown runtime error shows ErrorScene', async ({ page }) => {
  await landscape(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'TapToStart');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('e2e boom');
    }, 0);
  });
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'Error');
  expect(await scene(page)).toBe('Error');
});

test('a failed asset load shows Retry and stays on Preload', async ({ page }) => {
  await page.route(/\.png/, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-load-error', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'Preload');
});
