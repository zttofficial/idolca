import "server-only";
import { fail } from "./require-user";
import { arcReady } from "./arc-pay";

// 用戶選了 Arc 付款時的檢查：Arc 通道要已開通；設了 ARC_PAY_ADMIN_ONLY=1 時只有管理員能用
// （例如 Arc 主網收真錢、Solana 那邊還是 devnet 樣本卡的展示環境）。回傳錯誤回應，沒問題時回傳 null
export function arcRailBlocked(user: { isAdmin: boolean }) {
  if (!arcReady()) return fail("arc_not_configured", 503);
  if (process.env.ARC_PAY_ADMIN_ONLY === "1" && !user.isAdmin) return fail("arc_not_open", 403);
  return null;
}
