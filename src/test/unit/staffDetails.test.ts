import { describe, it, expect } from "vitest";
import { parseStaffDetails, pickDetails, hasAnyDetails, detailsForLink, EMPTY_DETAILS } from "@/lib/staffDetails";

const A = { phone: "99111111", department: "Φυσική Αγωγή", pmp: "12345" };
const B = { phone: "99222222", department: "Μαθηματικά", pmp: "67890" };

describe("detailsForLink", () => {
  it("takes the details from the account's current record on a direct relink", () => {
    expect(detailsForLink({ fromOldProfile: A, stash: B })).toEqual(A);
  });

  it("takes the stash when the account was unlinked first", () => {
    expect(detailsForLink({ fromOldProfile: null, stash: B })).toEqual(B);
    expect(detailsForLink({ fromOldProfile: { ...EMPTY_DETAILS }, stash: B })).toEqual(B);
  });

  it("gives empty details when there is nothing to carry", () => {
    expect(detailsForLink({ fromOldProfile: null, stash: null })).toEqual(EMPTY_DETAILS);
  });
});

describe("parseStaffDetails", () => {
  it("reads a stored stash and tolerates junk", () => {
    expect(parseStaffDetails(A)).toEqual(A);
    expect(parseStaffDetails(null)).toEqual(EMPTY_DETAILS);
    expect(parseStaffDetails("x")).toEqual(EMPTY_DETAILS);
    expect(parseStaffDetails({ phone: "99", pmp: 5, department: "  " })).toEqual({ phone: "99", department: null, pmp: null });
  });
});

describe("pickDetails / hasAnyDetails", () => {
  it("picks the three fields and treats blanks as missing", () => {
    expect(pickDetails({ ...A })).toEqual(A);
    expect(pickDetails(null)).toEqual(EMPTY_DETAILS);
    expect(hasAnyDetails(pickDetails({ phone: " ", department: null, pmp: null }))).toBe(false);
    expect(hasAnyDetails({ ...EMPTY_DETAILS, pmp: "1" })).toBe(true);
  });
});
