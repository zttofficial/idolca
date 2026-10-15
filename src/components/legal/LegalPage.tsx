import type { ReactNode } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Link } from "@/i18n/navigation";

// 服務條款和隱私權政策共用的版面。條文以英文為準
export type Section = { title: string; body: string[] };

// 條文裡的 [文字](/站內路徑) 顯示成站內連結（帶目前的語言前綴）；其他文字照原樣
const LINK = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;
function Paragraph({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    parts.push(text.slice(last, m.index));
    parts.push(
      <Link key={m.index} href={m[2]} className="font-semibold text-accent-ink hover:underline">
        {m[1]}
      </Link>,
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export default function LegalPage({ title, updated, intro, sections, note }: { title: string; updated: string; intro: string; sections: Section[]; note?: string }) {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-xs text-ink-3">Last updated {updated}</p>
        {note && <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-xs text-ink-2">{note}</p>}
        <p className="mt-6 text-sm leading-relaxed text-ink-2">{intro}</p>
        {sections.map((s, i) => (
          <section key={s.title} className="mt-8">
            <h2 className="text-base font-semibold">
              {i + 1}. {s.title}
            </h2>
            {s.body.map((p) => (
              <p key={p} className="mt-2 text-sm leading-relaxed text-ink-2">
                <Paragraph text={p} />
              </p>
            ))}
          </section>
        ))}
        {contact && (
          <p className="mt-10 text-sm text-ink-2">
            Contact:{" "}
            <a href={`mailto:${contact}`} className="font-semibold text-accent-ink hover:underline">
              {contact}
            </a>
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}
