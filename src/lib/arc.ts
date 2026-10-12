// Arc 收款通道的公開設定，瀏覽器和伺服器都能讀。卡片留在 Solana，Arc 只負責收款、退款：
// 買家簽一個 USDC 的 EIP-3009 授權轉帳（只是簽名，不發交易、不付手續費），平台錢包代為送出。
// NEXT_PUBLIC_ARC_NETWORK 設成 testnet 或 mainnet 才開通；沒設時網站只有 Solana 付款
import testnet from "./chain/arc-testnet.json";
import mainnet from "./chain/arc-mainnet.json";

export type ArcNetwork = "testnet" | "mainnet";

const NETWORKS = {
  testnet: { chainId: 5042002, name: "Arc Testnet", rpc: "https://rpc.testnet.arc.io", explorer: "https://explorer.testnet.arc.io", platform: testnet.platform },
  mainnet: { chainId: 5042, name: "Arc", rpc: "https://rpc.mainnet.arc.io", explorer: "https://explorer.arc.io", platform: mainnet.platform },
};

const network = process.env.NEXT_PUBLIC_ARC_NETWORK;
export const ARC_NETWORK: ArcNetwork | null = network === "testnet" || network === "mainnet" ? network : null;

// USDC 在 Arc 上是原生資產，這個地址是它的 ERC-20 介面（6 位小數），主網和測試網相同。
// EIP-712 網域的 name、version 是合約自己回報的值（name() 是 "USDC"，version() 是 "2"）
export const ARC_USDC = { address: "0x3600000000000000000000000000000000000000" as const, decimals: 6, name: "USDC", version: "2" };

export const ARC = ARC_NETWORK && NETWORKS[ARC_NETWORK].platform ? { network: ARC_NETWORK, ...NETWORKS[ARC_NETWORK], platform: NETWORKS[ARC_NETWORK].platform as `0x${string}` } : null;

export const arcExplorerUrl = (kind: "tx" | "address", id: string) => `${ARC?.explorer ?? NETWORKS.mainnet.explorer}/${kind}/${id}`;

// 授權轉帳的有效期：建單後 30 分鐘內要簽好送出
export const ARC_AUTH_TTL_SECONDS = 30 * 60;

// 買家要簽的內容（EIP-712）。伺服器建單時給出，買家簽名後原樣送回，伺服器逐項核對再送上鏈
export type ArcPaymentRequest = {
  chainId: number;
  to: `0x${string}`;
  // USDC 最小單位（6 位小數）的字串
  value: string;
  validAfter: string;
  validBefore: string;
  // 每張訂單固定一個：訂單編號的雜湊，同一張訂單不可能付兩次
  nonce: `0x${string}`;
};

export const arcTypedData = (from: `0x${string}`, p: ArcPaymentRequest) => ({
  domain: { name: ARC_USDC.name, version: ARC_USDC.version, chainId: p.chainId, verifyingContract: ARC_USDC.address },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization" as const,
  message: { from, to: p.to, value: p.value, validAfter: p.validAfter, validBefore: p.validBefore, nonce: p.nonce },
});
