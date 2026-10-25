// Captures the README screenshots (docs/screenshots/*.png) by driving the real app through one patient's visit.
// Synthetic data only. Start a production server first, with its own database, e.g.:
//   DB_PATH=./care-loop-readme.db MOCK_AI=0 npx next start -p 3104
//   npx tsx scripts/readme-screenshots.ts
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.SHOTS_URL ?? "http://localhost:3104";
const OUT = path.resolve("docs/screenshots");
const AI = { timeout: 90_000 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(browser: Browser, url: string, phone = false): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    baseURL: BASE,
    reducedMotion: "reduce",
    ...(phone
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 }),
  });
  const page = await ctx.newPage();
  await page.goto(url);
  return { ctx, page };
}

/** `top` scrolls the page up first, so the sticky header does not sit over the content. */
async function shot(target: Page | Locator, name: string, top = false) {
  if (top && "goto" in target) await target.evaluate(() => window.scrollTo(0, 0));
  // A scrolled shot would have a sticky header sitting over the content.
  if (!top) await ("goto" in target ? target : target.page()).addStyleTag({ content: ".sticky { position: static !important; }" });
  await sleep(900);
  const file = path.join(OUT, `${name}.png`);
  await target.screenshot({ path: file });
  console.log("saved", path.relative(process.cwd(), file));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const api = (await browser.newContext({ baseURL: BASE })).request;
  // With real AI, the seed sends a burst of calls; SKIP_SEED=1 reuses an already seeded board.
  if (!process.env.SKIP_SEED) {
    const seeded = await api.post("/api/demo/seed", { timeout: 180_000 });
    if (!seeded.ok()) throw new Error(`Seed failed (${seeded.status()}): is the server running on ${BASE}?`);
    await api.post("/api/shift/close", { data: { actor: { role: "nurse", id: "N-01" } } });
  }

  // Role chooser
  const home = await open(browser, "/");
  await shot(home.page, "home", true);

  // Nurse starts the shift session (its entrance popup is replaced by a dedicated shot below) and reveals the code.
  const nurse = await open(browser, "/nurse");
  nurse.ctx.on("page", (p) => void p.close().catch(() => {}));
  const gate = nurse.page.getByTestId("start-session");
  await gate.or(nurse.page.getByTestId("shift-bar")).first().waitFor();
  if (await gate.isVisible()) await gate.getByRole("button", { name: "Start session" }).click();
  await nurse.page.getByTestId("reveal-code").click();
  const code = (await nurse.page.getByTestId("session-code").innerText()).trim();

  const entrance = await open(browser, "/entrance", true);
  await entrance.page.getByTestId("entrance-qr").locator("svg").waitFor();
  await shot(entrance.page, "entrance-qr", true);

  // Doctor joins with the code.
  const doctor = await open(browser, "/doctor?doctor=D-03");
  await doctor.page.locator("input[name=code]").fill(code);
  await doctor.page.getByRole("button", { name: "Join session" }).click();
  await doctor.page.getByTestId("live-status").waitFor();

  // Patient scans the QR (the link carries the code) and checks in, in Arabic.
  const patient = await open(browser, `/patient?s=${code}`, true);
  await patient.page.evaluate(() => localStorage.clear());
  await patient.page.reload();
  await patient.page.locator("select[name=language]").selectOption("ar");
  await patient.page.locator("input[name=name]").fill("Layla Nasser");
  await patient.page.locator("textarea[name=reason]").fill("ألم في الصدر منذ يومين");
  await patient.page.locator("input[name=consentContact]").check();
  await patient.page.locator("input[name=aiNoticeAccepted]").check();
  await shot(patient.page, "patient-checkin");
  await patient.page.getByRole("button", { name: /Check in|تسجيل/ }).click();
  await patient.page.getByTestId("checkin-done").waitFor(AI);
  const id = (await patient.page.getByTestId("checkin-done").innerText()).match(/A-\d{3}/)![0];

  // Nurse triages. The priority is the nurse's decision.
  const card = nurse.page.getByTestId(`card-${id}`);
  await card.getByRole("button", { name: "Call for triage" }).click(AI);
  await card.getByRole("button", { name: "Complete triage" }).click();
  await card.locator("input[type=number]").fill("2");
  await card.locator("textarea").fill("Chest pain for 2 days, worse on exertion. Obs stable.");
  await card.locator("form").getByRole("button", { name: "Complete triage" }).click();

  // Patient asks a question while waiting; the AI suggests a tier for the nurse's inbox.
  const box = patient.page.getByTestId("enquiry-box");
  await box.locator("textarea, input[type=text]").first().fill("كم من الوقت سأنتظر؟");
  await box.getByRole("button").first().click();
  await patient.page.getByTestId("enquiry-sent").waitFor(AI);
  await shot(patient.page, "patient-status", true);
  await nurse.page.getByLabel("Patient enquiries").getByTestId("inbox-item").first().waitFor(AI);
  await shot(nurse.page, "nurse-board", true);

  // Doctor: queue with the AI summary, then Consult now.
  const row = doctor.page.getByTestId(`queue-row-${id}`);
  await row.waitFor(AI);
  await row.getByRole("button", { name: "View profile" }).click();
  await doctor.page.getByLabel("Patient profile").waitFor();
  await shot(doctor.page, "doctor-queue", true);
  await row.getByRole("button", { name: "Consult now" }).click();
  await nurse.page.getByTestId(`escort-${id}`).getByRole("button", { name: "Patient is with the doctor" }).click(AI);
  await doctor.page.getByLabel("The patient was informed and agreed to transcription").check();
  await doctor.page.getByRole("button", { name: "Start session" }).click(AI);

  // Consultation: typed lines, translated and checked before the doctor can send them.
  const say = async (text: string, asPatient = false) => {
    const composer = doctor.page.getByTestId("line-composer");
    const before = await doctor.page.getByTestId("message-card").count();
    if (asPatient) await composer.getByRole("checkbox").check();
    await composer.getByLabel("Type a line").fill(text);
    await composer.getByRole("button", { name: "Check translation" }).click();
    if (asPatient) await composer.getByRole("checkbox").uncheck();
    const card = doctor.page.getByTestId("message-card").nth(before);
    await card.waitFor(AI);
    await sleep(4000); // keeps Gemini calls under the free plan's per-minute limit
    return card;
  };
  const sendWhenReady = async (card: Locator) => {
    const send = card.getByRole("button", { name: "Send" });
    await send.and(doctor.page.locator(":enabled")).waitFor(AI);
    await send.click();
    await card.getByText("Delivered").or(card.getByText("Sent")).first().waitFor(AI).catch(() => {});
  };
  await sendWhenReady(await say("How long have you had the chest pain?"));
  const answer = await say("أشعر بألم في صدري منذ يومين", true);
  await answer.getByText(/AI-checked|Needs checking/).waitFor(AI);
  await sendWhenReady(await say("Take 5 mg of amlodipine once a day. Do not drive today."));
  const consent = await say("Do you consent to the procedure?");
  await consent.getByText("Use the hospital interpreter service").waitFor(AI);
  await doctor.page.getByLabel("Clinical Assessment").getByTestId("ai-draft-label").first().waitFor(AI);
  await sleep(2500);
  await shot(doctor.page.getByLabel("Session in progress"), "doctor-consultation");
  await patient.page.getByTestId("session-messages").scrollIntoViewIfNeeded();
  await shot(patient.page, "patient-messages");

  // Sign and send for tests; AI drafts follow-ups for the doctor to confirm.
  await doctor.page.getByLabel("Test name").fill("Bloods");
  await doctor.page.getByRole("button", { name: "Add test" }).click();
  await doctor.page.getByLabel(/I have reviewed this assessment and sign it/).check();
  await doctor.page.getByRole("button", { name: "Complete · send for tests" }).click();
  const nav = doctor.page.getByTestId("doctor-nav");
  await nav.getByRole("tab", { name: /Follow-ups/ }).click();
  await doctor.page.getByTestId("follow-ups").locator("article").first().waitFor(AI);
  await shot(doctor.page, "doctor-follow-ups", true);
  await nav.getByRole("tab", { name: "Home" }).click();

  // Results back; the nurse opens the visit overview.
  await card.getByLabel("Bloods state").selectOption("results_back", AI);
  await card.getByRole("button", { name: "Move to Awaiting Decision" }).click();
  await card.click({ position: { x: 8, y: 40 } });
  await nurse.page.getByTestId("visit-overview").waitFor();
  await shot(nurse.page, "nurse-overview", true);

  // Decision and results pack, released by the doctor, read on the phone in Arabic.
  const decision = doctor.page.getByLabel("Awaiting decision");
  const decRow = decision.locator("li, article, div", { hasText: id }).filter({ has: doctor.page.getByRole("button", { name: "Record decision" }) }).last();
  await decRow.getByRole("button", { name: "Record decision" }).click(AI);
  await decision.getByLabel("Results").fill("Blood tests normal. ECG normal.");
  await decision.getByLabel("Advice").fill("Rest today. Come back at once if the pain gets worse or you feel short of breath.");
  await decision.getByRole("button", { name: "Discharge" }).click();
  await decision.getByRole("button", { name: "Verify pack" }).click(AI);
  await decision.getByRole("button", { name: "Release pack" }).click(AI);
  await patient.page.getByTestId("results-pack").waitFor(AI);
  await patient.page.getByTestId("results-pack").scrollIntoViewIfNeeded();
  await shot(patient.page, "patient-results");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
