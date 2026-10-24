import { expect, test } from "@playwright/test";

test("onboarding shows four role cards that each open their route in a new window (A1)", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByText("Demo data")).toBeVisible();
  for (const role of ["patient", "nurse", "doctor", "interpreter"]) {
    const [popup] = await Promise.all([context.waitForEvent("page"), page.getByTestId(`role-${role}`).click()]);
    await popup.waitForLoadState();
    expect(new URL(popup.url()).pathname).toBe(`/${role}`);
    await expect(popup.getByText("Demo data")).toBeVisible();
    await popup.close();
  }
  await expect(page.getByRole("link", { name: "Demo controls" })).toBeVisible();
});

test("/demo Reset and Seed fills all seven columns, and shows the demo-defaults marker", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByTestId("demo-defaults")).toContainText("Demo defaults in use");
  await page.getByRole("button", { name: "Reset (empty board)" }).click();
  await expect(page.getByText("Board (0 patients")).toBeVisible();
  await page.getByRole("button", { name: "Reset and Seed" }).click();
  await expect(page.getByText("Board (9 patients")).toBeVisible();
  for (const col of ["arrival", "triage_waiting", "triaged", "diagnostics", "consultation", "awaiting_decision", "done"]) {
    await expect(page.getByTestId(`col-${col}`).locator("li").first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Check audit chain" }).click();
  await expect(page.getByTestId("demo-notice")).toContainText("Audit chain verified");
});

test("API rejects an illegal transition with a clear error and validates input", async ({ request }) => {
  await request.post("/api/demo/seed");
  const bad = await request.post("/api/checkin", { data: { name: "" } });
  expect(bad.status()).toBe(400);
  const r = await request.post("/api/checkin", {
    data: { name: "E2E Person", language: "en", consentContact: true, aiNoticeAccepted: true, reason: "e2e" },
  });
  expect(r.ok()).toBe(true);
  const { visitId, token, displayId } = await r.json();
  expect(displayId).toMatch(/^A-\d{3}$/);
  const illegal = await request.post(`/api/visits/${visitId}/decision`, {
    data: { actor: { role: "doctor", id: "D-05" }, outcome: "discharge" },
  });
  expect(illegal.status()).toBe(409);
  expect((await illegal.json()).error.message).toContain("not allowed from triage_waiting");
  const patient = await request.get(`/api/state?role=patient&id=${token}`);
  expect((await patient.json()).visit.displayId).toBe(displayId);
});
