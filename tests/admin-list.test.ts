import { describe, expect, it } from "vitest";
import { CURSOR_SEP, MAX_PAGE, PAGE_SIZE, csvCell, csvLine, decodeCursor, encodeCursor, escapeLike, likeContains, likePrefix, parseDay, parseLimit, parseQuery, pickOne } from "@/lib/admin-list";

// 後台列表的純邏輯：游標、查詢參數、LIKE 跳脫、CSV
describe("cursor", () => {
  it("round-trips the sort keys", () => {
    const raw = ["2026-10-20 12:00:00.123456-07", "escrow", "a42924a1-3bf3"].join(CURSOR_SEP);
    expect(decodeCursor(encodeCursor(raw), 3)).toEqual(["2026-10-20 12:00:00.123456-07", "escrow", "a42924a1-3bf3"]);
  });

  it("is url-safe", () => {
    expect(encodeCursor(`?&/+=${CURSOR_SEP}ü`)).toMatch(/^[\w-]+$/);
  });

  it("rejects missing, malformed or mismatched cursors", () => {
    expect(decodeCursor(null, 2)).toBeNull();
    expect(decodeCursor("", 2)).toBeNull();
    expect(decodeCursor("not base64!", 2)).toBeNull();
    expect(decodeCursor(encodeCursor(["a", "b", "c"].join(CURSOR_SEP)), 2)).toBeNull();
    expect(decodeCursor("A".repeat(601), 1)).toBeNull();
    expect(decodeCursor(encodeCursor("x".repeat(201)), 1)).toBeNull();
  });
});

describe("query params", () => {
  it("trims and collapses the search text", () => {
    expect(parseQuery("  IVE   Wonyoung ")).toBe("IVE Wonyoung");
    expect(parseQuery(null)).toBe("");
    expect(parseQuery("x".repeat(300))).toHaveLength(100);
  });

  it("clamps the page size", () => {
    expect(parseLimit(null)).toBe(PAGE_SIZE);
    expect(parseLimit("5")).toBe(5);
    expect(parseLimit("100000")).toBe(MAX_PAGE);
    expect(parseLimit("0")).toBe(PAGE_SIZE);
    expect(parseLimit("2.5")).toBe(PAGE_SIZE);
    expect(parseLimit("abc")).toBe(PAGE_SIZE);
  });

  it("only accepts listed filter values", () => {
    const views = ["open", "disputed", "all"] as const;
    expect(pickOne("disputed", views, "open")).toBe("disputed");
    expect(pickOne("DROP TABLE", views, "open")).toBe("open");
    expect(pickOne(null, views, "open")).toBe("open");
  });

  it("parses UTC days, the end of a range is exclusive next midnight", () => {
    expect(parseDay("2026-10-20")?.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(parseDay("2026-10-20", true)?.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("20261020")).toBeNull();
    expect(parseDay(null)).toBeNull();
  });
});

describe("LIKE escaping", () => {
  it("treats wildcards as plain characters", () => {
    expect(escapeLike("100%_off\\")).toBe("100\\%\\_off\\\\");
    expect(likeContains("a_b")).toBe("%a\\_b%");
    expect(likePrefix("IC-0")).toBe("IC-0%");
  });
});

describe("CSV", () => {
  it("quotes cells with separators, quotes or newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("neutralises spreadsheet formulas in text but keeps numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell(-12.5)).toBe("-12.5");
  });

  it("writes empty cells for missing values and ends lines with CRLF", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvLine(["a", 1, null, "b,c"])).toBe('a,1,,"b,c"\r\n');
  });
});
