import { describe, expect, it } from "vitest";
import { auctionFeeCents, minNextBid } from "@/lib/auction";

// 加價規則和鏈上託管程序的 min_next_bid 一致（onchain/programs/idolca-market/src/lib.rs 的 bid_steps 測試用同一組數字）
const UNIT = 1_000_000;

describe("auction bid steps", () => {
  it("starts at the starting bid", () => {
    expect(minNextBid(null, 1_000, 100)).toBe(1_000);
  });

  it("steps by 1 below 50, by 5 from 50 to 200, then by 2.5% rounded up", () => {
    expect(minNextBid(1_000, 1_000, 100)).toBe(1_100);
    expect(minNextBid(4_999, 1_000, 100)).toBe(5_099);
    expect(minNextBid(5_000, 1_000, 100)).toBe(5_500);
    expect(minNextBid(20_000, 1_000, 100)).toBe(20_500);
    expect(minNextBid(20_100, 1_000, 100)).toBe(20_100 + 503);
  });

  it("matches the program in token units", () => {
    expect(minNextBid(10 * UNIT, 10 * UNIT, UNIT)).toBe(11 * UNIT);
    expect(minNextBid(50 * UNIT, 10 * UNIT, UNIT)).toBe(55 * UNIT);
    expect(minNextBid(200 * UNIT, 10 * UNIT, UNIT)).toBe(205 * UNIT);
    expect(minNextBid(201 * UNIT + 1, 10 * UNIT, UNIT)).toBe(201 * UNIT + 1 + 5_025_001);
  });

  it("takes the seller fee from the winning bid", () => {
    expect(auctionFeeCents(10_000)).toBe(400);
    expect(auctionFeeCents(1_234, 400)).toBe(49);
  });
});
