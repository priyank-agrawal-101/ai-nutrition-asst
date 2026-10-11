import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page, baseURL }) => {
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== baseURL)
      throw new Error("Unexpected outbound browser request");
    await route.continue();
  });
});
test("EC-UI-01 EC-REQ-04 stored answer survives refresh and dropped response", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Your question")).toBeEnabled();
  await expect(page.getByText("LOCAL · SCRIPTED TEST MODE")).toBeVisible();
  let submissions = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/turns")) submissions++;
  });
  await page.route("**/api/v1/conversations/*/turns", async (route) => {
    await route.fetch();
    await route.abort("failed");
  });
  await page
    .getByLabel("Your question")
    .fill("Synthetic browser storage question");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(
    page.getByText("This is a scripted local test response.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Your question")).toBeEnabled();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "Synthetic browser storage question" }),
  ).toHaveCount(1);
  expect(submissions).toBe(1);
  await expect(
    page.getByRole("heading", { name: "Sources", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No sources available in this version."),
  ).toBeVisible();
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(page.getByLabel("Your question")).toBeEnabled();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "Synthetic browser storage question" }),
  ).toHaveCount(0);
});
test("EC-SEC-08 EC-UI-02 keyboard, mobile layout and inert user text", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("Your question");
  await expect(input).toBeEnabled();
  await input.fill("<img src=x onerror=alert('fixture')>");
  await input.press("Tab");
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("This is a scripted local test response.", { exact: false }),
  ).toBeVisible();
  expect(await page.locator("img").count()).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/phase1-chat.png",
    fullPage: true,
  });
});
