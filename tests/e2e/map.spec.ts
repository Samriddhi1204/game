import { expect, test } from '@playwright/test';
import {
  attr,
  collectProblems,
  Finger,
  playerPos,
  startGame,
  touchDrag,
  waitForPrompt,
} from './helpers';

test('keyboard walks the player, then a hotspot prompt appears and fires once', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'keyboard path runs on desktop');
  const problems = collectProblems(page);
  await startGame(page);
  const start = await playerPos(page);

  await page.keyboard.down('d');
  await expect
    .poll(async () => (await playerPos(page)).x, { timeout: 8000 })
    .toBeGreaterThan(start.x + 80);
  // The prompt only exists while walking through the radius, so watch every frame and stop at once.
  await waitForPrompt(page, 'notice_board:ready');
  await page.keyboard.up('d');

  await page.keyboard.press('e');
  await expect.poll(() => attr(page, 'data-action-count')).toBe('1');
  expect(await attr(page, 'data-last-action')).toBe('notice_board');

  // Same visit: pressing again must not re-trigger (the button is gone until re-entry).
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  expect(await attr(page, 'data-action-count')).toBe('1');
  expect(problems).toEqual([]);
});

test('touch joystick walks the player and the context button fires an interaction', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'touch path runs on the phone viewport');
  const problems = collectProblems(page);
  await startGame(page);
  const start = await playerPos(page);

  // Thumb lands bottom-left, drags right and holds: the joystick stays active until release.
  const finger = await Finger.create(page);
  await finger.send('touchStart', 120, 300);
  for (let i = 1; i <= 8; i++) await finger.send('touchMove', 120 + i * 10, 300);
  await expect
    .poll(async () => (await playerPos(page)).x, { timeout: 8000 })
    .toBeGreaterThan(start.x + 80);
  await waitForPrompt(page, 'notice_board:ready');
  await finger.send('touchEnd', 200, 300);
  await finger.detach();

  // Context button is bottom-right; at 915x412 the canvas is letterboxed, so tap near its centre.
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await page.touchscreen.tap(box.x + box.width * (816 / 960), box.y + box.height * (474 / 540));
  await expect.poll(() => attr(page, 'data-action-count')).toBe('1');
  expect(problems).toEqual([]);
});

test('the debug editor is not loaded in normal play', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await startGame(page);
  expect(requested.filter((u) => u.includes('mapEditor'))).toEqual([]);
  await expect(page.locator('#dbg-toolbar')).toHaveCount(0);
});

test('debug editor: lazy loads, draws a collision rect with a real drag, exports valid JSON', async ({
  page,
}, info) => {
  const problems = collectProblems(page);
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await startGame(page, '?debug=1');
  await expect(page.locator('#dbg-toolbar')).toBeVisible();
  expect(requested.some((u) => u.includes('mapEditor'))).toBe(true);

  await page.locator('#dbg-toolbar [data-id=mode]').click();
  await page.locator('#dbg-toolbar [data-id=fit]').click();
  await page.locator('#dbg-toolbar [data-id=draw]').click();

  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const from = { x: box.x + box.width * 0.1, y: box.y + box.height * 0.8 };
  const to = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.9 };
  if (info.project.name === 'mobile') {
    await touchDrag(page, from, to);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }

  await page.locator('#dbg-toolbar [data-id=export]').click();
  const collision = JSON.parse(
    await page.locator('#dbg-export textarea[data-file="collision.json"]').inputValue(),
  ) as { v: number; rects: { name: string; x1: number; x2: number }[] };
  expect(collision.v).toBe(1);
  expect(collision.rects).toHaveLength(14);
  const added = collision.rects[13];
  expect(added?.x2 ?? 0).toBeGreaterThan(added?.x1 ?? 0);
  const hotspots = JSON.parse(
    await page.locator('#dbg-export textarea[data-file="hotspots.json"]').inputValue(),
  ) as { v: number; hotspots: unknown[] };
  expect(hotspots.hotspots).toHaveLength(12);
  expect(
    problems.filter((p) => !p.includes('Permissions policy') && !p.includes('clipboard')),
  ).toEqual([]);
});
