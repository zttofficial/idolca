// 提貨流程。
//   request：持有人申請提貨。持有人簽名，把凍結權和銷毀權委託給平台並立即凍結，之後不能轉手或掛單。
//            正式環境由前端讓用戶的錢包簽這筆交易；這裡用 --owner-keypair 在 devnet 上模擬。
//   ship：   平台寄出實物時，在同一筆交易裡解凍並銷毀 NFT。
//   cancel： 取消提貨，平台解凍，凍結權交還持有人。
// 用法：npm run chain:redeem -- <request|ship|cancel> --asset <NFT 地址> [--owner-keypair 檔案]
import { parseArgs } from "node:util";
import { createSignerFromKeypair, publicKey, transactionBuilder } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { addPlugin, burn, fetchAsset, fetchCollection, freezeAsset, thawAsset } from "@metaplex-foundation/mpl-core";
import { explorer, loadKeypairFile, platformUmi, requireEnv } from "./lib/umi.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { asset: { type: "string" }, "owner-keypair": { type: "string" } },
});
const [action] = positionals;
if (!values.asset || !["request", "ship", "cancel"].includes(action)) {
  throw new Error("用法：redeem.ts <request|ship|cancel> --asset <NFT 地址>");
}

const umi = platformUmi();
const platform = umi.identity;
const asset = await fetchAsset(umi, publicKey(values.asset));
const collection = await fetchCollection(umi, publicKey(requireEnv("NEXT_PUBLIC_CARD_COLLECTION")));

let builder;
if (action === "request") {
  if (!values["owner-keypair"]) throw new Error("request 需要 --owner-keypair（持有人金鑰檔，僅限 devnet 測試）");
  const owner = createSignerFromKeypair(umi, loadKeypairFile(umi, values["owner-keypair"]));
  builder = transactionBuilder()
    .add(
      addPlugin(umi, {
        asset: asset.publicKey,
        collection: collection.publicKey,
        plugin: { type: "BurnDelegate", authority: { type: "Address", address: platform.publicKey } },
        authority: owner,
      }),
    )
    .add(freezeAsset(umi, { asset, collection, delegate: platform.publicKey, authority: owner }));
} else if (action === "ship") {
  // 凍結狀態下不能銷毀，所以先解凍再銷毀，兩步放在同一筆交易裡，中間不可能被轉走
  builder = transactionBuilder()
    .add(thawAsset(umi, { asset, collection, delegate: platform }))
    .add(burn(umi, { asset, collection, authority: platform }));
} else {
  builder = thawAsset(umi, { asset, collection, delegate: platform });
}

const { signature } = await builder.sendAndConfirm(umi);
console.log(`${action} 完成：${explorer("tx", base58.deserialize(signature)[0])}`);
