// 瀏覽器的 Solana RPC 請求先到我們的 /api/rpc，伺服器帶著 key 轉給 SOLANA_RPC_URL（Helius），key 不出現在網頁裡。
// 這裡決定哪些請求放行：錢包送交易、模擬交易和一般查詢；掃全鏈、讀整個區塊這類耗額度的方法一律拒絕

// 瀏覽器端用到的方法：wallets.ts 代送交易（sendTransaction），Privy 收藏錢包送交易前後的查詢
export const RPC_METHODS: ReadonlySet<string> = new Set([
  "sendTransaction",
  "simulateTransaction",
  "getLatestBlockhash",
  "isBlockhashValid",
  "getSignatureStatuses",
  "getTransaction",
  "getFeeForMessage",
  "getRecentPrioritizationFees",
  "getMinimumBalanceForRentExemption",
  "getBalance",
  "getAccountInfo",
  "getMultipleAccounts",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getSlot",
  "getBlockHeight",
  "getEpochInfo",
  "getGenesisHash",
  "getHealth",
  "getVersion",
]);

// 一次最多幾個請求（JSON-RPC 允許把多個請求放進陣列一起送）、請求內容最大多少位元組
export const RPC_MAX_BATCH = 10;
export const RPC_MAX_BYTES = 64 * 1024;

type RpcRequest = { jsonrpc?: unknown; method?: unknown };

// 檢查瀏覽器送來的 JSON-RPC 內容：單一請求或不超過 RPC_MAX_BATCH 個的陣列，每個方法都要在白名單裡。
// 合格回傳 null，不合格回傳原因
export function rejectRpc(body: unknown): "invalid_request" | "batch_too_large" | "method_not_allowed" | null {
  const list = Array.isArray(body) ? body : [body];
  if (!list.length || list.some((r) => !r || typeof r !== "object")) return "invalid_request";
  if (list.length > RPC_MAX_BATCH) return "batch_too_large";
  for (const r of list as RpcRequest[]) {
    if (typeof r.method !== "string") return "invalid_request";
    if (!RPC_METHODS.has(r.method)) return "method_not_allowed";
  }
  return null;
}
