import { describe, it, expect } from "vitest";
import el from "../../../messages/el.json";

// The Greek interface addresses a single person with both forms
// («ο/η μαθητής/τρια», «Διευθυντής/ντρια»). Generic plurals («μαθητές») stay
// as they are. This catches masculine-only singular wording creeping back in.
const MASCULINE_ONLY: RegExp[] = [
  /\bΟ μαθητής\b/i,
  /\bτον μαθητή\b/i,
  /\bτου μαθητή\b/i,
  /# μαθητής\b(?!\/)/,
  /\bΔιευθυντής\b(?!\/)/,
  /\bΥπεύθυνος\b(?!\/)/i,
  /\bεφημερεύ(ων|οντα)\b(?!\/)/i,
  /\bαυτός ο χρήστης\b/i,
  /\bΟ χρήστης\b/i,
  /^(Ενεργός|Ανενεργός|Μαθητής|Καθηγητής|Παρών|Απών)$/,
];

// Deliberate exceptions: [key, reason].
const ALLOW = new Map<string, string>([
  ["adminSettings.seInactive", "a special-ed code («κωδικός»), not a person"],
]);

function strings(x: unknown, path = ""): [string, string][] {
  if (typeof x === "string") return [[path, x]];
  if (x && typeof x === "object") {
    return Object.entries(x as Record<string, unknown>).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

describe("Greek wording uses both forms for a single person", () => {
  it("has no masculine-only singular references", () => {
    const offenders = strings(el)
      .filter(([k]) => !ALLOW.has(k))
      .filter(([, v]) => MASCULINE_ONLY.some((re) => re.test(v)))
      .map(([k, v]) => `${k}: ${v}`);
    expect(offenders).toEqual([]);
  });
});
