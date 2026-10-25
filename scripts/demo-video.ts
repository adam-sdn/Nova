// Records a captioned demo video of the full Nova Systems loop: patient phone, nurse board and doctor, driven
// through the real app (synthetic data, MOCK_AI). Usage, with a production server running on DEMO_URL:
//   npx tsx scripts/demo-video.ts [out.webm]
// Optional DEMO_VOICE_WAV: a 16-bit PCM WAV of the doctor saying VOICE_LINE, fed to Chromium as the microphone.
import { chromium, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.DEMO_URL ?? "http://localhost:3101";
const OUT = path.resolve(process.argv[2] ?? "demo-video/nova-systems-demo.webm");
const VOICE_WAV = process.env.DEMO_VOICE_WAV;
const VOICE_LINE = "How long have you had the pain?";
const W = 1920;
const H = 1080;
const FPS = 25;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function playwrightFfmpeg(): string {
  const root = path.join(process.env.LOCALAPPDATA ?? path.join(process.env.HOME ?? "", ".cache"), "ms-playwright");
  const dir = readdirSync(root).filter((d) => d.startsWith("ffmpeg-")).sort().pop();
  if (!dir) throw new Error(`No Playwright ffmpeg in ${root}`);
  const exe = readdirSync(path.join(root, dir)).find((f) => f.startsWith("ffmpeg"));
  return path.join(root, dir, exe!);
}

function wavSeconds(file: string): number {
  const b = readFileSync(file);
  return b.readUInt32LE(40) / b.readUInt32LE(28);
}

const STAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Nova Systems demo</title><style>
:root{--ground:#E5E4E2;--onyx:#0A0A0A;--graphite:#24282D;--muted:#667085;--accent:#087F8C}
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden}
body{background:var(--ground);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--onyx);
  background-image:radial-gradient(1200px 700px at 70% 30%,rgba(255,255,255,.65),transparent 70%)}
header{position:absolute;left:48px;right:48px;top:22px;height:44px;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:12px;font-size:22px;font-weight:650;letter-spacing:-.01em}
.mark{width:30px;height:30px;border-radius:6px;background:var(--onyx);display:grid;place-items:center;color:#fff;font-size:15px;font-weight:700}
.tag{font-size:13px;font-weight:500;color:var(--muted);border:1px solid rgba(10,10,10,.12);border-radius:4px;padding:5px 9px;background:rgba(255,255,255,.6)}
.label{position:absolute;font-size:13px;font-weight:600;color:var(--graphite);letter-spacing:.01em}
#phone{position:absolute;left:48px;top:100px;width:414px;height:868px;border-radius:46px;background:var(--onyx);padding:12px;
  box-shadow:0 30px 60px -20px rgba(10,10,10,.35)}
#phone iframe{width:390px;height:844px;border:0;border-radius:36px;background:#fff;display:block}
#staff{position:absolute;left:504px;top:100px;width:1368px;height:868px;border-radius:10px;overflow:hidden;background:#fff;
  box-shadow:0 0 0 1px rgba(10,10,10,.08),0 30px 60px -24px rgba(10,10,10,.3)}
#staff iframe{position:absolute;inset:0;width:100%;height:100%;border:0;transition:opacity .45s ease,transform .45s ease}
#staff iframe.off{opacity:0;transform:scale(.985);pointer-events:none}
#caption{position:absolute;left:48px;right:48px;bottom:24px;min-height:76px;border-radius:10px;background:var(--onyx);color:#fff;
  display:flex;align-items:center;gap:18px;padding:16px 24px;transition:opacity .3s}
#step{flex:none;font-size:13px;font-weight:700;color:#fff;background:var(--accent);border-radius:4px;padding:6px 10px;letter-spacing:.02em}
#text{font-size:25px;font-weight:500;line-height:1.3;letter-spacing:-.005em}
#text small{display:block;font-size:16px;color:#B5BCC6;font-weight:400;margin-top:3px}
#card{position:absolute;inset:0;background:var(--onyx);color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 160px;
  transition:opacity .7s ease;z-index:10}
#card.off{opacity:0;pointer-events:none}
#card h1{font-size:76px;margin:0;letter-spacing:-.03em;font-weight:700}
#card p{font-size:28px;color:#C9CED6;margin:18px 0 0;max-width:1300px;line-height:1.35}
#card ul{margin:34px 0 0;padding:0;list-style:none;font-size:24px;color:#E7EAEE;line-height:1.75}
#card li::before{content:"";display:inline-block;width:10px;height:10px;background:var(--accent);margin-right:16px;border-radius:2px;vertical-align:middle}
#card .foot{position:absolute;left:160px;bottom:70px;font-size:17px;color:#8B93A0}
</style></head><body>
<header><div class="brand"><div class="mark">N</div>Nova Systems</div><span class="tag">Live demo · synthetic patients · AI in demo mode</span></header>
<span class="label" style="left:58px;top:78px">Patient's phone</span>
<span class="label" id="staffLabel" style="left:506px;top:78px">Nurse board</span>
<div id="phone"><iframe id="patient" name="patient"></iframe></div>
<div id="staff"><iframe id="nurse" name="nurse"></iframe><iframe id="doctor" name="doctor" class="off"></iframe></div>
<div id="caption"><span id="step">1 / 9</span><div id="text"></div></div>
<div id="card"><h1 id="cardTitle"></h1><p id="cardSub"></p><ul id="cardList"></ul><div class="foot">Synthetic data only · not for clinical use</div></div>
</body></html>`;

async function main() {
  mkdirSync(path.dirname(OUT), { recursive: true });
  const voiceArgs =
    VOICE_WAV && existsSync(VOICE_WAV)
      ? ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${VOICE_WAV}%noloop`]
      : [];
  const browser = await chromium.launch({ args: voiceArgs });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await context.grantPermissions(["microphone"], { origin: BASE });
  const page = await context.newPage();
  // The nurse's Start session opens the entrance window as a popup; the stage shows the entrance in the phone instead.
  context.on("page", (p) => {
    if (p !== page) void p.waitForLoadState().then(() => p.close()).catch(() => {});
  });
  await page.route(`${BASE}/__stage`, (r) => r.fulfill({ contentType: "text/html", body: STAGE }));

  // Reset the demo database: seeded board, no open shift session.
  const api = context.request;
  if (!(await api.post(`${BASE}/api/demo/seed`)).ok()) throw new Error(`Cannot reach ${BASE}: start the server first`);
  await api.post(`${BASE}/api/shift/close`, { data: { actor: { role: "nurse", id: "N-01" } } });

  await page.goto(`${BASE}/__stage`);
  const P = page.frameLocator("#patient");
  const N = page.frameLocator("#nurse");
  const D = page.frameLocator("#doctor");

  // ---- recorder: CDP screencast frames saved with their times; encoded after the run (VP9 is slower than real time) ----
  const framesDir = mkdtempSync(path.join(os.tmpdir(), "nova-demo-"));
  const frames: { file: string; t: number }[] = [];
  const cdp = await context.newCDPSession(page);
  const t0 = Date.now();
  cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
    const file = path.join(framesDir, `${frames.length}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: Date.now() - t0 });
    void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

  // ---- stage helpers ----
  let stepNo = 0;
  const TOTAL = 9;
  const caption = async (text: string, sub = "", next = true) => {
    if (next) stepNo++;
    await page.evaluate(
      ([t, s, n]) => {
        document.getElementById("text")!.innerHTML = `${t}${s ? `<small>${s}</small>` : ""}`;
        document.getElementById("step")!.textContent = n;
      },
      [text, sub, `${stepNo} / ${TOTAL}`],
    );
  };
  const show = async (who: "nurse" | "doctor") => {
    await page.evaluate((w) => {
      document.getElementById("nurse")!.classList.toggle("off", w !== "nurse");
      document.getElementById("doctor")!.classList.toggle("off", w !== "doctor");
      document.getElementById("staffLabel")!.textContent = w === "nurse" ? "Nurse board" : "Doctor · Dr Haddad";
    }, who);
    await sleep(600);
  };
  const card = async (title: string, sub: string, list: string[] = [], on = true) => {
    await page.evaluate(
      ([t, s, l, o]) => {
        document.getElementById("cardTitle")!.textContent = t as string;
        document.getElementById("cardSub")!.textContent = s as string;
        document.getElementById("cardList")!.innerHTML = (l as string[]).map((x) => `<li>${x}</li>`).join("");
        document.getElementById("card")!.classList.toggle("off", !o);
      },
      [title, sub, list, on] as const,
    );
  };
  const load = (id: string, url: string) => page.evaluate(([i, u]) => ((document.getElementById(i) as HTMLIFrameElement).src = u), [id, `${BASE}${url}`]);
  const point = async (loc: Locator, ms = 650) => {
    await loc.scrollIntoViewIfNeeded();
    await loc.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const ring = document.createElement("div");
      ring.style.cssText = `position:fixed;left:${r.left - 5}px;top:${r.top - 5}px;width:${r.width + 10}px;height:${r.height + 10}px;border:3px solid #087F8C;border-radius:7px;box-shadow:0 0 0 7px rgba(8,127,140,.16);pointer-events:none;z-index:2147483647;transition:opacity .45s`;
      document.body.appendChild(ring);
      setTimeout(() => {
        ring.style.opacity = "0";
        setTimeout(() => ring.remove(), 500);
      }, 1000);
    });
    await sleep(ms);
  };
  const tap = async (loc: Locator, after = 500) => {
    await point(loc);
    await loc.click();
    await sleep(after);
  };
  const type = async (loc: Locator, text: string) => {
    await point(loc, 300);
    await loc.click();
    await loc.fill("");
    await loc.pressSequentially(text, { delay: 26 });
    await sleep(350);
  };
  const seen = (loc: Locator, timeout = 15_000) => loc.first().waitFor({ state: "visible", timeout });
  const text = (frame: FrameLocator, t: string | RegExp) => frame.getByText(t).first();

  try {
    // ---------------------------------------------------------------- title
    await card(
      "Nova Systems",
      "Emergency department patient flow. AI agents take the paperwork; nurses and doctors make every decision.",
      [],
    );
    await load("nurse", "/nurse");
    await load("doctor", "/doctor?doctor=D-03");
    await load("patient", "/entrance");
    await sleep(4500);
    await card("", "", [], false);
    await sleep(800);

    // ---------------------------------------------------------------- 1. shift
    await caption("The nurse in charge starts the shift session.", "It creates a code for doctors and opens a check-in QR at the ward entrance.");
    await seen(N.getByTestId("start-session"));
    await sleep(1200);
    await tap(N.getByTestId("start-session").getByRole("button", { name: "Start session" }), 1200);
    await seen(N.getByTestId("reveal-code"));
    await tap(N.getByTestId("reveal-code"), 1500);
    const code = (await N.getByTestId("session-code").innerText()).trim();
    await seen(P.getByTestId("entrance-qr").locator("svg"));
    await point(P.getByTestId("entrance-qr"), 1500);

    // ---------------------------------------------------------------- 2. doctor joins
    await caption("Dr Haddad joins the board with the session code.");
    await show("doctor");
    await type(D.locator("input[name=code]"), code);
    await tap(D.getByRole("button", { name: "Join session" }), 1800);
    await seen(D.getByTestId("live-status").filter({ hasText: "Live" }));
    await point(D.getByLabel("Ready to be consulted"), 1600);

    // ---------------------------------------------------------------- 3. patient check-in
    await caption("A patient scans the QR and checks in on her own phone, in Arabic.", "Name, reason and consent. She gets an ID; staff boards show the ID, not her name.");
    await show("nurse");
    await load("patient", `/patient?s=${code}`);
    await seen(P.locator("select[name=language]"));
    await P.locator("select[name=language]").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await point(P.locator("select[name=language]"), 300);
    await P.locator("select[name=language]").selectOption("ar");
    await sleep(700);
    await type(P.locator("input[name=name]"), "Mariam Saleh");
    await type(P.locator("textarea[name=reason]"), "ألم في الصدر منذ يومين");
    await tap(P.locator("input[name=consentContact]"), 250);
    await tap(P.locator("input[name=aiNoticeAccepted]"), 250);
    await tap(P.getByRole("button", { name: "Check in" }), 1000);
    await seen(P.getByTestId("checkin-done"));
    const id = (await P.getByTestId("checkin-done").innerText()).match(/A-\d{3}/)![0];
    await point(P.getByTestId("checkin-done"), 900);
    const nurseCard = N.getByTestId(`card-${id}`);
    await seen(nurseCard);
    await point(nurseCard, 2200);

    // ---------------------------------------------------------------- 4. triage + enquiry
    await caption("The nurse triages her. The priority is the nurse's decision, not the AI's.");
    await tap(nurseCard.getByRole("button", { name: "Call for triage" }), 900);
    await tap(nurseCard.getByRole("button", { name: "Complete triage" }), 700);
    await type(nurseCard.locator("input[type=number]"), "2");
    await type(nurseCard.locator("textarea"), "Chest pain for 2 days. Obs stable.");
    await tap(nurseCard.locator("form").getByRole("button", { name: "Complete triage" }), 1500);

    await caption("While she waits, she can ask a question from her phone.", "The AI suggests a priority for the nurse's inbox. It can raise a priority, never lower one.", false);
    const box = P.getByTestId("enquiry-box");
    await seen(box);
    await type(box.locator("textarea, input[type=text]").first(), "How long will I wait?");
    await tap(box.getByRole("button").first(), 1200);
    await point(N.getByLabel("Patient enquiries"), 2400);

    // ---------------------------------------------------------------- 5. consult + escort
    await caption("Dr Haddad sees her in the queue, with an AI summary, and calls her in.", "The nurse is asked to escort her; her phone tells her where to go.");
    await show("doctor");
    const row = D.getByTestId(`queue-row-${id}`);
    await seen(row);
    await tap(row.getByRole("button", { name: "View profile" }), 900);
    await point(D.getByLabel("Patient profile"), 2000);
    await tap(row.getByRole("button", { name: "Consult now" }), 1200);
    await show("nurse");
    await seen(N.getByTestId(`escort-${id}`));
    await point(N.getByLabel("Escort requests"), 900);
    await point(P.getByTestId("escort-alert"), 1400);
    await tap(N.getByTestId(`escort-${id}`).getByRole("button", { name: "Patient is with the doctor" }), 1000);
    await show("doctor");
    await tap(D.getByLabel("The patient was informed and agreed to transcription"), 500);
    await tap(D.getByRole("button", { name: "Start session" }), 1800);

    // ---------------------------------------------------------------- 6. voice
    await caption("In the consultation, the doctor holds a button and speaks.", "Speech is turned into text on this computer (OpenWhispr, local). The microphone is only on while the button is held.");
    const hold = D.getByTestId("hold-doctor");
    await seen(hold);
    let typedInstead = !VOICE_WAV;
    if (VOICE_WAV) {
      await point(hold, 500);
      const b = (await hold.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await sleep(wavSeconds(VOICE_WAV) * 1000 + 700);
      await page.mouse.up();
      const review = D.getByTestId("voice-review");
      const failed = D.getByTestId("voice-panel").getByRole("alert");
      await Promise.race([seen(review, 90_000), seen(failed, 90_000)]);
      if (await review.isVisible()) {
        const heard = review.locator("textarea");
        await point(heard, 1800);
        if ((await heard.inputValue()).trim() !== VOICE_LINE) {
          await caption("Nothing is sent until the doctor has read it. Here a missed word is fixed.", "Medicine names and doses get extra care at this step.", false);
          await type(heard, VOICE_LINE);
          await sleep(800);
        }
        await tap(review.getByRole("button", { name: "Check translation" }), 600);
      } else typedInstead = true;
    }
    if (typedInstead) {
      await type(D.getByLabel("Type a line"), VOICE_LINE);
      await tap(D.getByRole("button", { name: "Check translation" }), 600);
    }
    await caption("Every line is translated and checked before the doctor can send it.", "Translation, back-translation and an AI verifier from three different model families, plus fixed safety rules.", false);
    const firstMsg = D.getByTestId("message-card").last();
    await seen(firstMsg.getByRole("button", { name: "Send" }));
    await point(firstMsg, 2200);
    await tap(firstMsg.getByRole("button", { name: "Send" }), 900);
    await point(P.getByTestId("session-messages"), 2400);

    // ---------------------------------------------------------------- 7. safety catch
    await caption("The checks catch errors. For this demo a fault is planted: the translation doubles the dose.");
    await type(D.getByLabel("Type a line"), "Take 100 mg of paracetamol. Do not drive today. (plant wrong dose)");
    await tap(D.getByRole("button", { name: "Check translation" }), 800);
    const doseMsg = D.getByTestId("message-card").last();
    await seen(doseMsg.getByText("Use the hospital interpreter service"));
    await point(doseMsg, 2600);
    await caption("The line is held: Send is disabled. The doctor edits it and the checks run again.", "The patient never saw the wrong version.", false);
    await tap(doseMsg.getByRole("button", { name: "Edit and recheck" }), 500);
    await type(doseMsg.getByLabel("Edit message"), "Take 100 mg of paracetamol. Do not drive today.");
    await tap(doseMsg.getByRole("button", { name: "Recheck", exact: true }), 1200);
    await seen(doseMsg.getByRole("button", { name: "Send", disabled: false }));
    await tap(doseMsg.getByRole("button", { name: "Send" }), 1500);

    // ---------------------------------------------------------------- 8. assessment + follow-ups
    await caption("The AI drafts the Clinical Assessment from the conversation.", "Each section shows which lines it came from. The doctor corrects it and signs; nothing is signed automatically.");
    const assessment = D.getByLabel("Clinical Assessment");
    await seen(assessment.getByTestId("ai-draft-label"));
    await point(assessment, 2600);
    await type(assessment.getByLabel("Plan"), "Bloods. Recheck pain in 2 hours.");
    await type(D.getByLabel("Test name"), "Bloods (demo)");
    await tap(D.getByRole("button", { name: "Add test" }), 500);
    await tap(D.getByLabel(/I have reviewed this assessment and sign it/), 600);
    await tap(D.getByRole("button", { name: "Complete · send for tests" }), 1800);
    await caption("Follow-up tasks are drafted from the signed note, for the doctor to confirm.", "", false);
    const nav = D.getByTestId("doctor-nav");
    await tap(nav.getByRole("tab", { name: /Follow-ups/ }), 1000);
    const fu = D.getByTestId("follow-ups");
    const bloods = fu.locator("article", { hasText: "Review result: Bloods (demo)" });
    await seen(bloods);
    await point(fu, 1800);
    await tap(bloods.getByRole("button", { name: "Confirm" }), 1500);
    await tap(nav.getByRole("tab", { name: "Home" }), 700);

    // ---------------------------------------------------------------- 9. results, decision, discharge
    await caption("Results come back. The doctor records the outcome and releases a results pack in Arabic.", "The patient sees it only after the doctor verifies and releases it.");
    await show("nurse");
    await seen(nurseCard.getByText("Bloods (demo)"));
    await point(nurseCard, 1200);
    await nurseCard.getByLabel("Bloods (demo) state").selectOption("results_back");
    await sleep(700);
    await tap(nurseCard.getByRole("button", { name: "Move to Awaiting Decision" }), 1200);
    await show("doctor");
    const decision = D.getByLabel("Awaiting decision");
    const decRow = decision.locator("li, article, div", { hasText: id }).filter({ has: D.getByRole("button", { name: "Record decision" }) }).last();
    await tap(decRow.getByRole("button", { name: "Record decision" }), 900);
    await type(decision.getByLabel("Results"), "Blood tests normal.");
    await type(decision.getByLabel("Advice"), "Rest today. Come back if the pain gets worse.");
    await tap(decision.getByRole("button", { name: "Discharge" }), 1200);
    await tap(decision.getByRole("button", { name: "Verify pack" }), 900);
    await tap(decision.getByRole("button", { name: "Release pack" }), 1200);
    await seen(P.getByTestId("results-pack"));
    await point(P.getByTestId("results-pack"), 2600);

    await caption("The nurse closes the visit from the board. Her phone keeps the summary.", "", false);
    await show("nurse");
    await nurseCard.click({ position: { x: 8, y: 40 } });
    const overview = N.getByTestId("visit-overview");
    await seen(overview);
    await point(overview, 1600);
    await tap(overview.getByRole("button", { name: "End visit" }), 900);
    await tap(N.getByRole("dialog").getByRole("button", { name: "Confirm end visit" }), 1200);
    await seen(P.getByTestId("visit-ended"));
    await point(P.getByTestId("visit-ended"), 2600);

    // ---------------------------------------------------------------- outro
    await card(
      "Nova Systems",
      "AI drafts. People decide.",
      [
        "Patients check in and ask questions from their own phone, in their language",
        "Every translated line is checked by three model families and fixed rules",
        "Speech stays on the device; names are removed before any AI call",
        "Notes, follow-ups and results packs are drafted for staff to confirm",
      ],
    );
    await sleep(7000);
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => {});
    await browser.close();
  }
  const seconds = await encode(frames, (Date.now() - t0) / 1000);
  rmSync(framesDir, { recursive: true, force: true });
  console.log(`Saved ${OUT} (${seconds.toFixed(0)} s)`);
}

/** Lay the saved frames on a fixed 25 fps timeline (repeating each until the next) and encode VP9 WebM. */
async function encode(frames: { file: string; t: number }[], seconds: number): Promise<number> {
  if (frames.length === 0) throw new Error("No frames were captured");
  const ff = spawn(playwrightFfmpeg(), [
    "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "pipe:0",
    "-y", "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-crf", "26", "-b:v", "0",
    "-deadline", "good", "-cpu-used", "4", "-row-mt", "1", "-tile-columns", "2", OUT,
  ]);
  const closed = new Promise<number | null>((r) => ff.on("close", r));
  ff.stderr.on("data", (d) => process.stderr.write(d));
  const total = Math.ceil(seconds * FPS);
  let i = 0;
  let current = readFileSync(frames[0].file);
  for (let n = 0; n < total; n++) {
    const t = (n / FPS) * 1000;
    let changed = false;
    while (i + 1 < frames.length && frames[i + 1].t <= t) {
      i++;
      changed = true;
    }
    if (changed) current = readFileSync(frames[i].file);
    if (!ff.stdin.write(current)) await new Promise((r) => ff.stdin.once("drain", r));
    if (n % (FPS * 30) === 0) process.stdout.write(`encoding ${Math.round((n / total) * 100)}%\r`);
  }
  ff.stdin.end();
  if ((await closed) !== 0) throw new Error("ffmpeg failed");
  return total / FPS;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
