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
  await control(page, ".advanced").click();
  const link = control(page, "a.project");
  await expect(link).toHaveAttribute("href", /admin\.datocms\.com/);
  await expect(link).toHaveAttribute("target", "_blank");
  const docs = control(page, "a.docs");
  await expect(docs).toHaveAttribute("href", "https://www.datocms.com/docs");
  await expect(docs).toHaveAttribute("target", "_blank");
});

test("stays hidden on a non-local host", async ({ page }) => {
  await page.goto("http://devbar.example:5173/");
  await expect(serverState(page)).toBeVisible();
  await expect(page.locator("datocms-dev-bar .tab")).toHaveCount(0);
});

test("General shows the environment, how the queries performed, and a line per query", async ({ page }) => {
  await page.goto("/");
  await tab(page).click();
  const panel = control(page, ".panel");
  await expect(panel).toBeHidden();
  await control(page, ".advanced").click();
  await expect(panel).toBeVisible();
  const general = control(page, "#pane-general");
  await expect(general.locator("[data-row=environment]")).toHaveText("main");
  await expect(general.locator("[data-row=time]")).toHaveText("647 ms across 2 queries");
  await expect(general.locator("[data-row=complexity]")).toHaveText("1,500,000 of 21,294,900 (highest)");
  await expect(general.locator("[data-row=cache]")).toHaveText("Partly, 1 of 2 from cache");
  await expect(general.locator("[data-row=cacheTags]")).toHaveText("Active on all 2");
  await expect(general.locator(".rows .i")).toHaveCount(7);
  await expect(general.locator("[data-row=size]")).toHaveText("257 KB in total, largest 254 KB");
  await general.locator(".i").first().hover();
  await expect(control(page, "#tip-environment")).toBeVisible();
  const recap = general.locator(".recap");
  await expect(recap).toHaveText("2 calls · 2 distinct queries · 647 ms · 257 KB · 1 flagged→");
  await recap.click();
  await expect(control(page, "[data-tab=queries]")).toHaveAttribute("aria-selected", "true");
  await expect(control(page, ".queries > li").nth(1).locator(".flag")).toHaveText(["slow", "heavy 7%", "large 254 KB"]);
});

test("Queries shows each query with its text and variables", async ({ page }) => {
  await page.goto("/");
  await tab(page).click();
  await control(page, ".advanced").click();
  await control(page, "[data-tab=queries]").click();
  await expect(control(page, "[data-tab=queries] .tab-count")).toHaveText("2");
  const items = control(page, ".queries > li");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0).locator(".flag")).toHaveCount(0);
  // With more than one query they start closed; a click opens one
  await expect(items.nth(1).locator("pre").first()).toBeHidden();
  await items.nth(1).locator(".q-name").click();
  await expect(items.nth(1).locator("pre").first()).toBeVisible();
  await expect(items.nth(0).locator("pre").first()).toBeHidden();
  await expect(items.nth(1).locator("pre").first()).toContainText("query MenuQuery");
  await expect(items.nth(1).locator("pre").nth(1)).toContainText('"locale": "it"');
});

test("records are grouped by model and can be filtered", async ({ page }) => {
  await page.goto("/");
  await tab(page).click();
  await control(page, ".advanced").click();
  await control(page, "[data-tab=records]").click();
  const groups = control(page, ".r-group");
  await expect(groups).toHaveCount(3);
  await expect(control(page, ".r-group .r-model")).toHaveText(["Home page", "Menu item", "Button"]);
  await expect(control(page, ".records-note")).toHaveText("3 records, 1 block.");
  await expect(control(page, ".block-total")).toHaveText("7 blocks in these records, all locales");
  const menu = groups.nth(1);
  await expect(menu.locator(".r-count")).toHaveText("×2");
  await expect(menu.locator("summary .r-dot")).toHaveAttribute("aria-label", "1 not published");
  await expect(menu.locator(".r-title")).toHaveText(["Pricing", "Blog"]);
  const edit = groups.nth(0).locator(".r-edit");
  await expect(edit).toHaveAttribute("aria-label", "Edit in DatoCMS (opens in a new window)");
  await expect(edit.locator("svg")).toHaveCount(1);
  await expect(edit).toHaveAttribute("target", "_blank");
  await control(page, ".records-filter").fill("unpublished");
  await expect(control(page, ".r-group:visible")).toHaveCount(1);
  await expect(menu.locator("details")).toHaveAttribute("open", "");
  await expect(menu.locator(".r-items li:visible")).toHaveCount(1);
  await expect(control(page, ".records-note")).toHaveText("1 of 4 shown.");
  await control(page, ".records-filter").fill("block");
  await expect(control(page, ".r-group:visible .r-model")).toHaveText("Button");
  await control(page, ".records-filter").fill("");
  await expect(control(page, ".r-group:visible")).toHaveCount(3);
});

test("what is open in the panel stays open while the bar changes state", async ({ page }) => {
  await page.goto("/");
  await tab(page).click();
  await control(page, ".advanced").click();
  await control(page, "[data-tab=records]").click();
  const menu = control(page, ".r-group").nth(1).locator("details");
  await menu.locator("summary").click();
  await expect(menu).toHaveAttribute("open", "");
  await control(page, "[data-tab=queries]").click();
  await control(page, "[data-tab=records]").click();
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("datocms:click-to-edit:toggle", { detail: true })));
  await expect(control(page, ".outlines-label")).toHaveText("Outlines on");
  await expect(menu).toHaveAttribute("open", "");
});

test("a record that Content Link ties to the page scrolls there on click", async ({ page }) => {
  await page.goto("/");
  await tab(page).click();
  await control(page, ".advanced").click();
  await control(page, "[data-tab=records]").click();
  await control(page, ".records-filter").fill("pricing");
  const record = control(page, ".r-items li:visible .r-main");
  await expect(record).toHaveClass(/r-findable/);
  await record.click();
  await expect(page.locator("#linked")).toBeInViewport();
  await control(page, ".records-filter").fill("blog");
  await expect(control(page, ".r-items li:visible .r-main")).not.toHaveClass(/r-findable/);
});

test("the panel has four tabs, remembers the open one and moves with the arrow keys", async ({ page }) => {
  await page.goto("/");
  await tab(page).click();
  await control(page, ".advanced").click();
  await expect(control(page, "[data-tab=general]")).toHaveAttribute("aria-selected", "true");
  await expect(control(page, "#pane-general")).toBeVisible();
  await expect(control(page, "#pane-records")).toBeHidden();
  await control(page, "[data-tab=help]").click();
  await expect(control(page, "#pane-help")).toContainText("Alt");
  await page.reload();
  await expect(control(page, "[data-tab=help]")).toHaveAttribute("aria-selected", "true");
  await control(page, "[data-tab=help]").focus();
  await page.keyboard.press("ArrowRight");
  await expect(control(page, "[data-tab=general]")).toHaveAttribute("aria-selected", "true");
  await expect(control(page, "[data-tab=records] .tab-count")).toHaveText("4");
});

test("with data-url the bar loads its data from the site after the page", async ({ page }) => {
  await page.goto("/remote");
  await tab(page).click();
  await control(page, ".advanced").click();
  await expect(control(page, "[data-row=environment]")).toHaveText("main");
  await expect(control(page, ".recap")).toContainText("1 call · 1 distinct query");
  await expect(control(page, "[data-tab=records] .tab-count")).toHaveText("4");
});

test("the bar shows the Content Link outlines state it hears about, and remembers it", async ({ page }) => {
  await page.goto("/");
  await tab(page).click();
  const outlines = control(page, ".outlines");
  await expect(outlines).toBeVisible();
  await expect(control(page, ".outlines-label")).toHaveText("Outlines: hold Alt");
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("datocms:click-to-edit:toggle", { detail: true })));
  await expect(control(page, ".outlines-label")).toHaveText("Outlines on");
  await page.reload();
  await expect(control(page, ".outlines-label")).toHaveText("Outlines on");
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("datocms:click-to-edit:toggle", { detail: false })));
  await expect(control(page, ".outlines-label")).toHaveText("Outlines off");
  await control(page, "button[data-visual=off]").click();
  await expect(outlines).toBeHidden();
});
