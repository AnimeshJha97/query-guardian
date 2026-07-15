import { expect, test } from "@playwright/test";

test("seeded Compose stack exposes query, suggestion, and N+1 signals", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Admin password").fill(process.env.QG_E2E_ADMIN_PASSWORD ?? "ci-admin-password");
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page.getByText("Overview", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Top 5 slowest queries")).toBeVisible();
  await expect(page.getByText(/SELECT .*books/i).first()).toBeVisible();

  await page.getByRole("link", { name: /^Suggestions/i }).click();
  await expect(page.getByText("Index suggestions", { exact: true })).toBeVisible();
  if (!(await page.getByText(/CREATE INDEX/i).first().isVisible())) {
    await page.getByRole("button", { name: /Resolved \(/ }).click();
  }
  await expect(page.getByText(/CREATE INDEX/i).first()).toBeVisible();

  await page.getByRole("link", { name: /N\+1 patterns/i }).click();
  await expect(page.getByText("N+1 patterns", { exact: true })).toBeVisible();
  await expect(page.getByText(/\d+× in/).first()).toBeVisible();
});
