import { describe, it, expect } from "vitest";
import { registryChange } from "@/lib/studentEdit";

describe("registryChange", () => {
  it("records the old and new number when it changed", () => {
    expect(registryChange("12345", "12354")).toEqual({ from: "12345", to: "12354" });
  });

  it("is null when the number is unchanged, ignoring surrounding spaces", () => {
    expect(registryChange("12345", "12345")).toBeNull();
    expect(registryChange("12345", " 12345 ")).toBeNull();
  });

  it("is null for an empty new number", () => {
    expect(registryChange("12345", "")).toBeNull();
    expect(registryChange("12345", "   ")).toBeNull();
  });
});
