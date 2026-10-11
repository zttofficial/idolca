// 建置一個網路的鏈上基礎設施：金庫卡集合和收藏卡集合，地址寫進 src/lib/chain/<cluster>.json。
// 金庫卡不在這裡鑄造：實物入庫後由後台逐張鑄造（/admin 的入庫）。可以重複執行，已建好的集合會跳過。
// 用法：在 .env.local 設定 NEXT_PUBLIC_SOLANA_CLUSTER 和 PLATFORM_KEYPAIR，然後 npm run chain:setup
import { readFileSync, writeFileSync } from "node:fs";
import { generateSigner } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { createCollection, ruleSet } from "@metaplex-foundation/mpl-core";
import { cluster, explorer, platformUmi } from "./lib/umi";

const CONFIG = `src/lib/chain/${cluster}.json`;
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://idolca.vercel.app").replace(/\/$/, "");

const config = JSON.parse(readFileSync(CONFIG, "utf8")) as { platform: string; vaultCollection: string; collectorCollection: string };
const save = () => writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n");

const umi = platformUmi();
config.platform = umi.identity.publicKey.toString();
const balance = await umi.rpc.getBalance(umi.identity.publicKey);
console.log(`${cluster} 平台錢包 ${config.platform}，餘額 ${Number(balance.basisPoints) / 1e9} SOL`);
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

console.log(`完成，地址已寫入 ${CONFIG}`);
