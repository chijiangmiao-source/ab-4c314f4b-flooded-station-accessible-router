// 表单原始数据 -> 校验 -> Scenario
// 所有非法字段都要能定位：网格字段定位到 (行,列)，全局字段定位到字段名。

import {
  Cell,
  ElevatorCell,
  Heading,
  PassageCell,
  Pos,
  Scenario,
} from './types';

export interface RawCell {
  kind: 'passage' | 'blocked' | 'elevator';
  costText: string;
  groupText: string;
  waitText: string;
}

export interface RawScenario {
  rowsText: string;
  colsText: string;
  cells: RawCell[];
  start: Pos | null;
  end: Pos | null;
  heading: Heading | null;
}

export interface FieldError {
  /** 网格内错误时的 0 基坐标；全局字段错误时为 null */
  cell: Pos | null;
  /** 字段标识，供界面高亮对应输入框 */
  field: 'rows' | 'cols' | 'kind' | 'cost' | 'group' | 'wait' | 'start' | 'end' | 'heading' | 'general';
  message: string;
}

export type ValidationResult =
  | { ok: true; scenario: Scenario }
  | { ok: false; errors: FieldError[] };

const MIN_SIDE = 1;
export const MAX_SIDE = 20;
const MIN_COST = 1;
export const MAX_COST = 99;
const MIN_GROUP = 1;
const MAX_GROUP = 99;
const MIN_WAIT = 0;
const MAX_WAIT = 999;

function parseIntStrict(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  if (!/^[+-]?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

export function validateScenario(raw: RawScenario): ValidationResult {
  const errors: FieldError[] = [];

  const rows = parseIntStrict(raw.rowsText);
  const cols = parseIntStrict(raw.colsText);
  if (rows === null || rows < MIN_SIDE || rows > MAX_SIDE) {
    errors.push({
      cell: null,
      field: 'rows',
      message: `行数必须是 ${MIN_SIDE} 至 ${MAX_SIDE} 的整数`,
    });
  }
  if (cols === null || cols < MIN_SIDE || cols > MAX_SIDE) {
    errors.push({
      cell: null,
      field: 'cols',
      message: `列数必须是 ${MIN_SIDE} 至 ${MAX_SIDE} 的整数`,
    });
  }

  if (raw.heading === null) {
    errors.push({ cell: null, field: 'heading', message: '请选择北/东/南/西初始朝向' });
  }
  if (raw.start === null) {
    errors.push({ cell: null, field: 'start', message: '请在网格中点选起点' });
  }
  if (raw.end === null) {
    errors.push({ cell: null, field: 'end', message: '请在网格中点选终点' });
  }
  if (raw.start !== null && raw.end !== null && raw.start.r === raw.end.r && raw.start.c === raw.end.c) {
    errors.push({ cell: null, field: 'general', message: '起点与终点不能重合' });
  }

  // 尺寸非法时无法把单元格错误稳定地映射到行列，先返回全局错误。
  if (rows === null || cols === null || rows < MIN_SIDE || rows > MAX_SIDE || cols < MIN_SIDE || cols > MAX_SIDE) {
    return { ok: false, errors };
  }

  const expected = rows * cols;
  if (raw.cells.length !== expected) {
    errors.push({
      cell: null,
      field: 'general',
      message: `网格数据长度 ${raw.cells.length} 与 ${rows}×${cols}=${expected} 不符`,
    });
    return { ok: false, errors };
  }

  const cells: Cell[] = new Array(expected);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rawCell = raw.cells[r * cols + c];
      const at = { r, c };
      if (rawCell.kind === 'blocked') {
        cells[r * cols + c] = { kind: 'blocked' };
        continue;
      }
      if (rawCell.kind === 'passage') {
        const cost = parseIntStrict(rawCell.costText);
        if (cost === null || cost < MIN_COST || cost > MAX_COST) {
          errors.push({
            cell: at,
            field: 'cost',
            message: `第 ${r + 1} 行第 ${c + 1} 列通行格耗时必须是 ${MIN_COST} 至 ${MAX_COST} 的整数秒`,
          });
          continue;
        }
        cells[r * cols + c] = { kind: 'passage', cost } satisfies PassageCell;
        continue;
      }
      // elevator
      const group = parseIntStrict(rawCell.groupText);
      const wait = parseIntStrict(rawCell.waitText);
      let bad = false;
      if (group === null || group < MIN_GROUP || group > MAX_GROUP) {
        errors.push({
          cell: at,
          field: 'group',
          message: `第 ${r + 1} 行第 ${c + 1} 列电梯格组号必须是 ${MIN_GROUP} 至 ${MAX_GROUP} 的整数`,
        });
        bad = true;
      }
      if (wait === null || wait < MIN_WAIT || wait > MAX_WAIT) {
        errors.push({
          cell: at,
          field: 'wait',
          message: `第 ${r + 1} 行第 ${c + 1} 列首次等待必须是 ${MIN_WAIT} 至 ${MAX_WAIT} 的整数秒`,
        });
        bad = true;
      }
      if (!bad) {
        cells[r * cols + c] = { kind: 'elevator', group: group as number, wait: wait as number } satisfies ElevatorCell;
      }
    }
  }

  // 同一电梯组的首次等待必须一致，否则“该组等待”没有唯一定义。
  const groupWaits = new Map<number, { wait: number; at: Pos }>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r * cols + c];
      if (cell && cell.kind === 'elevator') {
        const prev = groupWaits.get(cell.group);
        if (prev === undefined) {
          groupWaits.set(cell.group, { wait: cell.wait, at: { r, c } });
        } else if (prev.wait !== cell.wait) {
          errors.push({
            cell: { r, c },
            field: 'wait',
            message: `第 ${r + 1} 行第 ${c + 1} 列与第 ${prev.at.r + 1} 行第 ${prev.at.c + 1} 列同属电梯组 ${cell.group}，首次等待秒数必须一致`,
          });
        }
      }
    }
  }

  if (raw.start !== null && !inBounds(raw.start, rows, cols)) {
    errors.push({ cell: null, field: 'start', message: '起点坐标超出当前网格范围，请重新点选' });
  }
  if (raw.end !== null && !inBounds(raw.end, rows, cols)) {
    errors.push({ cell: null, field: 'end', message: '终点坐标超出当前网格范围，请重新点选' });
  }

  const startBlocked = raw.start !== null && inBounds(raw.start, rows, cols) && cells[raw.start.r * cols + raw.start.c]?.kind === 'blocked';
  const endBlocked = raw.end !== null && inBounds(raw.end, rows, cols) && cells[raw.end.r * cols + raw.end.c]?.kind === 'blocked';
  if (startBlocked) {
    errors.push({
      cell: raw.start as Pos,
      field: 'start',
      message: `起点（第 ${raw.start!.r + 1} 行第 ${raw.start!.c + 1} 列）落在封闭的阻断格上`,
    });
  }
  if (endBlocked) {
    errors.push({
      cell: raw.end as Pos,
      field: 'end',
      message: `终点（第 ${raw.end!.r + 1} 行第 ${raw.end!.c + 1} 列）落在封闭的阻断格上`,
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    scenario: {
      rows,
      cols,
      cells,
      start: raw.start as Pos,
      end: raw.end as Pos,
      heading: raw.heading as Heading,
    },
  };
}

function inBounds(p: Pos, rows: number, cols: number): boolean {
  return p.r >= 0 && p.r < rows && p.c >= 0 && p.c < cols;
}

export function makeRawCell(kind: RawCell['kind'] = 'passage'): RawCell {
  return {
    kind,
    costText: kind === 'passage' ? '1' : '',
    groupText: kind === 'elevator' ? '1' : '',
    waitText: kind === 'elevator' ? '0' : '',
  };
}
