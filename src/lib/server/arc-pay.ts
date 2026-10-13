import "server-only";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, keccak256, parseAbi, parseEventLogs, parseSignature, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC, ARC_AUTH_TTL_SECONDS, ARC_USDC, type ArcPaymentRequest } from "@/lib/arc";

// Arc 收款通道的伺服器端：發出付款請求、把買家簽好的授權轉帳送上鏈並對帳、退款。
// 平台熱錢包代付手續費（Arc 的手續費也是 USDC，每筆不到 1 美分）。金鑰線上放在 ARC_PLATFORM_KEY（0x 開頭的私鑰），
// 本機也可以用 ARC_PLATFORM_KEYFILE 指向 { "privateKey": "0x…" } 的檔案

const USDC_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
]);

function platformKey(): Hex | null {
  const raw = process.env.ARC_PLATFORM_KEY || (process.env.ARC_PLATFORM_KEYFILE ? (JSON.parse(readFileSync(process.env.ARC_PLATFORM_KEYFILE, "utf8")) as { privateKey: string }).privateKey : "");
  return raw ? (raw as Hex) : null;
}

let cached: ReturnType<typeof makeClients> | null | undefined;
function makeClients(key: Hex) {
  const chain = defineChain({ id: ARC!.chainId, name: ARC!.name, nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [process.env.ARC_RPC_URL || ARC!.rpc] } } });
  const account = privateKeyToAccount(key);
  const transport = http(process.env.ARC_RPC_URL || ARC!.rpc);
  return { account, pub: createPublicClient({ chain, transport }), wallet: createWalletClient({ chain, transport, account }) };
}
function clients() {
  if (cached !== undefined) return cached;
  const key = ARC ? platformKey() : null;
  if (!ARC || !key) return (cached = null);
  const c = makeClients(key);
  // 金鑰和公開設定裡的平台地址必須是同一個，否則買家會把錢授權給別人
  if (getAddress(c.account.address) !== getAddress(ARC.platform)) {
    console.error("ARC_PLATFORM_KEY does not match the platform address in src/lib/chain/arc-*.json");
    return (cached = null);
  }
  return (cached = c);
}

export const arcReady = () => clients() !== null;

const units = (cents: number) => BigInt(cents) * BigInt(10 ** (ARC_USDC.decimals - 2));
export const arcNonce = (ref: string) => keccak256(toHex(ref));

// 建單時發出的付款請求：收款人是平台錢包，金額、nonce 都由訂單決定。ttlSeconds 是授權有效期，拍賣出價用較短的期限
export function arcPaymentRequest(ref: string, amountCents: number, ttlSeconds = ARC_AUTH_TTL_SECONDS): ArcPaymentRequest {
  return {
    chainId: ARC!.chainId,
    to: ARC!.platform,
    value: units(amountCents).toString(),
    validAfter: "0",
    validBefore: String(Math.floor(Date.now() / 1000) + Math.min(ttlSeconds, ARC_AUTH_TTL_SECONDS)),
    nonce: arcNonce(ref),
  };
}

export class ArcPaymentError extends Error {}

// 收款：核對買家送回的授權（收款人、金額、nonce 都要和訂單一致，還沒過期），送上鏈，再從回執裡確認 USDC 真的進了平台錢包。
// 同一份授權已經用過（例如上一次送出後連線中斷）時，找出那筆交易照樣對帳。回傳交易哈希
export async function settleArcPayment(ref: string, amountCents: number, input: { from?: unknown; validBefore?: unknown; signature: unknown }) {
  const c = clients();
  if (!c || !ARC) throw new ArcPaymentError("not_configured");
  if (typeof input.from !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(input.from)) throw new ArcPaymentError("invalid_payer");
  if (typeof input.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(input.signature)) throw new ArcPaymentError("invalid_signature");
  const from = getAddress(input.from);
  const platform = getAddress(ARC.platform);
  const nonce = arcNonce(ref);
  const value = units(amountCents);
  const validBefore = BigInt(String(input.validBefore ?? "0"));

  let hash: Hex;
  if (await c.pub.readContract({ address: ARC_USDC.address, abi: USDC_ABI, functionName: "authorizationState", args: [from, nonce] })) {
    // 授權 30 分鐘就過期，用過的那筆一定在最近的區塊裡；只查最近 9,000 個區塊，避開 RPC 的查詢範圍上限
    const latest = await c.pub.getBlockNumber();
    const logs = await c.pub.getContractEvents({ address: ARC_USDC.address, abi: USDC_ABI, eventName: "AuthorizationUsed", args: { authorizer: from, nonce }, fromBlock: latest > BigInt(9_000) ? latest - BigInt(9_000) : BigInt(0) });
    if (!logs.length) throw new ArcPaymentError("payment_not_found");
    hash = logs[0].transactionHash;
  } else {
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (validBefore <= now || validBefore > now + BigInt(ARC_AUTH_TTL_SECONDS + 60)) throw new ArcPaymentError("authorization_expired");
    const { v, r, s, yParity } = parseSignature(input.signature as Hex);
    try {
      hash = await c.wallet.writeContract({
        address: ARC_USDC.address,
        abi: USDC_ABI,
        functionName: "transferWithAuthorization",
        args: [from, platform, value, BigInt(0), validBefore, nonce, Number(v ?? BigInt(yParity + 27)), r, s],
      });
    } catch (err) {
      // 送出前的模擬就失敗：簽名和內容對不上（例如金額被改過），或付款地址的 USDC 不夠
      console.error("arc authorization rejected", err);
      throw new ArcPaymentError("authorization_rejected");
    }
  }
  const receipt = await c.pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new ArcPaymentError("payment_failed");
  const logs = parseEventLogs({ abi: USDC_ABI, logs: receipt.logs.filter((l) => getAddress(l.address) === getAddress(ARC_USDC.address)) });
  const paid = logs.some((l) => l.eventName === "Transfer" && getAddress(l.args.from) === from && getAddress(l.args.to) === platform && l.args.value === value);
  const used = logs.some((l) => l.eventName === "AuthorizationUsed" && getAddress(l.args.authorizer) === from && l.args.nonce === nonce);
  if (!paid || !used) throw new ArcPaymentError("payment_not_found");
  return { hash, from };
}

// 退款、放款：平台錢包直接把 USDC 轉過去
export async function arcPayout(to: string, amountCents: number) {
  const c = clients();
  if (!c) throw new ArcPaymentError("not_configured");
  const hash = await c.wallet.writeContract({ address: ARC_USDC.address, abi: USDC_ABI, functionName: "transfer", args: [getAddress(to), units(amountCents)] });
  const receipt = await c.pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new ArcPaymentError("payout_failed");
  return hash;
}

// 某個地址在 Arc 上的 USDC 餘額（ERC-20 介面，6 位小數），換成 USDC 數字。唯讀，不需要平台金鑰
export async function arcUsdcBalance(address: `0x${string}`) {
  if (!ARC) throw new ArcPaymentError("not_configured");
  const pub = createPublicClient({ transport: http(process.env.ARC_RPC_URL || ARC.rpc) });
  const raw = await pub.readContract({ address: ARC_USDC.address, abi: USDC_ABI, functionName: "balanceOf", args: [getAddress(address)] });
  return Number(raw) / 10 ** ARC_USDC.decimals;
}
