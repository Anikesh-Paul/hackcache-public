import { expect, test, type Page } from "@playwright/test";

const BOOKS_OPEN = /Your own private copy of the books is open/;

// landing → Demo world opens → Gupta's Invoice → pay link "already paid" → the Owner's Inbox shows it.
test("a Customer's 'already paid' on the pay link reaches the Owner's Inbox", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("₹8.1 lakh crore");
  await expect(page.getByText(BOOKS_OPEN)).toBeVisible({ timeout: 60_000 });

  await page.getByRole("link", { name: "Or open the books yourself" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Invoices" }).click();
  await page.getByRole("link", { name: /Gupta Traders/ }).first().click();
  await expect(page.getByText("TBW/26-27/0019").first()).toBeVisible();

  // The pay link opens in a new tab, as the Customer would see it: no login.
  const [customer] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: /Open pay link as Gupta Traders/ }).click(),
  ]);
  await customer.getByRole("button", { name: /मैंने भुगतान कर दिया है/ }).click();
  await customer.getByRole("button", { name: "हाँ, बताएं" }).click();
  await expect(customer.getByText(/स्क्रीनशॉट/).first()).toBeVisible();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByText("Said on the pay link that the bill is already paid")).toBeVisible();
  await expect(page.getByText("Says already paid").first()).toBeVisible();
});

const TITLES = [
  "Is salary day safe?",
  "Chase these first",
  "Before the call",
  "Be Gupta ji: take the call",
  "Salary covered",
  "Gupta ji's pay link",
  "A week later: the money is in",
  "Salary covered ✓",
];

/** All 8 steps with nothing but Next, from the landing page; ends on the last step with its checks done. */
async function runTour(page: Page, { resume = false } = {}) {
  await page.goto("/");
  await expect(page.getByText(BOOKS_OPEN)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /Start the 2-minute tour/ }).click();

  const tour = page.getByRole("dialog", { name: /./ });
  for (const [i, title] of TITLES.entries()) {
    // The week's step imports a statement and runs a week of the Ladder, live sends included.
    await expect(tour.getByRole("heading", { name: title, exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(tour).toContainText(`step ${i + 1} of 8`);
    if (title === "Salary covered") await expect(page.locator('[data-tour="headline"] h1')).toHaveText("Salary covered");
    if (resume && title === "A week later: the money is in") {
      await expect(page.getByText("Mon 9 Nov").first()).toBeVisible();
      // Leaving the step's screen folds the tour; Resume brings it back to the same step.
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Inbox" }).click();
      await expect(page).toHaveURL(/\/app\/inbox$/);
      await page.getByRole("button", { name: "Resume tour (step 7 of 8)" }).click();
      await expect(page).toHaveURL(/\/app\/bank$/);
    }
    if (i < TITLES.length - 1) await tour.getByRole("button", { name: "Next" }).click();
  }
  await expect(tour.getByRole("heading", { name: "Salary covered ✓", exact: true })).toBeVisible();
  await expect(page.locator('[data-tour="headline"] h1')).toHaveText("Salary covered");
  // The week's run sent its emails: no failed send.
  await tour.getByRole("link", { name: "Automation log" }).click();
  const log = page.getByRole("region", { name: "Automation log" });
  await expect(log).toContainText("0 failed");
  await expect(log).not.toContainText(/[1-9]\d* failed/);
  await page.getByRole("button", { name: /Resume tour/ }).click();
  return tour;
}

/** Reset demo from the header, accepting its confirm. */
async function resetDemo(page: Page) {
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByRole("button", { name: "Reset demo" })).toBeEnabled({ timeout: 60_000 });
}

// A fresh visitor takes the 8-step tour with nothing but Next: it ends on salary day covered, then /proof.
test("the guided tour runs from the landing page to Salary covered and /proof", async ({ page }) => {
  const tour = await runTour(page, { resume: true });
  await tour.getByRole("link", { name: "See the proof" }).click();
  await expect(page).toHaveURL(/\/proof$/);
  await expect(page.getByText(/(\d+) of \1 passed/)).toBeVisible();
});

// Reset, tour, reset, tour: the second run's week sends again, with no send refused as a repeat.
test("the tour runs twice in a row, each time from a reset", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/app");
  await expect(page.locator('[data-tour="headline"] h1')).toBeVisible({ timeout: 60_000 });
  await resetDemo(page);
  await runTour(page);
  await resetDemo(page);
  await expect(page.locator('[data-tour="headline"] h1')).not.toHaveText("Salary covered");
  const tour = await runTour(page);
  await expect(tour.getByRole("heading", { name: "Salary covered ✓", exact: true })).toBeVisible();
});

// Typing /proof in the address bar mid-tour opens /proof and stays there; the tour waits as its chip.
test("/proof typed mid-tour stays on /proof", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(BOOKS_OPEN)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /Start the 2-minute tour/ }).click();
  const tour = page.getByRole("dialog", { name: /./ });
  await expect(tour.getByRole("heading", { name: TITLES[0], exact: true })).toBeVisible({ timeout: 30_000 });
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour.getByRole("heading", { name: TITLES[1], exact: true })).toBeVisible();

  await page.goto("/proof");
  await expect(page.getByText(/(\d+) of \1 passed/)).toBeVisible();
  // Give the tour time to pull the page back, if it were going to.
  await page.waitForTimeout(2_000);
  await expect(page).toHaveURL(/\/proof$/);
  await page.getByRole("button", { name: "Resume tour (step 2 of 8)" }).click();
  await expect(tour.getByRole("heading", { name: TITLES[1], exact: true })).toBeVisible();
});

// The header's हिं and বাং switch Today's headline at once, with no reload, and EN brings it back.
test("the language switch changes Today's headline", async ({ page }) => {
  await page.goto("/app");
  const headline = page.locator('[data-tour="headline"] h1');
  await expect(headline).toHaveText(/^Salary (day|covered)/, { timeout: 60_000 });
  const english = await headline.textContent();
  await page.getByRole("button", { name: "हिं", exact: true }).click();
  await expect(headline).toHaveText(/^वेतन/);
  await page.getByRole("button", { name: "বাং", exact: true }).click();
  await expect(headline).toHaveText(/^বেতন/);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(headline).toHaveText(english ?? "");
});
