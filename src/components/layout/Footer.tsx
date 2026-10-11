import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Wordmark from "@/components/brand/Wordmark";
import { CLUSTER } from "@/lib/solana/config";

export default function Footer() {
  const t = useTranslations("Footer");
  return (
    <footer className="border-t border-line py-10 text-center text-xs text-ink-3">
      <Wordmark className="mb-4 text-xl" />
      <p>{t(CLUSTER === "devnet" ? "textDevnet" : "textMainnet")}</p>
      <nav className="mt-2 flex justify-center gap-4">
        <Link href="/terms" className="hover:text-ink">
          {t("terms")}
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          {t("privacy")}
        </Link>
        <Link href="/credits" className="hover:text-ink">
          {t("credits")}
        </Link>
      </nav>
    </footer>
  );
}
