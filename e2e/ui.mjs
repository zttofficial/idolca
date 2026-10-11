// 前端端到端：在無頭 Chrome 裡注入測試錢包（e2e/test-wallet.js，Wallet Standard、真實簽名上 devnet），點完主要流程並截圖。
// 錢包登入 → 領測試幣 → 買金庫卡 → 掛單、取消 → 填地址申請提貨 → 擔保購買自由刊登 → 開卡包、賣回 → 收藏冊 → 後台出貨
// 用法：npm run test:e2e:ui；截圖存到 E2E_OUT（預設 .data/e2e-shots）。CHROME_PATH 指定 Chrome 位置
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BASE, adminKey, api, check, finish, login, must, newKey, photo, sleep, step } from "./lib.mjs";

const OUT = process.env.E2E_OUT ?? ".data/e2e-shots";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
mkdirSync(OUT, { recursive: true });

// ---- 準備：管理員建測試卡包，賣家建一則自由刊登 ----
const AD = await login(adminKey());
const packId = `ui-${Date.now().toString(36)}`;
await must("POST", "/api/admin/packs", { id: packId, name: "UI Test Pack", priceUsdt: 1.5, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(), palette: ["#3a3a42", "#111114"] }, AD);
for (const [i, member] of ["Yeji", "Chaeryeong"].entries()) {
  const { card } = await must("POST", "/api/admin/vault", { photos: [await photo(i * 90), await photo(i * 90 + 180)], group: "ITZY", member, album: "BORN TO BE", version: "Album Ver.", rarity: "album", location: "SEL-E2E-03" }, AD);
  await must("POST", `/api/admin/packs/${packId}/cards`, { cardId: card.id, tier: i ? "R" : "SR", valueUsdt: i ? 4 : 20 }, AD);
}
const seller = newKey();
const S = await login(seller);
const item = (await must("POST", "/api/items", { photos: [await photo(40), await photo(260)], title: "UI test set", group: "ITZY", member: "Ryujin, Yuna", quantity: 2, source: "pob", priceUsdt: 8 }, S)).item;

// ---- 買家：瀏覽器 + 測試錢包 ----
const buyer = newKey();
const walletJs = readFileSync("e2e/test-wallet.js", "utf8").replaceAll("__SEED__", JSON.stringify(buyer.seed)).replaceAll("__PUBKEY__", JSON.stringify(buyer.pub)).replaceAll("__ADDRESS__", buyer.address);
const PORT = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/profile-${Date.now()}`, "--window-size=1440,1000", "--hide-scrollbars", "about:blank"]);
let targets;
for (let i = 0; i < 50; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    if (targets.some((t) => t.type === "page")) break;
  } catch {}
  await sleep(200);
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name) => writeFileSync(`${OUT}/${name}.png`, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
const click = (text) => evaluate(`(() => { const b = [...document.querySelectorAll('button, a')].find(b => b.textContent.trim().includes(${JSON.stringify(text)}) && !b.disabled); if (!b) return false; b.click(); return true; })()`);
const waitFor = async (expr, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evaluate(expr)) return true; await sleep(500); } return false; };
const has = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`;
const go = async (path) => { await send("Page.navigate", { url: BASE + path }); await sleep(5000); };
// React 受控輸入：用原生 setter 設值再觸發 input/change
const fill = (selector, value) =>
  evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); return true; })()`);

await send("Page.enable");
await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: walletJs });
await evaluate("window.confirm = () => true");

step("錢包登入");
await go("/");
check("open login", await click("Log in"));
await sleep(800);
check("wallet tab", await click("Wallet"));
await sleep(300);
check("test wallet listed", await click("Idolca Test Wallet"));
check("logged in", await waitFor(`!document.querySelector('[role=dialog]') && ${has(buyer.address.slice(0, 4))}`, 20000));

step("領測試幣");
await evaluate(`[...document.querySelectorAll('header button[aria-expanded]')].find(b => !b.hasAttribute('aria-haspopup')).click()`);
await sleep(800);
check("faucet", await click("Get devnet test funds"));
check("funded", await waitFor(has("500 USDT"), 60000));
await shot("1-account-menu");

step("買金庫卡");
const state = (await must("GET", "/api/chain/state")).cards;
const [cardId] = Object.entries(state).filter(([, s]) => s.listing).sort((a, b) => a[1].listing.priceUsdt - b[1].listing.priceUsdt)[0];
await go(`/card/${cardId}`);
check("buy", await click("Buy now for"));
check("bought", await waitFor(has("Bought. The NFT is in your wallet")));
await shot("2-card-bought");

step("掛單、取消");
await fill('input[aria-label="Listing price"]', "25");
check("list", await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'List'); b.click(); return true; })()`));
check("listed", await waitFor(has("Listed. View the transaction")));
check("cancel listing", await click("Cancel listing"));
check("cancelled", await waitFor(has("Listing cancelled")));

step("申請提貨");
check("open redeem form", await click("Request redemption"));
await sleep(500);
for (const [field, value] of [["name", "Kim Minji"], ["tel", "+82 10 1234 5678"], ["address-line1", "123 Teheran-ro"], ["address-level2", "Seoul"], ["postal-code", "06134"]]) await fill(`[role=dialog] [autocomplete="${field}"]`, value);
await fill('[role=dialog] select[autocomplete="country"]', "KR");
await shot("3-redeem-form");
check("submit redeem", await click("Confirm and sign"));
check("redeeming", await waitFor(has("Redemption requested. View the transaction")));
await shot("4-card-redeeming");

step("擔保購買自由刊登");
await go(`/listing/${item.id}`);
check("buy with escrow", await click("Buy with escrow"));
check("paid", await waitFor(has("Paid into escrow")));
const orders = (await must("GET", "/api/orders", undefined, S)).orders;
await must("POST", `/api/orders/${orders[0].id}/ship`, undefined, S);
await go("/binder?tab=orders");
check("confirm received", await click("Confirm received"));
check("completed", await waitFor(has("Completed")));
await shot("5-orders-completed");

step("開卡包、賣回");
await go(`/packs/${packId}`);
check("open 1", await click("Open 1"));
await sleep(500);
check("age confirm shown", await waitFor(has("18 or older"), 10000));
await evaluate(`document.querySelector('input[type=checkbox]').click()`);
check("age continue", await click("Continue"));
await sleep(1500);
check("open 1 again", await click("Open 1"));
check("pack revealed", await waitFor(has("Tap to open"), 120000));
await evaluate(`document.querySelector('[role=dialog] button[aria-label]')?.click()`);
await sleep(1500);
await click("Reveal all");
await sleep(2500);
await click("See results");
await sleep(1000);
await shot("6-pack-results");
check("sell back", await click("Sell back"));
check("sold back", await waitFor(has("Sold back"), 60000));
await shot("7-pack-sold");

step("收藏冊");
await go("/binder?tab=onchain");
await sleep(3000);
await shot("8-binder-onchain");

step("後台出貨");
const ship = await api("POST", `/api/admin/redemptions/${cardId}/ship`, undefined, AD);
check("shipped and burned", ship.ok && Boolean(ship.json.shipTx), ship.json.shipTx ?? JSON.stringify(ship.json));
await send("Network.setCookie", { name: AD.split("=")[0], value: AD.split("=")[1], url: BASE });
await go("/admin");
await sleep(3000);
await shot("9-admin");

console.log(`\nscreenshots in ${OUT}`);
ws.close();
chrome.kill();
finish();
