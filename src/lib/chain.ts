// 鏈上的公開地址（平台錢包、兩個集合、每張樣本金庫卡的 NFT），由 scripts/setup-devnet.ts 建置後寫入，瀏覽器和伺服器都能讀
import devnet from "./chain/devnet.json";

export type ChainConfig = {
  // 平台錢包：集合的更新權限持有人，也是郵箱帳號上鏈卡的代管錢包
  platform: string;
  // 金庫卡集合：入庫鑑定通過的卡
  vaultCollection: string;
  // 收藏卡集合：用戶自由上鏈的卡
  collectorCollection: string;
  // 樣本卡 id → 金庫 NFT 地址
  cards: Record<string, string>;
  // 掛單託管程序（onchain/scripts/devnet-market.mts 寫入）：程序和設定帳戶、抽成收款錢包、測試 USDT、
  // 每張掛單中的卡對應的掛單交易，以及一筆示範成交
  market?: {
    programId: string;
    config: string;
    treasury: string;
    usdtMint: string;
    listings: Record<string, string>;
    demoTrade?: { card: string; buyer: string; listTx: string; buyTx: string };
  };
};

export const CHAIN: ChainConfig = devnet as ChainConfig;
