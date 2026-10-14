// 收藏冊卡冊頁籤的篩選：全部／在售中，加上和市場同一套的關鍵字搜尋和團體 → 成員（facets.ts）。
// 條件放在網址裡（?filter=listed&q=&group=&member=），可以分享、可以用瀏覽器返回。
// 篩選結果照冊子裡的擺放順序排成連續的卡套，用同一本書顯示；有篩選時不能整理收藏冊（見 BinderView）

import { countOf, groupMemberFacets, hit, inGroupMember, type Facet } from "./facets";

export type BinderQuery = { listed: boolean; q: string; group: string | null; member: string | null };

export function parseBinderQuery(sp: URLSearchParams): BinderQuery {
  const group = sp.get("group")?.trim() || null;
  return {
    listed: sp.get("filter") === "listed",
    q: sp.get("q")?.trim() ?? "",
    group,
    // 成員只在選了團體時有意義
    member: (group && sp.get("member")?.trim()) || null,
  };
}

// 只寫非預設值，網址保持乾淨
export function binderSearch(q: BinderQuery, params = new URLSearchParams()) {
  if (q.listed) params.set("filter", "listed");
  if (q.q) params.set("q", q.q);
  if (q.group) params.set("group", q.group);
  if (q.group && q.member) params.set("member", q.member);
  return params;
}

// 有沒有用搜尋或團體、成員縮小範圍（「在售中」不算，它有自己的檢視）
export const isNarrowed = (q: BinderQuery) => Boolean(q.q || q.group || q.member);

// 一張卡拿來篩選的欄位：團體、成員，和關鍵字比對的文字（團體、成員、專輯、版本、標題、編號這類）
export type FilterFields = { group: string; member: string; text: string };

// 先比關鍵字，再套用團體、成員條件，保持原本的順序。
// 選項和市場一樣：列出這些卡裡實際有的團體（和選定團體的成員），數量是符合關鍵字的張數，可能是 0
export function filterBinder<T>(cards: T[], fields: (card: T) => FilterFields, q: BinderQuery) {
  const all = cards.map((card) => ({ card, f: fields(card) }));
  const base = q.q ? all.filter((x) => hit(x.f.text, q.q)) : all;
  const counts = groupMemberFacets(base, (x) => x.f, q.group);
  const names = q.q ? groupMemberFacets(all, (x) => x.f, q.group) : counts;
  const withCounts = (list: Facet[], from: Facet[]) => list.map((f) => ({ name: f.name, count: countOf(from, f.name) }));
  const shown = q.group || q.member ? base.filter((x) => inGroupMember(x.f, q.group, q.member)) : base;
  return {
    shown: shown.map((x) => x.card),
    facets: { total: base.length, groups: withCounts(names.groups, counts.groups), members: withCounts(names.members, counts.members) },
  };
}
