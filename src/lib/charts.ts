// 專輯銷量榜單（看板展示）。樣本數據：專輯是真實發行的，銷量數字是示意的，不是 Hanteo 或 Circle 的真實數據。
// 正式版接授權的榜單數據（Hanteo 實時零售銷量、Circle 發行商出貨量），按週更新

export type ChartEntry = {
  rank: number;
  // null 表示本週新進榜
  prevRank: number | null;
  groupId: string;
  artist: string;
  album: string;
  released: string;
  weeklySales: number;
  totalSales: number;
  firstWeekSales: number;
  weeksOnChart: number;
  // 用哪張樣本卡當封面
  coverCardId: string;
};

export const CHART_WEEK = { start: "2026-10-05", end: "2026-10-11" };

export const WEEKLY_CHART: ChartEntry[] = [
  { rank: 1, prevRank: 2, groupId: "straykids", artist: "Stray Kids", album: "ATE", released: "2024-07-19", weeklySales: 412830, totalSales: 3210455, firstWeekSales: 2486000, weeksOnChart: 12, coverCardId: "c7" },
  { rank: 2, prevRank: 1, groupId: "ive", artist: "IVE", album: "I've IVE", released: "2023-04-10", weeklySales: 298114, totalSales: 1684220, firstWeekSales: 1102310, weeksOnChart: 9, coverCardId: "c1" },
  { rank: 3, prevRank: 3, groupId: "aespa", artist: "aespa", album: "Armageddon", released: "2024-05-27", weeklySales: 186540, totalSales: 1402800, firstWeekSales: 1135600, weeksOnChart: 7, coverCardId: "c2" },
  { rank: 4, prevRank: null, groupId: "itzy", artist: "ITZY", album: "BORN TO BE", released: "2026-10-06", weeklySales: 182406, totalSales: 182406, firstWeekSales: 182406, weeksOnChart: 1, coverCardId: "c8" },
  { rank: 5, prevRank: 6, groupId: "lesserafim", artist: "LE SSERAFIM", album: "EASY", released: "2024-02-19", weeklySales: 121902, totalSales: 1130500, firstWeekSales: 1006400, weeksOnChart: 8, coverCardId: "c4" },
  { rank: 6, prevRank: 4, groupId: "newjeans", artist: "NewJeans", album: "Get Up", released: "2023-07-21", weeklySales: 98330, totalSales: 1720600, firstWeekSales: 1656000, weeksOnChart: 11, coverCardId: "c3" },
  { rank: 7, prevRank: 5, groupId: "twice", artist: "NAYEON", album: "NA", released: "2024-06-14", weeklySales: 61205, totalSales: 690400, firstWeekSales: 590800, weeksOnChart: 6, coverCardId: "c5" },
  { rank: 8, prevRank: 11, groupId: "blackpink", artist: "JISOO", album: "ME", released: "2023-03-31", weeklySales: 44870, totalSales: 1020300, firstWeekSales: 883200, weeksOnChart: 4, coverCardId: "c6" },
];

// 初動（發行後 7 天）排行，按初動銷量排序
export const FIRST_WEEK_CHART = [...WEEKLY_CHART].sort((a, b) => b.firstWeekSales - a.firstWeekSales);
