import { expect, test, type Page } from "@playwright/test";

const tab = (page: Page) => page.locator("datocms-dev-bar").first().locator(".tab");
const bar = (page: Page) => page.locator("datocms-dev-bar").first().locator(".bar");
const control = (page: Page, selector: string) => page.locator("datocms-dev-bar").first().locator(selector);
const serverState = (page: Page) => page.locator("#server-state");
const cookie = async (page: Page, name: string) => (await page.context().cookies()).find((c) => c.name === name)?.value;

test("starts closed in draft and opens and closes on click", async ({ page }) => {
  await page.goto("/");
  await expect(serverState(page)).toHaveText("server: draft, visual editing on");
  await expect(bar(page)).toBeHidden();
  await tab(page).click();
  await expect(bar(page)).toBeVisible();
  await expect(tab(page)).toHaveAttribute("aria-expanded", "true");
  await tab(page).click();
  await expect(bar(page)).toBeHidden();
});

test("switching to published reloads, keeps the bar open and disables visual editing", async ({ page }) => {
  await page.goto("/");
  await tab(page).click();
  await control(page, "button[data-mode=published]").click();
  await expect(serverState(page)).toHaveText("server: published, visual editing off");
  await expect(bar(page)).toBeVisible();
  await expect(control(page, "button[data-mode=published]")).toHaveAttribute("aria-pressed", "true");
  await expect(control(page, "button[data-visual=on]")).toBeDisabled();
  expect(await cookie(page, "datocms-mode")).toBe("published");
});

test("turning visual editing off removes the outlines", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cl")).toHaveCount(2);
  await tab(page).click();
  await control(page, "button[data-visual=off]").click();
  await expect(serverState(page)).toHaveText("server: draft, visual editing off");
  await expect(page.locator(".cl")).toHaveCount(0);
});

test("a URL parameter wins on the first load, then lives on as a cookie", async ({ page }) => {
  await page.goto("/other?datocms=published&keep=1");
  await expect(serverState(page)).toHaveText("server: published, visual editing off");
  await expect(page).toHaveURL(/\/other\?keep=1$/);
  await page.goto("/");
  await expect(serverState(page)).toHaveText("server: published, visual editing off");
});

test("keyboard shortcuts, ignored in text fields", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Alt+Shift+KeyB");
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press("Alt+Shift+KeyD");
  await expect(serverState(page)).toHaveText("server: published, visual editing off");
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press("Alt+Shift+KeyD");
  await expect(serverState(page)).toHaveText("server: draft, visual editing on");
  await page.keyboard.press("Alt+Shift+KeyV");
  await expect(serverState(page)).toHaveText("server: draft, visual editing off");
  await page.locator("#search").focus();
  await page.keyboard.press("Alt+Shift+KeyB");
  await expect(bar(page)).toBeVisible();
});

test("reload=false emits the event and does not reload", async ({ page }) => {
  await page.goto("/no-reload");
  await tab(page).click();
  await control(page, "button[data-mode=published]").click();
  await expect(page.locator("#events")).toContainText('{"mode":"published","visualEditing":false}');
  await expect(serverState(page)).toHaveText("server: draft, visual editing on");
  await page.reload();
  await expect(serverState(page)).toHaveText("server: published, visual editing off");
});

test("only the first bar on a page renders", async ({ page }) => {
  await page.goto("/double");
  await expect(page.locator("datocms-dev-bar").nth(0).locator(".tab")).toHaveCount(1);
  await expect(page.locator("datocms-dev-bar").nth(1).locator(".tab")).toHaveCount(0);
});

test("the project link opens DatoCMS in a new window", async ({ page }) => {
  await page.goto("/");
  await tab(page).click();
  const link = control(page, "a.project");
  await expect(link).toHaveAttribute("href", /admin\.datocms\.com/);
  await expect(link).toHaveAttribute("target", "_blank");
});

test("stays hidden on a non-local host", async ({ page }) => {
  await page.goto("http://devbar.example:5173/");
  await expect(serverState(page)).toBeVisible();
  await expect(page.locator("datocms-dev-bar .tab")).toHaveCount(0);
});
