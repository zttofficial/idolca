import { describe, expect, it } from "vitest";
import { arrange, EMPTY_LAYOUT, putBack, swapPockets, takeOut } from "@/lib/binder-layout";

const keys = ["vault:a", "vault:b", "item:c", "card:d"];

describe("binder layout", () => {
  it("uses the default order before anything is arranged", () => {
    expect(arrange(keys, EMPTY_LAYOUT).pockets).toEqual(keys);
  });

  it("keeps arranged positions and empty pockets, and appends new cards after the last card", () => {
    const { pockets } = arrange(keys, { order: ["card:d", "", "vault:a"], hidden: [] });
    expect(pockets).toEqual(["card:d", null, "vault:a", "vault:b", "item:c"]);
  });

  it("leaves an empty pocket where a sold card was, and puts it back there if it returns", () => {
    const layout = { order: ["vault:a", "vault:b", "item:c"], hidden: [] };
    const sold = arrange(["vault:a", "item:c"], layout);
    expect(sold.pockets).toEqual(["vault:a", null, "item:c"]);
    expect(arrange(["vault:a", "vault:b", "item:c"], sold.layout).pockets).toEqual(["vault:a", "vault:b", "item:c"]);
  });

  it("swaps two pockets, or moves a card into an empty one", () => {
    const base = arrange(keys, EMPTY_LAYOUT).layout;
    expect(arrange(keys, swapPockets(base, 0, 3)).pockets).toEqual(["card:d", "vault:b", "item:c", "vault:a"]);
    expect(arrange(keys, swapPockets(base, 0, 10)).pockets).toEqual([null, "vault:b", "item:c", "card:d", null, null, null, null, null, null, "vault:a"]);
  });

  it("takes a card out of the binder and puts it back", () => {
    const base = arrange(keys, EMPTY_LAYOUT).layout;
    const out = takeOut(base, "vault:b");
    const shown = arrange(keys, out);
    expect(shown.pockets).toEqual(["vault:a", null, "item:c", "card:d"]);
    expect(shown.hiddenCards).toEqual(["vault:b"]);
    const present = new Set(keys);
    expect(arrange(keys, putBack(out, "vault:b", present)).pockets).toEqual(["vault:a", null, "item:c", "card:d", "vault:b"]);
    // 放進有卡的卡套：原本那張移到最後
    expect(arrange(keys, putBack(out, "vault:b", present, 0)).pockets).toEqual(["vault:b", null, "item:c", "card:d", "vault:a"]);
  });
});
