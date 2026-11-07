import type { Page } from '@playwright/test';

/** Only this message is ignored. Everything else (including warnings) is fatal. */
const IGNORED = 'GL Driver Message';

export function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    if (msg.text().includes(IGNORED)) return;
    problems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  return problems;
}

export async function attr(page: Page, name: string): Promise<string> {
  return (await page.locator('html').getAttribute(name)) ?? '';
}

/** Open the game and get past Tap to start. Works for mouse and touch projects. */
export async function startGame(page: Page, query = '?e2e=1'): Promise<void> {
  await page.goto(`/${query}`);
  await page.locator('html[data-scene="TapToStart"]').waitFor();
  if (isTouchViewport(page)) {
    await page.touchscreen.tap(450, 200);
  } else {
    await page.mouse.click(640, 360);
  }
  await page.locator('html[data-scene="Map"]').waitFor();
  // The test hooks write state every 100 ms; wait for the first write so positions are real.
  await page.waitForFunction(() => document.documentElement.dataset['playerX'] !== undefined);
}

function isTouchViewport(page: Page): boolean {
  const v = page.viewportSize();
  return v !== null && v.width < 1000;
}

export async function playerPos(page: Page): Promise<{ x: number; y: number }> {
  return {
    x: Number(await attr(page, 'data-player-x')),
    y: Number(await attr(page, 'data-player-y')),
  };
}

type TouchType = 'touchStart' | 'touchMove' | 'touchEnd';

/** One finger driven through Chromium's real input pipeline (CDP). */
export class Finger {
  private constructor(private readonly cdp: import('@playwright/test').CDPSession) {}

  static async create(page: Page): Promise<Finger> {
    return new Finger(await page.context().newCDPSession(page));
  }

  async send(type: TouchType, x: number, y: number): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
  }

  async detach(): Promise<void> {
    await this.cdp.detach();
  }
}

export async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const finger = await Finger.create(page);
  await finger.send('touchStart', from.x, from.y);
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await finger.send(
      'touchMove',
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
    await page.waitForTimeout(16);
  }
  await finger.send('touchEnd', to.x, to.y);
  await finger.detach();
}

/** Resolves on the exact frame a prompt appears; polling by interval can miss a 0.4 s window. */
export async function waitForPrompt(page: Page, key: string): Promise<void> {
  await page.waitForFunction((k) => document.documentElement.dataset['prompt'] === k, key, {
    polling: 'raf',
    timeout: 20_000,
  });
}

/** Map a logical (960x540) point to page coordinates, for mouse and touch taps on the canvas. */
export async function logicalToPage(
  page: Page,
  lx: number,
  ly: number,
): Promise<{ x: number; y: number }> {
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  return { x: box.x + (box.width * lx) / 960, y: box.y + (box.height * ly) / 540 };
}

/** From the spawn, walk to the Academic Building hotspot and press Challenge with the keyboard. */
export async function startFightWithKeyboard(page: Page, query = '?e2e=1'): Promise<void> {
  await startGame(page, query);
  await page.keyboard.down('d');
  await waitForPrompt(page, 'academic_building:ready');
  await page.keyboard.up('d');
  await page.keyboard.press('e');
  await page.locator('html[data-scene="Fight"]').waitFor();
  await page.waitForFunction(() => document.documentElement.dataset['fightFrame'] !== undefined);
}

export const fightNum = async (page: Page, key: string): Promise<number> =>
  Number((await page.locator('html').getAttribute(`data-fight-${key}`)) ?? 'NaN');

/** Walk toward the dummy until a punch can reach, then stop. */
export async function closeIn(page: Page): Promise<void> {
  await page.keyboard.down('d');
  await page.waitForFunction(
    () => {
      const d = document.documentElement.dataset;
      return Number(d['fightEnemyX']) - Number(d['fightPlayerX']) < 100;
    },
    undefined,
    { polling: 'raf', timeout: 60_000 },
  );
  await page.keyboard.up('d');
}
