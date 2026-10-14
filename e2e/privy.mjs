// 收藏錢包（Privy 嵌入式錢包）的端到端檢查：郵箱帳號在帳號選單建立收藏錢包（輸入 Privy 的驗證碼）並綁定，
// 換頁之後不用再輸入驗證碼就能用它付款（Privy 在背景恢復登入），付款交易的手續費由平台付。
// 要用 Privy 的測試帳號（Privy 後台 User management > Authentication > Advanced 開啟）：E2E_PRIVY_EMAIL、E2E_PRIVY_CODE。
// 網站要設 NEXT_PUBLIC_PRIVY_APP_ID、不設 RESEND_API_KEY（驗證信從 .data/outbox.jsonl 讀）
import { api, check, finish, lastMail, login, must, newKey, openBrowser, photo, sleep, step, tokenIn } from "./lib.mjs";

const EMAIL = process.env.E2E_PRIVY_EMAIL;
const CODE = process.env.E2E_PRIVY_CODE;
if (!EMAIL || !CODE) throw new Error("設定 E2E_PRIVY_EMAIL、E2E_PRIVY_CODE（Privy 測試帳號）");
const PASSWORD = "privytest123";

step("賣家刊登");
const S = await login(newKey());
const item = (await must("POST", "/api/items", { photos: [await photo(120), await photo(300)], title: "Privy test", group: "ITZY", member: "Yuna", quantity: 1, source: "pob", priceUsdt: 2 }, S)).item;
check("listed", item.priceUsdt === 2);

step("粉絲的郵箱帳號");
// 同一個測試信箱可能已經在這個資料庫註冊過：註冊不了就登入
const reg = await api("POST", "/api/auth/register", { email: EMAIL, password: PASSWORD, displayName: "Privy Fan" });
const F = reg.ok ? reg.cookie : (await api("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD })).cookie;
check("signed in", !!F);
let me = (await api("GET", "/api/auth/me", undefined, F)).json.user;
if (!me.emailVerified) {
  await must("POST", "/api/auth/verify-email", { token: tokenIn(lastMail(EMAIL)) });
  me = (await api("GET", "/api/auth/me", undefined, F)).json.user;
}
check("email verified", me.emailVerified);

const b = await openBrowser();
await b.setCookie(F);
step("建立收藏錢包");
// 這個帳號之前跑測試時已經建過收藏錢包，就跳過建立，改測「換了裝置要重新輸入驗證碼」
const created = !me.walletAddress;
if (created) {
  await b.go("/");
  check("open account menu", await b.waitFor(`(() => { const x = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(me.displayName)})); x?.click(); return !!x; })()`, 20000));
  check("collection wallet offered", await b.waitFor(b.has("Create my collection wallet"), 10000));
  await b.shot("privy-1-setup");
  await b.click("Create my collection wallet");
  const asked = await b.waitFor("!!document.querySelector('input[autocomplete=one-time-code]')", 60000);
  check("code asked", asked, asked ? "" : b.errors.slice(-5).join(" | "));
  await b.shot("privy-2-code");
  await b.fill("input[autocomplete=one-time-code]", CODE);
  await b.click("Confirm", { inDialog: true });
  // 建錢包、簽名綁定
  for (let i = 0; i < 60 && !me.walletAddress; i++) {
    await sleep(1000);
    me = (await api("GET", "/api/auth/me", undefined, F)).json.user;
  }
  await b.shot("privy-3-linked");
}
check("collection wallet linked", me.walletKind === "privy" && !!me.walletAddress, me.walletAddress ?? "");

step("領測試幣");
// 水龍頭每個帳號 10 分鐘一次，餘額已經夠付就不領
const have = await must("GET", "/api/chain/balance", undefined, F);
if (have.usdt + (have.usdc ?? 0) < 2) await must("POST", "/api/chain/faucet", undefined, F);
const balance = await must("GET", "/api/chain/balance", undefined, F);
check("funded", balance.usdt + (balance.usdc ?? 0) >= 2, JSON.stringify(balance));

step(created ? "換頁後用收藏錢包付款（同一個瀏覽器，不用再輸入驗證碼）" : "在新的瀏覽器用收藏錢包付款（要重新輸入驗證碼）");
await b.go(`/listing/${item.id}`);
check("buy button", await b.waitFor(b.has("Buy with escrow"), 20000));
await b.click("Buy with escrow");
check("payment picker", await b.waitFor(b.has("Choose how to pay"), 10000));
const solBefore = (await must("GET", "/api/chain/balance", undefined, F)).sol;
await b.click("Solana wallet");
const codeShown = "!!document.querySelector('input[autocomplete=one-time-code]')";
let order = null;
let codeAsked = false;
for (let i = 0; i < 90 && !order; i++) {
  await sleep(1000);
  if (!codeAsked && (await b.evaluate(codeShown))) {
    codeAsked = true;
    // 驗證碼視窗要蓋在付款面板上面，用戶才看得到
    check("code dialog on top", await b.evaluate("(() => { const i = document.querySelector('input[autocomplete=one-time-code]'); const r = i.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === i; })()"));
    await b.shot("privy-4-relogin");
    if (created) break;
    await b.fill("input[autocomplete=one-time-code]", CODE);
    await b.click("Confirm", { inDialog: true });
  }
  order = (await api("GET", "/api/orders", undefined, F)).json.orders?.find((o) => o.itemId === item.id && o.status === "paid") ?? null;
}
await b.shot("privy-5-paid");
check(created ? "no code asked again" : "code asked on the new browser", codeAsked === !created);
check("order paid", !!order, order ? `${order.priceUsdt} paid` : b.errors.slice(-3).join(" | "));
// 手續費由平台付：錢包的 SOL 一點都沒少
check("no SOL spent by the fan", (await must("GET", "/api/chain/balance", undefined, F)).sol === solBefore);

b.close();
finish();
