import { useTranslations } from "next-intl";

const STEPS = ["s1", "s2", "s3", "s4"] as const;

export default function HowItWorks() {
  const t = useTranslations("How");
  return (
    <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
      <h2 className="text-3xl font-bold tracking-tight">{t("title")}</h2>
      <p className="mt-2 max-w-2xl text-sm text-ink-3">{t("subtitle")}</p>
      <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6 backdrop-blur transition hover:border-accent"
          >
            <span className="text-accent-ink font-mono text-sm font-bold">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-3 text-lg font-semibold">{t(`${s}Title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{t(`${s}Body`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
