import { describe, it, expect } from "vitest";
import {
  mayDeactivateLogin,
  parseHandover,
  subjectPrefix,
  suggestReplacement,
  testOwnerAfter,
} from "@/lib/teacherHandover";

describe("suggestReplacement", () => {
  it("reads the subject from the timetable name", () => {
    expect(subjectPrefix("ΗΥ-ΜΑΣΙΑ Μ. ΒΔ")).toBe("ΗΥ");
    expect(subjectPrefix("ΜΑΣΙΑ")).toBeNull();
  });

  it("suggests the only newcomer of the same subject", () => {
    expect(suggestReplacement("ΗΥ-ΜΑΣΙΑ Μ.", ["ΗΥ-ΠΕΤΡΟΥ Α.", "ΜΑΘ-ΚΩΣΤΑ Γ."])).toBe("ΗΥ-ΠΕΤΡΟΥ Α.");
  });

  it("suggests nobody when none or several match", () => {
    expect(suggestReplacement("ΗΥ-ΜΑΣΙΑ Μ.", ["ΜΑΘ-ΚΩΣΤΑ Γ."])).toBeNull();
    expect(suggestReplacement("ΗΥ-ΜΑΣΙΑ Μ.", ["ΗΥ-Α", "ΗΥ-Β"])).toBeNull();
  });
});

describe("parseHandover", () => {
  const inFile = new Set(["ΗΥ-ΝΕΟΣ", "ΜΑΘ-ΑΛΛΟΣ"]);
  const row = (o: object) => JSON.stringify([o]);

  it("keeps a valid choice", () => {
    expect(
      parseHandover(
        row({ left: "ΗΥ-ΠΑΛΙΟΣ", replacement: "ΗΥ-ΝΕΟΣ", designations: ["itManager"], deactivateLogin: true }),
        ["ΗΥ-ΠΑΛΙΟΣ"],
        inFile,
      ),
    ).toEqual([{ left: "ΗΥ-ΠΑΛΙΟΣ", replacement: "ΗΥ-ΝΕΟΣ", designations: ["itManager"], deactivateLogin: true }]);
  });

  it("ignores someone who has not left, and repeated rows", () => {
    expect(parseHandover(row({ left: "ΜΑΘ-ΑΛΛΟΣ" }), ["ΗΥ-ΠΑΛΙΟΣ"], inFile)).toEqual([]);
    const twice = JSON.stringify([{ left: "ΗΥ-ΠΑΛΙΟΣ" }, { left: "ΗΥ-ΠΑΛΙΟΣ", replacement: "ΗΥ-ΝΕΟΣ" }]);
    expect(parseHandover(twice, ["ΗΥ-ΠΑΛΙΟΣ"], inFile)).toHaveLength(1);
  });

  it("drops a replacement outside the file, and its designations with it", () => {
    expect(
      parseHandover(row({ left: "ΗΥ-ΠΑΛΙΟΣ", replacement: "ΞΕΝΟΣ", designations: ["itManager"] }), ["ΗΥ-ΠΑΛΙΟΣ"], inFile),
    ).toEqual([{ left: "ΗΥ-ΠΑΛΙΟΣ", replacement: null, designations: [], deactivateLogin: false }]);
  });

  it("drops an unknown designation", () => {
    const [e] = parseHandover(
      row({ left: "ΗΥ-ΠΑΛΙΟΣ", replacement: "ΗΥ-ΝΕΟΣ", designations: ["isAdmin", "ddkCoordinator"] }),
      ["ΗΥ-ΠΑΛΙΟΣ"],
      inFile,
    );
    expect(e!.designations).toEqual(["ddkCoordinator"]);
  });

  it("returns nothing for missing or malformed input", () => {
    expect(parseHandover(null, ["Α"], inFile)).toEqual([]);
    expect(parseHandover("not json", ["Α"], inFile)).toEqual([]);
    expect(parseHandover('{"left":"Α"}', ["Α"], inFile)).toEqual([]);
  });
});

describe("testOwnerAfter", () => {
  it("gives the test to the existing colleague who took the lesson", () => {
    expect(testOwnerAfter(["ΜΑΘ-ΑΛΛΟΣ"], "ΜΑΘ-ΝΕΟΣ")).toBe("ΜΑΘ-ΑΛΛΟΣ");
  });

  it("gives it to the only teacher even with no replacement", () => {
    expect(testOwnerAfter(["ΜΑΘ-ΑΛΛΟΣ", "ΜΑΘ-ΑΛΛΟΣ"], null)).toBe("ΜΑΘ-ΑΛΛΟΣ");
  });

  it("prefers the replacement when it is among several teachers", () => {
    expect(testOwnerAfter(["Α", "ΜΑΘ-ΝΕΟΣ"], "ΜΑΘ-ΝΕΟΣ")).toBe("ΜΑΘ-ΝΕΟΣ");
  });

  it("falls back to the replacement when nobody teaches it, or several others do", () => {
    expect(testOwnerAfter([], "ΜΑΘ-ΝΕΟΣ")).toBe("ΜΑΘ-ΝΕΟΣ");
    expect(testOwnerAfter(["Α", "Β"], "ΜΑΘ-ΝΕΟΣ")).toBe("ΜΑΘ-ΝΕΟΣ");
  });

  it("leaves the test in place with nobody to take it", () => {
    expect(testOwnerAfter([], null)).toBeNull();
    expect(testOwnerAfter(["Α", "Β"], null)).toBeNull();
  });
});

describe("mayDeactivateLogin", () => {
  const base = { targetUserId: "t", actorUserId: "a", targetRole: "TEACHER", targetExtraRoles: [] };

  it("allows an ordinary account", () => {
    expect(mayDeactivateLogin(base)).toBe(true);
  });

  it("never switches off the acting admin or another admin", () => {
    expect(mayDeactivateLogin({ ...base, targetUserId: "a" })).toBe(false);
    expect(mayDeactivateLogin({ ...base, targetRole: "SUPER_ADMIN" })).toBe(false);
    expect(mayDeactivateLogin({ ...base, targetExtraRoles: ["SUPER_ADMIN"] })).toBe(false);
  });
});
