// Access-code slips — two students per A4 sheet, cut in half by the school.
// Pure; unit-tested in codeSlips.test.ts.

export interface Slip {
  studentName: string;
  groupName: string;
  code: string;
}

export interface SlipGroup {
  groupName: string;
  slips: Slip[];
}

/** A4 sheets of two halves; every homegroup starts on a new sheet. */
export function slipPages(groups: SlipGroup[]): [Slip, Slip | null][] {
  const pages: [Slip, Slip | null][] = [];
  for (const g of groups) {
    for (let i = 0; i < g.slips.length; i += 2) {
      pages.push([g.slips[i]!, g.slips[i + 1] ?? null]);
    }
  }
  return pages;
}

/**
 * The activation link the QR opens. The code goes after «#» so it never
 * reaches the server or its access logs; the page reads it in the browser.
 */
export function activationUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/el/activate#code=${code.replace(/\D/g, "")}`;
}
