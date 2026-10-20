import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "./db";
import { rowsOf, type ListParams } from "./admin-lists";
import { decodeCursor, encodeCursor, likeContains, likePrefix } from "@/lib/admin-list";

// 銷售紀錄：三種成交合在一張表看——金庫卡在鏈上的成交（一口價和拍賣得標，vault_trades）、自由刊登的擔保訂單（orders，不含沒付款的）、開卡包（pack_orders，不含沒付款的）。
// 每種各自按時間倒序取一頁（各有時間索引），再在外層合併取前 limit 列，所以每頁的工作量和總筆數無關。
// 排序鍵是（時間, 種類, 編號）倒序；游標存這三個值，每種按自己的種類判斷從哪裡接著讀
export const SALE_TYPES = ["all", "vault", "escrow", "pack"] as const;
export const SALE_STATUSES = ["all", "settled", "open", "refunded"] as const;
type SaleType = Exclude<(typeof SALE_TYPES)[number], "all">;
type SaleStatus = (typeof SALE_STATUSES)[number];

export type Sale = {
  type: SaleType;
  id: string;
  // vault、escrow：buy 或 auction；pack：開了幾包
  sub: string;
  at: string;
  amountUsdt: number;
  feeUsdt: number;
  status: string;
  buyerWallet: string | null;
  buyerEmail: string | null;
  sellerWallet: string | null;
  sellerEmail: string | null;
  card: string;
  // vault：金庫卡 id；escrow：收藏卡 id；pack：卡包 id
  ref: string;
  tx: string | null;
  refundTx: string | null;
  rail: string;
  coin: string;
};

// 各種成交整理成同樣的欄位（at 是排序用的時間；擔保訂單用付款時間，索引建在同一個式子上）
const BASE: Record<SaleType, SQL> = {
  vault: sql`SELECT 'vault' AS type, t.signature AS id, t.kind AS sub, t.traded_at AS at, t.price_cents AS amount, t.fee_cents AS fee, 'settled' AS status,
    t.buyer AS buyer_wallet, bu.email AS buyer_email, t.seller AS seller_wallet, su.email AS seller_email,
    concat_ws(' · ', c.serial, c.group_name || ' ' || c.member) AS card, t.card_id AS ref, t.signature AS tx, NULL::text AS refund_tx, 'solana' AS rail, t.coin AS coin
    FROM vault_trades t LEFT JOIN vault_cards c ON c.id = t.card_id
    LEFT JOIN users bu ON bu.wallet_address = t.buyer LEFT JOIN users su ON su.wallet_address = t.seller`,
  escrow: sql`SELECT 'escrow' AS type, o.id AS id, CASE WHEN o.auction_id IS NULL THEN 'buy' ELSE 'auction' END AS sub, coalesce(o.paid_at, o.created_at) AS at,
    o.price_cents AS amount, o.fee_cents AS fee, o.status AS status, o.buyer_wallet AS buyer_wallet, bu.email AS buyer_email, su.wallet_address AS seller_wallet, su.email AS seller_email,
    coalesce(nullif(i.title, ''), i.group_name || ' ' || i.member, '') AS card, o.item_id AS ref, o.pay_tx AS tx, o.refund_tx AS refund_tx, o.rail AS rail, o.coin AS coin
    FROM orders o JOIN users bu ON bu.id = o.buyer_id JOIN users su ON su.id = o.seller_id LEFT JOIN collector_items i ON i.id = o.item_id
    WHERE o.status <> 'pending'`,
  pack: sql`SELECT 'pack' AS type, po.id AS id, po.qty::text AS sub, po.created_at AS at, po.amount_cents AS amount, 0 AS fee, po.status AS status,
    po.wallet AS buyer_wallet, u.email AS buyer_email, NULL::text AS seller_wallet, NULL::text AS seller_email,
    coalesce(p.name, po.pack_id) || ' ×' || po.qty AS card, po.pack_id AS ref, po.pay_tx AS tx, po.refund_tx AS refund_tx, po.rail AS rail, po.coin AS coin
    FROM pack_orders po JOIN users u ON u.id = po.user_id LEFT JOIN packs p ON p.id = po.pack_id
    WHERE po.status <> 'pending'`,
};

// 各種成交的狀態篩選：settled 已成交，open 進行中（擔保還沒結束、卡包抽卡中），refunded 有退款；金庫卡成交只有已成交
const STATUS: Record<SaleType, Record<Exclude<SaleStatus, "all">, SQL | null>> = {
  vault: { settled: sql`true`, open: null, refunded: null },
  escrow: {
    settled: sql`s.status = 'completed'`,
    open: sql`s.status IN ('paid', 'shipped', 'disputed', 'refunding', 'releasing')`,
    refunded: sql`s.status IN ('refunded', 'cancelled')`,
  },
  pack: { settled: sql`s.status IN ('drawn', 'legacy')`, open: sql`s.status = 'drawing'`, refunded: sql`s.refund_tx IS NOT NULL` },
};

export type SaleFilter = { type: (typeof SALE_TYPES)[number]; status: SaleStatus; q: string; from: Date | null; to: Date | null };
export const saleFilter = (p: ListParams): SaleFilter => ({ type: p.pick("type", SALE_TYPES, "all"), status: p.pick("status", SALE_STATUSES, "all"), q: p.q, from: p.from, to: p.to });

// 一種成交在篩選後的條件；這種被狀態篩掉時回傳 null（整段不查）
function branchWhere(type: SaleType, f: SaleFilter): SQL[] | null {
  if (f.type !== "all" && f.type !== type) return null;
  const status = f.status === "all" ? sql`true` : STATUS[type][f.status];
  if (!status) return null;
  const conds = [status];
  if (f.from) conds.push(sql`s.at >= ${f.from.toISOString()}::timestamptz`);
  if (f.to) conds.push(sql`s.at < ${f.to.toISOString()}::timestamptz`);
  if (f.q) {
    const contains = likeContains(f.q);
    conds.push(
      sql`(s.id = ${f.q} OR s.id ILIKE ${likePrefix(f.q)} OR s.tx = ${f.q} OR s.buyer_wallet = ${f.q} OR s.seller_wallet = ${f.q}
        OR s.buyer_email ILIKE ${contains} OR s.seller_email ILIKE ${contains} OR s.card ILIKE ${contains})`,
    );
  }
  return conds;
}

const TYPES: SaleType[] = ["vault", "escrow", "pack"];

type SaleRow = {
  type: SaleType;
  id: string;
  sub: string;
  at_iso: string;
  at_key: string;
  amount: number | string;
  fee: number | string;
  status: string;
  buyer_wallet: string | null;
  buyer_email: string | null;
  seller_wallet: string | null;
  seller_email: string | null;
  card: string | null;
  ref: string;
  tx: string | null;
  refund_tx: string | null;
  rail: string;
  coin: string;
};

export async function adminSales(db: Db, f: SaleFilter, cursor: string | null, limit: number) {
  const c = decodeCursor(cursor, 3);
  const branches = TYPES.flatMap((type) => {
    const conds = branchWhere(type, f);
    if (!conds) return [];
    // 接著上一頁：時間更早的，或同一時間裡排在後面的（種類、編號倒序）
    if (c) {
      const [at, ctype, cid] = c;
      if (type < ctype) conds.push(sql`s.at <= ${at}::timestamptz`);
      else if (type > ctype) conds.push(sql`s.at < ${at}::timestamptz`);
      else conds.push(sql`(s.at < ${at}::timestamptz OR (s.at = ${at}::timestamptz AND s.id < ${cid}))`);
    }
    return [sql`(SELECT * FROM (${BASE[type]}) s WHERE ${sql.join(conds, sql` AND `)} ORDER BY s.at DESC, s.id DESC LIMIT ${limit + 1})`];
  });
  if (!branches.length) return { rows: [] as Sale[], next: null };
  const result = await db.execute(sql`SELECT u.*, to_char(u.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at_iso, u.at::text AS at_key
    FROM (${sql.join(branches, sql` UNION ALL `)}) u ORDER BY u.at DESC, u.type DESC, u.id DESC LIMIT ${limit + 1}`);
  const rows = rowsOf<SaleRow>(result);
  const list = rows.slice(0, limit);
  const last = list[list.length - 1];
  return {
    rows: list.map((r): Sale => ({
      type: r.type,
      id: r.id,
      sub: r.sub,
      at: r.at_iso,
      amountUsdt: Number(r.amount) / 100,
      feeUsdt: Number(r.fee) / 100,
      status: r.status,
      buyerWallet: r.buyer_wallet,
      buyerEmail: r.buyer_email,
      sellerWallet: r.seller_wallet,
      sellerEmail: r.seller_email,
      card: r.card ?? "",
      ref: r.ref,
      tx: r.tx,
      refundTx: r.refund_tx,
      rail: r.rail,
      coin: r.coin,
    })),
    next: rows.length > limit && last ? encodeCursor([last.at_key, last.type, last.id].join("\u001f")) : null,
  };
}

// 目前篩選下各種成交的筆數、成交額和手續費。要掃過篩選到的所有列，只在讀第一頁時算一次
export async function adminSalesTotals(db: Db, f: SaleFilter) {
  const branches = TYPES.flatMap((type) => {
    const conds = branchWhere(type, f);
    return conds ? [sql`(SELECT s.type, s.amount, s.fee FROM (${BASE[type]}) s WHERE ${sql.join(conds, sql` AND `)})`] : [];
  });
  if (!branches.length) return [];
  const result = await db.execute(
    sql`SELECT u.type, count(*)::int AS n, coalesce(sum(u.amount), 0)::float8 AS amount, coalesce(sum(u.fee), 0)::float8 AS fee FROM (${sql.join(branches, sql` UNION ALL `)}) u GROUP BY u.type`,
  );
  return rowsOf<{ type: SaleType; n: number | string; amount: number | string; fee: number | string }>(result).map((r) => ({
    type: r.type,
    count: Number(r.n),
    amountUsdt: Number(r.amount) / 100,
    feeUsdt: Number(r.fee) / 100,
  }));
}
