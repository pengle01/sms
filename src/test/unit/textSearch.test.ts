import { describe, it, expect } from "vitest";
import { stripDiacritics, normalizeSearch, matchesSearch, suggestionList } from "@/lib/textSearch";

describe("stripDiacritics (accent-insensitive matching, e.g. import headers)", () => {
  it("strips tonos so accented headers match plain-vowel patterns", () => {
    expect(stripDiacritics("Διευκόλυνση 1")).toBe("Διευκολυνση 1");
    // The special-ed import column resolver matches against the stripped header.
    expect(/διευκολ/i.test(stripDiacritics("Διευκόλυνση 1"))).toBe(true);
    // Regression guard: the raw accented header did NOT match before.
    expect(/διευκολ/i.test("Διευκόλυνση 1")).toBe(false);
  });

  it("handles the other ministry headers and leaves plain text unchanged", () => {
    expect(/παρατηρ/i.test(stripDiacritics("Παρατηρήσεις"))).toBe(true);
    expect(/αλλες\s*απαλλ/i.test(stripDiacritics("Άλλες Απαλλαγές"))).toBe(true);
    expect(/γαλλικ/i.test(stripDiacritics("Απαλλαγή Γαλλικών"))).toBe(true);
    expect(stripDiacritics("Αρ.Μητρ")).toBe("Αρ.Μητρ");
  });
});

describe("normalizeSearch", () => {
  it("lowercases and strips Greek accents", () => {
    expect(normalizeSearch("Μαθηματικά")).toBe("μαθηματικα");
    expect(normalizeSearch("ΦΥΣΙΚΉ")).toBe("φυσικη");
  });

  it("folds final sigma", () => {
    expect(normalizeSearch("Ελληνικός")).toBe("ελληνικοσ");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSearch("  Χημεία ")).toBe("χημεια");
  });
});

describe("matchesSearch", () => {
  it("matches accent-insensitively in both directions", () => {
    expect(matchesSearch("Μαθηματικά", "μαθημ")).toBe(true);
    expect(matchesSearch("ΦΥΣΙΚΗ", "φυσική")).toBe(true);
  });

  it("matches English case-insensitively", () => {
    expect(matchesSearch("English Literature", "literat")).toBe(true);
  });

  it("returns true for an empty query (no filter)", () => {
    expect(matchesSearch("anything", "")).toBe(true);
    expect(matchesSearch(null, "   ")).toBe(true);
  });

  it("returns false when the term is absent or the haystack is missing", () => {
    expect(matchesSearch("Μαθηματικά", "χημ")).toBe(false);
    expect(matchesSearch(null, "χημ")).toBe(false);
    expect(matchesSearch(undefined, "χημ")).toBe(false);
  });
});

describe("suggestionList", () => {
  it("dedupes and drops null/empty values", () => {
    expect(suggestionList(["Φυσική", "Φυσική", null, undefined, "  ", "Χημεία"])).toEqual([
      "Φυσική",
      "Χημεία",
    ]);
  });

  it("sorts with Greek collation", () => {
    expect(suggestionList(["Χημεία", "Άλγεβρα", "Βιολογία"])).toEqual([
      "Άλγεβρα",
      "Βιολογία",
      "Χημεία",
    ]);
  });

  it("returns an empty list for no usable values", () => {
    expect(suggestionList([null, undefined, ""])).toEqual([]);
  });
});
