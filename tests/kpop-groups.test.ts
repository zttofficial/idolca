import { describe, expect, it } from "vitest";
import { parseCardFilename } from "@/lib/kpop-groups";

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
    expect(parseCardFilename("wonyoung pc.jpg")).toMatchObject({
      group: "IVE",
      member: "Wonyoung",
    });
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
