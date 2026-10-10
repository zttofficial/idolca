// 一次性建置 devnet：建金庫卡集合和收藏卡集合，把樣本金庫卡逐張鑄造成 Core NFT，地址寫進 src/lib/chain/devnet.json。
// 可以重複執行：已建好的集合和已鑄造的卡會跳過。
// 用法：在 .env.local 設定 PLATFORM_KEYPAIR=.data/platform-devnet.json，然後 npm run chain:setup-devnet
import { readFileSync, writeFileSync } from "node:fs";
import { generateSigner, publicKey } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { create, createCollection, fetchCollection, ruleSet } from "@metaplex-foundation/mpl-core";
import { CARDS } from "../src/lib/mock-cards";
import { explorer, platformUmi } from "./lib/umi";

const CONFIG = "src/lib/chain/devnet.json";
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://idolca.vercel.app").replace(/\/$/, "");

const config = JSON.parse(readFileSync(CONFIG, "utf8")) as { platform: string; vaultCollection: string; collectorCollection: string; cards: Record<string, string> };
const save = () => writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n");

const umi = platformUmi();
config.platform = umi.identity.publicKey.toString();
const balance = await umi.rpc.getBalance(umi.identity.publicKey);
console.log(`平台錢包 ${config.platform}，餘額 ${Number(balance.basisPoints) / 1e9} SOL`);
save();

if (!config.vaultCollection) {
  const collection = generateSigner(umi);
  const { signature } = await createCollection(umi, {
    collection,
    name: "Idolca Vault",
    uri: `${SITE}/api/meta/collection/vault`,
    plugins: [
      // 外部市場二次成交的版稅進平台錢包
      { type: "Royalties", basisPoints: 250, creators: [{ address: umi.identity.publicKey, percentage: 100 }], ruleSet: ruleSet("None") },
    ],
  }).sendAndConfirm(umi);
  config.vaultCollection = collection.publicKey.toString();
  save();
  console.log(`金庫集合 ${config.vaultCollection}  ${explorer("tx", base58.deserialize(signature)[0])}`);
}

if (!config.collectorCollection) {
  const collection = generateSigner(umi);
  const { signature } = await createCollection(umi, {
    collection,
    name: "Idolca Collector",
    uri: `${SITE}/api/meta/collection/collector`,
    plugins: [
      // 自由刊登成交時，平台把 NFT 從賣家轉給買家
      { type: "PermanentTransferDelegate" },
    ],
  }).sendAndConfirm(umi);
  config.collectorCollection = collection.publicKey.toString();
  save();
  console.log(`收藏集合 ${config.collectorCollection}  ${explorer("tx", base58.deserialize(signature)[0])}`);
}

// 樣本金庫卡：持有人先是平台錢包；屬性和 scripts/mint-card.ts 一致，金庫卡一律是鑑定過的真品
const vault = await fetchCollection(umi, publicKey(config.vaultCollection));
for (const card of CARDS) {
  if (config.cards[card.id]) continue;
  const asset = generateSigner(umi);
  const attributeList = [
    ["serial", card.serial],
    ["group", card.group],
    ["member", card.member],
    ["album", card.album],
    ["version", card.version],
    ["rarity", card.rarity],
    ["grade", card.grade ? String(card.grade) : ""],
    ["location", card.location],
    ["intake_date", card.intakeDate],
    ["custody", "vault"],
    ["verification", "authentic"],
  ]
    .filter(([, v]) => v)
    .map(([key, value]) => ({ key, value }));
  const { signature } = await create(umi, {
    asset,
    collection: vault,
    name: `${card.member} ${card.version}`.slice(0, 22) + ` #${card.serial}`,
    uri: `${SITE}/api/meta/card/${card.id}`,
    plugins: [{ type: "Attributes", attributeList }],
  }).sendAndConfirm(umi);
  config.cards[card.id] = asset.publicKey.toString();
  save();
  console.log(`${card.id} ${card.serial} → ${asset.publicKey}  ${explorer("tx", base58.deserialize(signature)[0])}`);
}

console.log(`完成，地址已寫入 ${CONFIG}`);
