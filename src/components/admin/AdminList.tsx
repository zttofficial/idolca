"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import Select from "@/components/ui/Select";
import { chip } from "@/components/market/CardFilters";
import Drawer from "./Drawer";
import type { Act, Call } from "./shared";

// 篩選：第一個選項是預設值（等於預設值時不寫進網址）。選項不多時排成一排標籤，多的用下拉選單
export type ListFilter = { key: string; label: string; options: { value: string; label: string }[] };
export type ListCtx = { busy?: string; act: Act; call: Call; reload: () => Promise<void>; close: () => void };
type Page<T> = { rows: T[]; next: string | null } & Record<string, unknown>;

const CHIP_LIMIT = 6;
const DEBOUNCE = 300;

// 後台每個列表共用：伺服器分頁（「載入更多」帶著游標往下讀）、搜尋框（停手 0.3 秒才查）、篩選、日期範圍；
// 搜尋和篩選寫在網址上（?tab=orders&status=disputed&q=…），重新整理或分享連結時停在同一個查詢。
// 點一列打開右側的詳情面板（網址記 open=編號，從待處理點進來也是靠它），面板裡的操作做完會重讀列表和這一列。
// local 時查詢條件只放在元件裡（例如卡包詳情面板裡的卡池列表，不能和外面的列表搶網址參數）
export default function AdminList<T, D = T>({
  endpoint,
  call,
  rowKey,
  renderRow,
  filters = [],
  dates = false,
  search,
  detail,
  summary,
  local = false,
  limit,
  empty,
  onChanged,
}: {
  endpoint: string;
  call: Call;
  rowKey: (row: T) => string;
  renderRow: (row: T, ctx: ListCtx) => React.ReactNode;
  filters?: ListFilter[];
  dates?: boolean;
  search?: string;
  // 詳情：預設用 endpoint?id= 讀那一列；要讀別的資料（例如用戶詳情）就給 path，讀 path + 編號
  detail?: { title: (d: D) => string; render: (d: D, ctx: ListCtx) => React.ReactNode; path?: string; wide?: boolean };
  // 列表上方的摘要（第一頁回應裡的額外欄位，例如銷售紀錄的總計），query 是目前的查詢字串
  summary?: (first: Page<T>, query: string) => React.ReactNode;
  local?: boolean;
  limit?: number;
  empty?: string;
  onChanged?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const [localParams, setLocalParams] = useState<Record<string, string>>({});
  const get = useCallback((k: string) => (local ? (localParams[k] ?? "") : (sp.get(k) ?? "")), [local, localParams, sp]);
  const set = useCallback(
    (patch: Record<string, string>) => {
      if (local) return setLocalParams((p) => ({ ...p, ...patch }));
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [local, pathname, router, sp],
  );

  // 查詢字串：搜尋、篩選（不是預設值的）、日期；同一個查詢不重讀
  const keys = useMemo(() => ["q", ...filters.map((f) => f.key), ...(dates ? ["from", "to"] : [])], [filters, dates]);
  const query = useMemo(() => {
    const qs = new URLSearchParams();
    for (const k of keys) {
      const v = get(k);
      const f = filters.find((x) => x.key === k);
      if (v && (!f || v !== f.options[0]?.value)) qs.set(k, v);
    }
    return qs.toString();
  }, [keys, filters, get]);
  // endpoint 可以自帶固定參數（例如 ?state=assignable），查詢條件接在後面
  const url = useCallback(
    (...parts: string[]) => {
      const qs = [...parts, limit ? `limit=${limit}` : ""].filter(Boolean).join("&");
      return qs ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}${qs}` : endpoint;
    },
    [endpoint, limit],
  );

  // 讀第一頁：查詢條件變了、或 rev 加一（操作完要重讀）時讀；data 記著是哪個查詢的結果，晚到的舊回應不覆蓋新的
  const [data, setData] = useState<{ query: string; first: Page<T>; rows: T[]; next: string | null } | null>(null);
  const [rev, setRev] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 查詢條件變了就從第一頁重讀
    setLoading(true);
    call<Page<T>>("GET", url(query))
      .then((first) => live && setData({ query, first, rows: first.rows, next: first.next }))
      .catch((e) => live && setError(e instanceof Error ? e.message : "error"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [call, url, query, rev]);

  const more = async () => {
    if (!data?.next) return;
    const from = data;
    setLoading(true);
    try {
      const page = await call<Page<T>>("GET", url(from.query, `cursor=${from.next}`));
      setData((d) => (d === from ? { ...d, rows: [...d.rows, ...page.rows], next: page.next } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  };

  // 搜尋框：輸入停下來才寫進查詢；網址上的 q 被別處改掉時（從待處理點進來）跟著更新
  const urlQ = get("q");
  const [text, setText] = useState(urlQ);
  const [lastQ, setLastQ] = useState(urlQ);
  if (urlQ !== lastQ) {
    setLastQ(urlQ);
    setText(urlQ);
  }
  useEffect(() => {
    if (text.trim() === urlQ) return;
    const id = setTimeout(() => set({ q: text.trim(), open: "" }), DEBOUNCE);
    return () => clearTimeout(id);
  }, [text, urlQ, set]);

  // 詳情面板：shown 記著是哪一列的資料，切到別列時先顯示骨架，不閃出上一列
  const openId = get("open");
  const hasDetail = Boolean(detail);
  const detailPath = detail?.path;
  const [shown, setShown] = useState<{ id: string; d: D | null } | null>(null);
  const loadDetail = useCallback(
    async (id: string) => {
      const d = detailPath
        ? await call<D>("GET", `${detailPath}${encodeURIComponent(id)}`)
        : ((await call<Page<T>>("GET", url(`id=${encodeURIComponent(id)}`))).rows[0] as unknown as D | undefined);
      setShown({ id, d: d ?? null });
    },
    [call, url, detailPath],
  );
  useEffect(() => {
    if (!hasDetail || !openId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 打開的列換了就讀它的詳情
    loadDetail(openId).catch((e) => setError(e instanceof Error ? e.message : "error"));
  }, [hasDetail, openId, loadDetail]);
  const current = shown && shown.id === openId ? shown.d : null;
  const close = useCallback(() => set({ open: "" }), [set]);

  // 重讀列表和打開著的那一列
  const reload = useCallback(async () => {
    setRev((n) => n + 1);
    if (openId && hasDetail) await loadDetail(openId);
  }, [openId, hasDetail, loadDetail]);
  const act: Act = async (key, fn) => {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      await reload();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(undefined);
    }
  };
  const ctx: ListCtx = { busy, act, call, reload, close };
  const errorBox = error && <p className="rounded-xl bg-down/10 px-4 py-2 text-sm text-down">{`Error: ${error}`}</p>;

  return (
    <div>
      <div className="flex flex-col gap-3">
        {search !== undefined && (
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={search}
            aria-label={search}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink sm:max-w-md"
          />
        )}
        {(filters.length > 0 || dates) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {filters.map((f) => {
              const value = get(f.key) || f.options[0]?.value || "";
              const pick = (v: string) => set({ [f.key]: v === f.options[0]?.value ? "" : v, open: "" });
              return f.options.length > CHIP_LIMIT ? (
                <label key={f.key} className="flex items-center gap-2 text-xs text-ink-3">
                  {f.label}
                  <Select value={value} onChange={pick} options={f.options} ariaLabel={f.label} className="rounded-lg border border-line bg-surface px-2 py-1 text-xs" />
                </label>
              ) : (
                <div key={f.key} role="group" aria-label={f.label} className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs text-ink-3">{f.label}</span>
                  {f.options.map((o) => (
                    <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => pick(o.value)} className={chip(value === o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              );
            })}
            {dates && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                {"Date (UTC)"}
                {(["from", "to"] as const).map((k) => (
                  <input
                    key={k}
                    type="date"
                    value={get(k)}
                    onChange={(e) => set({ [k]: e.target.value, open: "" })}
                    aria-label={k === "from" ? "From" : "To"}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {data && summary && <div className="mt-4">{summary(data.first, query)}</div>}
      {!openId && errorBox && <div className="mt-4">{errorBox}</div>}

      {!data ? (
        <p className="mt-4 text-sm text-ink-3">…</p>
      ) : !data.rows.length ? (
        <p className="mt-4 text-sm text-ink-3">{empty ?? (query ? "No matches." : "Nothing here yet.")}</p>
      ) : (
        <ul className={`mt-4 divide-y divide-line rounded-2xl border border-line bg-surface transition ${loading ? "opacity-60" : ""}`}>
          {data.rows.map((row) => {
            const key = rowKey(row);
            return (
              <li key={key}>
                {detail ? (
                  <button
                    type="button"
                    onClick={() => set({ open: key })}
                    aria-current={openId === key || undefined}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left text-sm transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-2 aria-[current]:bg-surface-2"
                  >
                    {renderRow(row, ctx)}
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">{renderRow(row, ctx)}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {data?.next && (
        <button
          type="button"
          disabled={loading}
          onClick={more}
          className="mt-3 w-full rounded-full border border-line py-2 text-xs font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-50"
        >
          {loading ? "…" : "Load more"}
        </button>
      )}

      {detail && openId && (
        <Drawer label={current ? detail.title(current) : "…"} onClose={close} wide={detail.wide}>
          {errorBox && <div className="mb-4">{errorBox}</div>}
          {current ? (
            detail.render(current, ctx)
          ) : shown?.id === openId ? (
            <p className="text-sm text-ink-3">This record no longer exists.</p>
          ) : (
            <div className="h-32 animate-pulse rounded-2xl bg-surface-2" />
          )}
        </Drawer>
      )}
    </div>
  );
}
