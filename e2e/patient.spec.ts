import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const nurse = { role: "nurse", id: "N-01" };
const doctor = { role: "doctor", id: "D-05" };

async function checkInViaForm(page: Page, name: string) {
  await page.goto("/patient");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/patient");
  await page.locator("input[name=name]").fill(name);
  await page.locator("textarea[name=reason]").fill("Synthetic reason for visit");
  await page.locator("input[name=consentContact]").check();
  await page.locator("input[name=aiNoticeAccepted]").check();
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByTestId("checkin-done")).toContainText(/Your ID: A-\d{3}/);
  return (await page.getByTestId("checkin-done").innerText()).match(/A-\d{3}/)![0];
}

async function card(request: APIRequestContext, displayId: string) {
  const s = await (await request.get("/api/state?role=nurse")).json();
  return s.visits.find((v: { displayId: string }) => v.displayId === displayId);
}

const post = (request: APIRequestContext, url: string, data: unknown) =>
  request.post(url, { data }).then(async (r) => {
    expect(r.ok(), `${url}: ${await r.text()}`).toBeTruthy();
    return r.json();
  });

test.use({ viewport: { width: 375, height: 812 } });

test("B1/B5: check-in needs consent, then shows Your ID and creates a card", async ({ page, request }) => {
  await page.goto("/patient");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/patient");
  await page.locator("input[name=name]").fill("Test Person Echo");
  await page.locator("textarea[name=reason]").fill("Synthetic");
  await page.locator("input[name=aiNoticeAccepted]").check();
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByTestId("checkin-errors")).toContainText("Consent to contact is required");

  const id = await checkInViaForm(page, "Test Person Echo");
  await expect(page.getByTestId("patient-id")).toContainText(id);
  expect((await card(request, id)).status).toBe("triage_waiting");
  await expect(page.getByTestId("enquiry-box")).toBeVisible();
});

test("D7: I feel worse shows the fixed wording and alerts the nurse", async ({ page, request }) => {
  const id = await checkInViaForm(page, "Test Person Foxtrot");
  await page.getByRole("button", { name: "I feel worse" }).click();
  await expect(page.getByTestId("urgent-wording")).toBeVisible();
  await expect.poll(async () => (await card(request, id)).urgentEnquiry).toBe(true);
});

test("D8, F5, G2: closed in session, pending lines hidden, summary preparing until release", async ({ page, request }) => {
  const c = await post(request, "/api/checkin", {
    name: "Test Person Golf",
    language: "en",
    consentContact: true,
    aiNoticeAccepted: true,
    reason: "Synthetic",
  });
  await page.goto(`/patient?token=${c.token}&visit=${c.visitId}`);
  await expect(page.getByTestId("patient-id")).toContainText(c.displayId);

  await post(request, `/api/visits/${c.visitId}/triage`, { actor: nurse, priority: 3, note: "Synthetic" });
  const { session } = await post(request, `/api/visits/${c.visitId}/consult-now`, { actor: doctor });
  await expect(page.getByTestId("escort-alert")).toContainText("A nurse is coming");
  await page.getByRole("button", { name: "I am here" }).click();
  await post(request, `/api/sessions/${session.id}/escorted`, { actor: nurse, outcome: "with_doctor" });
  await post(request, `/api/sessions/${session.id}/start`, { actor: doctor, transcriptionConsent: true });
  await expect(page.getByTestId("enquiry-closed")).toBeVisible();
  await expect(page.getByTestId("enquiry-box")).toHaveCount(0);

  const { message } = await post(request, `/api/sessions/${session.id}/messages`, {
    actor: doctor,
    direction: "doctor_to_patient",
    text: "Synthetic instruction",
  });
  await expect(page.getByTestId("message-pending")).toContainText("Your message is being checked.");
  await expect(page.getByTestId("session-messages")).not.toContainText("MOCK");
  await post(request, `/api/sessions/${session.id}/messages/${message.id}/send`, { actor: doctor });
  await expect(page.getByTestId("message-pending")).toHaveCount(0);

  await post(request, `/api/sessions/${session.id}/complete`, {
    actor: doctor,
    next: "decision",
    note: { sections: { Plan: "Synthetic" }, transcript: [], signed: true },
    tests: [],
  });
  await expect(page.getByTestId("enquiry-box")).toBeVisible();
  await post(request, `/api/visits/${c.visitId}/decision`, {
    actor: doctor,
    outcome: "discharge",
    results: "Synthetic results",
    advice: "Synthetic advice",
    medicines: [],
  });
  await expect(page.getByTestId("pack-preparing")).toBeVisible();
  await expect(page.getByTestId("feel-worse")).toHaveCount(0);
  await post(request, `/api/visits/${c.visitId}/pack/verify`, { actor: doctor });
  await expect(page.getByTestId("pack-preparing")).toBeVisible();
  await post(request, `/api/visits/${c.visitId}/pack/release`, { actor: doctor });
  await expect(page.getByTestId("results-pack")).toContainText("Synthetic results");
  await expect(page.getByTestId("follow-up")).toBeVisible();
});

test("I3: large text at phone width has no horizontal scroll", async ({ page }) => {
  await checkInViaForm(page, "Test Person Hotel");
  await page.getByTestId("large-text").click();
  await expect(page.locator("[data-large='1']")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
