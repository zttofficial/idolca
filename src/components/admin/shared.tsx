import { Link } from "@/i18n/navigation";
import { shortAddress, solscanUrl } from "@/lib/solana/config";
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

// 時間顯示到分鐘（瀏覽器的時區）
const pad = (n: number) => String(n).padStart(2, "0");
export function when(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 後台頁籤之間互相連結：例如從訂單的買家跳到用戶詳情（?tab=users&open=…）
export const adminHref = (tab: string, params: Record<string, string> = {}) => `/admin?${new URLSearchParams({ tab, ...params })}`;

// 錢包地址：縮短顯示，連到區塊瀏覽器
export function Wallet({ address }: { address: string | null | undefined }) {
  if (!address) return null;
  return (
    <a href={solscanUrl("account", address)} target="_blank" rel="noreferrer" title={address} className="font-mono hover:underline">
      {shortAddress(address)} ↗
    </a>
  );
}

// 帳號：暱稱連到用戶詳情，下面是郵箱和錢包
export function Party({ party }: { party: { id: string; name: string; email: string | null; wallet: string | null } | null }) {
  if (!party) return <span className="text-ink-3">—</span>;
  return (
    <span className="flex min-w-0 flex-col">
      <Link href={adminHref("users", { open: party.id })} className="truncate font-medium hover:underline">
        {party.name}
      </Link>
      <span className="flex flex-wrap gap-x-3 text-xs text-ink-3">
        {party.email && <span className="break-all">{party.email}</span>}
        <Wallet address={party.wallet} />
      </span>
    </span>
  );
}

// 詳情面板裡的欄位表：左邊欄名，右邊內容
export function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {rows
        .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== "")
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-xs leading-5 text-ink-3">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

// 列表裡的縮圖（卡的照片，沒有就是空白卡框）
export function Thumb({ src }: { src: string | null | undefined }) {
  return (
    <span className="aspect-[55/85] w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- 用戶上傳的照片 */}
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
    </span>
  );
}
