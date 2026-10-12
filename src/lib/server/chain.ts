import "server-only";
import { readFileSync } from "node:fs";
import { generateSigner, keypairIdentity, publicKey, type Umi } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { burn, create, fetchAsset, fetchCollection, mplCore, transfer, update, updatePlugin } from "@metaplex-foundation/mpl-core";
import { CHAIN } from "@/lib/chain";
import { CLUSTER } from "@/lib/solana/config";
import { GRADERS, type Grade } from "@/lib/grading";

// 平台在鏈上的動作：鑄造收藏 NFT、把假卡寫進鏈上並凍結。平台金鑰只在伺服器上：
// 線上放在 PLATFORM_SECRET_KEY（64 個數字的 JSON 陣列），本機也可以用 PLATFORM_KEYPAIR 指向金鑰檔

export const DEFAULT_RPC = { "mainnet-beta": "https://api.mainnet-beta.solana.com", devnet: "https://api.devnet.solana.com" };

export function platformSecret(): Uint8Array | null {
  const raw = process.env.PLATFORM_SECRET_KEY || (process.env.PLATFORM_KEYPAIR ? readFileSync(process.env.PLATFORM_KEYPAIR, "utf8") : "");
  return raw ? Uint8Array.from(JSON.parse(raw) as number[]) : null;
}

export const SERVER_RPC = process.env.SOLANA_RPC_URL || DEFAULT_RPC[CLUSTER];

let cached: Umi | null | undefined;
export function platformUmi() {
  if (cached !== undefined) return cached;
  const secret = platformSecret();
  if (!secret || !CHAIN.collectorCollection) return (cached = null);
  const umi = createUmi(SERVER_RPC).use(mplCore());
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));
  return (cached = umi);
}

// 有平台金鑰和收藏集合時才能上鏈；沒有時（例如還沒建置的環境）鑄造類接口回「未開通」
export const chainEnabled = () => platformUmi() !== null;
export const platformAddress = () => platformUmi()?.identity.publicKey.toString() ?? null;

// 網站的公開網址：NFT 的元數據和圖片都指向這裡
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://idolca.vercel.app").replace(/\/$/, "");

export type CollectorAttributes = { title: string; group: string; member: string; source: string; quantity: number; album: string | null; version: string | null };

const attributeList = (a: CollectorAttributes, verification: "unverified" | "fake") =>
  [
    ["group", a.group],
    ["member", a.member],
    ["source", a.source],
    ["quantity", String(a.quantity)],
    ["release", a.album],
    ["version", a.version],
    ["custody", "self"],
    ["verification", verification],
  ]
    .filter((x): x is [string, string] => Boolean(x[1]))
    .map(([key, value]) => ({ key, value }));

// 鑄造收藏 NFT。owner 是用戶自己的錢包（錢包登入），沒有時鑄到平台代管錢包。
// 每個 NFT 自帶 PermanentFreezeDelegate（平台可凍結假卡）；集合上的 PermanentTransferDelegate 讓平台在擔保交易成交時轉移
export async function mintCollectorNft(itemId: string, attrs: CollectorAttributes, owner: string | null) {
  const umi = platformUmi();
  if (!umi) return null;
  const collection = await fetchCollection(umi, publicKey(CHAIN.collectorCollection));
  const asset = generateSigner(umi);
  const { signature } = await create(umi, {
    asset,
    collection,
    owner: owner ? publicKey(owner) : umi.identity.publicKey,
    name: attrs.title.slice(0, 32),
    uri: `${SITE_URL}/api/meta/item/${itemId}`,
    plugins: [
      { type: "Attributes", attributeList: attributeList(attrs, "unverified") },
      { type: "PermanentFreezeDelegate", frozen: false },
    ],
  }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  return { asset: asset.publicKey.toString(), tx: base58.deserialize(signature)[0], owner: (owner ?? umi.identity.publicKey).toString() };
}

// 標成假卡：名稱加上 [FAKE]、屬性改成 fake、凍結 NFT，持有人改不回來也轉不走
export async function markFakeOnChain(assetAddress: string, attrs: CollectorAttributes) {
  const umi = platformUmi();
  if (!umi) return null;
  const asset = await fetchAsset(umi, publicKey(assetAddress));
  const collection = await fetchCollection(umi, publicKey(CHAIN.collectorCollection));
  const { signature } = await update(umi, { asset, collection, name: `[FAKE] ${attrs.title}`.slice(0, 32) })
    .add(updatePlugin(umi, { asset: asset.publicKey, collection: collection.publicKey, plugin: { type: "Attributes", attributeList: attributeList(attrs, "fake") } }))
    .add(updatePlugin(umi, { asset: asset.publicKey, collection: collection.publicKey, plugin: { type: "PermanentFreezeDelegate", frozen: true } }))
    .sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  return base58.deserialize(signature)[0];
}

// 評級寫進 NFT 屬性的三項：機構、分數、鑑定編號；沒有評級時都不寫
const GRADE_KEYS = ["grader", "grade", "grade_cert"];
const gradeAttributes = (grade: Grade | null): [string, string][] =>
  grade
    ? [
        ["grader", GRADERS.find((g) => g.id === grade.grader)?.name ?? grade.grader],
        ["grade", String(grade.score)],
        ["grade_cert", grade.cert],
      ]
    : [];

export type VaultAttributes = { serial: string; group: string; member: string; album: string; version: string; rarity: string; grade: Grade | null; location: string; intakeDate: string };

// 實物入庫鑑定通過後鑄造金庫 NFT：持有人是寄存人的錢包，平台自有庫存（卡包卡池）鑄給平台錢包。
// 屬性寫進 Attributes 插件，元數據指向 /api/meta/card/{id}
export async function mintVaultNft(cardId: string, card: VaultAttributes, owner: string | null) {
  const umi = platformUmi();
  if (!umi || !CHAIN.vaultCollection) throw new Error("not_configured");
  const collection = await fetchCollection(umi, publicKey(CHAIN.vaultCollection));
  const asset = generateSigner(umi);
  const attributeList = [
    ["serial", card.serial],
    ["group", card.group],
    ["member", card.member],
    ["album", card.album],
    ["version", card.version],
    ["rarity", card.rarity],
    ...gradeAttributes(card.grade),
    ["location", card.location],
    ["intake_date", card.intakeDate],
    ["custody", "vault"],
    ["verification", "authentic"],
  ]
    .filter(([, v]) => v)
    .map(([key, value]) => ({ key, value }));
  const { signature } = await create(umi, {
    asset,
    collection,
    owner: owner ? publicKey(owner) : umi.identity.publicKey,
    name: `${card.member} ${card.version}`.slice(0, 22) + ` #${card.serial}`,
    uri: `${SITE_URL}/api/meta/card/${cardId}`,
    plugins: [{ type: "Attributes", attributeList }],
  }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  return { asset: asset.publicKey.toString(), tx: base58.deserialize(signature)[0] };
}

// 已入庫的卡評級或改評級（例如送評回來）：換掉 NFT 屬性裡的評級三項，其他屬性不動；grade 為 null 時刪掉評級
export async function setVaultGradeOnChain(assetAddress: string, grade: Grade | null) {
  const umi = platformUmi();
  if (!umi || !CHAIN.vaultCollection) throw new Error("not_configured");
  const asset = await fetchAsset(umi, publicKey(assetAddress));
  const collection = await fetchCollection(umi, publicKey(CHAIN.vaultCollection));
  const kept = (asset.attributes?.attributeList ?? []).filter((a) => !GRADE_KEYS.includes(a.key));
  const at = Math.max(0, kept.findIndex((a) => a.key === "location"));
  const attributeList = [...kept.slice(0, at), ...gradeAttributes(grade).map(([key, value]) => ({ key, value })), ...kept.slice(at)];
  const { signature } = await updatePlugin(umi, { asset: asset.publicKey, collection: collection.publicKey, plugin: { type: "Attributes", attributeList } }).sendAndConfirm(umi, {
    confirm: { commitment: "confirmed" },
  });
  return base58.deserialize(signature)[0];
}

// 收藏卡轉成金庫卡後銷毀原本的收藏 NFT：持有人不是平台時，先用集合的 PermanentTransferDelegate 收回，同一筆交易裡再銷毀
export async function burnCollectorNft(assetAddress: string) {
  const umi = platformUmi();
  if (!umi) throw new Error("not_configured");
  const asset = await fetchAsset(umi, publicKey(assetAddress));
  const collection = await fetchCollection(umi, publicKey(CHAIN.collectorCollection));
  let builder = burn(umi, { asset, collection, authority: umi.identity });
  if (asset.owner.toString() !== umi.identity.publicKey.toString()) {
    builder = transfer(umi, { asset, collection, newOwner: umi.identity.publicKey, authority: umi.identity }).add(builder);
  }
  const { signature } = await builder.sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  return base58.deserialize(signature)[0];
}
