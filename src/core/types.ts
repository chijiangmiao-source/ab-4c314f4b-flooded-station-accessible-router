// 领域模型：网格、单元格、朝向
// 坐标统一为 0 基的行号 r、列号 c；界面展示时再加 1。

export type Heading = 0 | 1 | 2 | 3; // 北 N、东 E、南 S、西 W
export const HEADINGS: readonly Heading[] = [0, 1, 2, 3];
export const HEADING_LABEL: Record<Heading, string> = {
  0: '北',
  1: '东',
  2: '南',
  3: '西',
};
export const HEADING_ARROW: Record<Heading, string> = {
  0: '↑',
  1: '→',
  2: '↓',
  3: '←',
};
// 行、列位移，索引顺序与 Heading 一致：北、东、南、西
export const HEADING_DELTA: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

export type CellKind = 'passage' | 'blocked' | 'elevator';

export interface PassageCell {
  kind: 'passage';
  /** 步行进入该格的基础耗时，1..99 秒 */
  cost: number;
}

export interface BlockedCell {
  /** 暴雨倒灌后封闭（积水）的阻断格 */
  kind: 'blocked';
}

export interface ElevatorCell {
  kind: 'elevator';
  /** 电梯组号，同组任意两部电梯之间可以直接乘用 */
  group: number;
  /** 该组首次乘用时加收的等待秒数 */
  wait: number;
}

export type Cell = PassageCell | BlockedCell | ElevatorCell;

export interface Pos {
  r: number;
  c: number;
}

export const posKey = (p: Pos): string => `${p.r},${p.c}`;
export const samePos = (a: Pos, b: Pos): boolean => a.r === b.r && a.c === b.c;

/** 校验通过后的可求解场景 */
export interface Scenario {
  rows: number;
  cols: number;
  cells: Cell[]; // 行主序，索引 r * cols + c
  start: Pos;
  end: Pos;
  heading: Heading;
}
