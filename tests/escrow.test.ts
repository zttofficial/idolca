import { describe, expect, it } from "vitest";
import { needsAddressReminder, shipDeadline } from "@/lib/escrow";

const DAY = 86_400_000;
const paid = new Date("2026-10-01T00:00:00Z");

describe("shipDeadline", () => {
  it("counts from payment when the address came with the order", () => {
    expect(shipDeadline(paid, new Date(paid.getTime() - 60_000), 7)).toEqual(new Date(paid.getTime() + 7 * DAY));
  });

  it("counts from the address when the buyer filled it in later", () => {
    const filled = new Date(paid.getTime() + 3 * DAY);
    expect(shipDeadline(paid, filled, 7)).toEqual(new Date(filled.getTime() + 7 * DAY));
  });

  it("has no deadline until the order is paid and has an address", () => {
    expect(shipDeadline(paid, null, 7)).toBeNull();
    expect(shipDeadline(null, paid, 7)).toBeNull();
  });
});

describe("needsAddressReminder", () => {
  it("reminds only paid orders still missing an address after a while", () => {
    expect(needsAddressReminder(paid, null, paid.getTime() + 2 * DAY)).toBe(true);
    expect(needsAddressReminder(paid, null, paid.getTime() + DAY)).toBe(false);
    expect(needsAddressReminder(paid, paid, paid.getTime() + 5 * DAY)).toBe(false);
    expect(needsAddressReminder(null, null, paid.getTime() + 5 * DAY)).toBe(false);
  });
});
