import { describe, expect, it } from "vitest";
import { binderSearch, filterBinder, isNarrowed, parseBinderQuery, type BinderQuery } from "@/lib/binder-filter";
import { groupMemberFacets, hit } from "@/lib/facets";

type C = { id: string; group: string; member: string; album: string };
const cards: C[] = [
  { id: "1", group: "IVE", member: "Wonyoung", album: "I've IVE" },
  { id: "2", group: "aespa", member: "Karina", album: "Armageddon" },
  // 自己上鏈的卡，團名是用戶自己填的
  { id: "3", group: "ive ", member: "Yujin", album: "I've IVE" },
  { id: "4", group: "IVE", member: "wonyoung", album: "Switch" },
  { id: "5", group: "aespa", member: "Winter", album: "Armageddon" },
];
const fields = (c: C) => ({ group: c.group, member: c.member, text: `${c.group} ${c.member} ${c.album}` });
const all: BinderQuery = { listed: false, q: "", cat: null, group: null, member: null };
const ids = (list: C[]) => list.map((c) => c.id);

describe("binder filter", () => {
  it("reads and writes the query string, dropping a member without a group", () => {
    const q = parseBinderQuery(new URLSearchParams("filter=listed&q=karina&group=aespa&member=Karina"));
    expect(q).toEqual({ listed: true, q: "karina", cat: null, group: "aespa", member: "Karina" });
    expect(binderSearch(q).toString()).toBe("filter=listed&q=karina&group=aespa&member=Karina");
    expect(parseBinderQuery(new URLSearchParams("member=Karina")).member).toBeNull();
    expect(binderSearch(all).toString()).toBe("");
    expect(isNarrowed(all)).toBe(false);
    expect(isNarrowed({ ...all, listed: true })).toBe(false);
    expect(isNarrowed({ ...all, q: "x" })).toBe(true);
  });

  it("keeps the binder order and matches groups and members regardless of case and spacing", () => {
    expect(ids(filterBinder(cards, fields, all).shown)).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids(filterBinder(cards, fields, { ...all, group: "IVE" }).shown)).toEqual(["1", "3", "4"]);
    expect(ids(filterBinder(cards, fields, { ...all, group: "IVE", member: "Wonyoung" }).shown)).toEqual(["1", "4"]);
  });

  it("needs every keyword to match", () => {
    expect(ids(filterBinder(cards, fields, { ...all, q: "armageddon win" }).shown)).toEqual(["5"]);
    expect(hit("IVE Wonyoung Switch", "")).toBe(true);
  });

  it("counts groups and members of the cards in the binder, merging spellings", () => {
    const { facets } = filterBinder(cards, fields, { ...all, group: "ive" });
    expect(facets.total).toBe(5);
    expect(facets.groups).toEqual([
      { name: "aespa", count: 2 },
      { name: "IVE", count: 3 },
    ]);
    expect(facets.members).toEqual([
      { name: "Wonyoung", count: 2 },
      { name: "Yujin", count: 1 },
    ]);
  });

  it("keeps every group as an option while a keyword narrows the counts", () => {
    const { facets, shown } = filterBinder(cards, fields, { ...all, q: "karina" });
    expect(ids(shown)).toEqual(["2"]);
    expect(facets.total).toBe(1);
    expect(facets.groups).toEqual([
      { name: "aespa", count: 1 },
      { name: "IVE", count: 0 },
    ]);
  });

  it("stays linear for thousands of cards", () => {
    const many = Array.from({ length: 20000 }, (_, i) => ({ id: String(i), group: `Group ${i % 120}`, member: `Member ${i % 9}`, album: `Album ${i % 40}` }));
    const started = performance.now();
    const { shown, facets } = filterBinder(many, fields, { ...all, q: "album 7", group: "group 7", member: "member 7" });
    expect(performance.now() - started).toBeLessThan(500);
    expect(facets.groups).toHaveLength(120);
    expect(shown.length).toBe(56);
    expect(shown.every((c) => c.group === "Group 7" && c.member === "Member 7")).toBe(true);
    expect(groupMemberFacets(many, (c) => c, null).members).toEqual([]);
  });
});
