import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AdminConsole from "@/components/admin/AdminConsole";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");
  return { title: t("title"), robots: { index: false } };
}

// 平台後台（演示版）：處理提貨出貨、把自由上鏈的卡標成假卡。用 ADMIN_TOKEN 驗證
export default async function AdminPage() {
  const t = await getTranslations("Admin");
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">{t("intro")}</p>
        <AdminConsole />
      </main>
      <Footer />
    </>
  );
}
