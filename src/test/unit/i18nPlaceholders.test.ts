import { describe, it, expect } from "vitest";
import el from "../../../messages/el.json";
import en from "../../../messages/en.json";

// Messages are ICU MessageFormat: `{name}` is a value the code must pass in.
// Text meant to be SHOWN in braces (e.g. the absence-SMS fields «{όνομα}») must
// be quoted — '{όνομα}' — or next-intl reports FORMATTING_ERROR and renders the
// raw key instead of the sentence. Every real argument in this codebase has an
// ASCII name, so a non-ASCII one is literal text that lost its quotes.

function strings(x: unknown, path = ""): [string, string][] {
  if (typeof x === "string") return [[path, x]];
  if (x && typeof x === "object") {
    return Object.entries(x as Record<string, unknown>).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

/** Simple `{name}` arguments outside quoted text. Plural/select forms contain commas and are skipped. */
function simpleArguments(message: string): string[] {
  const unquoted = message.replace(/'[^']*'/g, "");
  return [...unquoted.matchAll(/\{([^{},\s]+)\}/g)].map((m) => m[1]!);
}

describe("message placeholders", () => {
  for (const [lang, messages] of [["el", el], ["en", en]] as const) {
    it(`${lang}: every {argument} is a real ASCII variable name`, () => {
      const bad = strings(messages).flatMap(([k, v]) =>
        simpleArguments(v)
          .filter((a) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(a))
          .map((a) => `${k}: {${a}}`),
      );
      expect(bad).toEqual([]);
    });
  }

  it("shows the absence-SMS fields as text", () => {
    expect(simpleArguments(el.adminSettings.absenceSmsPlaceholders)).toEqual([]);
    expect(simpleArguments(en.adminSettings.absenceSmsPlaceholders)).toEqual([]);
  });
});
