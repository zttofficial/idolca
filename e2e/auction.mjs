// 自由刊登的拍賣：出價鎖款、被超過退款、結標轉成擔保訂單、保底價流拍、賣家取消、截止後才付款的出價、假卡作廢拍賣；
// 金庫卡拍賣的出價紀錄；每一步該收到的站內通知。
// 網站要用縮短的時間啟動（拍賣選 1 天時實際只有 AUCTION_DAY_SECONDS 秒）：
//   PGLITE_DIR=.data/pglite-e2e AUCTION_DAY_SECONDS=25 AUCTION_BID_WINDOW_SECONDS=6 AUCTION_EXTEND_SECONDS=4 npm run dev
// 用法：npm run test:e2e:auction
import { ADDRESS, adminKey, api, check, finish, login, must, newKey, photo, ship, signSend, sleep, step } from "./lib.mjs";

const AD = await login(adminKey());
const seller = newKey();
const bidder1 = newKey();
const bidder2 = newKey();
const S = await login(seller);
const B1 = await login(bidder1);
const B2 = await login(bidder2);
for (const who of [S, B1, B2]) await must("POST", "/api/chain/faucet", undefined, who);

const addItem = async (title) => (await must("POST", "/api/items", { photos: [await photo(120), await photo(60)], title, group: "IVE", member: "Wonyoung", quantity: 1, source: "album" }, S)).item;
const startAuction = async (itemId, input) => (await must("POST", `/api/items/${itemId}/auction`, { days: 1, ...input }, S)).item.auction;
const auction = async (id, who) => (await must("GET", `/api/auctions/${id}`, undefined, who)).auction;
// 錢包裡兩種結算代幣的總額：出價時錢包裡哪種多就付哪種，退款退回原來的那種，所以核對總額
const usd = async (who) => {
  const b = await must("GET", "/api/chain/balance", undefined, who);
  return Math.round((b.usdt + b.usdc) * 100) / 100;
};
// 出價：建單（帶收件地址，address 傳 null 時沿用這場上一口的）、錢包簽付款交易、回報確認。回傳確認的回應（被拒時是錯誤碼）
async function bid(auctionId, key, who, amountUsd, address = ADDRESS) {
  const created = await api("POST", "/api/bids", { auctionId, amountUsd, ...(address ? { address } : {}) }, who);
  if (!created.ok) return created;
  return api("POST", `/api/bids/${created.json.id}/confirm`, { signature: await signSend(created.json.tx, key.kp) }, who);
}
// 等某個條件成立（例如退款落地、結標），最多 60 秒；每次輪詢都會觸發伺服器順便結標和退款
async function until(label, test) {
  for (let i = 0; i < 30; i++) {
    if (await test()) return true;
    await sleep(2000);
  }
  return false;
}
const waitEnd = async (a) => sleep(Math.max(0, Date.parse(a.endsAt) - Date.now()) + 7000);
// 站內通知：某人有沒有收到某張卡的某種通知。金庫卡的通知在回應後才寫入，要等一下
const notes = async (who) => must("GET", "/api/notifications", undefined, who);
const notified = (who, kind, card) => until(kind, async () => (await notes(who)).items.some((n) => n.kind === kind && n.params.card === card));

step("A. 出價鎖款、被超過退款、結標轉成擔保訂單");
const itemA = await addItem("Auction A");
let a = await startAuction(itemA.id, { startUsd: 10 });
check("auction live", a.status === "live" && a.startUsd === 10 && a.minNextUsd === 10, JSON.stringify(a));
check("fixed listing refused", (await api("PATCH", `/api/items/${itemA.id}`, { priceUsdt: 5 }, S)).json.error === "in_auction");
check("seller can't bid", (await api("POST", "/api/bids", { auctionId: a.id, amountUsd: 10 }, S)).json.error === "own_auction");
const b1Start = await usd(B1);
check("address required to bid", (await api("POST", "/api/bids", { auctionId: a.id, amountUsd: 10 }, B1)).json.error === "address_required");
check("bidder 1 bids 10", (await bid(a.id, bidder1, B1, 10)).ok);
check("bid locks the payment", (await usd(B1)) === b1Start - 10);
check("below minimum refused", (await api("POST", "/api/bids", { auctionId: a.id, amountUsd: 10.5 }, B2)).json.error === "bid_too_low");
const outbid = await bid(a.id, bidder2, B2, 11);
check("bidder 2 bids 11", outbid.ok && outbid.json.auction.highUsd === 11 && outbid.json.auction.minNextUsd === 12, JSON.stringify(outbid.json));
check("leader can't bid again", (await api("POST", "/api/bids", { auctionId: a.id, amountUsd: 12 }, B2)).json.error === "already_leading");
check("cancel refused after bids", (await api("DELETE", `/api/items/${itemA.id}/auction`, undefined, S)).json.error === "has_bids");
a = await auction(a.id, B1);
check("history with aliases", a.history.length === 2 && a.history[0].amountUsd === 11 && a.history[1].mine && !a.history[0].mine, JSON.stringify(a.history));
check("outbid bidder refunded", await until("refund", async () => (await usd(B1)) === b1Start));
check("seller notified of the bid", await notified(S, "bid_received", "Auction A"));
check("outbid bidder notified", await notified(B1, "outbid", "Auction A"));
check("leader not told they were outbid", !(await notes(B2)).items.some((n) => n.kind === "outbid"));
const unread = (await notes(S)).unread;
await must("POST", "/api/notifications/read", undefined, S);
check("mark all read", unread >= 2 && (await notes(S)).unread === 0, String(unread));
await waitEnd(a);
check("settled as sold", await until("sold", async () => (await auction(a.id, B2)).status === "sold"));
a = await auction(a.id, B2);
check("winner sees the win", a.me?.leading === true, JSON.stringify(a.me));
const orderA = (await must("GET", "/api/orders", undefined, B2)).orders.find((o) => o.itemId === itemA.id);
check("winning bid became a paid escrow order", orderA?.auction && orderA.status === "paid" && orderA.priceUsdt === 11 && orderA.feeUsdt === 0.44, JSON.stringify(orderA));
check("winner notified", await notified(B2, "auction_won_free", "Auction A"));
check("seller notified of the sale", await notified(S, "auction_sold_free", "Auction A"));
check("winning order carries the bid's address", orderA.shippingAddress?.line1 === ADDRESS.line1 && orderA.shipBy !== null, JSON.stringify(orderA.shippingAddress));
check("seller sees the winner's address", (await must("GET", "/api/orders", undefined, S)).orders.find((o) => o.id === orderA.id)?.shippingAddress?.line1 === ADDRESS.line1);
await must("POST", `/api/orders/${orderA.id}/address`, { address: { ...ADDRESS, line2: "Unit 2" } }, B2);
check("seller notified when the winner changes the address", await notified(S, "order_address", "Auction A"));
await ship(orderA.id, S);
check("buyer notified of shipping", await notified(B2, "order_shipped", "Auction A"));
const received = await must("POST", `/api/orders/${orderA.id}/receive`, undefined, B2);
check("seller paid after receipt", Boolean(received.payoutTx));
check("seller notified of the payout", await notified(S, "order_completed", "Auction A"));

step("B. 沒達到保底價就流拍，出價全額退回");
const itemB = await addItem("Auction B");
let b = await startAuction(itemB.id, { startUsd: 10, reserveUsd: 50 });
const b1Before = await usd(B1);
check("bid under reserve accepted", (await bid(b.id, bidder1, B1, 20)).ok);
b = await auction(b.id);
check("reserve not met shown", b.hasReserve && !b.reserveMet && b.highUsd === 20);
await waitEnd(b);
check("settled as unsold", await until("unsold", async () => (await auction(b.id)).status === "unsold"));
check("high bid refunded", await until("refund", async () => (await usd(B1)) === b1Before));
check("seller notified: no sale", await notified(S, "auction_unsold", "Auction B"));
check("high bidder notified: no sale", await notified(B1, "auction_lost", "Auction B"));
const backB = (await must("GET", "/api/items", undefined, S)).items.find((i) => i.id === itemB.id);
check("card back in the binder, unlisted", backB && backB.auction === null && backB.priceUsdt === null);

step("C. 沒人出價時賣家可以取消");
const itemC = await addItem("Auction C");
await startAuction(itemC.id, { startUsd: 12 });
const cancelled = await api("DELETE", `/api/items/${itemC.id}/auction`, undefined, S);
check("seller cancels", cancelled.ok && cancelled.json.item.auction === null);
check("listing gone", (await api("GET", `/api/listings`)).json.listings.every((l) => l.id !== itemC.id));

step("D. 截止後才付款的出價不被接受，全額退回");
const itemD = await addItem("Auction D");
const d = await startAuction(itemD.id, { startUsd: 10 });
const late = await must("POST", "/api/bids", { auctionId: d.id, amountUsd: 10, address: ADDRESS }, B1);
const b1BeforeLate = await usd(B1);
await waitEnd(d);
const lateConfirm = await api("POST", `/api/bids/${late.id}/confirm`, { signature: await signSend(late.tx, bidder1.kp) }, B1);
check("late bid rejected", lateConfirm.json.error === "auction_ended", JSON.stringify(lateConfirm.json));
check("late bid refunded", await until("refund", async () => (await usd(B1)) === b1BeforeLate));
check("auction unsold", await until("unsold", async () => (await auction(d.id)).status === "unsold"));

step("E. 卡被標成假卡時拍賣作廢，出價退回");
const itemE = await addItem("Auction E");
const e = await startAuction(itemE.id, { startUsd: 10 });
const b2Before = await usd(B2);
check("bid placed", (await bid(e.id, bidder2, B2, 10)).ok);
await must("PATCH", `/api/admin/items/${itemE.id}`, { verification: "fake", note: "e2e" }, AD);
check("auction cancelled", (await auction(e.id)).status === "cancelled");
check("bidder notified of the void", await notified(B2, "auction_lost", "Auction E"));
check("bid refunded", await until("refund", async () => (await usd(B2)) === b2Before));

step("F. 金庫卡的鏈上拍賣：開拍、出價鎖款、被超過時同一筆交易退回、有人出價後不能取消");
// 鏈上最短拍賣 1 天，結標和流拍由合約測試（onchain/tests）在本地驗證節點上驗證
if (!(await must("GET", "/api/chain/state")).auctions) {
  check("vault auctions open on-chain", false, "AuctionConfig missing, run npm run chain:setup-market");
} else {
  const vaultTx = async (who, key, body) => {
    const r = await api("POST", "/api/chain/vault/tx", body, who);
    if (!r.ok) return r;
    const signature = await signSend(r.json.tx, key.kp);
    return api("POST", "/api/chain/vault/confirm", { action: body.action, cardId: body.cardId, signature }, who);
  };
  const vaultAuction = async (cardId) => (await must("GET", "/api/chain/state")).cards[cardId]?.auction;
  const { card } = await must("POST", "/api/admin/vault", { photos: [await photo(20), await photo(200)], group: "IVE", member: "Rei", album: "I've IVE", version: "Album Ver.", rarity: "album", location: "SEL-E2E-04", depositor: seller.address }, AD);
  check("seller owns the vault card", (await must("GET", "/api/chain/state")).cards[card.id]?.owner === seller.address);
  check("start auction", (await vaultTx(S, seller, { action: "auction", cardId: card.id, startUsd: 10, days: 1 })).ok);
  let va = await vaultAuction(card.id);
  check("auction on-chain", va?.seller === seller.address && va.startUsd === 10 && va.feeBps === 400 && va.status === "live", JSON.stringify(va));
  check("seller can't bid", (await api("POST", "/api/chain/vault/tx", { action: "bid", cardId: card.id, amountUsd: 10 }, S)).json.error === "own_auction");
  const v1 = await usd(B1);
  check("bidder 1 bids 10", (await vaultTx(B1, bidder1, { action: "bid", cardId: card.id, amountUsd: 10 })).ok);
  check("bid locked on-chain", (await usd(B1)) === v1 - 10);
  check("below minimum refused", (await api("POST", "/api/chain/vault/tx", { action: "bid", cardId: card.id, amountUsd: 10.5 }, B2)).json.error === "bid_too_low");
  check("bidder 2 bids 11", (await vaultTx(B2, bidder2, { action: "bid", cardId: card.id, amountUsd: 11 })).ok);
  check("bidder 1 refunded in the same transaction", (await usd(B1)) === v1);
  va = await vaultAuction(card.id);
  check("leader and next minimum", va?.highBidder === bidder2.address && va.highUsd === 11 && va.minNextUsd === 12 && va.bidCount === 2, JSON.stringify(va));
  check("cancel refused after bids", (await api("POST", "/api/chain/vault/tx", { action: "cancelAuction", cardId: card.id }, S)).json.error === "has_bids");
  const history = (await must("GET", `/api/chain/bids/${card.id}?count=2`)).bids;
  check("on-chain bid history", history.length === 2 && history[0].bidder === bidder2.address && history[0].amountUsd === 11 && history[1].bidder === bidder1.address && history.every((h) => h.signature), JSON.stringify(history));
  const title = "IVE Rei Album Ver.";
  check("vault seller notified of the bid", await notified(S, "bid_received", title));
  check("vault outbid bidder notified", await notified(B1, "outbid", title));

  const { card: other } = await must("POST", "/api/admin/vault", { photos: [await photo(80), await photo(260)], group: "IVE", member: "Liz", album: "I've IVE", version: "Album Ver.", rarity: "album", location: "SEL-E2E-04", depositor: seller.address }, AD);
  await vaultTx(S, seller, { action: "auction", cardId: other.id, startUsd: 10, days: 1 });
  check("cancel before bids", (await vaultTx(S, seller, { action: "cancelAuction", cardId: other.id })).ok);
  const back = (await must("GET", "/api/chain/state")).cards[other.id];
  check("card back in the seller's wallet", back?.owner === seller.address && back.auction === null);
}

finish();
