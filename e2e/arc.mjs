// Arc 收款通道：在 Arc 上用 USDC 授權轉帳付款，卡照樣在 Solana 上交付。
// 開卡包（付款、重複回報、卡池不夠時在 Arc 上退款、偽造的授權被拒）和擔保交易（付款、後台退款退回 Arc）。
// 網站要開通 Arc 測試網：NEXT_PUBLIC_ARC_NETWORK=testnet ARC_PLATFORM_KEYFILE=.data/arc-platform-testnet.json
// 買家的 Arc 金鑰檔用 E2E_ARC_BUYER 指定（預設 .data/arc-buyer-testnet.json），裡面要有測試網 USDC（Circle Faucet）
// 用法：npm run test:e2e:arc
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ADDRESS, adminKey, api, check, conn, finish, login, must, newKey, photo, step } from "./lib.mjs";
import { ARC_USDC, arcTypedData } from "../src/lib/arc.ts";

const RPC = process.env.E2E_ARC_RPC ?? "https://rpc.testnet.arc.io";
const arc = createPublicClient({ transport: http(RPC) });
const usdc = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const balance = (a) => arc.readContract({ address: ARC_USDC.address, abi: usdc, functionName: "balanceOf", args: [a] });
const payer = privateKeyToAccount(JSON.parse(readFileSync(process.env.E2E_ARC_BUYER ?? ".data/arc-buyer-testnet.json", "utf8")).privateKey);

const AD = await login(adminKey());
const buyer = newKey();
const B = await login(buyer);
await must("POST", "/api/account/age", undefined, B);

// 建單（rail: arc）→ 買家簽授權 → 回報。tamper 用來偽造授權內容
const sign = async (request, tamper = (r) => r) => ({ from: payer.address, validBefore: request.validBefore, signature: await payer.signTypedData(arcTypedData(payer.address, tamper(request))) });

step("準備卡包");
const packId = `e2e-arc-${Date.now().toString(36)}`;
const now = Date.now();
await must("POST", "/api/admin/packs", { id: packId, name: "E2E Arc Pack", priceUsdt: 0.1, startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 86_400_000).toISOString(), palette: ["#ff6f93", "#e8285a"] }, AD);
for (const [member, hue] of [["Yeji", 10], ["Chaeryeong", 60]]) {
  const card = (await must("POST", "/api/admin/vault", { photos: [await photo(hue), await photo(hue + 180)], group: "ITZY", member, album: "BORN TO BE", version: "Album Ver.", rarity: "album", vault: "yvr", location: "E2E-ARC" }, AD)).card;
  // 卡值 0.05、售價 0.1：返還率 50%，在上限內
  await must("POST", `/api/admin/packs/${packId}/cards`, { cardId: card.id, tier: "N", valueUsdt: 0.05 }, AD);
}

step("在 Arc 上付款開包");
const sol = await conn.getBalance(new PublicKey(buyer.address));
check("buyer has no SOL", sol === 0, String(sol));
const before = await balance(payer.address);
const order = await must("POST", `/api/packs/${packId}/order`, { qty: 1, rail: "arc" }, B);
check("order returns an authorization to sign", order.arc?.value === "100000" && /^0x[0-9a-f]{64}$/.test(order.arc.nonce) && !order.tx, JSON.stringify(order.arc));
const forged = await api("POST", `/api/packs/orders/${order.id}/confirm`, await sign(order.arc, (r) => ({ ...r, value: "1" })), B);
check("forged amount refused", forged.status === 409 && forged.json.error === "authorization_rejected", `${forged.status} ${JSON.stringify(forged.json)}`);
const body = await sign(order.arc);
const paid = await must("POST", `/api/packs/orders/${order.id}/confirm`, body, B);
check("card delivered on Solana", paid.pulls.length === 1 && Boolean(paid.pulls[0].tx), paid.pulls[0]?.card.serial);
check("paid on Arc", /^0x[0-9a-f]{64}$/.test(paid.payTx), paid.payTx);
const receipt = await arc.getTransactionReceipt({ hash: paid.payTx });
check("Arc payment succeeded", receipt.status === "success");
check("buyer charged exactly 0.1 USDC, no gas", before - (await balance(payer.address)) === 100000n);
const state = (await must("GET", "/api/chain/state")).cards;
check("buyer owns the card on Solana", state[paid.pulls[0].cardId]?.owner === buyer.address);
const again = await must("POST", `/api/packs/orders/${order.id}/confirm`, body, B);
check("repeat confirm returns the same result", again.payTx === paid.payTx && again.pulls[0]?.cardId === paid.pulls[0].cardId);
const draws = await must("GET", `/api/packs/${packId}/draws`);
check("draw uses the buyer's signature as proof", draws.draws.some((d) => d.rail === "arc" && d.proof === body.signature && d.payTx === paid.payTx));

step("卡池不夠時在 Arc 上退款");
const late = await must("POST", `/api/packs/${packId}/order`, { qty: 1, rail: "arc" }, B);
const last = await must("POST", `/api/packs/${packId}/order`, { qty: 1, rail: "arc" }, B);
await must("POST", `/api/packs/orders/${last.id}/confirm`, await sign(last.arc), B);
const mid = await balance(payer.address);
const refunded = await must("POST", `/api/packs/orders/${late.id}/confirm`, await sign(late.arc), B);
check("empty pool refunded on Arc", refunded.pulls.length === 0 && /^0x[0-9a-f]{64}$/.test(refunded.refundTx ?? ""), refunded.refundTx);
check("refund arrived", (await balance(payer.address)) === mid, "paid and refunded 0.1 USDC");

step("擔保交易在 Arc 上付款，後台退款退回 Arc");
const seller = newKey();
const S = await login(seller);
const item = (await must("POST", "/api/items", { photos: [await photo(200), await photo(20)], title: "Arc Escrow", group: "ITZY", member: "Yuna", quantity: 1, source: "pob", priceUsdt: 0.2 }, S)).item;
const escrow = await must("POST", "/api/orders", { itemId: item.id, rail: "arc", address: ADDRESS }, B);
check("escrow order returns an authorization", escrow.arc?.value === "200000");
const escrowPaid = await must("POST", `/api/orders/${escrow.id}/confirm`, await sign(escrow.arc), B);
check("escrow paid on Arc", /^0x[0-9a-f]{64}$/.test(escrowPaid.payTx));
const mine = (await must("GET", "/api/orders", undefined, B)).orders.find((o) => o.id === escrow.id);
check("order shows the Arc rail", mine?.rail === "arc" && mine.status === "paid" && mine.payTx === escrowPaid.payTx);
const preRefund = await balance(payer.address);
const ar = await must("POST", `/api/admin/orders/${escrow.id}/refund`, undefined, AD);
check("admin refund on Arc", /^0x[0-9a-f]{64}$/.test(ar.refundTx ?? ""), ar.refundTx);
check("refund back to the Arc payer", (await balance(payer.address)) - preRefund === 200000n);

finish();
