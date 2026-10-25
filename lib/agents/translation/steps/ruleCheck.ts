// Rule checker (SPEC section 9 step 3). Pure functions, no AI.
// Extracts safety items from the source English and the back-translated English and compares them.
import drugsFile from "@/data/drugs.json";

export type Severity = "critical" | "warning";
export interface RuleError {
  kind: string;
  source: string;
  found: string | null;
  severity: Severity;
}
export interface RuleCheckResult {
  passed: boolean;
  errors: RuleError[];
}

export interface SafetyItems {
  numbers: string[];
  drugs: string[];
  negations: string[];
  allergy: string[];
  times: string[];
}

const DRUGS: string[] = (drugsFile as { drugs: string[] }).drugs.map((d) => d.toLowerCase());
// Longest first, so "do not" and "never use" are not also counted as "not" / "never".
const NEGATIONS = ["never use", "do not", "not", "no", "never", "avoid", "stop"];
const ALLERGY = ["allergic", "allergy", "reaction"];
const TIME_WORDS = ["today", "tomorrow", "daily", "twice", "morning", "evening"];
const UNITS = "mg|mcg|g|kg|ml|l|units?|tablets?|capsules?|puffs?|drops?|%";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function normalise(text: string): string {
  return text
    .replace(/\[\[[A-Z]+_\d+\]\]/g, " ") // pseudonym tokens
    .toLowerCase()
    .replace(/\b(do|does|did)n['’]t\b/g, "$1 not")
    .replace(/\bcan['’]t\b/g, "can not")
    .replace(/\bwon['’]t\b/g, "will not");
}

/** Removes each match from `text` so that later patterns cannot match it again. */
function take(text: { s: string }, re: RegExp, map: (m: RegExpExecArray) => string): string[] {
  const out: string[] = [];
  text.s = text.s.replace(re, (...args) => {
    const m = args.slice(0, -2) as unknown as RegExpExecArray;
    out.push(map(m));
    return " ";
  });
  return out;
}

export function extractSafetyItems(raw: string): SafetyItems {
  const t = { s: normalise(raw) };
  const times = take(t, /\bevery\s+(\d+(?:\.\d+)?)\s*(hours?|days?|weeks?)\b/g, (m) => `every ${m[1]} ${m[2]}`);
  const numbers = take(t, new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNITS})?(?![a-z])`, "g"), (m) =>
    m[2] ? `${m[1]} ${m[2]}` : m[1],
  );
  const words = (list: string[]) =>
    list.flatMap((w) => take(t, new RegExp(`(?<![a-z])${esc(w)}(?![a-z])`, "g"), () => w));
  const negations = words(NEGATIONS);
  times.push(...words(TIME_WORDS));
  return { numbers, drugs: words(DRUGS), negations, allergy: words(ALLERGY), times };
}

/** Items in `a` not matched in `b` (multiset difference). */
function missing(a: string[], b: string[]): string[] {
  const left = [...b];
  return a.filter((x) => {
    const i = left.indexOf(x);
    if (i === -1) return true;
    left.splice(i, 1);
    return false;
  });
}

export function ruleCheck(source: string, backTranslation: string): RuleCheckResult {
  const s = extractSafetyItems(source);
  const b = extractSafetyItems(backTranslation);
  const errors: RuleError[] = [];

  const compare = (kind: string, severity: Severity, srcItems: string[], backItems: string[], extraKind?: string) => {
    const lost = missing(srcItems, backItems);
    const added = missing(backItems, srcItems);
    for (const item of lost) errors.push({ kind, source: item, found: added.shift() ?? null, severity });
    if (extraKind) for (const item of added) errors.push({ kind: extraKind, source: "", found: item, severity });
  };

  compare("number_unit", "critical", s.numbers, b.numbers, "extra_number");
  compare("negation", "critical", s.negations, b.negations);
  compare("drug", "critical", s.drugs, b.drugs);
  compare("time", "warning", s.times, b.times);
  compare("allergy", "warning", s.allergy, b.allergy);

  return { passed: !errors.some((e) => e.severity === "critical"), errors };
}

export function hasSafetyItems(source: string): boolean {
  return Object.values(extractSafetyItems(source)).some((l) => l.length > 0);
}
