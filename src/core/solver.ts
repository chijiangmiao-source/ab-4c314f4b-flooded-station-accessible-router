// 最短路径求解（状态扩展 Dijkstra）
//
// 状态 = (位置, 朝向, 已付费电梯组集合)：
//   - 相邻正交移动：进入非阻断的相邻格，基础耗时取目标格耗时（通行格 1..99，
//     电梯格为步入厅门，基础耗时 0）；若移动方向与当前朝向不同，加收转弯费 5，
//     朝向更新为移动方向。
//   - 电梯乘用：从当前电梯格可直达同组任意另一部电梯，固定 8 秒，朝向不变；
//     该组第一次乘用时加收该组的等待秒数（同组等待在校验阶段已保证一致），
//     并把组号记入“已付费集合”，同组再次乘用不再收取等待。
//
// 优化目标按字典序：
//   1. 总秒数最少
//   2. 转弯次数最少
//   3. 从起点起的坐标序列逐项比较（行号、列号）字典序最小
//
// 不可达时同时做一次从起点出发的可达性泛洪（不计成本，只看能否通行），
// 返回可达格数量作为可复核的失败证据。

import {
  Cell,
  HEADING_DELTA,
  Heading,
  Pos,
  Scenario,
  posKey,
  samePos,
} from './types';

export const TURN_FEE = 5;
export const ELEVATOR_RIDE_FEE = 8;

export type MoveKind = 'walk' | 'elevator';

export interface PathStep {
  kind: MoveKind;
  /** 本步之后所在的格 */
  to: Pos;
  /** 本步采用的朝向（步行=移动方向，电梯=乘用前朝向，保持不变） */
  headingAfter: Heading;
  baseCost: number; // 基础耗时（目标格耗时；电梯乘用为 0）
  turnFee: number; // 转弯费（0 或 5）
  elevatorFee: number; // 电梯费（乘用 8，可能另含首次等待）
  waitFee: number; // 其中的首次等待部分（计入 elevatorFee 之外单列，便于界面展示）
  /** 电梯乘用时的组号，否则为 null */
  group: number | null;
  totalAfter: number; // 走完该步后的累计总秒数
  turnsAfter: number; // 走完该步后的累计转弯数
}

export interface SolveSuccess {
  reachable: true;
  steps: PathStep[];
  totalSeconds: number;
  totalTurns: number;
  /** 不含起点的路径坐标序列 */
  positions: Pos[];
  /** 从起点不计成本可达的格数（含起点），成功时同样给出，便于交叉核对 */
  reachableCount: number;
}

export interface SolveFailure {
  reachable: false;
  /** 从起点不计成本可达的格数（含起点），作为封闭后不可达的复核证据 */
  reachableCount: number;
  reachableCells: Pos[];
}

export type SolveResult = SolveSuccess | SolveFailure;

// 状态键：`行,列|朝向|已付费组掩码`
type StateKey = string;

// 已付费组用 32 位掩码表示：组号 1..99 -> bit (g-1)。
// 步数有限（状态内组数量受网格上的电梯格数限制），用数字安全。
type PaidMask = number;

interface State {
  pos: Pos;
  heading: Heading;
  paid: PaidMask;
}

interface Label {
  seconds: number;
  turns: number;
  path: Pos[]; // 不含起点
  parent: StateKey | null; // 父状态键，起点为 null
  stepFromParent: PathStep | null;
}

const keyOf = (s: State): StateKey =>
  `${s.pos.r},${s.pos.c}|${s.heading}|${s.paid}` as StateKey;

function cellAt(sc: Scenario, p: Pos): Cell {
  return sc.cells[p.r * sc.cols + p.c];
}

/** 目标格的步行基础耗时：通行格取其耗时，电梯厅门为 0；阻断格返回 null */
function walkBaseCost(sc: Scenario, p: Pos): number | null {
  const cell = cellAt(sc, p);
  if (cell.kind === 'blocked') return null;
  if (cell.kind === 'passage') return cell.cost;
  return 0;
}

/** 字典序比较坐标序列：a < b 返回 -1 */
function comparePaths(a: Pos[], b: Pos[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i].r !== b[i].r) return a[i].r < b[i].r ? -1 : 1;
    if (a[i].c !== b[i].c) return a[i].c < b[i].c ? -1 : 1;
  }
  return a.length - b.length;
}

/** 候选标签是否严格优于（用于松弛） */
function better(candSec: number, candTurn: number, candPath: Pos[], cur: Label): boolean {
  if (candSec !== cur.seconds) return candSec < cur.seconds;
  if (candTurn !== cur.turns) return candTurn < cur.turns;
  return comparePaths(candPath, cur.path) < 0;
}

export function solve(sc: Scenario): SolveResult {
  const reachableCells = floodReachable(sc);
  const reachableCount = reachableCells.length;

  const startState: State = { pos: sc.start, heading: sc.heading, paid: 0 };
  const startKey = keyOf(startState);

  const labels = new Map<StateKey, Label>();
  labels.set(startKey, {
    seconds: 0,
    turns: 0,
    path: [],
    parent: null,
    stepFromParent: null,
  });

  // 简易二叉堆；元素为 StateKey
  const heap: StateKey[] = [];
  const heapIndex = new Map<StateKey, number>();

  const prioOf = (k: StateKey): [number, number, Pos[]] => {
    const l = labels.get(k)!;
    return [l.seconds, l.turns, l.path];
  };
  const prioLess = (a: StateKey, b: StateKey): boolean => {
    const [as_, at, ap] = prioOf(a);
    const [bs, bt, bp] = prioOf(b);
    if (as_ !== bs) return as_ < bs;
    if (at !== bt) return at < bt;
    return comparePaths(ap, bp) < 0;
  };
  const siftUp = (i: number): void => {
    const k = heap[i];
    let idx = i;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (!prioLess(k, heap[parent])) break;
      heap[idx] = heap[parent];
      heapIndex.set(heap[idx], idx);
      idx = parent;
    }
    heap[idx] = k;
    heapIndex.set(k, idx);
  };
  const siftDown = (i: number): void => {
    const k = heap[i];
    let idx = i;
    const n = heap.length;
    while (true) {
      const l = idx * 2 + 1;
      const r = l + 1;
      let smallest = idx;
      if (l < n && prioLess(heap[l], k)) smallest = l;
      if (r < n && prioLess(heap[r], smallest === idx ? k : heap[smallest])) smallest = r;
      if (smallest === idx) break;
      heap[idx] = heap[smallest];
      heapIndex.set(heap[idx], idx);
      idx = smallest;
    }
    heap[idx] = k;
    heapIndex.set(k, idx);
  };
  const push = (k: StateKey): void => {
    heapIndex.set(k, heap.length);
    heap.push(k);
    siftUp(heap.length - 1);
  };
  const pop = (): StateKey => {
    const top = heap[0];
    const last = heap.pop()!;
    heapIndex.delete(top);
    if (heap.length > 0) {
      heap[0] = last;
      heapIndex.set(last, 0);
      siftDown(0);
    }
    return top;
  };
  const decreaseOrPush = (k: StateKey): void => {
    const idx = heapIndex.get(k);
    if (idx === undefined) push(k);
    else siftUp(idx);
  };

  push(startKey);

  // 终点上的最佳标签
  let bestEnd: { key: StateKey; label: Label } | null = null;
  // 已最终化的状态：在字典序 (秒, 转弯, 路径) 的 Dijkstra 下，弹出即最优，
  // 之后既不从它重复扩展，也不允许再改写它的标签。
  const finalized = new Set<StateKey>();

  const relax = (fromKey: StateKey, fromLabel: Label, next: State, step: PathStep): void => {
    const k = keyOf(next);
    if (finalized.has(k)) return;
    const candSec = fromLabel.seconds + step.baseCost + step.turnFee + step.elevatorFee;
    const candTurn = fromLabel.turns + (step.turnFee > 0 ? 1 : 0);
    const candPath = [...fromLabel.path, step.to];
    const cur = labels.get(k);
    if (cur === undefined || better(candSec, candTurn, candPath, cur)) {
      labels.set(k, {
        seconds: candSec,
        turns: candTurn,
        path: candPath,
        parent: fromKey,
        stepFromParent: step,
      });
      decreaseOrPush(k);
    }
  };

  // 预计算同组电梯：group -> 电梯格位置列表
  const groups = new Map<number, Pos[]>();
  for (let r = 0; r < sc.rows; r++) {
    for (let c = 0; c < sc.cols; c++) {
      const cell = sc.cells[r * sc.cols + c];
      if (cell.kind === 'elevator') {
        const list = groups.get(cell.group);
        if (list) list.push({ r, c });
        else groups.set(cell.group, [{ r, c }]);
      }
    }
  }

  while (heap.length > 0) {
    const k = pop();
    if (finalized.has(k)) continue;
    finalized.add(k);
    const label = labels.get(k)!;
    const [r, c] = k.split('|')[0].split(',').map(Number);
    const pos: Pos = { r, c };
    const heading = Number(k.split('|')[1]) as Heading;
    const paid = Number(k.split('|')[2]) as PaidMask;

    // 堆按完整字典序弹出：第一个落在终点的状态即全局最优，可直接结束。
    if (samePos(pos, sc.end)) {
      bestEnd = { key: k, label };
      break;
    }

    // —— 正交步行 ——
    for (let d = 0 as Heading; d < 4; d = (d + 1) as Heading) {
      const [dr, dc] = HEADING_DELTA[d];
      const np: Pos = { r: pos.r + dr, c: pos.c + dc };
      if (np.r < 0 || np.r >= sc.rows || np.c < 0 || np.c >= sc.cols) continue;
      const base = walkBaseCost(sc, np);
      if (base === null) continue;
      const turnFee = d === heading ? 0 : TURN_FEE;
      const step: PathStep = {
        kind: 'walk',
        to: np,
        headingAfter: d,
        baseCost: base,
        turnFee,
        elevatorFee: 0,
        waitFee: 0,
        group: null,
        totalAfter: 0,
        turnsAfter: 0,
      };
      step.totalAfter = label.seconds + base + turnFee;
      step.turnsAfter = label.turns + (turnFee > 0 ? 1 : 0);
      relax(k, label, { pos: np, heading: d, paid }, step);
    }

    // —— 电梯乘用 ——
    const here = cellAt(sc, pos);
    if (here.kind === 'elevator') {
      const bit = 1 << (here.group - 1);
      const firstRide = (paid & bit) === 0;
      const wait = firstRide ? here.wait : 0;
      const mates = groups.get(here.group) ?? [];
      for (const mate of mates) {
        if (samePos(mate, pos)) continue;
        const fee = ELEVATOR_RIDE_FEE + wait;
        const step: PathStep = {
          kind: 'elevator',
          to: mate,
          headingAfter: heading, // 乘用不改变朝向
          baseCost: 0,
          turnFee: 0,
          elevatorFee: fee,
          waitFee: wait,
          group: here.group,
          totalAfter: label.seconds + fee,
          turnsAfter: label.turns,
        };
        relax(
          k,
          label,
          { pos: mate, heading, paid: paid | bit },
          step,
        );
      }
    }
  }

  if (bestEnd === null) {
    return { reachable: false, reachableCount, reachableCells };
  }

  const steps: PathStep[] = [];
  // 沿父链回溯
  let curKey: StateKey | null = bestEnd.key;
  for (;;) {
    if (curKey === null) break;
    const l = labels.get(curKey);
    if (!l || l.stepFromParent === null) break;
    steps.push(l.stepFromParent);
    curKey = l.parent;
  }
  steps.reverse();

  return {
    reachable: true,
    steps,
    totalSeconds: bestEnd.label.seconds,
    totalTurns: bestEnd.label.turns,
    positions: bestEnd.label.path,
    reachableCount,
  };
}

/**
 * 不计成本的可达性泛洪：步行可进入任意非阻断格，电梯可在同组间乘用。
 * 用于不可达时给出可复核证据（从起点实际能到达多少格）。
 */
export function floodReachable(sc: Scenario): Pos[] {
  const seen = new Set<string>();
  const queue: Pos[] = [sc.start];
  seen.add(posKey(sc.start));

  const groupMap = new Map<number, Pos[]>();
  const addGroup = (g: number, p: Pos): void => {
    const list = groupMap.get(g);
    if (list) list.push(p);
    else groupMap.set(g, [p]);
  };
  for (let r = 0; r < sc.rows; r++) {
    for (let c = 0; c < sc.cols; c++) {
      const cell = sc.cells[r * sc.cols + c];
      if (cell.kind === 'elevator') addGroup(cell.group, { r, c });
    }
  }

  while (queue.length > 0) {
    const p = queue.shift()!;
    for (const [dr, dc] of HEADING_DELTA) {
      const np = { r: p.r + dr, c: p.c + dc };
      if (np.r < 0 || np.r >= sc.rows || np.c < 0 || np.c >= sc.cols) continue;
      if (seen.has(posKey(np))) continue;
      if (sc.cells[np.r * sc.cols + np.c].kind === 'blocked') continue;
      seen.add(posKey(np));
      queue.push(np);
    }
    const cell = sc.cells[p.r * sc.cols + p.c];
    if (cell.kind === 'elevator') {
      for (const mate of groupMap.get(cell.group) ?? []) {
        if (!seen.has(posKey(mate))) {
          seen.add(posKey(mate));
          queue.push(mate);
        }
      }
    }
  }

  return [...seen].map((k) => {
    const [r, c] = k.split(',').map(Number);
    return { r, c };
  });
}
