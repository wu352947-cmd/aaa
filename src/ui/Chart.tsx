import { useEffect, useRef, useState } from 'react';
import type { Game } from '../engine/game';
import type { Bar } from '../engine/types';
import { price, qty } from './format';

interface Props {
  game: Game;
  rev: number;
  mode: 'intraday' | 'daily';
  onPickPrice?: (fen: number) => void;
  /** 结局页：从这一分钟起的成交已被宣布无效 */
  voidFrom?: number | null;
  showPosition?: boolean;
}

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

const AXIS_R = 64;
const PAD_T = 14;
const PAD_B = 22;
const PAD_L = 10;

export function Chart({ game, rev, mode, onPickPrice, voidFrom, showPosition = true }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 300 });
  const [hover, setHover] = useState<number | null>(null);
  const geo = useRef<{ yToPrice: (y: number) => number; xToIndex: (x: number) => number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, size.w * dpr);
    c.height = Math.max(1, size.h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mode === 'intraday') geo.current = drawIntraday(ctx, size.w, size.h, game, hover, voidFrom ?? null, showPosition);
    else geo.current = drawDaily(ctx, size.w, size.h, game, hover);
  }, [game, rev, mode, size, hover, voidFrom, showPosition]);

  const pos = (e: React.MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="chart" ref={wrap}>
      <canvas
        ref={canvas}
        onMouseMove={(e) => geo.current && setHover(geo.current.xToIndex(pos(e).x))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          if (!onPickPrice || !geo.current) return;
          onPickPrice(Math.round(geo.current.yToPrice(pos(e).y)));
        }}
      />
      {onPickPrice && mode === 'intraday' && <div className="chart-hint">点击图表任意高度，可把该价格设为限价</div>}
    </div>
  );
}

function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}

function drawIntraday(ctx: CanvasRenderingContext2D, w: number, h: number, g: Game, hover: number | null, voidFrom: number | null, showPos: boolean) {
  const bars: Bar[] = g.market.bars;
  const up = css('--up');
  const down = css('--down');
  const gold = css('--gold');
  const line = css('--line');
  const muted = css('--muted');
  const text = css('--text');
  ctx.clearRect(0, 0, w, h);

  const closes = g.market.closePrices;
  const prev = (g.phase === 'trading' ? closes[closes.length - 1] : closes[closes.length - 2]) ?? bars[0]?.o ?? g.market.last;
  const vals = [...bars.flatMap((b) => [b.h, b.l, b.hist]), prev];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const p = g.player;
  const ex = g.market.ex;
  // 穿仓线：权益 = 现金 + (价格 − 均价) × 乘数 × 持仓 = 0 时的价格
  const liq = showPos && p.pos !== 0 ? Math.round(p.avg - p.cash / ((ex.deck.multiplier / 100) * p.pos)) : null;
  const span0 = Math.max(hi - lo, 40);
  if (liq != null && Math.abs(liq - (hi + lo) / 2) < span0 * 1.2) {
    lo = Math.min(lo, liq);
    hi = Math.max(hi, liq);
  }
  if (showPos && p.pos !== 0 && p.avg > lo - span0 * 0.3 && p.avg < hi + span0 * 0.3) {
    lo = Math.min(lo, p.avg);
    hi = Math.max(hi, p.avg);
  }
  const padV = Math.max((hi - lo) * 0.08, 8);
  lo -= padV;
  hi += padV;

  const S = g.market.session;
  const N = S.minutes;
  const plotW = w - PAD_L - AXIS_R;
  const volH = Math.max(36, (h - PAD_T - PAD_B) * 0.16);
  const plotH = h - PAD_T - PAD_B - volH - 6;
  const X = (i: number) => PAD_L + (i / (N - 1)) * plotW;
  const Y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * plotH;

  // 网格与价格轴
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  for (const v of niceTicks(lo, hi, 5)) {
    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(PAD_L, Y(v));
    ctx.lineTo(PAD_L + plotW, Y(v));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = muted;
    ctx.fillText(price(v), PAD_L + plotW + 8, Y(v));
  }
  // 时间轴
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  for (const [i, lab] of S.marks) {
    ctx.fillStyle = muted;
    ctx.fillText(lab, Math.min(Math.max(X(i), 20), PAD_L + plotW - 20), h - PAD_B + 6);
  }
  ctx.textAlign = 'left';
  // 午休分隔
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = line;
  for (const b of S.breaks) {
    ctx.beginPath();
    ctx.moveTo(X(b - 0.5), PAD_T);
    ctx.lineTo(X(b - 0.5), PAD_T + plotH + volH + 6);
    ctx.stroke();
  }

  // 作废区间
  if (voidFrom != null) {
    const x0 = X(voidFrom - 0.5);
    ctx.save();
    ctx.fillStyle = 'rgba(163, 39, 31, 0.12)';
    ctx.fillRect(x0, PAD_T, PAD_L + plotW - x0, plotH);
    ctx.strokeStyle = 'rgba(229, 72, 77, 0.35)';
    ctx.setLineDash([]);
    for (let x = x0; x < PAD_L + plotW; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, PAD_T + plotH);
      ctx.lineTo(x + 10, PAD_T);
      ctx.stroke();
    }
    ctx.fillStyle = up;
    ctx.font = '12px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('交易无效 →', x0 - 4, PAD_T + plotH - 18);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // 前收盘
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = muted;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(PAD_L, Y(prev));
  ctx.lineTo(PAD_L + plotW, Y(prev));
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 持仓成本与穿仓线
  const hline = (v: number, color: string, label: string, dash: number[]) => {
    if (v < lo || v > hi) return;
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(PAD_L, Y(v));
    ctx.lineTo(PAD_L + plotW, Y(v));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = '11px "Noto Sans SC", sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${label} ${price(v)}`, PAD_L + 4, Y(v) - 2);
    ctx.textBaseline = 'middle';
  };
  if (showPos && p.pos !== 0) {
    hline(p.avg, gold, '持仓成本', [1, 3]);
    if (liq != null) hline(liq, up, '穿仓线', [8, 4]);
  }

  // 真实历史（只画到当前分钟，不剧透）
  if (bars.length) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    bars.forEach((b, i) => (i ? ctx.lineTo(X(i), Y(b.hist)) : ctx.moveTo(X(i), Y(b.hist))));
    ctx.stroke();
    ctx.setLineDash([]);

    // 价格线 + 面积
    const last = bars[bars.length - 1].c;
    const col = last >= prev ? up : down;
    const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + plotH);
    grad.addColorStop(0, col + '33');
    grad.addColorStop(1, col + '00');
    ctx.beginPath();
    bars.forEach((b, i) => (i ? ctx.lineTo(X(i), Y(b.c)) : ctx.moveTo(X(i), Y(b.c))));
    ctx.lineTo(X(bars.length - 1), PAD_T + plotH);
    ctx.lineTo(X(0), PAD_T + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    bars.forEach((b, i) => (i ? ctx.lineTo(X(i), Y(b.c)) : ctx.moveTo(X(i), Y(b.c))));
    ctx.strokeStyle = text;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.lineWidth = 1;

    // 成交量
    const vMax = Math.max(...bars.map((b) => b.v), 1);
    const vTop = PAD_T + plotH + 6;
    const bw = Math.max(1, plotW / N - 0.5);
    bars.forEach((b, i) => {
      const vh = (b.v / vMax) * volH;
      ctx.fillStyle = (b.c >= b.o ? up : down) + 'aa';
      ctx.fillRect(X(i) - bw / 2, vTop + volH - vh, bw, vh);
    });

    // 最新价标签
    const ly = Y(last);
    ctx.fillStyle = col;
    ctx.fillRect(PAD_L + plotW + 2, ly - 9, AXIS_R - 4, 18);
    ctx.fillStyle = '#fff';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(price(last), PAD_L + plotW + 7, ly);
  }

  // 悬停
  if (hover != null && hover >= 0 && hover < bars.length) {
    const b = bars[hover];
    const x = X(hover);
    ctx.strokeStyle = muted;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x, PAD_T);
    ctx.lineTo(x, PAD_T + plotH + volH + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    const lines = [S.label(hover), `成交 ${price(b.c)}`, `历史 ${price(b.hist)}`, `偏离 ${b.c - b.hist >= 0 ? '+' : ''}${((b.c - b.hist) / 100).toFixed(2)}`, `量 ${qty(b.v)}`];
    tooltip(ctx, x, PAD_T + 6, lines, w);
  }

  return {
    yToPrice: (y: number) => lo + (1 - (y - PAD_T) / plotH) * (hi - lo),
    xToIndex: (x: number) => Math.round(((x - PAD_L) / plotW) * (N - 1)),
  };
}

function drawDaily(ctx: CanvasRenderingContext2D, w: number, h: number, g: Game, hover: number | null) {
  const up = css('--up');
  const down = css('--down');
  const gold = css('--gold');
  const line = css('--line');
  const muted = css('--muted');
  ctx.clearRect(0, 0, w, h);
  const days = g.scenario.days;
  const bars: (Bar | null)[] = days.map((_, i) => g.market.dailyBars[i] ?? null);
  if (g.phase === 'trading' && g.market.bars.length) {
    const b = g.market.bars;
    bars[g.dayIndex] = { tick: g.dayIndex, o: b[0].o, h: Math.max(...b.map((x) => x.h)), l: Math.min(...b.map((x) => x.l)), c: b[b.length - 1].c, v: b.reduce((a, x) => a + x.v, 0), hist: b[b.length - 1].hist };
  }
  const shown = bars.filter(Boolean) as Bar[];
  const vals = shown.flatMap((b) => [b.h, b.l, b.hist]);
  if (!vals.length) vals.push(g.market.last);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.1, 10);
  lo -= pad;
  hi += pad;
  const plotW = w - PAD_L - AXIS_R;
  const plotH = h - PAD_T - PAD_B;
  const slot = plotW / days.length;
  const X = (i: number) => PAD_L + slot * (i + 0.5);
  const Y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * plotH;
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  for (const v of niceTicks(lo, hi, 5)) {
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(PAD_L, Y(v));
    ctx.lineTo(PAD_L + plotW, Y(v));
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillText(price(v), PAD_L + plotW + 8, Y(v));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  days.forEach((d, i) => {
    ctx.fillStyle = muted;
    ctx.fillText(d.date.slice(5), X(i), h - PAD_B + 6);
  });
  ctx.textAlign = 'left';
  bars.forEach((b, i) => {
    if (!b) return;
    const col = b.c >= b.o ? up : down;
    const bw = Math.min(28, slot * 0.5);
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(X(i), Y(b.h));
    ctx.lineTo(X(i), Y(b.l));
    ctx.stroke();
    ctx.fillStyle = col;
    const y0 = Y(Math.max(b.o, b.c));
    ctx.fillRect(X(i) - bw / 2, y0, bw, Math.max(1, Math.abs(Y(b.o) - Y(b.c))));
    if (g.market.dailyBars[i]) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = gold;
      ctx.beginPath();
      ctx.moveTo(X(i) - bw, Y(b.hist));
      ctx.lineTo(X(i) + bw, Y(b.hist));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
  if (hover != null && bars[hover]) {
    const b = bars[hover]!;
    tooltip(ctx, X(hover), PAD_T + 6, [days[hover].date, `开 ${price(b.o)}  收 ${price(b.c)}`, `高 ${price(b.h)}  低 ${price(b.l)}`, `历史收盘 ${price(b.hist)}`], w);
  }
  return {
    yToPrice: (y: number) => lo + (1 - (y - PAD_T) / plotH) * (hi - lo),
    xToIndex: (x: number) => Math.floor((x - PAD_L) / slot),
  };
}

function tooltip(ctx: CanvasRenderingContext2D, x: number, y: number, lines: string[], w: number) {
  ctx.font = '12px "JetBrains Mono", "Noto Sans SC", monospace';
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
  const th = lines.length * 17 + 8;
  const bx = x + 12 + tw > w - AXIS_R ? x - 12 - tw : x + 12;
  ctx.fillStyle = 'rgba(14,16,20,0.92)';
  ctx.strokeStyle = css('--line');
  ctx.fillRect(bx, y, tw, th);
  ctx.strokeRect(bx, y, tw, th);
  ctx.fillStyle = css('--text');
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, bx + 8, y + 6 + i * 17));
}
