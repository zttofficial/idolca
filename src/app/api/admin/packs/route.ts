import { randomBytes } from "node:crypto";
import { and, isNull } from "drizzle-orm";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { packs, vaultCards } from "@/lib/server/schema";
import { listPacks, getPackRow, sha256 } from "@/lib/server/pack-pool";
import { vaultState } from "@/lib/server/vault-chain";
import { toCard } from "@/lib/server/vault-cards";
import { CHAIN } from "@/lib/chain";

// 卡包管理：所有卡包（含卡池），以及可以放進卡池的卡——平台自有（沒有寄存人）、還在平台錢包、沒掛單、沒在提貨、不在別的卡包
export async function GET() {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  const [list, rows, state] = await Promise.all([
    listPacks(a.db),
    a.db
      .select()
      .from(vaultCards)
      .where(and(isNull(vaultCards.packId), isNull(vaultCards.depositorId), isNull(vaultCards.burnedAt))),
    vaultState(),
  ]);
  const assignable = rows
    .filter((r) => {
      const s = state[r.id];
      return s && s.owner === CHAIN.platform && !s.listing && !s.redeeming;
    })
    .map(toCard);
  return Response.json({ packs: list, assignable });
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

// 建立卡包：生成種子，只公開它的 SHA-256
export async function POST(request: Request) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { id?: string; name?: string; priceUsdt?: number; startsAt?: string; endsAt?: string; palette?: string[] };
  const id = body.id?.trim().toLowerCase() ?? "";
  const name = body.name?.trim().slice(0, 40) ?? "";
  const price = Number(body.priceUsdt);
  const startsAt = new Date(body.startsAt ?? "");
  const endsAt = new Date(body.endsAt ?? "");
  const palette = Array.isArray(body.palette) && body.palette.length === 2 && body.palette.every((c) => COLOR.test(c)) ? body.palette : null;
  if (!SLUG.test(id) || !name) return fail("invalid_name");
  if (!Number.isFinite(price) || price <= 0 || price > 10_000) return fail("invalid_price");
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return fail("invalid_dates");
  if (!palette) return fail("invalid_palette");
  if (await getPackRow(a.db, id)) return fail("pack_exists", 409);
  const seed = randomBytes(32).toString("hex");
  await a.db.insert(packs).values({ id, name, priceCents: Math.round(price * 100), startsAt, endsAt, palette: JSON.stringify(palette), seed, seedHash: sha256(seed) });
  return Response.json({ ok: true });
}
