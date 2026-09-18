import { describe, expect, it } from 'vitest';
import { makeRawCell, validateScenario, RawScenario, RawCell } from '../../src/core/validation';

function rawGrid(rows: number, cols: number, fn?: (r: number, c: number) => RawCell): RawCell[] {
  return Array.from({ length: rows * cols }, (_, i) =>
    fn ? fn(Math.floor(i / cols), i % cols) : makeRawCell('passage'),
  );
}

function validRaw(over: Partial<RawScenario> = {}): RawScenario {
  return {
    rowsText: '3',
    colsText: '3',
    cells: rawGrid(3, 3),
    start: { r: 0, c: 0 },
    end: { r: 2, c: 2 },
    heading: 1,
    ...over,
  };
}

describe('validateScenario', () => {
  it('合法场景通过', () => {
    const r = validateScenario(validRaw());
    expect(r.ok).toBe(true);
  });

  it('尺寸越界（>20、<1、非整数、空）定位到行/列字段', () => {
    for (const bad of ['0', '21', 'abc', '', '3.5']) {
      const r = validateScenario(validRaw({ rowsText: bad }));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors.some((e) => e.field === 'rows' && e.cell === null)).toBe(true);
    }
  });

  it('通行耗时越界定位到具体格与 cost 字段', () => {
    const cells = rawGrid(2, 2);
    cells[3].costText = '100';
    const r = validateScenario(
      validRaw({ rowsText: '2', colsText: '2', cells, end: { r: 1, c: 1 } }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContainEqual(
      expect.objectContaining({
        field: 'cost',
        cell: { r: 1, c: 1 },
      }),
    );
  });

  it('电梯组号/等待非法分别定位到 group / wait 字段', () => {
    const cells = rawGrid(1, 3, () => makeRawCell('passage'));
    cells[1] = { kind: 'elevator', costText: '', groupText: '0', waitText: '12' };
    cells[2] = { kind: 'elevator', costText: '', groupText: '1', waitText: 'abc' };
    const r = validateScenario(
      validRaw({ rowsText: '1', colsText: '3', cells, start: { r: 0, c: 0 }, end: { r: 0, c: 2 } }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.field === 'group' && e.cell?.c === 1)).toBe(true);
    expect(r.errors.some((e) => e.field === 'wait' && e.cell?.c === 2)).toBe(true);
  });

  it('同组电梯等待秒数不一致时报错定位到后一格', () => {
    const cells = rawGrid(1, 3);
    cells[0] = { kind: 'elevator', costText: '', groupText: '2', waitText: '5' };
    cells[2] = { kind: 'elevator', costText: '', groupText: '2', waitText: '6' };
    const r = validateScenario(
      validRaw({ rowsText: '1', colsText: '3', cells, start: { r: 0, c: 1 }, end: { r: 0, c: 1 } }),
    );
    // start==end 也会报错，这里只关心 wait
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.field === 'wait' && e.cell?.c === 2)).toBe(true);
  });

  it('缺少起点/终点/朝向时分别报错', () => {
    const r = validateScenario(validRaw({ start: null, end: null, heading: null }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.field).sort()).toEqual(['end', 'heading', 'start']);
  });

  it('起点终点落在阻断格上时定位到该格', () => {
    const cells = rawGrid(1, 2);
    cells[0] = makeRawCell('blocked');
    const r = validateScenario(
      validRaw({ rowsText: '1', colsText: '2', cells, start: { r: 0, c: 0 }, end: { r: 0, c: 1 } }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.field === 'start' && e.cell?.c === 0)).toBe(true);
  });

  it('起点终点重合报错', () => {
    const r = validateScenario(validRaw({ end: { r: 0, c: 0 } }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.field === 'general')).toBe(true);
  });

  it('20x20 合法网格通过，1..99 边界耗时均接受', () => {
    const cells = rawGrid(20, 20, (r, c) => {
      const cell = makeRawCell('passage');
      cell.costText = ((r * 20 + c) % 99) + 1 > 0 ? String(((r * 20 + c) % 99) + 1) : '99';
      return cell;
    });
    const r = validateScenario(
      validRaw({ rowsText: '20', colsText: '20', cells }),
    );
    expect(r.ok).toBe(true);
  });
});
