// Stage 2: the rehearsal script (docs/ACCEPTANCE.md) across three separate browser contexts.
// Cross-window checks use a 3 second timeout: a change in one window must show in the others within 3 s (A4).
import { expect, test, type Browser, type Page } from "@playwright/test";

const A4 = { timeout: 3_000 };
// The dev server compiles a route on its first request, which can add a few seconds once. Used only where a
// route is hit for the first time in the run; A4 is still checked on every other cross-window update.
const FIRST = process.env.E2E_PROD ? A4 : { timeout: 8_000 };

async function windowFor(browser: Browser, path: string, viewport = { width: 1600, height: 1000 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(path);
  return page;
}

test("rehearsal: patient, nurse and doctor windows run the whole loop", async ({ browser, request }) => {
  test.setTimeout(120_000);

  // 1. Reset and Seed.
  expect((await request.post("/api/demo/seed")).ok()).toBeTruthy();
  const patient = await windowFor(browser, "/patient", { width: 375, height: 812 });
  const nurse = await windowFor(browser, "/nurse");
  const doctor = await windowFor(browser, "/doctor?doctor=D-03");
  await patient.evaluate(() => localStorage.clear());
  await patient.reload();

  // 2. Patient checks in (Arabic, so every doctor line is translated). The card appears on the nurse board.
  await patient.locator("select[name=language]").selectOption("ar");
  await patient.locator("input[name=name]").fill("Rehearsal Person Kilo");
  await patient.locator("textarea[name=reason]").fill("Synthetic reason (rehearsal)");
  await patient.locator("input[name=consentContact]").check();
  await patient.locator("input[name=aiNoticeAccepted]").check();
  await patient.getByRole("button", { name: "Check in" }).click();
  await expect(patient.getByTestId("checkin-done")).toContainText(/Your ID: A-\d{3}/);
  const id = (await patient.getByTestId("checkin-done").innerText()).match(/A-\d{3}/)![0];
  const card = nurse.getByTestId(`card-${id}`);
  await expect(card, "C1: registered card shows in Triage Waiting").toContainText("Call for triage", A4);

  // 3. Nurse: call for triage, complete triage with a priority.
  await card.getByRole("button", { name: "Call for triage" }).click();
  await card.getByRole("button", { name: "Complete triage" }).click();
  await expect(card.getByRole("button", { name: "Complete triage" })).toBeDisabled();
  await card.locator("input[type=number]").fill("2");
  await card.locator("textarea").fill("Synthetic triage note");
  await card.locator("form").getByRole("button", { name: "Complete triage" }).click();
  await expect(doctor.getByTestId(`queue-row-${id}`), "C3: in the doctor's queue").toBeVisible(A4);

  // 4. Patient: an enquiry and "I feel worse". The nurse inbox and card are flagged.
  await patient.getByTestId("enquiry-box").locator("textarea, input[type=text]").first().fill("How long will I wait?");
  await patient.getByTestId("enquiry-box").getByRole("button").first().click();
  await expect(patient.getByTestId("enquiry-sent")).toBeVisible();
  await patient.getByRole("button", { name: "I feel worse" }).click();
  await expect(patient.getByTestId("urgent-wording")).toBeVisible();
  await expect(card, "D7: Urgent chip on the card").toContainText("Urgent enquiry", A4);
  const inbox = nurse.getByLabel("Patient enquiries");
  await expect(inbox.getByTestId("inbox-item").first(), "D7: urgent item at the top of the inbox").toContainText(id, A4);

  // 5. Doctor: profile, Consult now. Nurse: escort, Patient is with the doctor.
  const row = doctor.getByTestId(`queue-row-${id}`);
  await row.getByRole("button", { name: "View profile" }).click();
  await expect(doctor.getByLabel("Patient profile")).toContainText("AI summary");
  await row.getByRole("button", { name: "Consult now" }).click();
  const escort = nurse.getByLabel("Escort requests");
  await expect(escort, "C4: escort request on the nurse board").toContainText(id, A4);
  await expect(patient.getByTestId("escort-alert"), "C4: the phone is alerted").toBeVisible(A4);
  await expect(doctor.getByRole("button", { name: "Start session" })).toBeDisabled();
  await nurse.getByTestId(`escort-${id}`).getByRole("button", { name: "Patient is with the doctor" }).click();

  // 6. Doctor: Start session (needs the nurse's confirmation and transcription consent).
  await doctor.getByLabel("The patient was informed and agreed to transcription").check();
  await expect(doctor.getByRole("button", { name: "Start session" }), "C6/E3: enabled after the nurse confirms").toBeEnabled(FIRST);
  await doctor.getByRole("button", { name: "Start session" }).click();
  await expect(doctor.getByTestId("session-ids")).toContainText(id);
  await expect(doctor.getByTestId("session-ids")).toContainText("D-03");
  await expect(card, "C6: card in Doctor Consultation").toContainText(/Dr Haddad|D-03/, A4);

  // 7. A planted wrong dose is caught and held; edit and recheck passes; Send delivers it.
  const typeLine = async (text: string) => {
    await doctor.getByLabel("Type a line").fill(text);
    await doctor.getByRole("button", { name: "Check translation" }).click();
  };
  await typeLine("Take 100 mg of paracetamol. Do not drive today. (plant wrong dose)");
  const first = doctor.getByTestId("message-card").first();
  await expect(first, "F1/F2: the wrong dose is caught and held").toContainText("Use the hospital interpreter service");
  await expect(first.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(patient.getByTestId("message-pending")).toBeVisible(A4);
  await first.getByRole("button", { name: "Edit and recheck" }).click();
  await first.getByLabel("Edit message").fill("Take 100 mg of paracetamol. Do not drive today.");
  await first.getByRole("button", { name: "Recheck", exact: true }).click();
  await expect(first.getByRole("button", { name: "Send" }), "checks pass after the edit").toBeEnabled();
  await expect(first).toContainText("The patient will read:");
  await expect(patient.getByTestId("session-messages")).not.toContainText("100 mg");
  await first.getByRole("button", { name: "Send" }).click();
  await expect(patient.getByTestId("session-messages"), "F3: the patient sees it only after Send").toContainText("100 mg", A4);

  // A consent line is held: the banner on the doctor screen, Escalate, and the nurse chip.
  await typeLine("Do you consent to the procedure?");
  const consent = doctor.getByTestId("message-card").nth(1);
  await expect(consent, "F4: consent lines are held").toContainText("Use the hospital interpreter service");
  await expect(consent.getByRole("button", { name: "Send" })).toBeDisabled();
  await consent.getByRole("button", { name: "Escalate" }).click();
  await expect(card, "F9: Interpreter needed chip on the nurse board").toContainText("Interpreter needed", A4);
  await expect(patient.getByTestId("session-messages")).not.toContainText("consent");

  // 8. Complete · send for tests (needs a signed note). Nurse: results back, Awaiting Decision.
  await doctor.getByLabel("Test name").fill("Bloods (demo)");
  await doctor.getByRole("button", { name: "Add test" }).click();
  await doctor.getByRole("button", { name: "Complete · send for tests" }).click();
  await expect(doctor.getByRole("alert").filter({ hasText: /sign/i }), "C8: unsigned note is refused").toBeVisible();
  await doctor.getByLabel(/I have reviewed this note and sign it/).check();
  await doctor.getByRole("button", { name: "Complete · send for tests" }).click();
  await expect(card, "C8: card in Diagnostics with the test listed").toContainText("Bloods (demo)", FIRST);
  await card.getByLabel("Bloods (demo) state").selectOption("results_back");
  await card.getByRole("button", { name: "Move to Awaiting Decision" }).click();

  // 9. Doctor: decision, verify and release the pack. Patient: pack and follow-up.
  const decision = doctor.getByLabel("Awaiting decision");
  const decRow = decision.locator("li, article, div", { hasText: id }).filter({ has: doctor.getByRole("button", { name: "Record decision" }) }).last();
  await decRow.getByRole("button", { name: "Record decision" }).click({ timeout: 5_000 });
  await decision.getByLabel("Results").fill("Demo results");
  await decision.getByLabel("Advice").fill("Demo advice");
  await decision.getByRole("button", { name: "Discharge" }).click();
  await expect(patient.getByTestId("pack-preparing"), "G2: preparing until release").toBeVisible(A4);
  await decision.getByRole("button", { name: "Verify pack" }).click();
  await decision.getByRole("button", { name: "Release pack" }).click();
  await expect(patient.getByTestId("results-pack"), "G4: pack after release").toBeVisible(A4);
  await expect(patient.getByTestId("follow-up")).toBeVisible();

  // 10. The audit chain verifies.
  const audit = await (await request.get("/api/demo/audit")).json();
  expect(audit.ok).toBe(true);
});
