import "server-only";
import { cacheLife } from "next/cache";

// Circle Chart（韓國音樂內容協會）週專輯榜的前 10 名。讀它網頁本身用的數據接口，
// 只取名次、專輯、藝人、銷量這些事實數據，不取封面圖；頁面標明來源並連回原榜單。結果快取幾小時，對方每週更新一次
export const CIRCLE_CHART_URL = "https://circlechart.kr/page_chart/album.circle?nationGbn=T&serviceGbn=ALL";
const API = "https://circlechart.kr/data/api/chart/album";
const UA = "Mozilla/5.0 (compatible; IdolcaBot/0.1; +https://idolca.vercel.app)";

export type ChartRow = {
  rank: number;
  // 上週名次；新進榜為 null
  prevRank: number | null;
  album: string;
  artist: string;
  weeklySales: number;
  totalSales: number;
  distributor: string;
};

export type WeeklyChart = { year: number; week: number; rows: ChartRow[] };

type RawRow = {
  SERVICE_RANKING: string;
  PRE_SERVICE_RANKING: string;
  ALBUM_NAME: string;
  ARTIST_NAME: string;
  Album_CNT: string;
  Total_CNT: string;
  de_nm: string;
};

export async function weeklyAlbumTop10(): Promise<WeeklyChart | null> {
  "use cache";
  cacheLife("hours");
  try {
    // 榜單頁裡寫著目前最新的是哪一年第幾週
    const html = await (await fetch(CIRCLE_CHART_URL, { headers: { "User-Agent": UA } })).text();
    const year = Number(/var hitYear = "(\d+)"/.exec(html)?.[1]);
    const week = Number(/var targetTime = "(\d+)"/.exec(html)?.[1]);
    if (!year || !week) return null;

    const body = new URLSearchParams({ nationGbn: "T", termGbn: "week", hitYear: String(year), targetTime: String(week), yearTime: "3", curUrl: "circlechart.kr/page_chart/album.circle" });
    const res = await fetch(API, { method: "POST", headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "content-type": "application/x-www-form-urlencoded" }, body });
    const data = (await res.json()) as { ResultStatus?: string; List?: Record<string, RawRow> };
    if (data.ResultStatus !== "OK" && !data.List) return null;

    const rows = Object.values(data.List ?? {})
      .map((r) => ({
        rank: Number(r.SERVICE_RANKING),
        prevRank: r.PRE_SERVICE_RANKING ? Number(r.PRE_SERVICE_RANKING) : null,
        album: r.ALBUM_NAME,
        artist: r.ARTIST_NAME,
        weeklySales: Number(r.Album_CNT),
        totalSales: Number(r.Total_CNT),
        distributor: r.de_nm,
      }))
      .filter((r) => r.rank > 0)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 10);
    return rows.length ? { year, week, rows } : null;
  } catch {
    return null;
  }
}
