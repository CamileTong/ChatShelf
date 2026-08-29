import { describe, expect, it } from "vitest";
import { formatSmartDate } from "./date";

describe("formatSmartDate", () => {
  const reference = new Date(2026, 7, 28, 12);

  it("labels today and yesterday", () => {
    expect(formatSmartDate(new Date(2026, 7, 28, 1).toISOString(), reference))
      .toBe("Aug 28, 2026, Today");
    expect(formatSmartDate(new Date(2026, 7, 27, 23).toISOString(), reference))
      .toBe("Aug 27, 2026, Yesterday");
  });

  it("shows the weekday for the rest of the past week", () => {
    expect(formatSmartDate(new Date(2026, 7, 26, 8).toISOString(), reference))
      .toBe("Aug 26, 2026, Wednesday");
    expect(formatSmartDate(new Date(2026, 7, 22, 8).toISOString(), reference))
      .toBe("Aug 22, 2026, Saturday");
  });

  it("uses only the calendar date after six days", () => {
    expect(formatSmartDate(new Date(2026, 7, 21, 8).toISOString(), reference))
      .toBe("Aug 21, 2026");
  });
});
