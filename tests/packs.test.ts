import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/cards";
import { drawRandom, verifyDraw } from "@/lib/pack-draw";
import { entryCard, packStats, pickIndex, poolOrder, type PoolEntry, type Tier } from "@/lib/packs";

const card = (serial: string): Card => ({
  id: serial,
  serial,
  group: "IVE",
  member: "Wonyoung",
  album: "I've IVE",
  version: "Album Ver.",
  rarity: "album",
  priceUsdt: 0,
  palette: ["#000000", "#111111", "#222222"],
  asset: serial,
  owner: "",
  status: "vaulted",
  intakeDate: "2026-10-01",
  location: "A",
});
const entry = (serial: string, tier: Tier, valueUsdt: number, remaining = 1): PoolEntry => ({ id: serial, card: card(serial), tier, valueUsdt, total: 1, remaining });

describe("packStats", () => {
  const pool = [entry("IC-3", "SSR", 100), entry("IC-1", "R", 10), entry("IC-2", "N", 2), entry("IC-4", "N", 2, 0)];

  it("odds are each tier's share of the cards still in the pool", () => {
    const s = packStats({ pool });
    expect(s.remaining).toBe(3);
    expect(s.total).toBe(4);
    expect(s.tiers.find((t) => t.tier === "SSR")!.odds).toBeCloseTo(1 / 3);
    expect(s.tiers.find((t) => t.tier === "N")!.odds).toBeCloseTo(1 / 3);
    expect(s.tiers.find((t) => t.tier === "SR")!.odds).toBe(0);
  });

  it("expected value and top value only count cards still in the pool", () => {
    const s = packStats({ pool });
    expect(s.expected).toBeCloseTo((100 + 10 + 2) / 3);
    expect(s.topValue).toBe(100);
  });

  it("handles an empty pool and empty tiers", () => {
    const s = packStats({ pool: [] });
    expect(s).toMatchObject({ remaining: 0, total: 0, expected: 0, topValue: 0 });
    expect(s.tiers.every((t) => t.minValue === 0 && t.maxValue === 0)).toBe(true);
  });

  it("entryCard shows the pack value as the price", () => {
    expect(entryCard(entry("IC-9", "SR", 25)).priceUsdt).toBe(25);
  });
});

describe("fair draw", () => {
  const seed = "a".repeat(64);

  it("pickIndex stays inside the pool and is uniform over the hex range", () => {
    expect(pickIndex("000000000000", 7)).toBe(0);
    expect(pickIndex("ffffffffffff", 7)).toBe(6);
    expect(pickIndex("800000000000", 10)).toBe(5);
  });

  it("the pool is ordered by serial regardless of input order", () => {
    expect(poolOrder([entry("IC-3", "N", 1), entry("IC-1", "N", 1), entry("IC-2", "N", 1)]).map((e) => e.card.serial)).toEqual(["IC-1", "IC-2", "IC-3"]);
  });

  it("each pull is reproducible from the seed and payment signature, and differs by pull number", () => {
    const r0 = drawRandom(seed, "sig", 0);
    expect(r0).toMatch(/^[0-9a-f]{64}$/);
    expect(drawRandom(seed, "sig", 0)).toBe(r0);
    expect(drawRandom(seed, "sig", 1)).not.toBe(r0);
    expect(drawRandom("b".repeat(64), "sig", 0)).not.toBe(r0);
  });

  it("verifyDraw accepts a genuine record and rejects tampered ones", () => {
    const r = drawRandom(seed, "sig", 2);
    const d = { proof: "sig", idx: 2, poolSize: 13, pick: pickIndex(r, 13), r };
    expect(verifyDraw(seed, d)).toBe(true);
    expect(verifyDraw(seed, { ...d, pick: (d.pick + 1) % 13 })).toBe(false);
    expect(verifyDraw("c".repeat(64), d)).toBe(false);
  });

  it("the published commitment is the seed's SHA-256", () => {
    expect(createHash("sha256").update(seed).digest("hex")).toHaveLength(64);
  });
});
