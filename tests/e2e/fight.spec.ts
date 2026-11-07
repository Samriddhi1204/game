import { expect, test } from '@playwright/test';
import {
  attr,
  closeIn,
  collectProblems,
  Finger,
  fightNum,
  logicalToPage,
  startFightWithKeyboard,
  startGame,
  waitForPrompt,
} from './helpers';

test('Challenge on a section starts the fight, and a punch combo lowers the dummy CGPA', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'keyboard path runs on desktop');
  const problems = collectProblems(page);
  await startFightWithKeyboard(page);
  expect(await fightNum(page, 'player-hp')).toBe(100);
  expect(await fightNum(page, 'enemy-hp')).toBe(100);
  await closeIn(page);

  // Three punches in a chain: 3 x 6 damage, +18 meter.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('j');
    await page.waitForTimeout(120);
  }
  await expect.poll(() => fightNum(page, 'enemy-hp')).toBeLessThanOrEqual(88);
  await expect.poll(() => fightNum(page, 'meter')).toBeGreaterThanOrEqual(12);
  expect(problems).toEqual([]);
});

test('dodge costs stamina; holding block against the dummy only takes chip damage', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'keyboard path runs on desktop');
  await startFightWithKeyboard(page);

  await page.keyboard.press('Space');
  await expect.poll(() => fightNum(page, 'stamina')).toBeLessThanOrEqual(75);

  // Dummy mode: Idle -> Block -> Attack (two taps on the "Dummy" button).
  const btn = await logicalToPage(page, 435, 40);
  await page.mouse.click(btn.x, btn.y);
  await page.mouse.click(btn.x, btn.y);
  await expect.poll(() => attr(page, 'data-fight-dummy')).toBe('attack');

  await page.keyboard.down('l');
  await page.waitForTimeout(7000);
  await page.keyboard.up('l');
  const hp = await fightNum(page, 'player-hp');
  expect(hp).toBeLessThan(100); // it did hit the block
  expect(hp).toBeGreaterThan(80); // but only chip damage got through
});

test('the pause menu stops the fight, resumes, and returns to the map', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'keyboard path runs on desktop');
  await startFightWithKeyboard(page);

  await page.keyboard.press('Escape');
  await expect.poll(() => attr(page, 'data-fight-paused')).toBe('true');
  const frozen = await fightNum(page, 'frame');
  await page.waitForTimeout(600);
  expect(await fightNum(page, 'frame')).toBe(frozen);

  await page.keyboard.press('Escape');
  await expect.poll(() => attr(page, 'data-fight-paused')).toBe('false');
  await expect.poll(() => fightNum(page, 'frame')).toBeGreaterThan(frozen);

  await page.keyboard.press('Escape');
  await expect.poll(() => attr(page, 'data-fight-paused')).toBe('true');
  const back = await logicalToPage(page, 480, 400);
  await page.mouse.click(back.x, back.y);
  await page.locator('html[data-scene="Map"]').waitFor();
  // Back where we were.
  await page.waitForFunction(() => document.documentElement.dataset['playerX'] !== undefined);
  expect(Number(await attr(page, 'data-player-x'))).toBeGreaterThan(700);
  await page.waitForTimeout(300);
  // The Academic prompt is quiet until we leave and re-enter (the locked Admin Block next door may show).
  expect(await attr(page, 'data-prompt')).not.toBe('academic_building:ready');
});

test('debug fight tools: hitbox panel loads lazily, +Meter then LITE LO spends the meter', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'keyboard path runs on desktop');
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await startFightWithKeyboard(page, '?debug=1');
  await expect(page.locator('#dbg-fight')).toBeVisible();
  expect(requested.some((u) => u.includes('fightDebug'))).toBe(true);

  await page.locator('#dbg-fight [data-id=meter]').click();
  await expect.poll(() => fightNum(page, 'meter')).toBe(100);
  await page.keyboard.press('i');
  await expect.poll(() => attr(page, 'data-fight-player-state')).toBe('special');
  await expect.poll(() => fightNum(page, 'meter')).toBeLessThan(5);
});

test('normal play never downloads the fight debug panel', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'keyboard path runs on desktop');
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await startFightWithKeyboard(page);
  expect(requested.filter((u) => u.includes('fightDebug'))).toEqual([]);
  await expect(page.locator('#dbg-fight')).toHaveCount(0);
});

test('touch: the round Attack button punches, and the Dodge button spends stamina', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'touch path runs on the phone viewport');
  const problems = collectProblems(page);
  await startGame(page);

  // Walk right with the joystick until the Academic Building prompt, then tap Challenge.
  const finger = await Finger.create(page);
  await finger.send('touchStart', 120, 300);
  for (let i = 1; i <= 8; i++) await finger.send('touchMove', 120 + i * 10, 300);
  await waitForPrompt(page, 'academic_building:ready');
  await finger.send('touchEnd', 200, 300);
  const challenge = await logicalToPage(page, 816, 474);
  await page.touchscreen.tap(challenge.x, challenge.y);
  await page.locator('html[data-scene="Fight"]').waitFor();
  await page.waitForFunction(() => document.documentElement.dataset['fightFrame'] !== undefined);

  // Close in with the joystick, then tap Attack three times.
  await finger.send('touchStart', 120, 300);
  for (let i = 1; i <= 6; i++) await finger.send('touchMove', 120 + i * 10, 300);
  await page.waitForFunction(
    () => {
      const d = document.documentElement.dataset;
      return Number(d['fightEnemyX']) - Number(d['fightPlayerX']) < 105;
    },
    undefined,
    { polling: 'raf', timeout: 30_000 },
  );
  await finger.send('touchEnd', 180, 300);
  await finger.detach();
  const attack = await logicalToPage(page, 850, 438);
  for (let i = 0; i < 3; i++) {
    await page.touchscreen.tap(attack.x, attack.y);
    await page.waitForTimeout(130);
  }
  await expect.poll(() => fightNum(page, 'enemy-hp')).toBeLessThanOrEqual(88);

  const dodge = await logicalToPage(page, 722, 474);
  await page.touchscreen.tap(dodge.x, dodge.y);
  await expect.poll(() => fightNum(page, 'stamina')).toBeLessThanOrEqual(75);
  expect(problems).toEqual([]);
});
