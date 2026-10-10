import "server-only";
import { createPublicKey, randomBytes, verify } from "node:crypto";
import { getBase58Encoder } from "@solana/kit";

// 錢包簽名登入（Sign In With Solana 的簡化版）：伺服器發一段帶隨機數的純文字訊息，錢包用私鑰簽名，
// 伺服器用地址（就是 ed25519 公鑰）驗簽。簽的是訊息不是交易，不花手續費、不動任何資產

export const NONCE_TTL_MS = 5 * 60_000;

// 地址是 base58 編碼的 32 位元組 ed25519 公鑰；不合法時回傳 null
export function addressBytes(address: unknown): Uint8Array | null {
  if (typeof address !== "string" || address.length < 32 || address.length > 44) return null;
  try {
    const bytes = new Uint8Array(getBase58Encoder().encode(address));
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

export const newNonce = () => randomBytes(16).toString("hex");

export function loginMessage(domain: string, address: string, nonce: string, issuedAt: Date) {
  return [
    `${domain} wants you to sign in with your Solana account:`,
    address,
    "",
    "Sign in to Idolca. This only proves you own this wallet. It does not send a transaction or cost any fees.",
    "",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
  ].join("\n");
}

// ed25519 公鑰的 SPKI 前綴，加上 32 位元組原始公鑰就是 Node 能讀的 DER 格式
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifySignature(publicKey: Uint8Array, message: string, signature: Uint8Array) {
  if (signature.length !== 64) return false;
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey]), format: "der", type: "spki" });
  return verify(null, Buffer.from(message, "utf8"), key, signature);
}
