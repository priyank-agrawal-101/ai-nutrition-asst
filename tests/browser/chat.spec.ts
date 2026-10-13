import { test, expect, type Page } from "@playwright/test";
import {
  conversationSchema,
  envelope,
  operationSchema,
  sessionSchema,
  type TurnView,
} from "../../src/contracts/api";
const frameSizes = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
async function expectFrame(page: Page, welcome = false) {
  await expect
    .poll(() =>
      page.evaluate((empty) => {
        const inside = (el: Element | null) => {
          const r = el?.getBoundingClientRect();
          return (
            !!r &&
            r.top >= -1 &&
            r.bottom <= innerHeight + 1 &&
            r.left >= -1 &&
            r.right <= innerWidth + 1
          );
        };
        const messages = document.querySelector<HTMLElement>(
          '[aria-label="Messages"]',
        );
        return {
          pageFits:
            document.documentElement.scrollHeight <= innerHeight + 1 &&
            document.documentElement.scrollWidth <= innerWidth + 1,
          composer: inside(document.querySelector("form")),
          sources: inside(document.querySelector("aside")),
          header: inside(document.querySelector("header")),
          welcomeFits:
            !empty ||
            (!!messages && messages.scrollHeight <= messages.clientHeight + 1),
        };
      }, welcome),
    )
    .toEqual({
      pageFits: true,
      composer: true,
      sources: true,
      header: true,
      welcomeFits: true,
    });
}
test.beforeEach(async ({ page, baseURL }) => {
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== baseURL)
      throw new Error("Unexpected outbound browser request");
    await route.continue();
  });
});
test("EC-UI-01 EC-REQ-04 stored answer survives refresh and dropped response", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Your question")).toBeEnabled();
  await expect(page.getByText("Scripted test mode")).toBeVisible();
  await expect(
    page.getByText("Local diagnostics are on:", { exact: false }),
  ).toHaveCount(0);
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
  let creations = 0;
  context.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/conversations"))
      creations++;
  });
  await page.evaluate(() => sessionStorage.removeItem("nutribite.recovery.v1"));
  await page.reload();
  await expect(page.getByLabel("Your question")).toBeEnabled();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "Synthetic browser storage question" }),
  ).toHaveCount(1);
  expect(creations).toBe(0);
  expect(submissions).toBe(1);
  const returnedTab = await context.newPage();
  await returnedTab.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Storage unavailable fixture");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Storage unavailable fixture");
    };
  });
  await returnedTab.goto(page.url());
  await expect(returnedTab.getByLabel("Your question")).toBeEnabled();
  await expect(
    returnedTab
      .getByRole("article")
      .filter({ hasText: "Synthetic browser storage question" }),
  ).toHaveCount(1);
  expect(creations).toBe(0);
  await returnedTab.close();
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
  await page.reload();
  await expect(page.getByLabel("Your question")).toBeEnabled();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: "Resume last saved chat" }).click();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "Synthetic browser storage question" }),
  ).toHaveCount(1);
  expect(creations).toBe(1);
  expect(submissions).toBe(1);
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
  await page.getByText("Claims (0)", { exact: true }).click();
  await expect(
    page.getByText("No factual claims were included in this response."),
  ).toBeVisible();
  // Supply a structured read fixture for presentation; the real database round-trip
  // and rejection of malformed/non-null-source candidates have integration coverage.
  await page.route("**/api/v1/conversations/*", async (route) => {
    const response = await route.fetch();
    const body = envelope(conversationSchema).parse(
      (await response.json()) as unknown,
    );
    if (!("data" in body)) throw new Error("Expected conversation");
    const assistant = body.data.turns[0]?.assistant_message;
    if (!assistant) throw new Error("Expected saved assistant response");
    assistant.content.claims = [
      { text: "Synthetic <b>claim</b> displayed as plain text.", source: null },
      { text: "A second synthetic claim.", source: null },
    ];
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(input).toBeEnabled();
  await page.getByText("Claims (2)", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Synthetic <b>claim</b> displayed as plain text.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Source: null", { exact: true })).toHaveCount(2);
  expect(await page.getByRole("article").locator("b").count()).toBe(0);
  await expectFrame(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectFrame(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/structured-claims-mobile.png",
    fullPage: true,
  });
});

test("EC-UI-03 composition, line breaks and Enter submit once", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("Your question");
  await expect(input).toBeEnabled();
  let submits = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/turns")) submits++;
  });
  await input.fill("A cooking question");
  await input.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
  });
  expect(submits).toBe(0);
  await input.press("End");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("A cooking question\n");
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Response ready.");
  await expect(page.getByRole("status")).toHaveCSS("clip-path", "inset(50%)");
  expect(submits).toBe(1);
  await input.fill("A long draft line\n".repeat(12));
  await expect
    .poll(() =>
      input.evaluate((el) => {
        const line = Number.parseFloat(getComputedStyle(el).lineHeight);
        return (
          el.clientHeight <= line * 4 + 1 && el.scrollHeight > el.clientHeight
        );
      }),
    )
    .toBe(true);
  await expectFrame(page);
  await input.fill("");
  await expect
    .poll(() =>
      input.evaluate(
        (el) =>
          el.clientHeight / Number.parseFloat(getComputedStyle(el).lineHeight),
      ),
    )
    .toBeCloseTo(2, 1);
  // Mock only the safe capability flag to inspect the privacy notice.
  await page.route("**/api/v1/session", async (route) => {
    const response = await route.fetch();
    const body = envelope(sessionSchema).parse(
      (await response.json()) as unknown,
    );
    if (!("data" in body)) throw Error("Expected session");
    await route.fulfill({
      response,
      json: { ...body, data: { ...body.data, diagnostics_enabled: true } },
    });
  });
  await page.reload();
  await expect(
    page.getByText("Private diagnostics on;", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "About this chat", exact: true })
    .click();
  await expect(
    page.getByText("Local diagnostics are on:", { exact: false }),
  ).toBeVisible();
});

test("EC-UI-07 EC-OPS-05 pre-acceptance quota preserves draft and waits for an explicit send", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const input = page.getByLabel("Your question");
  await expect(input).toBeEnabled();
  let calls = 0;
  const submissions: unknown[] = [];
  let retryAfterSeconds = 2;
  await page.route("**/api/v1/conversations/*/turns", async (route) => {
    calls++;
    submissions.push(route.request().postDataJSON() as unknown);
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "Retry-After": String(retryAfterSeconds) },
      json: {
        error: {
          code: "PROVIDER_RATE_LIMITED",
          message:
            "The AI usage limit has been reached. Please wait before trying again.",
          operation_state: "not_accepted",
          field_errors: [],
          recovery: {
            action: "repeat_request",
            conversation_id: null,
            turn_id: null,
            client_attempt_id: null,
            client_submission_id: null,
            retry_after_seconds: retryAfterSeconds,
          },
        },
        meta: {
          request_id: crypto.randomUUID(),
          server_time: new Date().toISOString(),
        },
      },
    });
  });
  await input.fill("Synthetic retained draft");
  await input.press("Enter");
  await expect(
    page.getByText("The AI usage limit has been reached.", { exact: false }),
  ).toBeVisible();
  await expect(input).toHaveValue("Synthetic retained draft");
  await expect(input).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await input.press("Enter");
  expect(calls).toBe(1);
  await expect(page.getByText("Response ready.")).toHaveCount(0);
  await page.clock.fastForward(3000);
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeEnabled();
  expect(calls).toBe(1);
  await expect(input).toHaveValue("Synthetic retained draft");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("The AI usage limit has been reached.", { exact: false }),
  ).toBeVisible();
  expect(calls).toBe(2);
  expect(submissions[1]).toEqual(submissions[0]);
  await page.clock.fastForward(3000);
  retryAfterSeconds = 66998;
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => calls).toBe(3);
  await expect(
    page.getByText("The AI usage limit has been reached.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(/seconds before sending or retrying/),
  ).toHaveCount(0);
  await expect(page.getByText("66998", { exact: false })).toHaveCount(0);
  await expect(input).toHaveValue("Synthetic retained draft");
  await expect(input).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(60000);
  expect(calls).toBe(3);
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(66998000);
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeEnabled();
  expect(calls).toBe(3);
});

for (const limited of [false, true])
  test(`EC-UI-07/08 mocked UI failure hides candidate and exposes explicit Retry (quota=${limited})`, async ({
    page,
  }) => {
    if (limited) await page.clock.install();
    await page.goto("/");
    const input = page.getByLabel("Your question");
    await expect(input).toBeEnabled();
    let failed: TurnView | null = null,
      showFailure = true;
    await page.route("**/api/v1/conversations/*", async (route) => {
      if (route.request().method() !== "GET" || !failed || !showFailure) {
        await route.continue();
        return;
      }
      const response = await route.fetch(),
        body = envelope(conversationSchema).parse(
          (await response.json()) as unknown,
        );
      if (!("data" in body)) throw Error("Expected synthetic conversation");
      const value = {
        ...body,
        data: {
          ...body.data,
          turns: body.data.turns.map((t) => (t.id === failed?.id ? failed : t)),
        },
      };
      envelope(conversationSchema).parse(value);
      await route.fulfill({ response, json: value });
    });
    await page.route("**/api/v1/conversations/*/turns", async (route) => {
      const response = await route.fetch(),
        body = envelope(operationSchema).parse(
          (await response.json()) as unknown,
        );
      if (!("data" in body)) throw Error("Expected synthetic operation");
      failed = {
        ...body.data.turn,
        status: "failed",
        assistant_message: null,
        failure: {
          code: limited ? "PROVIDER_RATE_LIMITED" : "OUTPUT_REJECTED",
          message: "Couldn't complete the answer. Try again.",
          retry_at: limited
            ? new Date(Date.now() + 120000).toISOString()
            : null,
        },
        retry: { allowed: true, reason: null, attempts_remaining: 2 },
      };
      const value = { ...body, data: { ...body.data, turn: failed } };
      envelope(operationSchema).parse(value);
      await route.fulfill({ response, json: value });
    });
    await page.route(
      "**/api/v1/conversations/*/turns/*/attempts",
      async (route) => {
        showFailure = false;
        await route.abort("failed"); // Unknown retry must recover through a read.
      },
    );
    await input.fill("Synthetic UI failure question");
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: "Retry", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Response ready.")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText(
      "Your question is saved, but no answer is ready.",
    );
    await expect(page.getByRole("status")).toHaveCSS("clip-path", "inset(50%)");
    await expect(
      page.getByText("This is a scripted local test response.", {
        exact: false,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText("No sources available in this version."),
    ).toBeVisible();
    await expectFrame(page);
    if (limited) {
      await expect(
        page.getByRole("button", { name: "Retry", exact: true }),
      ).toBeDisabled();
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Retry", exact: true }),
      ).toBeDisabled();
      await expect(page.getByText("Response ready.")).toHaveCount(0);
      await page.clock.fastForward(121000);
      await expect(
        page.getByRole("button", { name: "Retry", exact: true }),
      ).toBeEnabled();
    }
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(
      page.getByText("This is a scripted local test response.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("article")
        .filter({ hasText: "Synthetic UI failure question" }),
    ).toHaveCount(1);
  });

test("EC-UI-11 reading position stays put and bottom tracking follows new messages", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("Your question");
  await expect(input).toBeEnabled();
  for (let i = 0; i < 3; i++) {
    await input.fill(
      `What should I weigh? ${"Synthetic detail. ".repeat(25)} ${i}`,
    );
    await input.press("Enter");
    await expect(input).toHaveValue("");
  }
  const messages = page.getByRole("region", { name: "Messages", exact: true });
  await messages.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  await input.fill("What should I weigh?");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  expect(await messages.evaluate((el) => el.scrollTop)).toBe(0);
  await expectFrame(page);
  await messages.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  await input.fill("How many calories should I eat?");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  expect(
    await messages.evaluate(
      (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
    ),
  ).toBeLessThan(5);
});

test("EC-UI-04 draft dialog keeps editing and failed creation preserves history", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("Your question");
  await expect(input).toBeEnabled();
  await input.fill("What should I weigh?");
  await input.press("Enter");
  await expect(
    page.getByText("I can't recommend a weight target", { exact: false }),
  ).toBeVisible();
  await input.fill("Keep this draft");
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Keep editing" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("Keep this draft");
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page.route("**/api/v1/conversations", (r) => r.abort("failed"));
  await page.getByRole("button", { name: "Discard and start" }).click();
  await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
  await expect(
    page.getByText("I can't recommend a weight target", { exact: false }),
  ).toBeVisible();
  await page.unroute("**/api/v1/conversations");
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("");
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("EC-UI-07/08/10 one visitor views refusal, sources and wrapped input within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  const input = page.getByLabel("Your question");
  await expect(input).toBeEnabled();
  await input.fill("How many calories should I eat each day?");
  await input.press("Enter");
  for (const { width, height } of frameSizes) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByText("I can't recommend or calculate calorie targets.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry", exact: true }),
    ).toHaveCount(0);
    const sources = page.getByRole("complementary", { name: "Sources" });
    await sources.scrollIntoViewIfNeeded();
    await expect(
      sources.getByText("No sources available in this version."),
    ).toBeVisible();
    const sourceBox = await sources.boundingBox();
    const chatBox = await page
      .getByRole("region", { name: "Conversation", exact: true })
      .boundingBox();
    if (!sourceBox || !chatBox) throw new Error("Missing chat layout");
    if (width >= 1100) {
      expect(sourceBox.x).toBeGreaterThan(chatBox.x + chatBox.width);
      expect(sourceBox.y).toBeLessThan(chatBox.y + chatBox.height);
    } else {
      expect(sourceBox.y).toBeGreaterThanOrEqual(chatBox.y + chatBox.height);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await input.fill("x".repeat(2001));
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByRole("button", { name: "Send", exact: true }),
    ).toBeDisabled();
    await expectFrame(page);
    await page.screenshot({
      path: `test-results/phase2-${width}.png`,
      fullPage: true,
    });
  }
});

test("EC-UI-02 EC-UI-07 starter questions, quiet notices and reduced motion", async ({
  page,
}) => {
  let releaseSession!: () => void;
  const sessionGate = new Promise<void>((resolve) => {
    releaseSession = resolve;
  });
  await page.route("**/api/v1/session", async (route) => {
    await sessionGate;
    await route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Loading your saved chat…");
  await expectFrame(page);
  releaseSession();
  const input = page.getByLabel("Your question");
  await expect(input).toBeEnabled();
  let submissions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/turns"))
      submissions++;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Next suggestion" }).click();
  await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("");
  expect(submissions).toBe(0);
  await page.getByRole("button", { name: "Previous suggestion" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("1 / 3", { exact: true })).toBeVisible();
  const suggestionRail = page.getByRole("group", {
    name: "Suggested questions",
  });
  await suggestionRail.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await expect(page.getByText("3 / 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Food safety", exact: true }).click();
  await expect(page.getByText("1 / 3", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Everyday nutrition", exact: true })
    .click();
  for (const { width, height } of frameSizes) {
    await page.setViewportSize({ width, height });
    await expectFrame(page, true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/redesign-empty-${width}.png`,
      fullPage: true,
    });
  }
  const plate = page.locator('svg[viewBox="0 0 320 280"]');
  const ambient = page.locator('main > div[aria-hidden="true"]');
  await expect(ambient).toHaveCSS("pointer-events", "none");
  expect(
    await ambient.evaluate(
      (el) => getComputedStyle(el, "::before").animationName,
    ),
  ).not.toBe("none");
  await plate.hover({ position: { x: 40, y: 40 } });
  await expect
    .poll(() =>
      plate.evaluate((element) => element.style.getPropertyValue("--plate-x")),
    )
    .not.toBe("");
  await page.mouse.move(0, 0);
  await expect
    .poll(() =>
      plate.evaluate((element) => element.style.getPropertyValue("--plate-x")),
    )
    .toBe("");
  await page.getByRole("button", { name: "Food safety", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Food safety", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", {
      name: "How should I store leftover rice safely?",
      exact: true,
    })
    .click();
  await expect(input).toHaveValue("How should I store leftover rice safely?");
  await expect(input).toBeFocused();
  expect(
    await input.evaluate(
      (element) => element.closest("form")?.getAnimations().length ?? 0,
    ),
  ).toBeGreaterThan(0);
  await expect(
    page.getByRole("button", {
      name: "Can I refreeze food after thawing it?",
      exact: true,
    }),
  ).toBeDisabled();
  expect(submissions).toBe(0);
  const about = page.getByRole("button", {
    name: "About this chat",
    exact: true,
  });
  await about.click();
  await expect(
    page.getByRole("button", { name: "Close chat information" }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "About the answers", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/redesign-about.png",
    fullPage: true,
  });
  // Native modal inertness must prevent programmatic focus on the background.
  await input.evaluate((element) => element.focus());
  await expect(
    page.getByRole("button", { name: "Close chat information" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(about).toBeFocused();
  await expect(input).toHaveValue("How should I store leftover rice safely?");
  // Finish the earlier normal-motion pulse before checking a new reduced-motion selection.
  await expect
    .poll(() =>
      input.evaluate(
        (element) => element.closest("form")?.getAnimations().length ?? 0,
      ),
    )
    .toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      ambient.evaluate((el) => getComputedStyle(el, "::before").animationName),
    )
    .toBe("none");
  await plate.hover({ position: { x: 40, y: 40 } });
  await expect(plate).toHaveCSS("transform", "none");
  await expect
    .poll(() =>
      plate.evaluate((element) => element.style.getPropertyValue("--plate-x")),
    )
    .toBe("");
  await input.fill("");
  await page
    .getByRole("button", {
      name: "Can I refreeze food after thawing it?",
      exact: true,
    })
    .click();
  await expect(input).toHaveValue("Can I refreeze food after thawing it?");
  expect(
    await input.evaluate(
      (element) => element.closest("form")?.getAnimations().length ?? 0,
    ),
  ).toBe(0);
  await expect(page.locator("svg g").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(submissions).toBe(0);
  // 1280x720 at 200% browser zoom has a 640x360 CSS layout viewport.
  // Exercise that layout separately from physical-device/browser-zoom verification.
  await page.setViewportSize({ width: 640, height: 360 });
  await input.focus();
  await input.fill("Short-window draft\n".repeat(6));
  await expect(input).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: "test-results/viewport-zoom-equivalent.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 360 });
  await expect(input).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/viewport-keyboard-equivalent.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await input.fill("");
  await expectFrame(page, true);
  const info = page.getByRole("button", {
    name: "About this chat",
    exact: true,
  });
  await info.click();
  await page.setViewportSize({ width: 640, height: 360 });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("heading", { name: "How this chat uses your data" })
    .scrollIntoViewIfNeeded();
  await page.keyboard.press("Escape");
  await expect(info).toBeFocused();
});
