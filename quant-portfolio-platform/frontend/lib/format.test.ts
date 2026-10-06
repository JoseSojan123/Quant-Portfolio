import { describe, expect, it } from "vitest";
import { money, pct, tone } from "./format";

describe("format", () => {
  it("formats money", () => {
    expect(money(12842)).toBe("$12,842");
    expect(money(1234.5, { cents: true })).toBe("$1,234.50");
    expect(money(250000, { compact: true })).toBe("$250K");
    expect(money(null)).toBe("–");
  });
  it("formats percentages", () => {
    expect(pct(0.284)).toBe("28.4%");
    expect(pct(0.05, 1, true)).toBe("+5.0%");
    expect(pct(-0.128)).toBe("-12.8%");
  });
  it("reserves green/red for direction", () => {
    expect(tone(1)).toBe("text-pos");
    expect(tone(-1)).toBe("text-neg");
    expect(tone(0)).toBe("text-ink");
  });
});
