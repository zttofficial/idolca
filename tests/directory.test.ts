import { describe, expect, it } from "vitest";
import { categoryOf, findDirectoryGroup, parseCardFilename } from "@/lib/directory";
import { groupMemberFacets, groupTree, inGroupMember, memberList } from "@/lib/facets";

describe("parseCardFilename", () => {
  it("fills title, group and member from a descriptive filename", () => {
    expect(parseCardFilename("IVE Wonyoung 2024 Fanmeeting photocard - Front.jpg")).toEqual({
      title: "IVE Wonyoung 2024 Fanmeeting photocard - Front",
      group: "IVE",
      member: "Wonyoung",
    });
    expect(parseCardFilename("ive_wonyoung_pc.png")).toMatchObject({
      group: "IVE",
      member: "Wonyoung",
    });
  });

  it("matches whole words and aliases only", () => {
    expect(parseCardFilename("LIVE concert.jpg")).toBeUndefined();
    expect(parseCardFilename("snsd taeyeon.jpg")).toMatchObject({
      group: "Girls' Generation",
      member: "Taeyeon",
    });
  });

  it("infers the group from a member only when the name is unique", () => {
    expect(parseCardFilename("ningning pc.jpg")).toMatchObject({
      group: "aespa",
      member: "Ningning",
    });
    // Wonyoung 在 IVE 和 IZ*ONE 都有
    expect(parseCardFilename("wonyoung pc.jpg")).toMatchObject({ member: "Wonyoung", group: undefined });
    expect(parseCardFilename("yujin pc.jpg")).toEqual({
      title: "yujin pc",
      member: "Yujin",
      group: undefined,
    });
  });

  it("leaves fields empty when the name is ambiguous or unrecognised", () => {
    expect(parseCardFilename("IMG_1234.jpg")).toBeUndefined();
    expect(parseCardFilename("IVE aespa Wonyoung Karina.jpg")).toBeUndefined();
    expect(parseCardFilename("IVE Yujin Wonyoung.jpg")).toEqual({
      title: "IVE Yujin Wonyoung",
      group: "IVE",
      member: undefined,
    });
    expect(parseCardFilename("Wonyoung Karina.jpg")).toBeUndefined();
  });
});

describe("categories and the group tree", () => {
  it("finds groups by alias and puts unknown groups under other", () => {
    expect(findDirectoryGroup("txt")?.name).toBe("TOMORROW X TOGETHER");
    expect(categoryOf("IVE")).toBe("kpop");
    expect(categoryOf("My Local Band")).toBe("other");
  });

  it("counts aliases as the same group and lists every directory group in the market", () => {
    const cards = [
      { group: "TXT", member: "Yeonjun" },
      { group: "tomorrow x together", member: "Soobin" },
      { group: "My Local Band", member: "Kim" },
    ];
    const facets = groupMemberFacets(cards, (c) => c, "TXT");
    expect(facets.groups).toEqual([
      { name: "My Local Band", count: 1 },
      { name: "TOMORROW X TOGETHER", count: 2 },
    ]);
    expect(inGroupMember(cards[1], "TXT", null)).toBe(true);
    expect(inGroupMember(cards[0], null, null, "other")).toBe(false);

    const kpop = groupTree(facets.groups, true).find((c) => c.key === "kpop")!;
    expect(kpop.count).toBe(2);
    expect(kpop.groups[0]).toEqual({ name: "TOMORROW X TOGETHER", count: 2 });
    expect(kpop.groups.find((g) => g.name === "IVE")).toEqual({ name: "IVE", count: 0 });
    // 收藏冊只列自己有的
    expect(groupTree(facets.groups, false).map((c) => c.key)).toEqual(["kpop", "other"]);

    // 市場的成員按名錄順序列全，數量照卡算
    const members = memberList("TXT", facets.members, true);
    expect(members.slice(0, 2)).toEqual([
      { name: "Soobin", count: 1 },
      { name: "Yeonjun", count: 1 },
    ]);
    expect(members.find((m) => m.name === "Beomgyu")).toEqual({ name: "Beomgyu", count: 0 });
  });
});
