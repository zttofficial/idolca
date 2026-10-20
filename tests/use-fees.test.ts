import { describe, expect, it } from "vitest";
import { resolveFees, type FeeRule } from "@/lib/fees";
import { nextFeeChange, showFee } from "@/lib/use-fees";

const now = new Date("2026-10-20T12:00:00Z");
const rule = (r: Partial<FeeRule>): FeeRule => ({ id: Math.random().toString(), kind: "sale", value: 250, startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: null, label: null, ...r });

describe("showFee", () => {
  it("抽成和拍賣手續費顯示百分比，鑄造費顯示金額", () => {
    expect(showFee("sale", 250)).toBe("2.5%");
    expect(showFee("auction", 0)).toBe("0%");
    expect(showFee("mint", 50)).toBe("0.50 USD");
    expect(showFee("mint", 100)).toBe("1 USD");
  });
});

describe("nextFeeChange", () => {
  it("沒有促銷和排定調整時沒有", () => {
    expect(nextFeeChange(resolveFees([], now))).toBeNull();
  });

  it("取促銷結束和排定基本費率生效中最早的", () => {
    const fees = resolveFees(
      [
        rule({ kind: "sale", value: 0, startsAt: new Date("2026-10-01T00:00:00Z"), endsAt: new Date("2026-10-31T00:00:00Z") }),
        rule({ kind: "auction", value: 300, startsAt: new Date("2026-10-25T00:00:00Z") }),
        rule({ kind: "mint", value: 25, startsAt: new Date("2026-11-05T00:00:00Z") }),
      ],
      now,
    );
    expect(nextFeeChange(fees)).toBe(new Date("2026-10-25T00:00:00Z").getTime());
  });
});
