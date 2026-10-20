import { after, connection } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { syncChainFees } from "@/lib/server/vault-chain";
import { addFeeRule, getFees, listFeeRules, type FeeRuleInput } from "@/lib/server/fees";

// 手續費：現在各項的費率（含進行中的促銷和排定的下一個基本費率）和全部規則
export async function GET() {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  const [fees, rules] = await Promise.all([getFees(a.db), listFeeRules(a.db)]);
  return Response.json({ fees, rules });
}

// 新增規則：沒有結束時間是基本費率，有結束時間是限時促銷（檢查見 addFeeRule）
export async function POST(request: Request) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as FeeRuleInput;
  const r = await addFeeRule(a.db, body, a.user.id);
  if (r.error) return fail(r.error);
  // 金庫卡的抽成和拍賣手續費在鏈上，規則改了馬上同步（之後的購買、開拍也會在同一筆交易裡再對一次）
  after(() => syncChainFees(true).catch((err) => console.error("sync chain fees failed", err)));
  return Response.json({ rule: r.rule });
}
