// 入庫鑑定通過後，給寄存人鑄造一張卡的 Core NFT，卡片資料寫進 Attributes 插件。
// 用法：npm run chain:mint-card -- --card scripts/cards/IC-000128.json --owner <寄存人錢包> --uri https://.../IC-000128.json
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { generateSigner, publicKey } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { create, fetchCollection } from "@metaplex-foundation/mpl-core";
import { explorer, platformUmi, requireEnv } from "./lib/umi.ts";

// 估值低於這個數的卡只記在倉庫內部帳本，不上鏈（鑄造和託管成本會超過卡價）
const MIN_VALUATION_USDT = 10;

type CardRecord = {
  serial: string;
  group: string;
  member: string;
  album: string;
  version: string;
  rarity: string;
  grade?: number;
  location: string;
  intake_date: string;
  valuation_usdt: number;
};

const { values } = parseArgs({
  options: { card: { type: "string" }, owner: { type: "string" }, uri: { type: "string" } },
});
if (!values.card || !values.owner || !values.uri) throw new Error("需要 --card、--owner、--uri");

const card = JSON.parse(readFileSync(values.card, "utf8")) as CardRecord;
if (card.valuation_usdt < MIN_VALUATION_USDT) {
  throw new Error(`${card.serial} 估值 ${card.valuation_usdt} USDT，低於 ${MIN_VALUATION_USDT} USDT，不鑄造 NFT`);
}

const umi = platformUmi();
const collection = await fetchCollection(umi, publicKey(requireEnv("NEXT_PUBLIC_CARD_COLLECTION")));
const asset = generateSigner(umi);

// 估值只用於上鏈門檻，不寫進屬性；金庫卡一律是鑑定過的真品
const attributeList = [
  ...Object.entries(card)
    .filter(([key]) => key !== "valuation_usdt")
    .map(([key, value]) => ({ key, value: String(value) })),
  { key: "custody", value: "vault" },
  { key: "verification", value: "authentic" },
];

const { signature } = await create(umi, {
  asset,
  collection,
  owner: publicKey(values.owner),
  name: `${card.group} ${card.member} ${card.version} #${card.serial}`,
  uri: values.uri,
  plugins: [{ type: "Attributes", attributeList }],
}).sendAndConfirm(umi);

console.log(`NFT：${asset.publicKey}`);
console.log(`交易：${explorer("tx", base58.deserialize(signature)[0])}`);
