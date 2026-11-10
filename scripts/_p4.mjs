import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
const page = await (await browser.newContext({ viewport:{width:1180,height:900} })).newPage();
await page.goto('http://127.0.0.1:4173/#/practice', { waitUntil:'networkidle' });
await page.waitForTimeout(800);
const box = await page.locator('.board-canvas').boundingBox();
const pad=box.width*0.075, cell=(box.width-pad*2)/8;
for (const [c,r] of [[4,4],[3,4],[5,4]]) { await page.mouse.click(box.x+pad+c*cell, box.y+pad+r*cell); await page.waitForTimeout(400); }
const info = await page.evaluate(()=>{
  const wrap=document.querySelector('.practice__replay');
  const btns=[...document.querySelectorAll('.practice__replay button')].map(b=>({t:b.textContent?.trim(), disabled:b.disabled}));
  const counter=document.querySelector('.practice__replay .tiny')?.textContent;
  return {exists:Boolean(wrap), btns, counter};
});
console.log(JSON.stringify(info,null,2));
