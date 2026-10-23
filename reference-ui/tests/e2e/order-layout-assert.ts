import { expect, test, type Locator, type Page } from "@playwright/test";

export async function expectOrderWorkspaceBounds(page: Page, width: number, target: Locator) {
  await page.setViewportSize({ width, height: 1000 });
  await page.evaluate(() => document.fonts.ready);
  const bounds = await page.evaluate(() => {
    const header = document.querySelector("main header")?.getBoundingClientRect();
    const nav = document.querySelector('aside[aria-label="Main navigation"]')?.getBoundingClientRect();
    const main = document.querySelector("main")?.getBoundingClientRect();
    return { scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      headerLeft: header?.left ?? -1, headerRight: header?.right ?? -1, headerTop: header?.top ?? -1,
      mainRight: main?.right ?? -1, navRight: nav?.right ?? -1 };
  });
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.viewportWidth + 1);
  expect(bounds.headerTop).toBeGreaterThanOrEqual(55);
  expect(bounds.headerLeft).toBeGreaterThanOrEqual(width >= 1024 ? bounds.navRight - 1 : -1);
  expect(bounds.headerRight).toBeLessThanOrEqual(bounds.mainRight + 1);
  await expect(target).toBeVisible();
  expect(await target.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const center = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return node === center || node.contains(center);
  })).toBe(true);
  const targetName = (await target.getAttribute("aria-label") || await target.innerText()).replace(/[^a-z0-9]+/gi, "-");
  await page.screenshot({ path: test.info().outputPath(`order-${width}-${targetName}.png`), fullPage: true });
}
