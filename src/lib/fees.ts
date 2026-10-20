import { AUCTION_FEE_BPS, FEE_BPS, MINT_FEE_USD } from "./policy";

// 手續費：管理員在後台設基本費率和限時促銷（存在 fee_rules 表，見 src/lib/server/fees.ts），伺服器和頁面都用這裡的規則算出當下的費率。
// sale 一口價成交抽成（金庫卡和擔保交易共用）、auction 拍賣手續費，單位是基點；mint 收藏卡做成數位珍藏的鑄造費，單位是美分。
// 沒設過規則時用 policy.ts 的預設值

export const FEE_KINDS = ["sale", "auction", "mint"] as const;
export type FeeKind = (typeof FEE_KINDS)[number];

export const DEFAULT_FEES: Record<FeeKind, number> = {
  sale: FEE_BPS,
  auction: AUCTION_FEE_BPS,
  mint: Math.round(MINT_FEE_USD * 100),
};
// 上限：抽成和拍賣手續費不超過鏈上程序的 MAX_FEE_BPS（10%）；鑄造費不超過 10 USD
export const FEE_MAX: Record<FeeKind, number> = {
  sale: 1000,
  auction: 1000,
  mint: 1000,
};

export type FeeRule = {
  id: string;
  kind: FeeKind;
  value: number;
  startsAt: Date;
  endsAt: Date | null;
  label: string | null;
};

export type FeeView = {
  kind: FeeKind;
  // 現在收的費率（有促銷時是促銷價）
  value: number;
  // 現在的基本費率
  base: number;
  // 正在進行、讓費率低於基本費率的促銷
  promo: { label: string | null; endsAt: string } | null;
  // 已排定、還沒生效的下一個基本費率
  next: { value: number; startsAt: string } | null;
};
export type Fees = Record<FeeKind, FeeView>;

export const isPromo = (r: Pick<FeeRule, "endsAt">) => r.endsAt !== null;

export function resolveFee(kind: FeeKind, rules: FeeRule[], now = new Date()): FeeView {
  const mine = rules.filter((r) => r.kind === kind);
  const bases = mine.filter((r) => !isPromo(r)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const started = bases.filter((r) => r.startsAt <= now);
  const base = started.at(-1)?.value ?? DEFAULT_FEES[kind];
  const upcoming = bases.find((r) => r.startsAt > now);
  const promo = mine.filter((r) => isPromo(r) && r.startsAt <= now && r.endsAt! > now && r.value < base).sort((a, b) => a.value - b.value)[0];
  return {
    kind,
    value: promo ? promo.value : base,
    base,
    promo: promo ? { label: promo.label, endsAt: promo.endsAt!.toISOString() } : null,
    next: upcoming ? { value: upcoming.value, startsAt: upcoming.startsAt.toISOString() } : null,
  };
}

export const resolveFees = (rules: FeeRule[], now = new Date()) => Object.fromEntries(FEE_KINDS.map((k) => [k, resolveFee(k, rules, now)])) as Fees;

// 沒讀到規則時（例如沒有資料庫）的費率
export const defaultFees = () => resolveFees([]);

export const feeCents = (priceCents: number, bps: number) => Math.round((priceCents * bps) / 10_000);
// 顯示用：基點換成百分比（250 → 2.5）
export const bpsToPct = (bps: number) => bps / 100;
