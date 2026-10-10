import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Wordmark from "@/components/brand/Wordmark";
import { CLUSTER } from "@/lib/solana/config";

export default function Footer() {
  const t = useTranslations("Footer");
  return (
    <footer className="border-t border-line py-10 text-center text-xs text-ink-3">
      <Wordmark className="mb-4 text-xl" />
      <p>{t("text", { cluster: CLUSTER === "devnet" ? "Devnet" : "Mainnet" })}</p>
      <Link href="/credits" className="mt-2 inline-block hover:text-ink">
        {t("credits")}
      </Link>
    </footer>
  );
}
