import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { TEMPLATES } from "@/lib/catalog";
import type { collectorItems } from "./schema";

export type ItemRow = typeof collectorItems.$inferSelect;

// 前端看到的收藏品
export function publicItem(r: ItemRow) {
  return {
    id: r.id,
    photo: r.photo,
    photoBack: r.photoBack,
    source: r.source,
    group: r.groupName,
    member: r.member,
    album: r.album,
    version: r.version,
    templateId: r.templateId,
    asset: r.asset,
    verification: r.verification,
    verificationNote: r.verificationNote,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

// 用戶填的名稱和圖鑑卡款完全一致（不分大小寫）時自動關聯
export function matchTemplate(group: string, member: string, album?: string | null, version?: string | null) {
  if (!album || !version) return null;
  return (
    TEMPLATES.find(
      (t) => norm(t.group) === norm(group) && norm(t.member) === norm(member) && norm(t.album) === norm(album) && norm(t.version) === norm(version),
    )?.id ?? null
  );
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// 演示模式的 NFT 地址；接上 Bubblegum 鑄造後換成真實的資產 ID
export function demoAssetId() {
  return Array.from(randomBytes(44), (b) => BASE58[b % 58]).join("");
}

export const newItemId = () => randomUUID();
