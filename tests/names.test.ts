import { describe, expect, it } from "vitest";
import { cleanName, impersonatesPlatform, isReservedName, nextRenameAt } from "@/lib/server/names";

describe("isReservedName", () => {
  it("blocks platform and staff names in any spelling", () => {
    for (const n of ["Admin", "ad min", "ADM1N", "ｉｄｏｌｃａ", "IdoIca Fan", "Idolca_Support", "官方客服", "管理員小美", "운영자", "公式スタッフ", "mod", "System"])
      expect(isReservedName(n), n).toBe(true);
  });
  it("lets ordinary names through", () => {
    for (const n of ["minji", "modern girl", "rooted", "teamwork", "小美", "카리나 팬", "Bunny_04"]) expect(isReservedName(n), n).toBe(false);
  });
});

describe("impersonatesPlatform", () => {
  it("flags titles posing as the platform", () => {
    for (const t of ["Idolca Official sale", "官方 idolca", "請加官方客服 LINE", "idolca support will contact you"]) expect(impersonatesPlatform(t), t).toBe(true);
  });
  it("allows normal card listings", () => {
    for (const t of ["NewJeans official photocard", "Bought on Idolca, mint condition", "官方小卡 正版"]) expect(impersonatesPlatform(t), t).toBe(false);
  });
});

describe("cleanName", () => {
  it("trims, collapses spaces and checks length", () => {
    expect(cleanName("  Bunny   Minji ")).toBe("Bunny Minji");
    expect(cleanName("a")).toBeNull();
    expect(cleanName("x".repeat(25))).toBeNull();
    expect(cleanName("bad​name")).toBeNull();
    expect(cleanName(42)).toBeNull();
  });
});

describe("nextRenameAt", () => {
  it("allows the first change and enforces 3 days after", () => {
    expect(nextRenameAt(null)).toBeNull();
    expect(nextRenameAt(new Date(Date.now() - 4 * 86400_000))).toBeNull();
    const recent = new Date(Date.now() - 86400_000);
    expect(nextRenameAt(recent)?.getTime()).toBe(recent.getTime() + 3 * 86400_000);
  });
});
