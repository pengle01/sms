import { describe, it, expect } from "vitest";
import { pickQueryString } from "@/lib/listFilters";

describe("pickQueryString", () => {
  it("serializes only the requested keys, in order", () => {
    expect(
      pickQueryString(
        { grade: "2", groupId: "g1", search: "παπ", other: "x" },
        ["grade", "groupId", "search"]
      )
    ).toBe(`?grade=2&groupId=g1&search=${encodeURIComponent("παπ")}`);
  });

  it("skips missing and empty values", () => {
    expect(pickQueryString({ grade: "1", groupId: undefined, search: "" }, ["grade", "groupId", "search"])).toBe(
      "?grade=1"
    );
  });

  it("returns an empty string when nothing is set", () => {
    expect(pickQueryString({}, ["grade", "groupId"])).toBe("");
    expect(pickQueryString({ grade: undefined }, ["grade"])).toBe("");
  });
});
