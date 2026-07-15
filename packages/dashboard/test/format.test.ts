import { describe, expect, it } from "vitest";
import { fmtMs, fmtNum, truncate } from "../src/lib/format";

describe("dashboard formatting", () => {
  it("formats durations at useful scales", () => {
    expect(fmtMs(0.42)).toBe("0.4ms");
    expect(fmtMs(12.345)).toBe("12.3ms");
    expect(fmtMs(1_500)).toBe("1.50s");
  });

  it("formats counts and truncates long SQL", () => {
    expect(fmtNum(1_234)).toBe("1,234");
    expect(truncate("SELECT all columns from books", 12)).toBe("SELECT all c…");
  });
});
