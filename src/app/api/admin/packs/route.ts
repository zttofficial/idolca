import { randomBytes } from "node:crypto";
import { connection, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { packs } from "@/lib/server/schema";
import { getPackRow, sha256 } from "@/lib/server/pack-pool";
import { listParams } from "@/lib/server/admin-lists";
import { adminPacks } from "@/lib/server/admin-packs";
import { MAX_QTY } from "@/lib/packs";
import { notifyIndexNow } from "@/lib/server/indexnow";

// 卡包管理，一次一頁：每個卡包只帶卡池的統計（剩幾張、各等級、期望價值、返還率），卡池本身和能放進卡池的卡另外分頁查
// （/api/admin/packs/[id]/cards 和 /api/admin/cards?state=assignable）
export async function GET(request: NextRequest) {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  return Response.json(await adminPacks(a.db, listParams(request.nextUrl.searchParams)));
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

// 建立卡包：生成種子，只公開它的 SHA-256
export async function POST(request: Request) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { id?: string; name?: string; priceUsdt?: number; maxQty?: number; startsAt?: string; endsAt?: string; palette?: string[] };
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
  const maxQty = body.maxQty === undefined ? MAX_QTY : Number(body.maxQty);
  if (!Number.isInteger(maxQty) || maxQty < 1 || maxQty > MAX_QTY) return fail("invalid_qty");
  if (await getPackRow(a.db, id)) return fail("pack_exists", 409);
  const seed = randomBytes(32).toString("hex");
  await a.db.insert(packs).values({ id, name, priceCents: Math.round(price * 100), maxQty, startsAt, endsAt, palette: JSON.stringify(palette), seed, seedHash: sha256(seed) });
  notifyIndexNow(`/packs/${id}`);
  return Response.json({ ok: true });
}
