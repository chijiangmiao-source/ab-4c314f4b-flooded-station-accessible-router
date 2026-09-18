import { describe, expect, it } from 'vitest';
import { solve, floodReachable, TURN_FEE, ELEVATOR_RIDE_FEE } from '../../src/core/solver';
import {
  Cell,
  ElevatorCell,
  Heading,
  PassageCell,
  Pos,
  Scenario,
} from '../../src/core/types';

function passage(cost: number): PassageCell {
  return { kind: 'passage', cost };
}
function blocked(): Cell {
  return { kind: 'blocked' };
}
function elevator(group: number, wait: number): ElevatorCell {
  return { kind: 'elevator', group, wait };
}

function makeScenario(
  rows: number,
  cols: number,
  entries: Array<[Pos, Cell]>,
  start: Pos,
  end: Pos,
  heading: Heading = 1,
): Scenario {
  const cells: Cell[] = Array.from({ length: rows * cols }, () => passage(1));
  for (const [p, cell] of entries) cells[p.r * cols + p.c] = cell;
  return { rows, cols, cells, start, end, heading };
}

describe('基础步行计费', () => {
  it('沿初始朝向直行：按目标格耗时累计，不收转弯费', () => {
    // 1x4：起点 (0,0) 朝东，目标格耗时 2、3、4
    const sc = makeScenario(
      1,
      4,
      [
        [{ r: 0, c: 1 }, passage(2)],
        [{ r: 0, c: 2 }, passage(3)],
        [{ r: 0, c: 3 }, passage(4)],
      ],
      { r: 0, c: 0 },
      { r: 0, c: 3 },
      1,
    );
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    expect(res.totalSeconds).toBe(2 + 3 + 4);
    expect(res.totalTurns).toBe(0);
    expect(res.steps.map((s) => s.baseCost)).toEqual([2, 3, 4]);
    expect(res.steps.map((s) => s.turnFee)).toEqual([0, 0, 0]);
    expect(res.steps[res.steps.length - 1].totalAfter).toBe(9);
  });

  it('改变方向加收 5 秒并计入转弯数，绕路费用体现在累计值', () => {
    // 2x2，全 1 秒，起点 (0,0) 朝东，终点 (1,1)
    // 路线 东再南：1 + 5转弯 + 1 = 7，转弯 1 次
    const sc = makeScenario(2, 2, [], { r: 0, c: 0 }, { r: 1, c: 1 }, 1);
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    expect(res.totalSeconds).toBe(1 + TURN_FEE + 1);
    expect(res.totalTurns).toBe(1);
    expect(res.positions).toEqual([
      { r: 0, c: 1 },
      { r: 1, c: 1 },
    ]);
  });

  it('初始朝向相反时第一步就收转弯费', () => {
    // 1x3，起点 (0,2) 朝东，终点 (0,0)，必须先向西
    const sc = makeScenario(1, 3, [], { r: 0, c: 2 }, { r: 0, c: 0 }, 1);
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    expect(res.totalSeconds).toBe(1 + TURN_FEE + 1);
    expect(res.steps[0].turnFee).toBe(TURN_FEE);
  });
});

describe('优化目标字典序', () => {
  it('总秒数相同时选择转弯更少的路线', () => {
    // 3x3，全 1，起点 (0,0) 朝东，终点 (2,2)
    // 任意单调路线 4 步基础耗时 4；先一路东再一路南 = 1 次转弯
    // 交替走（东-南-东-南）= 3 次转弯，每次 +5。
    const sc = makeScenario(3, 3, [], { r: 0, c: 0 }, { r: 2, c: 2 }, 1);
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    expect(res.totalTurns).toBe(1);
  });

  it('总秒数与转弯数都相同时按坐标序列字典序取小（优先行号更小）', () => {
    // 2x2 全 1，起点 (0,0) 朝北，终点 (1,1)。
    // 两条路线都要转 2 次弯、费用同为 2+10=12：
    //  A: 东再南 -> (0,1),(1,1)
    //  B: 南再东 -> (1,0),(1,1)
    // 第一项后 (0,1) 行号 0 < 1，故取 A。
    const sc = makeScenario(2, 2, [], { r: 0, c: 0 }, { r: 1, c: 1 }, 0);
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    expect(res.totalSeconds).toBe(2 + 2 * TURN_FEE);
    expect(res.totalTurns).toBe(2);
    expect(res.positions).toEqual([
      { r: 0, c: 1 },
      { r: 1, c: 1 },
    ]);
  });

  it('宁可多走便宜格也不选更短但更贵的路线', () => {
    // 2x3：直行走 (0,1)=50 的贵格；下排绕行全部 1 秒。
    // 起点 (0,0) 朝东，终点 (0,2)。
    // 直行：50 + 1 = 51；
    // 绕行：南(转5+1) 东(转5+1) 东(1) 北入终点(转5+1) = 19。
    const sc = makeScenario(
      2,
      3,
      [[{ r: 0, c: 1 }, passage(50)]],
      { r: 0, c: 0 },
      { r: 0, c: 2 },
      1,
    );
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    expect(res.totalSeconds).toBe(19);
    expect(res.totalTurns).toBe(3);
    expect(res.positions).toEqual([
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
      { r: 0, c: 2 },
    ]);
  });
});

describe('电梯规则', () => {
  it('同组电梯之间移动固定 8 秒、朝向不变，首次乘用加收一次等待', () => {
    // 1x5：(0,0) 通行起点，(0,1) 电梯组1等待10，中间阻断 (0,2)(0,3)(0,4)...
    // 构造为：A=(0,0) 起；电梯 E1=(0,1)；E2=(0,3)；阻断 (0,2)；终点 (0,4)
    const sc = makeScenario(
      1,
      5,
      [
        [{ r: 0, c: 1 }, elevator(1, 10)],
        [{ r: 0, c: 2 }, blocked()],
        [{ r: 0, c: 3 }, elevator(1, 10)],
      ],
      { r: 0, c: 0 },
      { r: 0, c: 4 },
      1,
    );
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    // 步入 E1：基础 0；乘用 E1->E2：8+10 首等；步入 (0,4)：1
    expect(res.totalSeconds).toBe(ELEVATOR_RIDE_FEE + 10 + 1);
    const ride = res.steps.find((s) => s.kind === 'elevator')!;
    expect(ride.elevatorFee).toBe(8 + 10);
    expect(ride.waitFee).toBe(10);
    expect(ride.headingAfter).toBe(1); // 朝东不变
    expect(res.totalTurns).toBe(0);
  });

  it('反复经过同一电梯组只支付一次等待（状态包含已付费组集合）', () => {
    // 5 个组1 电梯排成环，最优解可能两次乘用同组：
    // 起点 -> E1（等待4）乘到 E2，办事后必须再从 E2 乘到 E3 才到终点。
    // 布局（1 行）：[起][E1][阻断][E2][阻断][E3][终]
    const sc = makeScenario(
      1,
      7,
      [
        [{ r: 0, c: 1 }, elevator(1, 4)],
        [{ r: 0, c: 2 }, blocked()],
        [{ r: 0, c: 3 }, elevator(1, 4)],
        [{ r: 0, c: 4 }, blocked()],
        [{ r: 0, c: 5 }, elevator(1, 4)],
      ],
      { r: 0, c: 0 },
      { r: 0, c: 6 },
      1,
    );
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    // E1 可直达 E3（同组任意两部）：8+4，然后步入终点 1 => 13。
    // 若错误地每乘必收等待：8+4+8+4+1=25；若不能直达则无解。
    expect(res.totalSeconds).toBe(8 + 4 + 1);
    const rides = res.steps.filter((s) => s.kind === 'elevator');
    expect(rides).toHaveLength(1);
    // 全程首次等待费之和恰好只收一次
    expect(res.steps.reduce((sum, s) => sum + s.waitFee, 0)).toBe(4);
  });

  it('状态保留已付费组：乘组1跨区后，后续同组电梯不再补等待', () => {
    // 三台组1 电梯 E1(0,1)、E2(2,1)、E3(2,3)，等待 9。
    // 起点 (0,0)，终点 (2,4)；中段整列阻断，迫使乘用电梯跨越：
    //  行0: 起  E1  X
    //  行1: X   X   X
    //  行2: X   E2  X   E3  终
    const sc = makeScenario(
      3,
      5,
      [
        [{ r: 0, c: 1 }, elevator(1, 9)],
        [{ r: 0, c: 2 }, blocked()],
        [{ r: 1, c: 0 }, blocked()],
        [{ r: 1, c: 1 }, blocked()],
        [{ r: 1, c: 2 }, blocked()],
        [{ r: 2, c: 0 }, blocked()],
        [{ r: 2, c: 1 }, elevator(1, 9)],
        [{ r: 2, c: 2 }, blocked()],
        [{ r: 2, c: 3 }, elevator(1, 9)],
      ],
      { r: 0, c: 0 },
      { r: 2, c: 4 },
      1,
    );
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    // 步入 E1（基础 0），E1->E3 直达（8+9），东入终点 1 => 18。
    expect(res.steps.reduce((sum, s) => sum + s.waitFee, 0)).toBe(9);
    expect(res.totalSeconds).toBe(8 + 9 + 1);
  });

  it('不同组的等待分别收取', () => {
    // 必须先后乘用组1（等待3）与组2（等待6）：
    // 行0: (0,0)起  (0,1)=E1(g1)  (0,2)X  (0,3)=E3(g1)  (0,4)X  (0,5)X  (0,6)X
    // 行1: (1,0..2)X             (1,3)=E5(g2) (1,4)X (1,5)=E6(g2) (1,6)=终(1)
    const sc = makeScenario(
      2,
      7,
      [
        [{ r: 0, c: 1 }, elevator(1, 3)],
        [{ r: 0, c: 2 }, blocked()],
        [{ r: 0, c: 3 }, elevator(1, 3)],
        [{ r: 0, c: 4 }, blocked()],
        [{ r: 0, c: 5 }, blocked()],
        [{ r: 0, c: 6 }, blocked()],
        [{ r: 1, c: 0 }, blocked()],
        [{ r: 1, c: 1 }, blocked()],
        [{ r: 1, c: 2 }, blocked()],
        [{ r: 1, c: 3 }, elevator(2, 6)],
        [{ r: 1, c: 4 }, blocked()],
        [{ r: 1, c: 5 }, elevator(2, 6)],
      ],
      { r: 0, c: 0 },
      { r: 1, c: 6 },
      1,
    );
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    // 步入E1(0)；g1 乘用 8+3=11；向南步入 E5（转弯5）；g2 乘用 8+6=14；
    // 向东步入终点（转弯5+基础1）=6。合计 36，转弯 2 次。
    const rides = res.steps.filter((s) => s.kind === 'elevator');
    expect(rides.map((s) => s.elevatorFee)).toEqual([11, 14]);
    expect(rides.map((s) => s.waitFee)).toEqual([3, 6]);
    expect(rides.map((s) => s.group)).toEqual([1, 2]);
    expect(res.totalSeconds).toBe(11 + 5 + 14 + 6);
    expect(res.totalTurns).toBe(2);
  });
});

describe('不可达与失败证据', () => {
  it('阻断完全包围终点时不可达，返回可达格数（含起点）', () => {
    // 3x3，终点 (1,1)，其四周 (0,1)(2,1)(1,0)(1,2) 全阻断
    const sc = makeScenario(
      3,
      3,
      [
        [{ r: 0, c: 1 }, blocked()],
        [{ r: 1, c: 0 }, blocked()],
        [{ r: 1, c: 2 }, blocked()],
        [{ r: 2, c: 1 }, blocked()],
      ],
      { r: 0, c: 0 },
      { r: 1, c: 1 },
      1,
    );
    const res = solve(sc);
    expect(res.reachable).toBe(false);
    if (res.reachable) return;
    // 起点所在连通区：四角中 (0,0) 可到 (0,2)? (0,1) 阻断，上排被切断。
    // 可达集合 = (0,0)、(1,0)阻断、(2,0)、(2,1)阻断、(0,2)、(1,2)阻断、(2,2)、...
    const flood = floodReachable(sc);
    expect(res.reachableCount).toBe(flood.length);
    expect(res.reachableCount).toBeGreaterThan(0);
    expect(res.reachableCells.some((p) => p.r === 1 && p.c === 1)).toBe(false);
    // 显式列举：从 (0,0) 可走：(0,0),(2,0)? (1,0) 阻断，所以 (2,0) 到不了。
    expect(res.reachableCount).toBe(1);
  });

  it('电梯突破阻断包围时仍可达，且泛洪把同组电梯计入可达', () => {
    // 3x3：终点岛 (1,1) 四围阻断；起点 (0,0) 与终点 (1,1) 同为电梯组1。
    const sc = makeScenario(
      3,
      3,
      [
        [{ r: 0, c: 0 }, elevator(1, 0)],
        [{ r: 0, c: 1 }, blocked()],
        [{ r: 1, c: 0 }, blocked()],
        [{ r: 1, c: 1 }, elevator(1, 0)],
        [{ r: 1, c: 2 }, blocked()],
        [{ r: 2, c: 1 }, blocked()],
      ],
      { r: 0, c: 0 },
      { r: 1, c: 1 },
      1,
    );
    const flood = floodReachable(sc);
    // 步行只在起点孤岛，但电梯乘用把 (1,1) 纳入可达集合
    expect(flood.map((p) => `${p.r},${p.c}`).sort()).toEqual(['0,0', '1,1']);
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    expect(res.totalSeconds).toBe(8); // 直达同组，无等待
  });
});

describe('状态空间正确性', () => {
  it('同一位置不同朝向是不同状态，转弯费不会被错误摊薄', () => {
    // 构造需要“先转向离开、再转回来”的场景，确保 paid/heading 状态独立。
    // 直廊 1x4，起点在 (0,1) 朝东，终点在 (0,0)：第一步西向 +5。
    const sc = makeScenario(
      1,
      4,
      [
        [{ r: 0, c: 2 }, passage(9)],
        [{ r: 0, c: 3 }, passage(9)],
      ],
      { r: 0, c: 1 },
      { r: 0, c: 0 },
      1,
    );
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    expect(res.totalSeconds).toBe(1 + TURN_FEE);
  });

  it('20x20 全通行网格可快速求解', () => {
    const sc = makeScenario(
      20,
      20,
      [],
      { r: 0, c: 0 },
      { r: 19, c: 19 },
      1,
    );
    const t0 = Date.now();
    const res = solve(sc);
    expect(res.reachable).toBe(true);
    if (!res.reachable) return;
    // 38 个 1 秒 + 1 次转弯 5
    expect(res.totalSeconds).toBe(38 + 5);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
