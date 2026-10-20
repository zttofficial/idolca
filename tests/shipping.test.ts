import { describe, expect, it } from "vitest";
import { CA_PROVINCES, REDEEM_FEE_RANGE, SHIP_COUNTRIES, formatAddress, parseAddress, redeemCharge, redeemFeeUsd, redeemTaxRate, vaultCountries } from "@/lib/shipping";
import { CA_GST_HST } from "@/lib/rates/ca-tax";
import { REDEEM_FEE_BUFFER, REDEEM_FEE_STEP_USD } from "@/lib/policy";
import { VAULTS, VAULT_IDS, suggestVault, vaultOf } from "@/lib/vaults";

describe("transitDays", () => {
  it("gives every country each vault ships to a business-day range", () => {
    for (const vault of VAULT_IDS) {
      for (const country of vaultCountries(vault)) {
        const [min, max] = VAULTS[vault].transitDays(country);
        expect(Number.isInteger(min) && Number.isInteger(max), `${vault} ${country}`).toBe(true);
        expect(min, `${vault} ${country}`).toBeGreaterThan(0);
        expect(max, `${vault} ${country}`).toBeGreaterThanOrEqual(min);
      }
    }
    expect(VAULTS.yvr.transitDays("US")).toEqual([4, 7]);
    expect(VAULTS.ckg.transitDays("CN")).toEqual([1, 4]);
  });
});

describe("redeemFeeUsd", () => {
  it("prices every country each vault ships to with a positive fee rounded to the step", () => {
    for (const vault of VAULT_IDS) {
      expect(vaultCountries(vault).length, vault).toBeGreaterThan(0);
      for (const country of vaultCountries(vault)) {
        const fee = redeemFeeUsd(vault, country);
        expect(fee, `${vault} ${country}`).not.toBeNull();
        expect(fee!, `${vault} ${country}`).toBeGreaterThan(0);
        expect(Number.isInteger(fee! / REDEEM_FEE_STEP_USD), `${vault} ${country}`).toBe(true);
      }
    }
  });

  it("adds the buffer to postage plus packing, converts with the vault's rate, then rounds up, never down", () => {
    for (const vault of VAULT_IDS) {
      const v = VAULTS[vault];
      for (const country of vaultCountries(vault)) {
        const usd = ((v.postage[country] + v.packing) * (1 + REDEEM_FEE_BUFFER)) / v.perUsd;
        const fee = redeemFeeUsd(vault, country)!;
        expect(fee, `${vault} ${country}`).toBeGreaterThanOrEqual(usd - 1e-9);
        expect(fee - usd, `${vault} ${country}`).toBeLessThan(REDEEM_FEE_STEP_USD);
      }
    }
    // 溫哥華寄美國：（Tracked Packet 8.19 × 燃油附加費 1.2525 + 包材 0.4595）× 1.15 = CAD 12.33 ≈ 8.64 USD → 9
    expect(redeemFeeUsd("yvr", "US")).toBe(9);
    // 溫哥華寄日本（rate code 14）：（24.85 × 1.2525 + 0.4595）× 1.15 = CAD 36.32 ≈ 25.47 USD → 25.5
    expect(redeemFeeUsd("yvr", "JP")).toBe(25.5);
    // 溫哥華寄加拿大國內：（掛號信 2.61 + 13.15 + 0.4595）× 1.15 = CAD 18.65 ≈ 13.08 USD → 13.5
    expect(redeemFeeUsd("yvr", "CA")).toBe(13.5);
  });

  it("has no fee where the card's vault doesn't ship", () => {
    // Tracked Packet 不送達這幾個地方，溫哥華的卡不能提貨到那裡
    for (const country of ["TH", "ID", "VN", "PH", "MO"]) expect(redeemFeeUsd("yvr", country), country).toBeNull();
    expect(redeemFeeUsd("yvr", "KP")).toBeNull();
    expect(redeemFeeUsd("yvr", "")).toBeNull();
    expect(redeemFeeUsd("yvr", "us")).toBeNull();
    expect(redeemFeeUsd("yvr", "constructor")).toBeNull();
    expect(redeemFeeUsd("sel", "US")).toBeNull();
    expect(redeemFeeUsd("ckg", "KP")).toBeNull();
  });

  it("exposes the range the terms quote, across both vaults", () => {
    const fees = VAULT_IDS.flatMap((v) => vaultCountries(v).map((c) => redeemFeeUsd(v, c)!));
    expect(REDEEM_FEE_RANGE).toEqual({ min: Math.min(...fees), max: Math.max(...fees) });
    expect(REDEEM_FEE_RANGE.max).toBeGreaterThan(REDEEM_FEE_RANGE.min);
  });

  it("lets addresses pick every place either vault ships to, including mainland China", () => {
    for (const vault of VAULT_IDS) for (const country of vaultCountries(vault)) expect(SHIP_COUNTRIES, `${vault} ${country}`).toContain(country);
    expect(SHIP_COUNTRIES).toContain("CN");
  });
});

describe("GST/HST on redemption shipping", () => {
  it("has a CRA rate for every province and territory, and nothing else", () => {
    expect(Object.keys(CA_PROVINCES).sort()).toEqual(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);
    expect(Object.keys(CA_GST_HST).sort()).toEqual(Object.keys(CA_PROVINCES).sort());
    // CRA 稅率表 2025-04-01 起：HST 省份
    expect(CA_GST_HST.ON).toBe(0.13);
    expect(CA_GST_HST.NS).toBe(0.14);
    for (const p of ["NB", "NL", "PE"]) expect(CA_GST_HST[p], p).toBe(0.15);
    // 其他只收 GST，不加省稅
    for (const p of ["AB", "BC", "MB", "NT", "NU", "QC", "SK", "YT"]) expect(CA_GST_HST[p], p).toBe(0.05);
  });

  it("taxes only Vancouver shipments within Canada", () => {
    for (const p of Object.keys(CA_PROVINCES)) expect(redeemTaxRate("yvr", "CA", p), p).toBe(CA_GST_HST[p]);
    for (const country of vaultCountries("yvr").filter((c) => c !== "CA")) expect(redeemTaxRate("yvr", country, "ON"), country).toBe(0);
    for (const country of vaultCountries("ckg")) expect(redeemTaxRate("ckg", country, "ON"), country).toBe(0);
    expect(redeemCharge("ckg", { country: "CA", region: "ON" })).toMatchObject({ taxCents: 0, totalCents: redeemCharge("ckg", { country: "CA", region: "ON" })!.feeCents });
    expect(redeemCharge("yvr", { country: "US", region: "CA" })).toEqual({ feeCents: 900, taxCents: 0, totalCents: 900, taxRate: 0 });
  });

  it("can't price a Canadian shipment from Vancouver without a valid province", () => {
    expect(redeemTaxRate("yvr", "CA", "")).toBeNull();
    expect(redeemTaxRate("yvr", "CA", "XX")).toBeNull();
    expect(redeemTaxRate("yvr", "CA", "constructor")).toBeNull();
    expect(redeemTaxRate("sel", "CA", "ON")).toBeNull();
    expect(redeemCharge("yvr", { country: "CA", region: "" })).toBeNull();
    expect(redeemCharge("yvr", { country: "TH", region: "" })).toBeNull();
  });

  it("rounds the tax to the cent, half up, and adds it to the fee", () => {
    // 溫哥華寄加拿大運費 13.5：× 5% = 0.675 → 0.68，× 13% = 1.755 → 1.76，× 14% = 1.89，× 15% = 2.025 → 2.03
    expect(redeemCharge("yvr", { country: "CA", region: "BC" })).toEqual({ feeCents: 1350, taxCents: 68, totalCents: 1418, taxRate: 0.05 });
    expect(redeemCharge("yvr", { country: "CA", region: "ON" })).toEqual({ feeCents: 1350, taxCents: 176, totalCents: 1526, taxRate: 0.13 });
    expect(redeemCharge("yvr", { country: "CA", region: "NS" })).toEqual({ feeCents: 1350, taxCents: 189, totalCents: 1539, taxRate: 0.14 });
    expect(redeemCharge("yvr", { country: "CA", region: "PE" })).toEqual({ feeCents: 1350, taxCents: 203, totalCents: 1553, taxRate: 0.15 });
    for (const p of Object.keys(CA_PROVINCES)) {
      const c = redeemCharge("yvr", { country: "CA", region: p })!;
      expect(c.feeCents, p).toBe(Math.round(redeemFeeUsd("yvr", "CA")! * 100));
      expect(Math.abs(c.taxCents - c.feeCents * CA_GST_HST[p]), p).toBeLessThanOrEqual(0.5);
      expect(c.totalCents, p).toBe(c.feeCents + c.taxCents);
    }
  });
});

describe("vaults", () => {
  it("suggests Vancouver only for North America and Chongqing everywhere else", () => {
    expect(suggestVault("US")).toBe("yvr");
    expect(suggestVault("CA")).toBe("yvr");
    expect(suggestVault("MX")).toBe("yvr");
    expect(suggestVault("GB")).toBe("ckg");
    expect(suggestVault("BR")).toBe("ckg");
    expect(suggestVault("TW")).toBe("ckg");
    expect(suggestVault(null)).toBe("ckg");
  });

  it("treats unknown stored values as the default vault", () => {
    expect(vaultOf("ckg").id).toBe("ckg");
    expect(vaultOf(null).id).toBe("yvr");
    expect(vaultOf("sel").id).toBe("yvr");
  });
});

const valid = { name: " Kim  Minji ", phone: "+82 10-1234-5678", line1: "123 Teheran-ro", line2: "", city: "Seoul", region: "", postal: "06134", country: "kr" };

describe("parseAddress", () => {
  it("trims, collapses spaces and upper-cases the country", () => {
    expect(parseAddress(valid)).toMatchObject({ name: "Kim Minji", country: "KR" });
  });

  it("rejects missing required fields", () => {
    expect(parseAddress({ ...valid, line1: " " })).toBeNull();
    expect(parseAddress({ ...valid, city: "" })).toBeNull();
    expect(parseAddress(null)).toBeNull();
    expect(parseAddress("Seoul")).toBeNull();
  });

  it("rejects countries we don't ship to and malformed phones", () => {
    expect(parseAddress({ ...valid, country: "KP" })).toBeNull();
    expect(parseAddress({ ...valid, phone: "call me" })).toBeNull();
  });

  it("requires a Canadian province or territory code from the list", () => {
    const ca = { ...valid, city: "Toronto", postal: "M5V 2T6", country: "CA" };
    expect(parseAddress({ ...ca, region: "" })).toBeNull();
    expect(parseAddress({ ...ca, region: "Ontario" })).toBeNull();
    expect(parseAddress({ ...ca, region: "XX" })).toBeNull();
    expect(parseAddress({ ...ca, region: "on" })).toMatchObject({ country: "CA", region: "ON" });
    // 別的國家的州、省照舊選填、自由輸入
    expect(parseAddress({ ...valid, country: "US", region: "" })).not.toBeNull();
    expect(parseAddress({ ...valid, country: "US", region: "California" })).toMatchObject({ region: "California" });
  });

  it("rejects fields over their length limit", () => {
    expect(parseAddress({ ...valid, name: "x".repeat(81) })).toBeNull();
  });

  it("formats for a shipping label, skipping empty lines", () => {
    expect(formatAddress(parseAddress(valid)!)).toBe("Kim Minji\n+82 10-1234-5678\n123 Teheran-ro\nSeoul, 06134\nKR");
  });
});
