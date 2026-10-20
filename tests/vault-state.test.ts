import { describe, expect, it } from "vitest";
import { auctionView, listingView, marketColumns, sameMarket, stateOfRow, type RawAuction, type RawListing } from "@/lib/vault-state";

const listing: RawListing = { seller: "S", price: 50_000_000, rentPayer: "P" };
const auction: RawAuction = {
  seller: "S",
  startPrice: 10_000_000,
  reservePrice: 0,
  endTs: 1_800_000_000,
  highBidder: "11111111111111111111111111111111",
  highBid: 0,
  highBidMint: "11111111111111111111111111111111",
  bidCount: 0,
  rentPayer: "P",
  feeBps: 500,
};
const asset = { owner: "O", redeeming: false, burned: false };

describe("vault chain state index", () => {
  it("round-trips a listing through the index columns", () => {
    const row = { ...asset, ...marketColumns(listing, null) };
    expect(row.listingPriceCents).toBe(5000);
    expect(stateOfRow(row)).toEqual({ owner: "O", listing: listingView(listing), auction: null, redeeming: false, burned: false });
  });

  it("rebuilds the auction view from the stored raw fields", () => {
    const row = { ...asset, ...marketColumns(null, auction) };
    expect(row.auctionEndsAt?.getTime()).toBe(1_800_000_000_000);
    const now = 1_700_000_000_000;
    expect(stateOfRow(row, now).auction).toEqual(auctionView(auction, now));
    expect(stateOfRow(row, now).auction?.status).toBe("live");
    expect(stateOfRow(row, 1_800_000_000_000).auction?.status).toBe("settling");
  });

  it("hides the bidder before the first bid and rounds the next bid up to a cent", () => {
    const open = auctionView(auction);
    expect(open.highBidder).toBeNull();
    expect(open.minNextUsd).toBe(10);
    const bid = auctionView({ ...auction, bidCount: 1, highBid: 60_000_000, highBidder: "B", reservePrice: 100_000_000 });
    expect(bid).toMatchObject({ highBidder: "B", highUsd: 60, minNextUsd: 65, hasReserve: true, reserveMet: false });
  });

  it("detects market changes", () => {
    const a = marketColumns(listing, null);
    expect(sameMarket(a, marketColumns(listing, null))).toBe(true);
    expect(sameMarket(a, marketColumns({ ...listing, price: 40_000_000 }, null))).toBe(false);
    expect(sameMarket(a, marketColumns(null, null))).toBe(false);
    expect(sameMarket(marketColumns(null, auction), marketColumns(null, { ...auction, bidCount: 1, highBid: 11_000_000 }))).toBe(false);
  });
});
