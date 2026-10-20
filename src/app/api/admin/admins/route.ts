import { eq, inArray } from "drizzle-orm";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { adminWallets } from "@/lib/server/auth";
import { users } from "@/lib/server/schema";

type AdminEntry = { id: string | null; displayName: string | null; email: string | null; walletAddress: string | null; source: "role" | "env" };

// 管理員名單：資料庫裡 role 是 admin 的帳號，加上 ADMIN_WALLETS 裡的錢包（有帳號就帶上帳號資料）。
// 錢包在環境變數裡的帳號一律標成 env：撤銷 role 也還是管理員，只能改環境變數
export async function GET() {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  const env = [...adminWallets()];
  const [byRole, byWallet] = await Promise.all([
    a.db.select().from(users).where(eq(users.role, "admin")),
    env.length ? a.db.select().from(users).where(inArray(users.walletAddress, env)) : Promise.resolve([]),
  ]);
  const entry = (u: typeof users.$inferSelect, source: AdminEntry["source"]): AdminEntry => ({
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    walletAddress: u.walletAddress,
    source,
  });
  const envSet = new Set(env);
  const admins: AdminEntry[] = [
    ...byRole.filter((u) => !u.walletAddress || !envSet.has(u.walletAddress)).map((u) => entry(u, "role")),
    ...env.map((w) => {
      const u = byWallet.find((x) => x.walletAddress === w);
      return u ? entry(u, "env") : { id: null, displayName: null, email: null, walletAddress: w, source: "env" as const };
    }),
  ];
  return Response.json({ admins });
}

// 授予管理員：按郵箱（轉小寫）或錢包地址找帳號；對方要先登入網站一次才有帳號
export async function POST(request: Request) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { target?: unknown };
  const target = typeof body.target === "string" ? body.target.trim() : "";
  if (!target) return fail("invalid_target");
  const where = target.includes("@") ? eq(users.email, target.toLowerCase()) : eq(users.walletAddress, target);
  const [row] = await a.db.update(users).set({ role: "admin" }).where(where).returning({ id: users.id });
  if (!row) return fail("no_account", 404);
  return Response.json({ ok: true, id: row.id });
}
