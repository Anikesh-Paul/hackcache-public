// "Your books, live": the pay packets and the 13-week forecast. Today shows
// them, and so will the call screen; give either a new book (say, with an
// approved Plan) and it animates from the old figures to the new ones.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatInr, formatInrShort, nearestPaise, sumPaise } from "@tagada/money";
import { payPackets, type ForecastWeek, type SalaryDay } from "@tagada/domain";
import { useT, type Copy } from "./i18n/index.ts";

/** 8 artisans and 1 accountant. */
export const PAY_PACKETS = 9;
const FLIP_MS = 650;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Numbers that ease from their last values to new ones (650 ms, ease-out); at once with reduced motion. */
function useTween(target: readonly number[]): readonly number[] {
  const [shown, setShown] = useState(target);
  const last = useRef(target);
  const key = target.join(",");
  useEffect(() => {
    const from = last.current;
    if (from.length !== target.length || reducedMotion()) {
      last.current = target;
      setShown(target);
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / FLIP_MS);
      const eased = 1 - (1 - t) ** 4;
      const values = target.map((to, i) => (from[i] ?? to) + (to - (from[i] ?? to)) * eased);
      last.current = values;
      setShown(values);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // `key` stands for the target's values.
  }, [key]);
  return shown;
}

/** The salary-day figure, counting from the old Shortfall to the new one during a flip. */
export function SalaryFigure({ cashAfterPaise }: { cashAfterPaise: number }) {
  const [v = cashAfterPaise] = useTween([cashAfterPaise]);
  // Mid-flip frames show whole rupees; the last frame is the exact figure.
  const shown = v === cashAfterPaise ? cashAfterPaise : nearestPaise(Math.round(v), 100);
  const short = shown < 0;
  const t = useT();
  return (
    <>
      <span className={`figure dbl ${short ? "text-sindoor" : "text-bamboo-ink"}`}>
        {formatInr(short ? -shown : shown)}
      </span>
      <small className="mt-1 block text-[13px] text-ink-2">{short ? t.packets.figureShort : t.packets.figureSpare}</small>
    </>
  );
}

/** The salary as envelopes, filled with what salary day leaves in hand. */
export function PayPackets({ salary }: { salary: Pick<SalaryDay, "salaryPaise" | "cashAfterPaise"> }) {
  const packets = payPackets(salary, PAY_PACKETS);
  const covered = packets.full === packets.count;
  const partial = packets.fills.some((f) => f > 0 && f < 1);
  const t = useT();
  return (
    <div>
      <div className="packets" role="img" aria-label={t.packets.aria(packets.full, packets.count)}>
        {packets.fills.map((fill, i) => (
          <span key={i} className={`pk ${fill >= 1 ? "full" : fill <= 0 ? "empty" : ""}`}>
            <span className="fill" style={{ height: `${fill * 100}%`, transitionDelay: `${i * 70}ms` }} />
            <svg viewBox="0 0 46 32" preserveAspectRatio="none" aria-hidden>
              <polyline points="0,0 23,15 46,0" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </span>
        ))}
      </div>
      <p className="mt-2 text-sm">
        {covered ? (
          <>
            <b>{t.packets.allFull(packets.count)}</b>
            {salary.cashAfterPaise > 0 && t.packets.toSpare(formatInr(salary.cashAfterPaise))}.
          </>
        ) : (
          <>
            {t.packets.fills(formatInr(packets.fundedPaise))}{" "}
            <b>{t.packets.someFull(packets.full, packets.count)}</b>
            {partial && t.packets.partOf(packets.full + 1)}.
          </>
        )}{" "}
        <span className="text-ink-2">{t.packets.each(formatInr(packets.aboutEachPaise))}</span>
      </p>
    </div>
  );
}

function weekSays(t: Copy, week: ForecastWeek): string {
  const cash = week.closePaise < 0 ? t.forecast.shortAmount(formatInr(-week.closePaise)) : formatInr(week.closePaise);
  return t.forecast.weekSays(t.date(week.start, { weekday: false }), week.salary, cash);
}

/** Cash at the end of each week as ledger bars: short weeks hang below the ground line. */
export function ForecastChart({ weeks }: { weeks: readonly ForecastWeek[] }) {
  const box = useRef<HTMLDivElement>(null);
  const t = useT();
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // One axis that only ever grows, so later figures are drawn to the same scale;
  // it eases with the bars when a flip widens it.
  const axis = useRef({ lo: 0, hi: 0 });
  for (const w of weeks) {
    axis.current = { lo: Math.min(axis.current.lo, w.closePaise), hi: Math.max(axis.current.hi, w.closePaise) };
  }
  const shown = useTween([...weeks.map((w) => w.closePaise), axis.current.lo, axis.current.hi]);
  const closes = shown.slice(0, weeks.length);
  const lo = shown[weeks.length] ?? axis.current.lo;
  const hi = shown[weeks.length + 1] ?? axis.current.hi;

  const narrow = width < 520;
  const h = narrow ? 230 : 260;
  const top = 30;
  const bottom = 26;
  // Room under the lowest bar for its "short" label.
  const below = lo < 0 ? 20 : 0;
  const left = 4;
  const span = hi - lo || 1;
  const y = (v: number) => top + ((hi - v) / span) * (h - top - bottom - below);
  const slot = (width - left * 2) / weeks.length;
  const bw = Math.max(8, Math.min(26, slot * 0.55));
  // A date label needs about 46 px; on a phone, label every second or third week.
  const labelEvery = Math.max(1, Math.ceil(46 / slot));
  // Labels near either edge grow inwards, so none is cut off.
  const place = (cx: number, half: number) =>
    cx - half < 0
      ? { x: left, textAnchor: "start" as const }
      : cx + half > width
        ? { x: width - left, textAnchor: "end" as const }
        : { x: cx, textAnchor: "middle" as const };
  // Gap labels under short bars: salary weeks first, then any other short week
  // whose label fits without touching one already placed (about 7 px a character).
  const shortLabels = new Map<number, string>();
  const taken: { from: number; to: number; y: number }[] = [];
  const order = weeks.map((_, i) => i).sort((a, b) => Number(weeks[b]!.salary) - Number(weeks[a]!.salary));
  for (const i of order) {
    const v = closes[i] ?? 0;
    if (v >= 0) continue;
    const text = `${formatInrShort(-Math.round(v))}${weeks[i]!.salary ? t.forecast.shortMark : ""}`;
    const cx = left + slot * i + slot / 2;
    const half = (text.length * 7) / 2 + 3;
    const box = { from: Math.max(0, cx - half), to: Math.min(width, cx + half), y: y(v) };
    if (taken.some((t) => Math.abs(t.y - box.y) < 14 && t.from < box.to && box.from < t.to)) continue;
    taken.push(box);
    shortLabels.set(i, text);
  }
  const label = t.forecast.chartLabel(weeks.length, weeks.map((week) => weekSays(t, week)).join("; "));

  return (
    <div ref={box} className="chartwrap">
      <svg className="chart" width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={label}>
        {weeks.map((week, i) => {
          const cx = left + slot * i + slot / 2;
          const v = closes[i] ?? week.closePaise;
          const y0 = y(0);
          const yv = y(v);
          const short = v < 0;
          return (
            <g key={week.start}>
              {week.salary && (
                <>
                  <line x1={cx} x2={cx} y1={top - 8} y2={h - bottom} className="salary-mark" />
                  <text x={cx} y={top - 12} textAnchor="middle" className="chart-note">
                    {t.forecast.salaryMark}
                  </text>
                </>
              )}
              {short ? (
                <rect x={cx - bw / 2} y={y0 + 3} width={bw} height={Math.max(1, yv - y0 - 3)} rx={1.5} className="bar-short" />
              ) : (
                <rect
                  x={cx - bw / 2}
                  y={yv}
                  width={bw}
                  height={Math.max(1, y0 - yv)}
                  rx={1}
                  className={week.salary ? "bar-ok" : "bar-ok dim"}
                />
              )}
              {/* Labels follow the bar as it moves. */}
              {shortLabels.has(i) && (
                <text {...place(cx, ((shortLabels.get(i)?.length ?? 0) * 7) / 2)} y={yv + 15} className="chart-short">
                  {shortLabels.get(i)}
                </text>
              )}
              {!short && week.salary && (
                <text {...place(cx, 26)} y={Math.max(top + 10, yv - 7)} className="chart-ok">
                  ✓ {formatInrShort(Math.round(v))}
                </text>
              )}
              {i % labelEvery === 0 && (
                <text {...place(cx, 22)} y={h - 6} className="chart-axis">
                  {t.date(week.start, { weekday: false })}
                </text>
              )}
            </g>
          );
        })}
        {/* the ground is an accounting double rule */}
        <line x1={left} x2={width - left} y1={y(0)} y2={y(0)} className="ground" />
        <line x1={left} x2={width - left} y1={y(0) + 3} y2={y(0) + 3} className="ground" />
      </svg>
    </div>
  );
}

/** The same numbers as the chart, week by week: its readable alternative. */
export function ForecastTable({ weeks }: { weeks: readonly ForecastWeek[] }) {
  const t = useT();
  return (
    <table className="khata">
      <caption className="sr-only">{t.forecast.caption}</caption>
      <thead>
        <tr>
          <th scope="col">{t.forecast.weekOf}</th>
          <th scope="col">{t.forecast.comingIn}</th>
          <th scope="col">{t.forecast.goingOut}</th>
          <th scope="col">{t.forecast.cashAtWeekEnd}</th>
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => {
          const inPaise = sumPaise([week.inPaise, week.newSalesPaise]);
          return (
            <tr key={week.start} className={week.closePaise < 0 ? "neg" : ""}>
              <th scope="row">
                {t.date(week.start, { weekday: false })}
                {week.salary && <small>{t.forecast.salaries}</small>}
              </th>
              <td data-label={t.forecast.comingIn}>
                {inPaise ? formatInr(inPaise) : "—"}
                {week.newSalesPaise > 0 && <small>{t.forecast.newSales(formatInr(week.newSalesPaise))}</small>}
              </td>
              <td data-label={t.forecast.goingOut}>{week.outPaise ? `−${formatInr(week.outPaise)}` : "—"}</td>
              <td data-label={t.forecast.cashAtWeekEnd} className="close">
                {week.closePaise < 0 ? t.forecast.shortAmount(formatInr(-week.closePaise)) : formatInr(week.closePaise)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
