import { Suspense } from "react";
import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AdminConsole from "@/components/admin/AdminConsole";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Admin console", robots: { index: false } };
}

// 平台後台：待處理、入庫、金庫卡和評級、卡包、擔保交易、提貨、收藏卡、銷售紀錄、用戶、手續費、管理員，分頁籤。只給管理員帳號（見 src/lib/server/auth.ts 的 isAdmin）
export default function AdminPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Admin console</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">
          Intake (including collector cards sent in for authentication), vault cards and grading, trading card pools, escrow disputes, redemption shipping, fake cards, sales records, user
          lookup, fees and promotions, and admins. Admin accounts only.
        </p>
        {/* 頁籤跟著網址參數走，讀網址的元件要包在 Suspense 裡 */}
        <Suspense fallback={<div className="mt-8 h-32 animate-pulse rounded-2xl bg-surface-2" />}>
          <AdminConsole />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
