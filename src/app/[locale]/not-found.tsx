import { useTranslations } from "next-intl";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <>
      <Navbar />
      <main className="mx-auto flex w-full page-width flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
        <p className="text-accent-ink font-mono text-6xl font-bold">404</p>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Link href="/" className="rounded-full border border-line bg-surface px-5 py-2 text-sm hover:bg-surface-3">
          {t("back")}
        </Link>
      </main>
      <Footer />
    </>
  );
}
