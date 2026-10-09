import HoloTile from "./HoloTile";
import { CARDS } from "@/lib/mock-cards";

const FILTERS = ["全部", "簽售限定", "預購特典", "幸運抽", "已評級"];

export default function MarketGrid() {
  return (
    <section id="market" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">熱門小卡</h2>
          <p className="mt-2 text-sm text-white/50">全部已入庫鑑定，成交即轉移所有權</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f, i) => (
            <button
              key={f}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                i === 0 ? "border-white/40 bg-white/15" : "border-white/10 bg-white/5 text-white/55 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {CARDS.map((c) => (
          <HoloTile key={c.id} card={c} />
        ))}
      </div>
    </section>
  );
}
