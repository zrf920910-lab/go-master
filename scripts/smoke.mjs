/**
 * End-to-end smoke test.
 *
 * Requires a running dev server (`npm run dev`) and a local Chrome. It walks
 * every route at three tablet/phone sizes, records console errors, checks for
 * horizontal overflow, and exercises the core interactions (lesson drill,
 * level stage, battle move + scoring).
 *
 *   node scripts/smoke.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const routes = [
  ['home', '/'],
  ['learn', '/#/learn'],
  ['levels', '/#/levels'],
  ['level', '/#/level/lv-01'],
  ['lesson', '/#/lesson/l-liberty'],
  ['battle', '/#/battle'],
  ['practice', '/#/practice'],
  ['daily', '/#/daily'],
  ['review', '/#/review'],
  ['mistakes', '/#/mistakes'],
  ['profile', '/#/profile'],
  ['library', '/#/library'],
];

const viewports = [
  ['landscape', { width: 1180, height: 820 }, false],
  ['portrait', { width: 834, height: 1194 }, true],
  ['phone', { width: 390, height: 844 }, true],
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const errors = [];
const report = [];
let failures = 0;

async function clickCell(page, col, row, size = 9) {
  const canvas = page.locator('.board-canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('board not found');
  const padRatio = size === 19 ? 0.055 : 0.075;
  const pad = box.width * padRatio;
  const cell = (box.width - pad * 2) / (size - 1);
  await page.mouse.click(box.x + pad + col * cell, box.y + pad + row * cell);
  await page.waitForTimeout(700);
}

for (const [tag, viewport, touch] of viewports) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`);
  });

  for (const [name, path] of routes) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    const textLength = (await page.locator('.app-main').innerText().catch(() => '')).length;
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (textLength < 30) {
      failures++;
      errors.push(`${tag}/${name}: page rendered only ${textLength} characters`);
    }
    if (overflow) {
      failures++;
      errors.push(`${tag}/${name}: horizontal overflow`);
    }
    report.push({ view: tag, page: name, textLength, overflow });
  }
  await ctx.close();
}

// --- interaction: a lesson drill -----------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`drill: ${e.message}`));
  await page.goto(BASE + '/#/lesson/l-liberty', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /看动画演示/ }).click();
  await page.getByRole('button', { name: /跳过演示|开始练习/ }).click();
  await page.waitForTimeout(300);
  await clickCell(page, 0, 0); // wrong point (top-left corner)
  const wrong = await page.locator('.feedback').innerText();
  if (!wrong.includes('✕')) {
    failures++;
    errors.push('drill: a wrong tap was not reported as wrong');
  }
  await clickCell(page, 4, 3); // E4 is a liberty of E5
  const right = await page.locator('.feedback').innerText();
  if (!right.includes('✓')) {
    failures++;
    errors.push('drill: the correct liberty was not accepted');
  }
  await ctx.close();
}

// --- interaction: a level stage ------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`level: ${e.message}`));
  await page.goto(BASE + '/#/level/lv-01', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await clickCell(page, 4, 4); // tengen
  const passed = await page.locator('.stage-passed').count();
  if (!passed) {
    failures++;
    errors.push('level: solving a stage did not show the result panel');
  }
  await ctx.close();
}

// --- interaction: battle move + score ------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`battle: ${e.message}`));
  await page.goto(BASE + '/#/battle', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // Play a few moves (the AI answers after each) so scoring is available.
  for (const [c, r] of [[4, 4], [2, 2], [6, 2], [2, 6], [6, 6]]) {
    await page.waitForTimeout(900);
    await clickCell(page, c, r);
  }
  await page.waitForTimeout(1200);
  const footer = await page.locator('.battle__footer').innerText();
  if (!/第 (\d{2,}|[4-9])/.test(footer)) {
    failures++;
    errors.push('battle: the move counter did not advance');
  }
  await page.getByRole('button', { name: '结算' }).click();
  await page.waitForTimeout(500);
  if (!(await page.locator('.score-sheet').count())) {
    failures++;
    errors.push('battle: scoring sheet did not open');
  }
  await ctx.close();
}

console.log(JSON.stringify({ failures, errors, report }, null, 2));
await browser.close();
process.exit(failures ? 1 : 0);
