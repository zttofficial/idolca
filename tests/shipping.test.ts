import { describe, expect, it } from "vitest";
import { formatAddress, parseAddress } from "@/lib/shipping";

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
