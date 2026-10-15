import { describe, expect, it } from "vitest";
import { RPC_MAX_BATCH, rejectRpc } from "@/lib/rpc-proxy";

const call = (method: string) => ({ jsonrpc: "2.0", id: 1, method, params: [] });

describe("rejectRpc", () => {
  it("lets wallet methods through, one at a time or in a batch", () => {
    expect(rejectRpc(call("sendTransaction"))).toBeNull();
    expect(rejectRpc([call("getLatestBlockhash"), call("getSignatureStatuses")])).toBeNull();
  });

  it("refuses methods a wallet doesn't need", () => {
    expect(rejectRpc(call("getProgramAccounts"))).toBe("method_not_allowed");
    expect(rejectRpc([call("getBalance"), call("getBlock")])).toBe("method_not_allowed");
  });

  it("refuses malformed and oversized requests", () => {
    expect(rejectRpc(null)).toBe("invalid_request");
    expect(rejectRpc([])).toBe("invalid_request");
    expect(rejectRpc({ jsonrpc: "2.0", id: 1 })).toBe("invalid_request");
    expect(rejectRpc(Array.from({ length: RPC_MAX_BATCH + 1 }, () => call("getSlot")))).toBe("batch_too_large");
  });
});
