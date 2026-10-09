// 建立卡片 NFT 的 Metaplex Core 集合（每個網路只跑一次），輸出的地址填進 NEXT_PUBLIC_CARD_COLLECTION。
// 用法：npm run chain:create-collection -- --uri https://.../collection.json [--royalty-bps 250]
import { parseArgs } from "node:util";
import { generateSigner } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { createCollection, ruleSet } from "@metaplex-foundation/mpl-core";
import { explorer, platformUmi } from "./lib/umi.ts";

const { values } = parseArgs({
  options: {
    uri: { type: "string" },
    name: { type: "string", default: "Idolca Vault" },
    "royalty-bps": { type: "string", default: "250" },
  },
});
if (!values.uri) throw new Error("缺少 --uri（集合元數據 JSON 的網址）");

const umi = platformUmi();
const collection = generateSigner(umi);

const { signature } = await createCollection(umi, {
  collection,
  name: values.name,
  uri: values.uri,
  plugins: [
    {
      // 外部市場二次成交的版稅，進平台錢包；不限制可交易的程序
      type: "Royalties",
      basisPoints: Number(values["royalty-bps"]),
      creators: [{ address: umi.identity.publicKey, percentage: 100 }],
      ruleSet: ruleSet("None"),
    },
  ],
}).sendAndConfirm(umi);

console.log(`集合：${collection.publicKey}`);
console.log(`交易：${explorer("tx", base58.deserialize(signature)[0])}`);
console.log(`把這行加進 .env.local：NEXT_PUBLIC_CARD_COLLECTION=${collection.publicKey}`);
