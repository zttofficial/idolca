// 金庫清單（伺服器和頁面共用）。一張卡只放在一個金庫，提貨從卡所在的金庫寄出；寄進金庫時賣家選寄到哪一個。
// 每個金庫有自己的郵資表（src/lib/rates/），運費按（金庫，目的地）計價，見 src/lib/shipping.ts
import type { CarrierId } from "./tracking";
import { CAD_PER_USD, YVR_PACKING_CAD, YVR_POSTAGE_CAD, YVR_SERVICE } from "./rates/yvr";
import { CKG_PACKING_CNY, CKG_POSTAGE_CNY, CKG_SERVICE, CNY_PER_USD } from "./rates/ckg";

export const VAULT_IDS = ["yvr", "ckg"] as const;
export type VaultId = (typeof VAULT_IDS)[number];
// 加這個欄位之前入庫的卡都在溫哥華
export const DEFAULT_VAULT: VaultId = "yvr";

export type Vault = {
  id: VaultId;
  // 倉位編號的前綴，後台用
  code: string;
  // 城市（英文），服務條款和後台用；面向粉絲的名稱在翻譯檔的 Vaults
  city: string;
  country: string;
  // 郵資表的計價貨幣和對美元匯率（1 美元 = perUsd 單位）
  currency: string;
  perUsd: number;
  // 寄法名稱
  service: string;
  // 後台出貨時物流單號預設的物流商
  carrier: CarrierId;
  // 寄一張卡到各地的郵資和一張卡的包材，都按 currency 計；postage 沒列的地方這個金庫不寄
  postage: Readonly<Record<string, number>>;
  packing: number;
  // 收件地址（寄進金庫用），環境變數名稱和值；NEXT_PUBLIC_ 變數在構建時寫進頁面，所以要寫成字面的 process.env.X
  addressEnv: string;
  address: string | undefined;
  // 寄進金庫時建議寄到這裡的收件國家；不在任何一邊清單裡的都建議重慶（見 suggestVault）
  near: readonly string[];
};

export const VAULTS: Record<VaultId, Vault> = {
  yvr: {
    id: "yvr",
    code: "YVR",
    city: "Vancouver",
    country: "CA",
    currency: "CAD",
    perUsd: CAD_PER_USD,
    service: YVR_SERVICE,
    carrier: "canadapost",
    postage: YVR_POSTAGE_CAD,
    packing: YVR_PACKING_CAD,
    addressEnv: "NEXT_PUBLIC_VAULT_ADDRESS_YVR",
    address: process.env.NEXT_PUBLIC_VAULT_ADDRESS_YVR,
    // 只有北美：賣家寄國內件或北美件就能入庫
    near: ["CA", "US", "MX"],
  },
  ckg: {
    id: "ckg",
    code: "CKG",
    city: "Chongqing",
    country: "CN",
    currency: "CNY",
    perUsd: CNY_PER_USD,
    service: CKG_SERVICE,
    carrier: "chinapost",
    postage: CKG_POSTAGE_CNY,
    packing: CKG_PACKING_CNY,
    addressEnv: "NEXT_PUBLIC_VAULT_ADDRESS_CKG",
    address: process.env.NEXT_PUBLIC_VAULT_ADDRESS_CKG,
    // 北美以外都建議寄這裡（suggestVault 的預設）：重慶寄到任何地方的提貨運費都比溫哥華低
    near: [],
  },
};

export const VAULT_LIST: Vault[] = VAULT_IDS.map((id) => VAULTS[id]);

export const isVaultId = (v: unknown): v is VaultId => typeof v === "string" && (VAULT_IDS as readonly string[]).includes(v);

// 資料庫裡的值轉成金庫；不認得的（理論上不會有）當成預設金庫
export const vaultOf = (v: string | null | undefined): Vault => VAULTS[isVaultId(v) ? v : DEFAULT_VAULT];

// 按收件國家建議寄到哪個金庫：北美建議溫哥華，其他地區（包括還不知道國家時）一律建議重慶
export const suggestVault = (country: string | null | undefined): VaultId => VAULT_LIST.find((v) => country && v.near.includes(country))?.id ?? "ckg";
