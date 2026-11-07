import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { isBlocked } from '../../src/core/map/collision';
import { parseTilemap, parseTiles } from '../../src/core/map/parse';
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

test('the player can only stand on walkable tiles, however long a direction is held', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'keyboard path runs on desktop');
  const read = (f: string): unknown => JSON.parse(readFileSync(`src/data/${f}`, 'utf8'));
  const grid = parseTilemap(read('tilemap.json'), parseTiles(read('tiles.json')));
  await startGame(page);
  const start = await playerPos(page);
  expect(isBlocked(start, grid)).toBe(false);

  // Push into the grass on both sides of the road. The kerb path is the last walkable tile.
  for (const key of ['s', 'w', 's', 'a']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(2200);
    await page.keyboard.up(key);
    const p = await playerPos(page);
    expect(isBlocked(p, grid), `after holding ${key} the player is at ${p.x},${p.y}`).toBe(false);
  }
  const end = await playerPos(page);
  // 's' then 'w' from the middle of the road can only travel the road and its two kerbs: 5 tiles.
  expect(Math.abs(end.y - start.y)).toBeLessThan(5 * 32);
});

test('the debug editor is not loaded in normal play', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await startGame(page);
  expect(requested.filter((u) => u.includes('mapEditor'))).toEqual([]);
  await expect(page.locator('#dbg-toolbar')).toHaveCount(0);
});

test('debug editor: lazy loads, paints tiles with a real drag, exports valid JSON', async ({
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
  await page.locator('#dbg-toolbar [data-id=paint]').click();
  await page.locator('#dbg-palette [data-char="T"]').click(); // tree

  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const from = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.85 };
  const to = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.85 };
  if (info.project.name === 'mobile') {
    await touchDrag(page, from, to);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }

  await page.locator('#dbg-toolbar [data-id=export]').click();
  const exported = JSON.parse(
    await page.locator('#dbg-export textarea[data-file="tilemap.json"]').inputValue(),
  ) as { v: number; tileSize: number; rows: string[] };
  const original = JSON.parse(readFileSync('src/data/tilemap.json', 'utf8')) as { rows: string[] };
  const trees = (rows: string[]): number => rows.join('').split('T').length - 1;
  expect(exported.v).toBe(1);
  expect(exported.rows).toHaveLength(original.rows.length);
  expect(exported.rows[0]).toHaveLength(original.rows[0]?.length ?? 0);
  expect(trees(exported.rows)).toBeGreaterThan(trees(original.rows) + 2);

  const hotspots = JSON.parse(
    await page.locator('#dbg-export textarea[data-file="hotspots.json"]').inputValue(),
  ) as { v: number; hotspots: unknown[] };
  expect(hotspots.hotspots).toHaveLength(12);

  // Undo takes the painted tiles back out.
  await page.locator('#dbg-export button', { hasText: 'Close' }).click();
  await page.locator('#dbg-toolbar [data-id=undo]').click();
  await page.locator('#dbg-toolbar [data-id=export]').click();
  const undone = JSON.parse(
    await page.locator('#dbg-export textarea[data-file="tilemap.json"]').inputValue(),
  ) as { rows: string[] };
  expect(undone.rows).toEqual(original.rows);
  expect(
    problems.filter((p) => !p.includes('Permissions policy') && !p.includes('clipboard')),
  ).toEqual([]);
});
