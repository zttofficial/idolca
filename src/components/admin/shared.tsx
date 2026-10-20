import { solscanUrl } from "@/lib/solana/config";
import { arcExplorerUrl } from "@/lib/arc";

// 後台各頁籤共用：打管理接口（出錯時丟出伺服器回的錯誤碼）、執行一個操作（期間鎖住按鈕，完成後重讀資料）
export type Call = <T>(method: string, path: string, body?: unknown) => Promise<T>;
export type Act = (key: string, fn: () => Promise<unknown>) => Promise<void>;

export const field = "mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink";
export const label = "block text-xs text-ink-3";

// 交易連結：付款和退款走 Arc 的訂單連到 Arc 區塊瀏覽器；其他都在 Solana
export function TxLink({ label, sig, onArc = false }: { label: string; sig: string | null; onArc?: boolean }) {
  if (!sig) return null;
  return (
    <a href={onArc ? arcExplorerUrl("tx", sig) : solscanUrl("tx", sig)} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">
      {label} ↗
    </a>
  );
}
