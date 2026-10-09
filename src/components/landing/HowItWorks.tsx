const STEPS = [
  { n: "01", title: "寄卡入庫", body: "把小卡寄到首爾倉庫，或在線上拆專輯，抽到的卡直接入庫。" },
  { n: "02", title: "鑑定上架", body: "逐張鑑定真偽、拍攝高清正反面，高價卡可加購評級。" },
  { n: "03", title: "秒速轉手", body: "成交時卡不移動，所有權即時轉移；付款由平台擔保，驗貨無憂。" },
  { n: "04", title: "隨時提貨", body: "想摸到實物時，多張合併寄出，全球配送。" },
];

export default function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
      <h2 className="text-3xl font-bold tracking-tight">卡留在倉庫，交易在線上</h2>
      <p className="mt-2 max-w-2xl text-sm text-white/50">
        告別收錢不發貨、假卡和跨境運費。每張卡都有唯一編號和完整的流轉紀錄。
      </p>
      <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition hover:border-violet-400/40"
          >
            <span className="text-holo font-mono text-sm font-bold">{s.n}</span>
            <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
