// 郵箱帳號的端到端檢查：註冊寄驗證信、沒驗證不能綁錢包和刊登、驗證連結只能用一次、忘記密碼不透露帳號是否存在、
// 重設密碼登出其他裝置、改密碼；最後用瀏覽器走一遍註冊、忘記密碼和重設頁並截圖。
// 只對沒設 RESEND_API_KEY 的開發伺服器跑：信寫進伺服器目錄的 .data/outbox.jsonl，從這裡讀連結（見 lib.mjs 的 lastMail）
import { api, check, finish, lastMail, linkIn, openBrowser, photo, sleep, step, tokenIn } from "./lib.mjs";

const email = `mail-${Date.now()}@example.com`;

step("註冊寄驗證信");
const reg = await api("POST", "/api/auth/register", { email, password: "oldpass123", displayName: "Mail Tester", locale: "zh-Hant" });
const A = reg.cookie;
check("registered, unverified", reg.ok && reg.json.user.emailVerified === false);
const first = lastMail(email);
check("verify mail in the account's language", first?.subject.includes("驗證") && linkIn(first)?.includes("/zh-Hant/verify-email?token="), first?.subject);

step("沒驗證不能綁錢包和刊登");
check("wallet link blocked", (await api("POST", "/api/auth/wallet/link", { address: "x", nonce: "n", signature: "s" }, A)).json.error === "email_unverified");
const listed = await api("POST", "/api/items", { photos: [await photo(10), await photo(200)], group: "ITZY", member: "Yeji", priceUsdt: 5 }, A);
check("listing at creation blocked", listed.json.error === "email_unverified");
const kept = await api("POST", "/api/items", { photos: [await photo(20), await photo(220)], group: "ITZY", member: "Yeji" }, A);
check("adding a card without a price still works", kept.ok);
check("listing later blocked", (await api("PATCH", `/api/items/${kept.json.item.id}`, { priceUsdt: 5 }, A)).json.error === "email_unverified");

step("重寄後舊連結作廢，新連結只能用一次");
check("resend", (await api("POST", "/api/auth/verify-email/send", { locale: "en" }, A)).ok);
const second = lastMail(email);
check("resent in English", second?.subject.startsWith("Confirm"));
check("old link dead", (await api("POST", "/api/auth/verify-email", { token: tokenIn(first) })).json.error === "invalid_token");
check("new link works without a session", (await api("POST", "/api/auth/verify-email", { token: tokenIn(second) })).ok);
check("link single-use", (await api("POST", "/api/auth/verify-email", { token: tokenIn(second) })).json.error === "invalid_token");
check("account verified", (await api("GET", "/api/auth/me", undefined, A)).json.user.emailVerified === true);
check("listing allowed now", (await api("PATCH", `/api/items/${kept.json.item.id}`, { priceUsdt: 5 }, A)).ok);

step("忘記密碼");
const B = (await api("POST", "/api/auth/login", { email, password: "oldpass123" })).cookie;
const unknown = await api("POST", "/api/auth/password/forgot", { email: `nobody-${Date.now()}@example.com` });
check("unknown email gets the same answer", unknown.ok && unknown.json.ok === true);
check("forgot", (await api("POST", "/api/auth/password/forgot", { email, locale: "ko" })).ok);
const reset = lastMail(email);
check("reset mail in Korean", reset?.subject.includes("비밀번호") && linkIn(reset)?.includes("/ko/reset-password?token="));
check("short password rejected, link kept", (await api("POST", "/api/auth/password/reset", { token: tokenIn(reset), password: "short" })).json.error === "weak_password");
const done = await api("POST", "/api/auth/password/reset", { token: tokenIn(reset), password: "newpass123" });
check("reset signs this device in", done.ok && !!done.cookie);
check("other device logged out", (await api("GET", "/api/auth/me", undefined, B)).json.user === null);
check("first device logged out too", (await api("GET", "/api/auth/me", undefined, A)).json.user === null);
check("old password rejected", (await api("POST", "/api/auth/login", { email, password: "oldpass123" })).json.error === "invalid_credentials");
check("reset link single-use", (await api("POST", "/api/auth/password/reset", { token: tokenIn(reset), password: "again1234" })).json.error === "invalid_token");

step("改密碼");
const C = done.cookie;
check("wrong current password", (await api("POST", "/api/account/password", { current: "nope", password: "another123" }, C)).json.error === "wrong_password");
const changed = await api("POST", "/api/account/password", { current: "newpass123", password: "another123" }, C);
check("changed, still signed in", changed.ok && (await api("GET", "/api/auth/me", undefined, changed.cookie)).json.user?.email === email);
check("new password works", (await api("POST", "/api/auth/login", { email, password: "another123" })).ok);

// ---- 瀏覽器：註冊彈窗、帳號選單的驗證提示、忘記密碼、重設頁 ----
step("瀏覽器");
const { click, fill, go, has, shot, waitFor, evaluate, close } = await openBrowser();
const clickInDialog = (text) => click(text, { inDialog: true });

const uiEmail = `mail-ui-${Date.now()}@example.com`;
await go("/");
// 首次載入要等前端接管，點早了沒反應；點到彈窗出來為止
const openLogin = async () => {
  for (let i = 0; i < 20; i++) {
    await click("Log in");
    if (await waitFor("!!document.querySelector('#acc-email')", 1500)) return true;
  }
  return false;
};
check("open sign-up", await openLogin());
await fill("#acc-name", "UI Tester");
await fill("#acc-email", uiEmail);
await fill("#acc-password", "uipass1234");
await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
check("check-inbox step", await waitFor(has("Check your inbox"), 20000));
await shot("email-1-check-inbox");
await clickInDialog("Continue");
check("signed in", await waitFor("!document.querySelector('[role=dialog]')", 10000));
await click("UI Tester");
check("menu shows verify notice", await waitFor(has("Resend the email"), 10000));
await shot("email-2-menu-unverified");
await click("Log out");
await sleep(1000);

await openLogin();
await clickInDialog("Log in");
check("forgot link on log-in", await waitFor(has("Forgot password?"), 5000));
await clickInDialog("Forgot password?");
await fill("#acc-email", uiEmail);
await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
check("reset sent message", await waitFor(has("reset link is on its way"), 20000));
await shot("email-3-forgot-sent");

const resetUrl = new URL(linkIn(lastMail(uiEmail)));
await go(resetUrl.pathname + resetUrl.search);
check("reset page", await waitFor("!!document.querySelector('#reset-password')", 20000));
await shot("email-4-reset-form");
await fill("#reset-password", "uipass5678");
await evaluate("document.querySelector('main form').requestSubmit()");
check("reset done page", await waitFor(has("Password updated"), 20000));
await shot("email-5-reset-done");

close();
finish();
