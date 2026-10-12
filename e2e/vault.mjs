// 金庫與卡包：管理員入庫鑄卡 → 建卡包、放卡 → 買家開包（承諾—揭示抽卡、NFT 轉移）→ 卡池不夠時自動退款
// → 抽完後公開種子、重算每一抽 → 回購回到卡池 → 提貨（地址、運費）→ 後台取消提貨退運費
// 用法：npm run test:e2e:vault
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { adminKey, api, check, conn, finish, login, must, newKey, photo, signSend, step } from "./lib.mjs";
import { verifyDraw } from "../src/lib/pack-draw.ts";

const admin = adminKey();
const AD = await login(admin);
check("admin flag", (await api("GET", "/api/auth/me", undefined, AD)).json.user?.isAdmin === true);

step("權限");
const buyer = newKey();
const B = await login(buyer);
check("non-admin blocked", (await api("GET", "/api/admin/packs", undefined, B)).status === 403);
check("anonymous blocked", (await api("GET", "/api/admin/orders")).status === 401);

step("入庫");
const intake = await api("POST", "/api/admin/vault", { photos: [await photo(300), await photo(120)], group: "ITZY", member: "Yuna", album: "BORN TO BE", version: "Fansign Event", rarity: "fansign", grader: "psa", gradeScore: 9, gradeCert: "E2E12345678", condition: "Sharp corners", location: "SEL-E2E-01" }, AD);
check("intake minted", intake.ok && Boolean(intake.json.mintTx), intake.json.card?.serial ?? JSON.stringify(intake.json));
const fresh = intake.json.card;
check("in vault list", (await must("GET", "/api/vault/cards")).cards.some((c) => c.id === fresh.id));
const meta = (await api("GET", `/api/meta/card/${fresh.id}`)).json;
check("metadata has grade", meta.attributes?.some((a) => a.trait_type === "Grade" && a.value === "PSA 9"), meta.name);
check("bad rarity refused", (await api("POST", "/api/admin/vault", { photos: [await photo(), await photo()], group: "x", member: "y", album: "z", version: "v", rarity: "nope", location: "a" }, AD)).status === 400);

step("建卡包、放卡");
const packId = `e2e-${Date.now().toString(36)}`;
const now = Date.now();
await must("POST", "/api/admin/packs", { id: packId, name: "E2E Pack", priceUsdt: 1, startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 86_400_000).toISOString(), palette: ["#ff6f93", "#e8285a"] }, AD);
check("duplicate pack refused", (await api("POST", "/api/admin/packs", { id: packId, name: "x", priceUsdt: 1, startsAt: new Date(now).toISOString(), endsAt: new Date(now + 1000).toISOString(), palette: ["#000000", "#ffffff"] }, AD)).status === 409);
// 卡池另外入庫兩張平台自有卡，測試不依賴現有庫存
const others = [];
for (const [member, hue] of [["Ryujin", 30], ["Lia", 90]]) {
  others.push((await must("POST", "/api/admin/vault", { photos: [await photo(hue), await photo(hue + 180)], group: "ITZY", member, album: "BORN TO BE", version: "Album Ver.", rarity: "album", location: "SEL-E2E-02" }, AD)).card);
}
const { assignable } = await must("GET", "/api/admin/packs", undefined, AD);
check("new cards assignable", [fresh, ...others].every((c) => assignable.some((x) => x.id === c.id)), `${assignable.length} assignable`);
await must("POST", `/api/admin/packs/${packId}/cards`, { cardId: fresh.id, tier: "SSR", valueUsdt: 50 }, AD);
await must("POST", `/api/admin/packs/${packId}/cards`, { cardId: others[0].id, tier: "R", valueUsdt: 5 }, AD);
await must("POST", `/api/admin/packs/${packId}/cards`, { cardId: others[1].id, tier: "N", valueUsdt: 2 }, AD);
check("assigned card no longer assignable", (await api("POST", `/api/admin/packs/${packId}/cards`, { cardId: fresh.id, tier: "N", valueUsdt: 1 }, AD)).status === 409);
let pack = (await must("GET", `/api/packs/${packId}/pool`)).pack;
check("pool of 3", pack.pool.length === 3 && pack.pool.every((e) => e.remaining === 1));
check("seed hidden", pack.seed === null && /^[0-9a-f]{64}$/.test(pack.seedHash));

step("開包");
await must("POST", "/api/chain/faucet", undefined, B);
check("age required", (await api("POST", `/api/packs/${packId}/order`, { qty: 1 }, B)).json.error === "age_required");
await must("POST", "/api/account/age", undefined, B);
const open = async (qty) => {
  const order = await must("POST", `/api/packs/${packId}/order`, { qty }, B);
  return must("POST", `/api/packs/orders/${order.id}/confirm`, { signature: await signSend(order.tx, buyer.kp) }, B);
};
const first = await open(2);
check("2 pulls delivered", first.pulls.length === 2 && first.pulls.every((p) => p.tx), first.pulls.map((p) => p.card.serial).join(","));
check("no refund", first.refundTx === null);
const state = (await must("GET", "/api/chain/state")).cards;
check("buyer owns pulls on-chain", first.pulls.every((p) => state[p.cardId]?.owner === buyer.address));
check("sold out refused", (await api("POST", `/api/packs/${packId}/order`, { qty: 2 }, B)).json.error === "sold_out");

step("卡池不夠時自動退款");
const late = await must("POST", `/api/packs/${packId}/order`, { qty: 1 }, B);
check("last card delivered", (await open(1)).pulls.length === 1);
const lateResult = await must("POST", `/api/packs/orders/${late.id}/confirm`, { signature: await signSend(late.tx, buyer.kp) }, B);
check("empty pool refunded", lateResult.pulls.length === 0 && Boolean(lateResult.refundTx));

step("公平性核對");
const draws = await must("GET", `/api/packs/${packId}/draws`);
check("seed revealed and matches commitment", typeof draws.seed === "string" && createHash("sha256").update(draws.seed).digest("hex") === draws.seedHash);
check("every draw recomputes", draws.draws.length === 3 && draws.draws.every((d) => verifyDraw(draws.seed, d)), `${draws.draws.length} draws`);

step("回購");
const sell = first.pulls[0];
const bb = await must("POST", "/api/packs/buyback", { cardId: sell.cardId }, B);
await must("POST", "/api/packs/buyback/confirm", { cardId: sell.cardId, signature: await signSend(bb.tx, buyer.kp) }, B);
pack = (await must("GET", `/api/packs/${packId}/pool`)).pack;
check("back in pool", pack.pool.find((e) => e.id === sell.cardId)?.remaining === 1, `${bb.amountUsdt} USDT`);
check("double buyback refused", (await api("POST", "/api/packs/buyback", { cardId: sell.cardId }, B)).status === 409);
await must("DELETE", `/api/admin/packs/${packId}/cards`, { cardId: sell.cardId }, AD);
check("removed from pool", !(await must("GET", `/api/packs/${packId}/pool`)).pack.pool.some((e) => e.id === sell.cardId));

step("提貨：地址、運費、後台取消");
const keep = first.pulls[1].cardId;
const address = { name: "Kim Minji", phone: "+82 10 1234 5678", line1: "123 Teheran-ro", line2: "", city: "Seoul", region: "", postal: "06134", country: "KR" };
check("address required", (await api("POST", "/api/chain/vault/tx", { action: "redeem", cardId: keep }, B)).json.error === "invalid_address");
const redeem = await must("POST", "/api/chain/vault/tx", { action: "redeem", cardId: keep, address }, B);
const redeemSig = await signSend(redeem.tx, buyer.kp);
await must("POST", "/api/chain/vault/confirm", { action: "redeem", cardId: keep, signature: redeemSig, address }, B);
const req = (await must("GET", "/api/admin/redemptions", undefined, AD)).redemptions.find((r) => r.cardId === keep);
check("redemption recorded with paid fee and address", req && req.feePaid === 1 && JSON.parse(req.shippingAddress).city === "Seoul", `fee ${redeem.feeUsdt} USDT`);
const cancel = await api("POST", `/api/admin/redemptions/${keep}/cancel`, undefined, AD);
check("admin cancel refunds fee", cancel.ok && Boolean(cancel.json.cancelTx) && (redeem.feeUsdt === 0 || Boolean(cancel.json.refundTx)));
const after = (await must("GET", "/api/chain/state")).cards[keep];
check("card unfrozen and still the buyer's", after.owner === buyer.address && !after.redeeming);
const again = await must("POST", "/api/chain/vault/tx", { action: "redeem", cardId: keep, address }, B);
const againSig = await signSend(again.tx, buyer.kp);
await must("POST", "/api/chain/vault/confirm", { action: "redeem", cardId: keep, signature: againSig, address }, B);
check("can request redemption again after a cancel", (await must("GET", "/api/chain/state")).cards[keep].redeeming === true);
check("second cancel", (await api("POST", `/api/admin/redemptions/${keep}/cancel`, undefined, AD)).ok);

step("收藏卡寄進金庫");
const minted = (await must("POST", "/api/items", { photos: [await photo(50), await photo(230)], group: "ITZY", member: "Yeji", album: "BORN TO BE", version: "Lucky Draw Round 1", source: "luckydraw", quantity: 1, priceUsdt: 9 }, B)).item;
const req2 = await api("POST", `/api/items/${minted.id}/vault`, undefined, B);
check("request delists", req2.ok && req2.json.item.priceUsdt === null && Boolean(req2.json.item.vaultRequestedAt));
check("relisting refused while requested", (await api("PATCH", `/api/items/${minted.id}`, { priceUsdt: 9 }, B)).json.error === "in_vault");
check("other users can't request it", (await api("POST", `/api/items/${minted.id}/vault`, undefined, AD)).status === 409);
const adminItems = (await must("GET", "/api/admin/items", undefined, AD)).items;
check("admin sees request first", adminItems[0]?.id === minted.id);
const conv = await api("POST", `/api/admin/items/${minted.id}/vault`, { rarity: "luckydraw", grader: "brg", gradeScore: 8.5, gradeCert: "BRG-E2E-01", location: "SEL-E2E-04", condition: "Clean" }, AD);
check("converted to vault card", conv.ok && conv.json.card?.serial?.startsWith("IC-") && Boolean(conv.json.burnTx), conv.json.card?.serial ?? JSON.stringify(conv.json));
const vc = conv.json.card;
check("photos carried over", vc.image?.front === minted.photo && vc.image?.back === minted.photoBack);
check("vault NFT owned by the depositor", (await must("GET", "/api/chain/state")).cards[vc.id]?.owner === buyer.address);
const old = await conn.getAccountInfo(new PublicKey(minted.asset));
check("collector NFT burned", !old || old.data.length <= 1 || old.data[0] !== 1);
check("collector item gone from my items", !(await must("GET", "/api/items", undefined, B)).items.some((i) => i.id === minted.id));
check("convert is idempotent", (await api("POST", `/api/admin/items/${minted.id}/vault`, {}, AD)).json.card?.id === vc.id);

const returned = (await must("POST", "/api/items", { photos: [await photo(10), await photo(190)], group: "ITZY", member: "Lia", source: "album", quantity: 1 }, B)).item;
await must("POST", `/api/items/${returned.id}/vault`, undefined, B);
check("admin return clears request", (await api("DELETE", `/api/admin/items/${returned.id}/vault`, undefined, AD)).ok && !(await must("GET", "/api/items", undefined, B)).items.find((i) => i.id === returned.id).vaultRequestedAt);

finish();
