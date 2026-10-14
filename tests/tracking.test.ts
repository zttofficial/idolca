import { describe, expect, it } from "vitest";
import { CARRIERS, carrierName, parseTracking, s10Valid, trackingOf, trackingUrl } from "@/lib/tracking";

describe("parseTracking", () => {
  it("normalizes spaces, hyphens and case", () => {
    expect(parseTracking({ carrier: "cj", number: " 6895-1234 5678 " })).toEqual({ carrier: "cj", number: "689512345678" });
    expect(parseTracking({ carrier: "dhl", number: "jd0146000" })).toEqual({ carrier: "dhl", number: "JD0146000" });
  });

  it("treats a missing or empty carrier as other", () => {
    expect(parseTracking({ number: "ABC12345" })).toEqual({ carrier: null, number: "ABC12345" });
    expect(parseTracking({ carrier: "", number: "ABC12345" })).toEqual({ carrier: null, number: "ABC12345" });
  });

  it("rejects unknown carriers and malformed numbers", () => {
    expect(parseTracking({ carrier: "pigeon", number: "ABC12345" })).toBeNull();
    expect(parseTracking({ carrier: "cj", number: "12345" })).toBeNull();
    expect(parseTracking({ carrier: "cj", number: "1234/5678" })).toBeNull();
    expect(parseTracking({ carrier: "cj", number: "1".repeat(41) })).toBeNull();
    expect(parseTracking({ carrier: "cj" })).toBeNull();
    expect(parseTracking(null)).toBeNull();
    expect(parseTracking("EE123456785KR")).toBeNull();
  });

  it("checks the UPU S10 check digit for postal carriers", () => {
    // RR473124829GB 是 UPU S10 標準裡的範例
    expect(s10Valid("RR473124829GB")).toBe(true);
    expect(s10Valid("RR473124828GB")).toBe(false);
    expect(parseTracking({ carrier: "koreapost", number: "RR 473 124 829 GB" })).toEqual({ carrier: "koreapost", number: "RR473124829GB" });
    expect(parseTracking({ carrier: "koreapost", number: "RR473124828GB" })).toBeNull();
    // 快遞公司的單號不套用郵政的檢查碼
    expect(parseTracking({ carrier: "dhl", number: "RR473124828GB" })).not.toBeNull();
  });

  it("maps check digits 10 and 11 to 0 and 5", () => {
    const withCheck = (serial: string) => {
      for (let d = 0; d <= 9; d++) if (s10Valid(`EE${serial}${d}KR`)) return d;
      return -1;
    };
    // 加權和 7 → 11 − 7 = 4；加權和 0 → 11 → 5；加權和 2 + 21 = 23，餘 1 → 10 → 0
    expect(withCheck("00000001")).toBe(4);
    expect(withCheck("00000000")).toBe(5);
    expect(withCheck("00010003")).toBe(0);
  });
});

describe("trackingUrl", () => {
  it("links Korea Post domestic and international numbers to different pages", () => {
    expect(trackingUrl({ carrier: "koreapost", number: "6012345678901" })).toContain("RetrieveDomRigiTraceList");
    expect(trackingUrl({ carrier: "koreapost", number: "EE123456785KR" })).toContain("RetrieveEmsRigiTraceList.comm?POST_CODE=EE123456785KR");
  });

  it("has no link for other carriers or carriers without a public lookup", () => {
    expect(trackingUrl({ carrier: null, number: "ABC12345" })).toBeNull();
    expect(trackingUrl({ carrier: "cvstw", number: "ABC12345" })).toBeNull();
  });

  it("every carrier has a name", () => {
    for (const id of CARRIERS) expect(carrierName(id)).toBeTruthy();
  });
});

describe("trackingOf", () => {
  it("rebuilds the stored columns", () => {
    expect(trackingOf("ups", "1Z999")).toEqual({ carrier: "ups", number: "1Z999" });
    expect(trackingOf("gone", "1Z999")).toEqual({ carrier: null, number: "1Z999" });
    expect(trackingOf(null, null)).toBeNull();
  });
});
