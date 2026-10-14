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

// 用戶把收藏卡做成數位珍藏：伺服器組交易（平台付手續費和押金）、錢包（key）簽名送出並付鑄造費、回報確認。回傳上鏈後的收藏卡
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
// 擔保訂單用的收件地址（格式見 src/lib/shipping.ts）
export const ADDRESS = { name: "Kim Minji", phone: "+82 10 1234 5678", line1: "123 Teheran-ro", line2: "", city: "Seoul", region: "", postal: "06134", country: "KR" };
// 寄件的物流單號（格式見 src/lib/tracking.ts）：韓國郵政的國際郵件單號，檢查碼正確
export const TRACKING = { carrier: "koreapost", number: "EE123456785KR" };
// 賣家標記寄出：帶上物流單號和他看到的收件地址的填寫時間
export async function ship(orderId, seller, tracking = TRACKING) {
  const o = (await must("GET", "/api/orders", undefined, seller)).orders.find((x) => x.id === orderId);
  return must("POST", `/api/orders/${orderId}/ship`, { addressAt: o?.addressAt, tracking }, seller);
}
export const step = (s) => console.log(`\n▶ ${s}`);
export function finish() {
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
}

// 開發伺服器沒設 RESEND_API_KEY 時把信寫進伺服器目錄的 .data/outbox.jsonl（E2E_OUTBOX 可以改路徑）：讀寄給某個信箱的最後一封、取出信裡的連結和令牌
const OUTBOX = process.env.E2E_OUTBOX ?? ".data/outbox.jsonl";
export const lastMail = (to) =>
  readFileSync(OUTBOX, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .filter((m) => m.to === to)
    .at(-1);
export const linkIn = (mail) => mail?.text.match(/https?:\/\/\S+token=[\w-]+/)?.[0];
export const tokenIn = (mail) => new URL(linkIn(mail)).searchParams.get("token");

// 無頭 Chrome（DevTools 協定）：開一個分頁，給測試點按、填表、截圖。只結束自己開的這個 Chrome
export async function openBrowser({ out = process.env.E2E_OUT ?? ".data/e2e-shots", width = 1280, height = 900, init } = {}) {
  const { spawn } = await import("node:child_process");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  mkdirSync(out, { recursive: true });
  const port = 9300 + Math.floor(Math.random() * 600);
  // 設定檔目錄要給絕對路徑，新版 Chrome 收到相對路徑會直接退出
  const chrome = spawn(process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${resolve(out, `profile-${Date.now()}`)}`,
    `--window-size=${width},${height}`,
    "--hide-scrollbars",
    "about:blank",
  ]);
  let targets;
  for (let i = 0; i < 50; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets.some((t) => t.type === "page")) break;
    } catch {}
    await sleep(200);
  }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  // 頁面的主控台錯誤和未處理的例外，失敗時印出來除錯
  const errors = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  });
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const waitFor = async (expr, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await evaluate(expr)) return true;
      await sleep(400);
    }
    return false;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  if (init) await send("Page.addScriptToEvaluateOnNewDocument", { source: init });
  return {
    send,
    evaluate,
    waitFor,
    has: (text) => `document.body.innerText.includes(${JSON.stringify(text)})`,
    shot: async (name) => writeFileSync(`${out}/${name}.png`, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64")),
    // 點文字包含 text 的按鈕或連結；inDialog 時只找彈窗裡、文字完全相同的按鈕
    click: (text, { inDialog = false } = {}) =>
      evaluate(
        inDialog
          ? `(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`
          : `(() => { const b = [...document.querySelectorAll('button, a')].find(b => b.textContent.trim().includes(${JSON.stringify(text)}) && !b.disabled); if (!b) return false; b.click(); return true; })()`,
      ),
    go: async (path) => {
      await send("Page.navigate", { url: BASE + path });
      await waitFor("document.readyState === 'complete'");
      await sleep(1500);
    },
    // React 受控輸入：用原生 setter 設值再觸發 input
    fill: (selector, value) =>
      evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
      ),
    // 帶入登入會話（api() 拿到的 cookie 字串 name=value）
    setCookie: (cookie) => {
      const [name, value] = cookie.split("=");
      return send("Network.setCookie", { name, value, url: BASE });
    },
    errors,
    close: () => {
      chrome.kill();
      ws.close();
    },
  };
}
