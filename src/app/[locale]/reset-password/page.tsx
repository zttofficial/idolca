import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { ResetPassword } from "@/components/auth/EmailLinkPages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("resetTitle"), robots: { index: false } };
}

// 點重設密碼信裡的連結打開；網址帶一次性令牌，不收錄
export default function Page({ searchParams }: PageProps<"/[locale]/reset-password">) {
  return (
    <>
      <Navbar />
      <main className="flex flex-1 items-center px-4 py-20 sm:px-6">
        <Suspense>
          <WithToken searchParams={searchParams} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

// 令牌在網址參數裡，要等請求進來才知道；頁框先出，這一塊串流補上
async function WithToken({ searchParams }: { searchParams: PageProps<"/[locale]/reset-password">["searchParams"] }) {
  const { token } = await searchParams;
  return <ResetPassword token={typeof token === "string" ? token : ""} />;
}
