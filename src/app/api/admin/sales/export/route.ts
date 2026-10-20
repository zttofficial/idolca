import { connection, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { listParams } from "@/lib/server/admin-lists";
import { adminSales, saleFilter } from "@/lib/server/admin-sales";
import { SALES_EXPORT_CAP, csvLine } from "@/lib/admin-list";

// 匯出目前篩選下的銷售紀錄（CSV）：每次讀 500 列、邊讀邊送，最多 SALES_EXPORT_CAP 列；超過時最後一行註明被截斷，要縮小日期範圍再匯出
const BATCH = 500;
const BOM = String.fromCharCode(0xfeff);
const HEADER = [
  "type",
  "kind",
  "id",
  "time_utc",
  "amount_usd",
  "fee_usd",
  "status",
  "buyer_wallet",
  "buyer_email",
  "seller_wallet",
  "seller_email",
  "item",
  "ref",
  "tx",
  "refund_tx",
  "rail",
  "coin",
];

export async function GET(request: NextRequest) {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  const f = saleFilter(listParams(request.nextUrl.searchParams));
  const db = a.db;
  const encoder = new TextEncoder();
  let cursor: string | null = null;
  let sent = 0;
  let started = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          // 開頭的 BOM 讓 Excel 用 UTF-8 打開（郵箱、卡名可能有中日韓文字）
          controller.enqueue(encoder.encode(BOM + csvLine(HEADER)));
          return;
        }
        const { rows, next } = await adminSales(db, f, cursor, Math.min(BATCH, SALES_EXPORT_CAP - sent));
        const body = rows
          .map((s) =>
            csvLine([
              s.type,
              s.sub,
              s.id,
              s.at,
              s.amountUsdt,
              s.feeUsdt,
              s.status,
              s.buyerWallet,
              s.buyerEmail,
              s.sellerWallet,
              s.sellerEmail,
              s.card,
              s.ref,
              s.tx,
              s.refundTx,
              s.rail,
              s.coin,
            ]),
          )
          .join("");
        sent += rows.length;
        cursor = next;
        if (body) controller.enqueue(encoder.encode(body));
        if (!next || sent >= SALES_EXPORT_CAP) {
          if (next) controller.enqueue(encoder.encode(csvLine([`# truncated at ${SALES_EXPORT_CAP} rows: narrow the date range and export again`])));
          controller.close();
        }
      } catch (err) {
        console.error("sales export failed", err);
        controller.error(err);
      }
    },
  });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="idolca-sales-${day}.csv"`, "cache-control": "no-store" },
  });
}
