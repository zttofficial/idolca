import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Wordmark from "@/components/brand/Wordmark";
import { CLUSTER } from "@/lib/solana/config";
import { SOCIAL } from "@/lib/social";

export default function Footer() {
  const t = useTranslations("Footer");
  return (
    <footer className="border-t border-line py-10 text-center text-xs text-ink-3">
      <Wordmark className="mb-4 text-xl" />
      <nav aria-label={t("follow")} className="mb-4 flex justify-center gap-3">
        {SOCIAL.map((s) => (
          <a key={s.id} href={s.url} target="_blank" rel="noreferrer me" aria-label={s.name} title={s.name} className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink-2 transition hover:border-line-strong hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d={s.icon} />
            </svg>
          </a>
        ))}
      </nav>
      <p>{t(CLUSTER === "devnet" ? "textDevnet" : "textMainnet")}</p>
      <nav className="mt-2 flex justify-center gap-4">
        <Link href="/terms" className="hover:text-ink">
          {t("terms")}
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          {t("privacy")}
        </Link>
        <Link href="/grading" className="hover:text-ink">
          {t("grading")}
        </Link>
        <Link href="/credits" className="hover:text-ink">
          {t("credits")}
        </Link>
      </nav>
    </footer>
  );
}
