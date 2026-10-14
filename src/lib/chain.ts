// 鏈上的公開地址（平台錢包、兩個集合、託管程序），每個網路一份：src/lib/chain/<cluster>.json，
// 由 scripts/setup-chain.ts 和 onchain/scripts/setup-market.mts 建置後寫入，瀏覽器和伺服器都能讀。
// 用哪一份由 NEXT_PUBLIC_SOLANA_CLUSTER 決定；換網路只改這個變數，不改代碼
import devnet from "./chain/devnet.json";
import mainnet from "./chain/mainnet-beta.json";

export type ChainConfig = {
  // 平台錢包：集合的更新權限持有人，收付款、代付用戶交易的手續費和帳戶租金
  platform: string;
  // 金庫卡集合：入庫鑑定通過的卡
  vaultCollection: string;
  // 收藏卡集合：用戶自由上鏈的卡
  collectorCollection: string;
  // 掛單託管程序（onchain/scripts/setup-market.mts 寫入）：程序和設定帳戶、抽成收款錢包、結算用的 USDT 和 USDC
  market?: {
    programId: string;
    config: string;
    treasury: string;
    usdtMint: string;
    usdcMint?: string;
  };
};

export const CHAIN: ChainConfig = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? mainnet : devnet) as ChainConfig;
