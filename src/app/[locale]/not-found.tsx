import { useTranslations } from "next-intl";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <>
      <div className="aurora" />
      <div className="grid-bg" />
      <Navbar />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
        <p className="text-holo font-mono text-6xl font-bold">404</p>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Link href="/" className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm hover:bg-white/10">
          {t("back")}
        </Link>
      </main>
      <Footer />
    </>
  );
}
