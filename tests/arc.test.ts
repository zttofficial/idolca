import { describe, expect, it } from "vitest";
import { hashDomain } from "viem";
import { ARC_USDC, arcTypedData } from "@/lib/arc";

// 鏈上 USDC 回報的 DOMAIN_SEPARATOR()（2026-10-12 讀取）。網域算錯的話，買家簽的授權在鏈上會被拒絕
const DOMAIN_SEPARATOR = {
  5042002: "0x361191522483d32a83e70ae7183b4b9629442c13a78bc9921d6f707911c8c6b0",
  5042: "0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84",
};

describe("arc payments", () => {
  it("signs against the same EIP-712 domain as Arc's USDC on testnet and mainnet", () => {
    for (const [chainId, expected] of Object.entries(DOMAIN_SEPARATOR)) {
      const { domain, types } = arcTypedData("0x0000000000000000000000000000000000000001", { chainId: Number(chainId), to: "0x0000000000000000000000000000000000000002", value: "1", validAfter: "0", validBefore: "1", nonce: `0x${"0".repeat(64)}` });
      expect(hashDomain({ domain: { ...domain, chainId: BigInt(domain.chainId) }, types: { ...types, EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }] } })).toBe(expected);
    }
    expect(ARC_USDC.decimals).toBe(6);
  });
});
