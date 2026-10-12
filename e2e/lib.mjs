// 端到端測試共用：對著跑起來的網站（預設 http://localhost:3000）和 Solana devnet 執行，每次都是真實交易。
// 測試會入庫測試卡、建測試卡包，網站要用獨立的測試資料庫啟動：PGLITE_DIR=.data/pglite-e2e npm run dev
// 管理員錢包金鑰檔用 E2E_ADMIN_KEYPAIR 指定（預設 .data/admin-test-devnet.json），它的地址要在網站的 ADMIN_WALLETS 裡
import { createPrivateKey, generateKeyPairSync, sign as edSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import sharp from "sharp";

export const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const conn = new Connection(process.env.E2E_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 錢包金鑰：address（base58）、privateKey（給 node:crypto 簽登入訊息）、kp（給 web3.js 簽交易）、seed/pub（給瀏覽器測試錢包）
export function fromSeed(seed) {
  const kp = Keypair.fromSeed(Uint8Array.from(seed));
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(seed)]), format: "der", type: "pkcs8" });
  return { address: kp.publicKey.toBase58(), privateKey, kp, seed: [...seed], pub: [...kp.publicKey.toBytes()] };
}
export const newKey = () => fromSeed([...generateKeyPairSync("ed25519").privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32)]);
export const adminKey = () => fromSeed([...JSON.parse(readFileSync(process.env.E2E_ADMIN_KEYPAIR ?? ".data/admin-test-devnet.json", "utf8")).slice(0, 32)]);

// 呼叫 API；cookie 是登入後拿到的 "idolca_session=..."
export async function api(method, path, body, cookie, headers = {}) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json, cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
export async function must(...args) {
  const r = await api(...args);
  if (!r.ok) throw new Error(`${args[0]} ${args[1]} ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}

// 錢包登入：拿挑戰訊息、簽名、換會話 cookie
export async function login(key) {
  const ch = (await api("POST", "/api/auth/wallet/nonce", { address: key.address })).json;
  const r = await api("POST", "/api/auth/wallet/verify", { address: key.address, nonce: ch.nonce, signature: edSign(null, Buffer.from(ch.message), key.privateKey).toString("base64") });
  if (!r.ok) throw new Error(`login ${r.status} ${JSON.stringify(r.json)}`);
  return r.cookie;
}

// 伺服器組好的交易：簽上自己的名、送出、等確認
export async function signSend(txBase64, kp) {
  const tx = Transaction.from(Buffer.from(txBase64, "base64"));
  tx.partialSign(kp);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

// 用戶自己付費把收藏卡上鏈：伺服器組交易、錢包（key）簽名送出並付手續費和押金、回報確認。回傳上鏈後的收藏卡
export async function mintSelf(itemId, key, cookie) {
  const { tx, asset } = await must("POST", `/api/items/${itemId}/mint`, undefined, cookie);
  const signature = await signSend(tx, key.kp);
  return (await must("POST", `/api/items/${itemId}/mint/confirm`, { signature, asset }, cookie)).item;
}

// 上傳用的卡片照片：執行時用 sharp 畫一張帶色塊的 JPEG，倉庫裡不放圖片檔
export async function photo(hue = 330) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="660" height="1020"><rect width="660" height="1020" fill="hsl(${hue},70%,60%)"/><circle cx="330" cy="420" r="180" fill="hsl(${(hue + 40) % 360},80%,85%)"/><rect x="80" y="760" width="500" height="120" rx="20" fill="#fff" opacity=".8"/></svg>`;
  return "data:image/jpeg;base64," + (await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer()).toString("base64");
}

let failures = 0;
export const check = (label, ok, extra = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label} ${extra}`);
  if (!ok) failures++;
};
export const step = (s) => console.log(`\n▶ ${s}`);
export function finish() {
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
}
