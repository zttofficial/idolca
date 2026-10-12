import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { GROUPS } from "@/lib/catalog";
import { SITE_URL, languageAlternates, localePath } from "@/lib/seo";
import { getDb } from "@/lib/server/db";
import { listListings } from "@/lib/server/items";
import { listPacks } from "@/lib/server/pack-pool";
import { listRedeemedCards, listVaultCards } from "@/lib/server/vault-cards";

// 站點地圖：固定頁面、圖鑑團體、金庫卡（包括已提貨的，紀錄頁仍有價值）、刊登中的自由刊登、卡包。
// 每條網址附上八種語言的對應版本，搜尋引擎據此把各語言頁面歸成一組
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const entry = (path: string, priority: number, lastModified?: string): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${localePath("en", path)}`,
    lastModified,
    priority,
    alternates: { languages: languageAlternates(path) },
  });
  const pages = [
    entry("/", 1),
    entry("/market", 0.9),
    entry("/packs", 0.8),
    entry("/catalog", 0.8),
    entry("/vault", 0.7),
    entry("/grading", 0.6),
    entry("/charts", 0.6),
    entry("/terms", 0.2),
    entry("/privacy", 0.2),
    ...GROUPS.map((g) => entry(`/catalog/${g.id}`, 0.6)),
  ];
  const db = await getDb();
  if (!db) return pages;
  const [vault, redeemed, listings, packs] = await Promise.all([listVaultCards(db), listRedeemedCards(db), listListings(db), listPacks(db)]);
  return [
    ...pages,
    ...vault.map((c) => entry(`/card/${c.id}`, 0.7, c.intakeDate)),
    ...redeemed.map((c) => entry(`/card/${c.id}`, 0.3, c.redeemedAt)),
    ...listings.map((l) => entry(`/listing/${l.id}`, 0.6, l.listedAt ?? undefined)),
    ...packs.map((p) => entry(`/packs/${p.id}`, 0.7, p.startsAt)),
  ];
}
