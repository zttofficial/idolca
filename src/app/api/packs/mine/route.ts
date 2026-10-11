import { requireUser } from "@/lib/server/require-user";
import { myPackPulls } from "@/lib/server/pack-pool";

// 我開卡包抽到、還沒賣回平台的卡（每張都是轉進我錢包的金庫卡）
export async function GET() {
  const a = await requireUser();
  if (a.error) return a.error;
  return Response.json({ pulls: await myPackPulls(a.db, a.user.id) });
}
