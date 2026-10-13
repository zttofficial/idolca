// 金庫卡的資料型別。卡片資料存在資料庫（vault_cards 表，見 src/lib/server/vault-cards.ts），
// 持有人、掛單價格和狀態以鏈上即時狀態為準
import type { Grade } from "./grading";

export type Rarity = "album" | "pob" | "luckydraw" | "fansign";
export const RARITY_LIST: Rarity[] = ["album", "pob", "luckydraw", "fansign"];

// vaulted：在庫；listed：在託管程序裡掛單；auction：在託管程序裡拍賣；redeeming：已申請提貨，NFT 凍結中；
// redeemed：已提貨寄出，NFT 已銷毀（鏈上紀錄還在）
export type VaultStatus = "vaulted" | "listed" | "auction" | "redeeming" | "redeemed";

export type Card = {
  id: string;
  serial: string;
  group: string;
  member: string;
  album: string;
  version: string;
  rarity: Rarity;
  // 外部評級機構的分數和鑑定編號；沒有送評時沒有
  grade?: Grade;
  // 入庫時的品相說明
  condition?: string;
  // 掛單價格（USDT）；拍賣中是目前最高出價，還沒人出價時是起標價；不在售時為 0
  priceUsdt: number;
  palette: [string, string, string];
  asset: string;
  // 持有人錢包和狀態：伺服器給的是預設值，瀏覽器用鏈上即時狀態覆蓋（withLive）
  owner: string;
  status: VaultStatus;
  intakeDate: string;
  location: string;
  // 入庫時拍攝的正反面。沒有照片時畫佔位卡面
  image?: { front: string; back?: string };
  // 提貨寄出、NFT 銷毀的時間（ISO）
  redeemedAt?: string;
};
