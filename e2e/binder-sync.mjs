// 收藏冊同步的端到端檢查（只對 PGLITE_DIR=.data/pglite-e2e 的開發伺服器跑）：
// 1. 以前被拿出冊子的「僅記錄」卡，載入時連標記一起刪掉
// 2. 別的裝置刪掉的卡，不會被本機舊副本合併回來
// 3. 本機還沒送出的改動（dirty），重新載入時以本機為準補傳
import { spawn } from "node:child_process";
// 用法：node e2e/binder-sync.mjs [網址]，網址預設 http://localhost:3000
const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = "ive--yujin--ive-ive--album-ver", B = "ive--gaeul--ive-ive--album-ver", C = "ive--rei--ive-ive--album-ver";

const email = `sync-${Date.now()}@example.com`;
const reg = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "testpass1234" }) });
const cookie = reg.headers.get("set-cookie").split(";")[0];
const session = cookie.split("=")[1];
const userId = (await reg.json()).user.id;
const api = async (method, body) => (await fetch(`${BASE}/api/binder`, { method, headers: { cookie, "content-type": "application/json" }, body: body && JSON.stringify(body) })).json();
const haveKeys = async () => Object.keys((await api("GET")).have).sort();

await api("PUT", { have: { [A]: { count: 1 }, [B]: { count: 1 }, [C]: { count: 1 } }, want: {}, layout: { order: [], hidden: [`card:${C}`] } });

const PORT = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}/sync-${Date.now()}`, "about:blank"]);
let t;
for (let i = 0; i < 50; i++) {
  try {
    t = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    if (t.some((x) => x.type === "page")) break;
  } catch {}
  await sleep(200);
}
const ws = new WebSocket(t.find((x) => x.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const p = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (p.has(m.id)) {
    p.get(m.id)(m);
    p.delete(m.id);
  }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const open = async () => {
  await send("Page.navigate", { url: `${BASE}/zh-Hant/binder` });
  await sleep(7000);
};
await send("Page.enable");
await send("Network.setCookie", { name: "idolca_session", value: session, domain: "localhost", path: "/" });

const results = [];
const check = (name, ok, detail) => results.push(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${JSON.stringify(detail)}`}`);

await open();
let keys = await haveKeys();
check("tracked-only card taken out before is removed", JSON.stringify(keys) === JSON.stringify([B, A].sort()), keys);

// 別的裝置刪掉 B
await api("PUT", { have: { [A]: { count: 1 } }, want: {}, layout: { order: [], hidden: [] } });
await open();
keys = await haveKeys();
check("card deleted on another device stays deleted", JSON.stringify(keys) === JSON.stringify([A]), keys);
const local = await evalJs(`localStorage.getItem("idolca:binder:v3")`);
check("local copy matches account", JSON.parse(local).binder.have[A] && !JSON.parse(local).binder.have[B], local);

// 本機有還沒送出的改動：清空 A
await evalJs(`localStorage.setItem("idolca:binder:v3", JSON.stringify({ binder: { have: {}, want: {}, layout: { order: [], hidden: [] } }, owner: ${JSON.stringify(userId)}, dirty: true }))`);
await open();
await sleep(1500);
keys = await haveKeys();
check("unsent local change wins and is uploaded", keys.length === 0, keys);

console.log(results.join("\n"));
chrome.kill();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
