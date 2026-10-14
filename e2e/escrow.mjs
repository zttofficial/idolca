// 擔保交易：逾時退款、申訴與後台退款、逾時自動放款、後台放款，以及每一步該收到的站內通知。
// 網站要用縮短的期限啟動：ESCROW_SHIP_DAYS=0.0003 ESCROW_CONFIRM_DAYS=0.0003 CRON_SECRET=<同 E2E_CRON_SECRET> npm run dev
// 用法：E2E_CRON_SECRET=testcron npm run test:e2e:escrow
import { adminKey, api, check, finish, login, mintSelf, must, newKey, photo, signSend, sleep, step } from "./lib.mjs";

const CRON = process.env.E2E_CRON_SECRET ?? "testcron";
const AD = await login(adminKey());
const seller = newKey();
const buyer = newKey();
const S = await login(seller);
const B = await login(buyer);
await must("POST", "/api/chain/faucet", undefined, S);
await must("POST", "/api/chain/faucet", undefined, B);

const list = async (title) => (await must("POST", "/api/items", { photos: [await photo(200), await photo(20)], title, group: "ITZY", member: "Yuna", quantity: 1, source: "pob", priceUsdt: 3 }, S)).item;
const buy = async (itemId) => {
  const { id, tx } = await must("POST", "/api/orders", { itemId }, B);
  await must("POST", `/api/orders/${id}/confirm`, { signature: await signSend(tx, buyer.kp) }, B);
  return id;
};
const order = async (id, who = B) => (await must("GET", "/api/orders", undefined, who)).orders.find((o) => o.id === id);
const listing = async (itemId) => (await must("GET", "/api/items", undefined, S)).items.find((i) => i.id === itemId);
// 某人有沒有收到某張卡的某種站內通知
const notified = async (who, kind, card) => (await must("GET", "/api/notifications", undefined, who)).items.some((n) => n.kind === kind && n.params.card === card);

step("A. 賣家逾時未寄 → 買家取消退款");
const itemA = await list("Escrow A");
const a = await buy(itemA.id);
let o = await order(a);
check("paid with shipBy", o.status === "paid" && Boolean(o.shipBy), o.shipBy);
check("seller notified of the sale", await notified(S, "order_paid", "Escrow A"));
const early = await api("POST", `/api/orders/${a}/refund`, undefined, B);
check("too early refused", early.status === 409 && early.json.error === "too_early");
await sleep(Math.max(0, Date.parse(o.shipBy) - Date.now()) + 1500);
const r = await api("POST", `/api/orders/${a}/refund`, undefined, B);
check("buyer refund", r.ok && Boolean(r.json.refundTx), r.json.refundTx ?? JSON.stringify(r.json));
check("double refund refused", (await api("POST", `/api/orders/${a}/refund`, undefined, B)).status === 409);
o = await order(a);
check("refunded", o.status === "refunded" && o.refundTx === r.json.refundTx);
check("relisted", (await listing(itemA.id))?.priceUsdt === 3);
check("buyer notified of the refund", await notified(B, "order_refunded", "Escrow A"));
check("seller notified of the refund", await notified(S, "order_refunded_seller", "Escrow A"));

step("B. 寄出 → 申訴 → 後台退款");
const itemB = await list("Escrow B");
const b = await buy(itemB.id);
await must("POST", `/api/orders/${b}/ship`, undefined, S);
check("buyer notified of shipping", await notified(B, "order_shipped", "Escrow B"));
check("dispute", (await api("POST", `/api/orders/${b}/dispute`, { reason: "Wrong member" }, B)).ok);
check("seller notified of the dispute", await notified(S, "order_disputed", "Escrow B"));
await sleep(30000);
o = await order(b);
check("dispute pauses auto-release", o.status === "disputed" && o.disputeReason === "Wrong member", o.status);
check("admin needs login", (await api("POST", `/api/admin/orders/${b}/refund`)).status === 401);
check("non-admin refused", (await api("POST", `/api/admin/orders/${b}/refund`, undefined, B)).status === 403);
check("admin list puts dispute first", (await must("GET", "/api/admin/orders", undefined, AD)).orders[0]?.id === b);
const ar = await api("POST", `/api/admin/orders/${b}/refund`, undefined, AD);
check("admin refund", ar.ok && Boolean(ar.json.refundTx), ar.json.refundTx ?? JSON.stringify(ar.json));
check("release after refund refused", (await api("POST", `/api/admin/orders/${b}/release`, undefined, AD)).status === 409);

step("C. 寄出後逾時未確認 → 排程自動放款");
// C 由賣家做成數位珍藏：成交時數位珍藏也要轉給買家；其他刊登沒上鏈，只過戶不轉 NFT
const itemC = await mintSelf((await list("Escrow C")).id, seller, S);
const c = await buy(itemC.id);
await must("POST", `/api/orders/${c}/ship`, undefined, S);
o = await order(c);
check("shipped with autoReleaseAt", o.status === "shipped" && Boolean(o.autoReleaseAt), o.autoReleaseAt);
check("cron needs secret", (await api("GET", "/api/cron/daily")).status === 403);
await sleep(Math.max(0, Date.parse(o.autoReleaseAt) - Date.now()) + 1500);
const cron = await api("GET", "/api/cron/daily", undefined, undefined, { authorization: `Bearer ${CRON}` });
check("cron released", cron.ok && cron.json.released >= 1, JSON.stringify(cron.json));
o = await order(c, S);
check("completed with payout and transfer", o.status === "completed" && Boolean(o.payoutTx) && Boolean(o.transferTx));
check("seller notified of the payout", await notified(S, "order_completed", "Escrow C"));

step("D. 申訴 → 後台放款");
const itemD = await list("Escrow D");
const d = await buy(itemD.id);
await must("POST", `/api/orders/${d}/ship`, undefined, S);
await must("POST", `/api/orders/${d}/dispute`, { reason: "Not arrived" }, B);
const rel = await api("POST", `/api/admin/orders/${d}/release`, undefined, AD);
check("admin release", rel.ok && Boolean(rel.json.payoutTx), rel.json.payoutTx ?? JSON.stringify(rel.json));
o = await order(d);
check("completed without an NFT to transfer", o.status === "completed" && o.transferTx === null);

finish();
