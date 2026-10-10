"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Sale } from "@/lib/card-detail";

// 單一系列：線和面用主色（白底上驗證過亮度和對比度），文字一律用文字色
const LINE = "#e8285a";
const SURFACE = "#ffffff";
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 52 };

const fmt = (n: number) => n.toLocaleString("en-US");

function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || max || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export default function PriceChart({ sales }: { sales: Sale[] }) {
  const t = useTranslations("Detail");
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { points, yTicks, xTicks, path, area } = useMemo(() => {
    const times = sales.map((s) => Date.parse(s.date));
    const prices = sales.map((s) => s.priceUsdt);
    const yTicks = niceTicks(Math.min(...prices) * 0.95, Math.max(...prices) * 1.03);
    const t0 = times[0];
    const t1 = times[times.length - 1];
    const innerW = width - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (ms: number) => PAD.left + ((ms - t0) / (t1 - t0 || 1)) * innerW;
    const y = (v: number) => PAD.top + (1 - (v - yTicks[0]) / (yTicks[yTicks.length - 1] - yTicks[0])) * innerH;
    const points = sales.map((s, i) => ({ x: x(times[i]), y: y(s.priceUsdt), sale: s }));
    const path = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
    const area = `${path}L${points[points.length - 1].x.toFixed(1)},${H - PAD.bottom}L${points[0].x.toFixed(1)},${H - PAD.bottom}Z`;
    const xTicks = [0, 1, 2, 3].map((i) => {
      const ms = t0 + ((t1 - t0) * i) / 3;
      return { x: x(ms), label: new Date(ms).toISOString().slice(5, 10) };
    });
    return { points, yTicks: yTicks.map((v) => ({ v, y: y(v) })), xTicks, path, area };
  }, [sales, width]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].x - px) < Math.abs(points[best].x - px)) best = i;
    setHover(best);
  };

  const last = points[points.length - 1];
  const active = hover === null ? null : points[hover];

  return (
    <div>
      <div ref={wrap} className="relative">
        <svg
          width={width}
          height={H}
          className="block touch-none"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={t("priceSubtitle")}
        >
          {yTicks.map(({ v, y }) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} style={{ stroke: "var(--line)" }} />
              <text x={PAD.left - 8} y={y} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[10px] tabular-nums">
                {fmt(v)}
              </text>
            </g>
          ))}
          {xTicks.map(({ x, label }, i) => (
            <text
              key={label}
              x={x}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
              className="fill-ink-3 text-[10px] tabular-nums"
            >
              {label}
            </text>
          ))}
          <path d={area} fill={LINE} fillOpacity={0.1} />
          <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={last.x} cy={last.y} r={4} fill={LINE} stroke={SURFACE} strokeWidth={2} />
          {active && (
            <g pointerEvents="none">
              <line x1={active.x} x2={active.x} y1={PAD.top} y2={H - PAD.bottom} style={{ stroke: "var(--ink-3)" }} />
              <circle cx={active.x} cy={active.y} r={5} fill={LINE} stroke={SURFACE} strokeWidth={2} />
            </g>
          )}
        </svg>
        {active && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-line bg-surface shadow-xl px-3 py-2 text-xs shadow-lg backdrop-blur"
            style={{ left: Math.min(Math.max(active.x - 60, 0), width - 130) }}
          >
            <p className="text-sm font-semibold text-ink tabular-nums">{fmt(active.sale.priceUsdt)} USDT</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-ink-2">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: LINE }} />
              {active.sale.date}
            </p>
          </div>
        )}
      </div>

      <details className="mt-3 text-xs text-ink-2">
        <summary className="cursor-pointer select-none hover:text-ink">{t("showTable")}</summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-surface text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">{t("colDate")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("colPrice")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {[...sales].reverse().map((s, i) => (
                <tr key={`${s.date}-${i}`}>
                  <td className="px-3 py-1.5">{s.date}</td>
                  <td className="px-3 py-1.5 text-right text-ink">{fmt(s.priceUsdt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
