import "server-only";
import { eq, sql } from "drizzle-orm";
import { atomic, type Db } from "./db";
import { users } from "./schema";

// 把只靠錢包登入建出來的帳號併進郵箱帳號。用戶先用錢包登入過（自動建了一個沒有郵箱的帳號），
// 後來用郵箱帳號綁同一個錢包時呼叫；呼叫前要先驗過錢包簽名，證明兩個帳號是同一個人。
// 舊帳號的卡、訂單、拍賣、出價、照片、收藏冊、通知都轉到郵箱帳號，然後刪掉舊帳號，錢包記到郵箱帳號上。
// 收藏冊兩邊都標了同一款卡時，張數取大的，照片和 NFT 地址優先用郵箱帳號的。
// 公開收藏冊的連結：郵箱帳號還沒有就沿用舊帳號的，舊帳號分享出去的連結繼續有效
export async function mergeWalletAccount(db: Db, fromId: string, intoId: string, wallet: string, walletKind: "external" | "privy") {
  const [[from], [into]] = await Promise.all([
    db.select({ slug: users.binderSlug, isPublic: users.binderPublic }).from(users).where(eq(users.id, fromId)),
    db.select({ slug: users.binderSlug }).from(users).where(eq(users.id, intoId)),
  ]);
  const carrySlug = from?.slug && !into?.slug ? from : null;
  await atomic(db, (q) => [
    q.execute(sql`
      UPDATE binder_entries t SET count = GREATEST(t.count, f.count), photo = COALESCE(t.photo, f.photo), mint = COALESCE(t.mint, f.mint)
      FROM binder_entries f WHERE t.user_id = ${intoId} AND f.user_id = ${fromId} AND f.template_id = t.template_id`),
    q.execute(sql`DELETE FROM binder_entries f WHERE f.user_id = ${fromId} AND EXISTS (SELECT 1 FROM binder_entries t WHERE t.user_id = ${intoId} AND t.template_id = f.template_id)`),
    q.execute(sql`UPDATE binder_entries SET user_id = ${intoId} WHERE user_id = ${fromId}`),
    q.execute(sql`DELETE FROM binder_wants f WHERE f.user_id = ${fromId} AND EXISTS (SELECT 1 FROM binder_wants t WHERE t.user_id = ${intoId} AND t.template_id = f.template_id)`),
    q.execute(sql`UPDATE binder_wants SET user_id = ${intoId} WHERE user_id = ${fromId}`),
    // 擺法和水龍頭紀錄每人一筆：郵箱帳號沒有才搬過去，有就留郵箱帳號的（舊的隨帳號刪除）
    q.execute(sql`UPDATE binder_layouts SET user_id = ${intoId} WHERE user_id = ${fromId} AND NOT EXISTS (SELECT 1 FROM binder_layouts WHERE user_id = ${intoId})`),
    q.execute(sql`UPDATE faucet_claims SET user_id = ${intoId} WHERE user_id = ${fromId} AND NOT EXISTS (SELECT 1 FROM faucet_claims WHERE user_id = ${intoId})`),
    q.execute(sql`DELETE FROM faucet_claims WHERE user_id = ${fromId}`),
    q.execute(sql`UPDATE collector_items SET user_id = ${intoId} WHERE user_id = ${fromId}`),
    q.execute(sql`UPDATE media SET owner_id = ${intoId} WHERE owner_id = ${fromId}`),
    q.execute(sql`UPDATE orders SET buyer_id = ${intoId} WHERE buyer_id = ${fromId}`),
    q.execute(sql`UPDATE orders SET seller_id = ${intoId} WHERE seller_id = ${fromId}`),
    q.execute(sql`UPDATE auctions SET seller_id = ${intoId} WHERE seller_id = ${fromId}`),
    q.execute(sql`UPDATE bids SET bidder_id = ${intoId} WHERE bidder_id = ${fromId}`),
    q.execute(sql`UPDATE pack_orders SET user_id = ${intoId} WHERE user_id = ${fromId}`),
    q.execute(sql`UPDATE redemptions SET user_id = ${intoId} WHERE user_id = ${fromId}`),
    q.execute(sql`UPDATE vault_cards SET depositor_id = ${intoId} WHERE depositor_id = ${fromId}`),
    q.execute(sql`UPDATE notifications SET user_id = ${intoId} WHERE user_id = ${fromId}`),
    // 管理員身分和年齡確認不因合併丟失
    q.execute(sql`
      UPDATE users t SET role = CASE WHEN f.role = 'admin' THEN 'admin' ELSE t.role END, age_confirmed_at = COALESCE(t.age_confirmed_at, f.age_confirmed_at)
      FROM users f WHERE t.id = ${intoId} AND f.id = ${fromId}`),
    // 舊帳號的會話、郵件連結隨刪除一起清掉
    q.execute(sql`DELETE FROM users WHERE id = ${fromId} AND email IS NULL`),
    // slug 不能重複：舊帳號刪掉之後才能記到郵箱帳號上
    ...(carrySlug
      ? [
          q.execute(
            sql`UPDATE users SET binder_slug = ${carrySlug.slug}, binder_public = ${carrySlug.isPublic} WHERE id = ${intoId} AND binder_slug IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = ${fromId})`,
          ),
        ]
      : []),
    q.execute(sql`UPDATE users SET wallet_address = ${wallet}, wallet_kind = ${walletKind} WHERE id = ${intoId}`),
  ]);
}
