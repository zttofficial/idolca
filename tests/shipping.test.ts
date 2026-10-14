import { describe, expect, it } from "vitest";
import { REDEEM_FEE_RANGE, SHIP_COUNTRIES, formatAddress, parseAddress, redeemFeeUsd, vaultCountries } from "@/lib/shipping";
import { REDEEM_FEE_BUFFER, REDEEM_FEE_STEP_USD } from "@/lib/policy";
import { VAULTS, VAULT_IDS, suggestVault, vaultOf } from "@/lib/vaults";

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

describe("vaults", () => {
  it("suggests the vault closer to the sender", () => {
    expect(suggestVault("US")).toBe("yvr");
    expect(suggestVault("CA")).toBe("yvr");
    expect(suggestVault("TW")).toBe("ckg");
    expect(suggestVault("CN")).toBe("ckg");
    expect(suggestVault(null)).toBe("yvr");
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

  it("rejects fields over their length limit", () => {
    expect(parseAddress({ ...valid, name: "x".repeat(81) })).toBeNull();
  });

  it("formats for a shipping label, skipping empty lines", () => {
    expect(formatAddress(parseAddress(valid)!)).toBe("Kim Minji\n+82 10-1234-5678\n123 Teheran-ro\nSeoul, 06134\nKR");
  });
});
