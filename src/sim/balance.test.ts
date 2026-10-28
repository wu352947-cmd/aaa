import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GME } from '../scenarios/gme';
import { S327 } from '../scenarios/s327';
import { POLICIES, runGame, runTulip, TULIP_POLICIES, type Run, type TulipRun } from './balance';

/**
 * 平时只跑冒烟（每个座位一局）；BALANCE=种子数 时跑完整统计，并写出 docs/balance.md。
 *   BALANCE=20 npx vitest run src/sim
 */
const N = Number(process.env.BALANCE ?? 0);
const SEEDS = Array.from({ length: Math.max(1, N) }, (_, i) => String(i + 1));

const SEATS: { scenario: typeof S327; seats: string[] }[] = [
  { scenario: S327, seats: ['official', 'short', 'long', 'ally', 'retail'] },
  { scenario: GME, seats: ['broker', 'short', 'retail', 'mm'] },
];

const pct = (n: number, of: number) => `${Math.round((100 * n) / of)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const dist = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, xs.length)}`).join('，');
};
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');

function gameTable(runs: Run[]): string[] {
  const out: string[] = [];
  const keys = [...new Set(runs.map((r) => `${r.scenario}|${r.seat}`))];
  for (const k of keys) {
    const rs = runs.filter((r) => `${r.scenario}|${r.seat}` === k);
    const extra = [...new Set(rs.flatMap((r) => Object.keys(r.num)))];
    out.push(`### ${k.replace('|', ' · ')}`, '');
    out.push(`| 打法 | 结局 | 人物类型 | 平均收益 | ${extra.join(' | ')} | 打出 / 换算 |`);
    out.push(`| --- | --- | --- | --- | ${extra.map(() => '---').join(' | ')} | --- |`);
    for (const p of [...new Set(rs.map((r) => r.policy))]) {
      const ps = rs.filter((r) => r.policy === p);
      const ret = ps.map((r) => r.ret).filter((x): x is number => x != null);
      out.push(
        `| ${p} | ${dist(ps.map((r) => r.ending))} | ${dist(ps.map((r) => r.archetype))} | ${ret.length ? `${(mean(ret) * 100).toFixed(0)}%` : '—'} | ${extra.map((e) => f2(mean(ps.map((r) => r.num[e] ?? NaN)))).join(' | ')} | ${f2(mean(ps.map((r) => r.played)))} / ${f2(mean(ps.map((r) => r.converted)))} |`,
      );
    }
    out.push('');
  }
  return out;
}

function tulipTable(runs: TulipRun[]): string[] {
  const out: string[] = [];
  for (const seat of [...new Set(runs.map((r) => r.seat))]) {
    const rs = runs.filter((r) => r.seat === seat);
    out.push(`### tulip · ${seat}`, '');
    if (seat === 'council') {
      out.push('| 打法 | 平均威望 | 威望 ≥ 50 | 通过的规则 | 倾家荡产（人） | 办到的交代 |', '| --- | --- | --- | --- | --- | --- |');
      for (const p of [...new Set(rs.map((r) => r.policy))]) {
        const ps = rs.filter((r) => r.policy === p);
        out.push(`| ${p} | ${f2(mean(ps.map((r) => r.score)))} | ${pct(ps.filter((r) => r.score >= 50).length, ps.length)} | ${dist(ps.map((r) => r.rule!))} | ${f2(mean(ps.map((r) => r.ruined!)))} | ${f2(mean(ps.map((r) => r.dirsMet!)))} |`);
      }
    } else {
      out.push('| 打法 | 收益（期权，历史） | 收益（照约） | 赚钱的局 | 落空的钱（盾） |', '| --- | --- | --- | --- | --- |');
      for (const p of [...new Set(rs.map((r) => r.policy))]) {
        const ps = rs.filter((r) => r.policy === p);
        out.push(`| ${p} | ${(mean(ps.map((r) => r.score)) * 100).toFixed(0)}% | ${(mean(ps.map((r) => r.fwd!)) * 100).toFixed(0)}% | ${pct(ps.filter((r) => r.score > 0).length, ps.length)} | ${f2(mean(ps.map((r) => r.unpaid!)))} |`);
      }
    }
    out.push('');
  }
  return out;
}

describe('平衡性模拟', { timeout: 3_600_000 }, () => {
  it('每个座位、每种打法都跑得完', () => {
    const runs: Run[] = [];
    for (const { scenario, seats } of SEATS)
      for (const seat of seats.filter((x) => !process.env.BALANCE_ONLY || process.env.BALANCE_ONLY.split(',').includes(`${scenario.id}:${x}`)))
        // 平时只跑“照章办事”一局，保证模拟脚本本身没坏
        for (const p of N ? POLICIES : POLICIES.filter((x) => x.name === '照章办事'))
          for (const s of N ? SEEDS : ['smoke']) {
            const r = runGame(scenario, seat, p, s);
            expect(r.ending).not.toBe('(未结束)');
            runs.push(r);
          }
    const truns: TulipRun[] = [];
    for (const p of process.env.BALANCE_ONLY && !process.env.BALANCE_ONLY.split(',').includes('tulip') ? [] : TULIP_POLICIES)
      for (const seat of p.seats)
        for (const s of N ? SEEDS : ['smoke']) {
          const r = runTulip(seat, p, s);
          expect(Number.isFinite(r.score)).toBe(true);
          truns.push(r);
        }
    if (N) {
      const md = [`# 平衡性报告`, '', `每个座位 × 每种打法 × ${N} 个种子。由 \`BALANCE=${N} npx vitest run src/sim\` 生成。`, '', ...gameTable(runs), ...tulipTable(truns)];
      writeFileSync(process.env.BALANCE_OUT ?? 'docs/balance.md', md.join('\n'));
      writeFileSync((process.env.BALANCE_OUT ?? 'docs/balance.md').replace(/\.md$/, '.json'), JSON.stringify({ runs, truns }));
    }
  });
});
