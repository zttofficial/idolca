import { describe, expect, it } from "vitest";
import { DEFAULT_FEES, feeCents, resolveFee, type FeeRule } from "@/lib/fees";

const now = new Date("2026-10-20T12:00:00Z");
const at = (iso: string) => new Date(iso);
let n = 0;
const rule = (r: Partial<FeeRule>): FeeRule => ({
  id: String(n++),
  kind: "sale",
  value: 250,
  startsAt: at("2026-01-01T00:00:00Z"),
  endsAt: null,
  label: null,
  ...r,
});

describe("resolveFee", () => {
  it("沒有規則時用預設值", () => {
    expect(resolveFee("sale", [], now)).toEqual({
      kind: "sale",
      value: DEFAULT_FEES.sale,
      base: DEFAULT_FEES.sale,
      promo: null,
      next: null,
    });
  });

  it("基本費率取最近一條已生效的，下一條列為 next", () => {
    const rules = [rule({ value: 300 }), rule({ value: 200, startsAt: at("2026-06-01T00:00:00Z") }), rule({ value: 350, startsAt: at("2026-11-01T00:00:00Z") })];
    const fee = resolveFee("sale", rules, now);
    expect(fee.value).toBe(200);
    expect(fee.base).toBe(200);
    expect(fee.next).toEqual({
      value: 350,
      startsAt: "2026-11-01T00:00:00.000Z",
    });
  });

  it("促銷期間取較低的那個，期間外不算", () => {
    const promo = rule({
      value: 0,
      startsAt: at("2026-10-15T00:00:00Z"),
      endsAt: at("2026-10-31T00:00:00Z"),
      label: "週年慶",
    });
    expect(resolveFee("sale", [promo], now)).toMatchObject({
      value: 0,
      base: DEFAULT_FEES.sale,
      promo: { label: "週年慶", endsAt: "2026-10-31T00:00:00.000Z" },
    });
    expect(resolveFee("sale", [promo], at("2026-10-31T00:00:00Z")).value).toBe(DEFAULT_FEES.sale);
    expect(resolveFee("sale", [promo], at("2026-10-14T00:00:00Z")).promo).toBeNull();
  });

  it("促銷比基本費率高時不生效，多個促銷取最低", () => {
    const window = {
      startsAt: at("2026-10-01T00:00:00Z"),
      endsAt: at("2026-12-01T00:00:00Z"),
    };
    const rules = [rule({ value: 100 }), rule({ value: 150, ...window }), rule({ value: 50, ...window }), rule({ value: 80, ...window })];
    expect(resolveFee("sale", rules, now)).toMatchObject({
      value: 50,
      base: 100,
    });
    expect(resolveFee("sale", [rule({ value: 100 }), rule({ value: 150, ...window })], now)).toMatchObject({ value: 100, promo: null });
  });

  it("只看同一種費用", () => {
    expect(resolveFee("auction", [rule({ kind: "sale", value: 0 })], now).value).toBe(DEFAULT_FEES.auction);
  });
});

describe("feeCents", () => {
  it("四捨五入到分", () => {
    expect(feeCents(1999, 250)).toBe(50);
    expect(feeCents(1000, 0)).toBe(0);
  });
});
