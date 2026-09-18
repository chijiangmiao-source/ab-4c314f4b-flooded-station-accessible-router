import { describe, expect, it } from 'vitest';
import { solve } from '../../src/core/solver';
import {
  Cell,
  HEADING_DELTA,
  Heading,
  Pos,
  Scenario,
} from '../../src/core/types';

// 暴力枚举：在小网格上枚举所有“状态简单路径”（正费用下最优必为状态简单），
// 与 Dijkstra 结果按 (秒, 转弯, 坐标序列) 比较。

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function brute(sc: Scenario): { seconds: number; turns: number; path: Pos[] } | null {
  const groups = new Map<number, Pos[]>();
  for (let r = 0; r < sc.rows; r++)
    for (let c = 0; c < sc.cols; c++) {
      const cell = sc.cells[r * sc.cols + c];
      if (cell.kind === 'elevator') {
        const l = groups.get(cell.group);
        if (l) l.push({ r, c });
        else groups.set(cell.group, [{ r, c }]);
      }
    }

  let best: { seconds: number; turns: number; path: Pos[] } | null = null;
  const cmp = (sec: number, turns: number, path: Pos[]): number => {
    if (!best) return -1;
    if (sec !== best.seconds) return sec < best.seconds ? -1 : 1;
    if (turns !== best.turns) return turns < best.turns ? -1 : 1;
    const n = Math.min(path.length, best.path.length);
    for (let i = 0; i < n; i++) {
      if (path[i].r !== best.path[i].r) return path[i].r < best.path[i].r ? -1 : 1;
      if (path[i].c !== best.path[i].c) return path[i].c < best.path[i].c ? -1 : 1;
    }
    return path.length - best.path.length;
  };

  const dfs = (
    pos: Pos,
    heading: Heading,
    paid: number,
    sec: number,
    turns: number,
    path: Pos[],
    visited: Set<string>,
  ): void => {
    if (best && sec > best.seconds) return;
    if (pos.r === sc.end.r && pos.c === sc.end.c) {
      if (cmp(sec, turns, path) < 0) best = { seconds: sec, turns, path: path.slice() };
      return;
    }
    for (let d = 0 as Heading; d < 4; d = (d + 1) as Heading) {
      const [dr, dc] = HEADING_DELTA[d];
      const np = { r: pos.r + dr, c: pos.c + dc };
      if (np.r < 0 || np.r >= sc.rows || np.c < 0 || np.c >= sc.cols) continue;
      const cell = sc.cells[np.r * sc.cols + np.c];
      if (cell.kind === 'blocked') continue;
      const base = cell.kind === 'passage' ? cell.cost : 0;
      const tf = d === heading ? 0 : 5;
      const key = `${np.r},${np.c}|${d}|${paid}`;
      if (visited.has(key)) continue;
      visited.add(key);
      path.push(np);
      dfs(np, d, paid, sec + base + tf, turns + (tf ? 1 : 0), path, visited);
      path.pop();
      visited.delete(key);
    }
    const here = sc.cells[pos.r * sc.cols + pos.c];
    if (here.kind === 'elevator') {
      const bit = 1 << (here.group - 1);
      const first = (paid & bit) === 0;
      const wait = first ? here.wait : 0;
      for (const mate of groups.get(here.group)!) {
        if (mate.r === pos.r && mate.c === pos.c) continue;
        const np = mate;
        const key = `${np.r},${np.c}|${heading}|${paid | bit}`;
        if (visited.has(key)) continue;
        visited.add(key);
        path.push(np);
        dfs(np, heading, paid | bit, sec + 8 + wait, turns, path, visited);
        path.pop();
        visited.delete(key);
      }
    }
  };

  dfs(sc.start, sc.heading, 0, 0, 0, [], new Set([`${sc.start.r},${sc.start.c}|${sc.heading}|0`]));
  return best;
}

describe('求解器随机暴力对照', () => {
  it('100 个随机小网格：秒数/转弯/坐标序列与暴力枚举一致', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rand = rng(seed);
      const rows = 2 + Math.floor(rand() * 2); // 2..3
      const cols = 2 + Math.floor(rand() * 2);
      const cells: Cell[] = [];
      for (let i = 0; i < rows * cols; i++) {
        const x = rand();
        if (x < 0.2) cells.push({ kind: 'blocked' });
        else if (x < 0.4)
          cells.push({
            kind: 'elevator',
            group: 1 + Math.floor(rand() * 2),
            wait: Math.floor(rand() * 7),
          });
        else cells.push({ kind: 'passage', cost: 1 + Math.floor(rand() * 6) });
      }
      const heading = Math.floor(rand() * 4) as Heading;
      const si = Math.floor(rand() * rows * cols);
      let ei = Math.floor(rand() * rows * cols);
      if (ei === si) ei = (ei + 1) % (rows * cols);
      const sp = { r: Math.floor(si / cols), c: si % cols };
      const ep = { r: Math.floor(ei / cols), c: ei % cols };
      if (cells[si].kind === 'blocked') cells[si] = { kind: 'passage', cost: 1 };
      if (cells[ei].kind === 'blocked') cells[ei] = { kind: 'passage', cost: 1 };
      const sc: Scenario = { rows, cols, cells, start: sp, end: ep, heading };

      const got = solve(sc);
      const want = brute(sc);
      if (want === null) {
        expect(got.reachable, `seed ${seed} 应为不可达`).toBe(false);
      } else {
        expect(got.reachable, `seed ${seed} 应可达`).toBe(true);
        if (!got.reachable) continue;
        expect(got.totalSeconds, `seed ${seed} 秒数`).toBe(want.seconds);
        expect(got.totalTurns, `seed ${seed} 转弯`).toBe(want.turns);
        expect(got.positions, `seed ${seed} 路径`).toEqual(want.path);
      }
    }
  });
});
