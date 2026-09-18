import { FieldError, RawCell } from '../core/validation';
import { HEADING_ARROW, HEADING_LABEL, Heading, Pos, samePos } from '../core/types';

interface Props {
  rows: number;
  cols: number;
  cells: RawCell[];
  selected: Pos | null;
  start: Pos | null;
  end: Pos | null;
  heading: Heading | null;
  errors: FieldError[];
  onUpdate: (p: Pos, patch: Partial<RawCell>) => void;
  onSelect: (p: Pos) => void;
}

export function Inspector({
  rows,
  cols,
  cells,
  selected,
  start,
  end,
  heading,
  errors,
  onUpdate,
  onSelect,
}: Props): JSX.Element {
  if (selected === null) {
    return (
      <section className="panel inspector" aria-label="格检查器">
        <h2>格检查器</h2>
        <p className="muted">请在网格中点选一个格。</p>
      </section>
    );
  }

  const p = selected;
  const cell = cells[p.r * cols + p.c];
  const cellErrors = errors.filter(
    (e) => e.cell !== null && samePos(e.cell, p),
  );
  const errFor = (field: FieldError['field']): FieldError | undefined =>
    cellErrors.find((e) => e.field === field);

  const setKind = (kind: RawCell['kind']): void => {
    if (kind === 'passage') {
      onUpdate(p, { kind, costText: cell.costText || '1' });
    } else if (kind === 'elevator') {
      onUpdate(p, {
        kind,
        groupText: cell.groupText || '1',
        waitText: cell.waitText === '' ? '0' : cell.waitText,
      });
    } else {
      onUpdate(p, { kind });
    }
  };

  return (
    <section className="panel inspector" aria-label="格检查器">
      <h2>
        格检查器 · 第 {p.r + 1} 行第 {p.c + 1} 列
        <button
          type="button"
          className="mini"
          data-testid="locate-start"
          onClick={() => start && onSelect(start)}
        >
          {start ? `定位起点(${start.r + 1},${start.c + 1})` : '起点未设置'}
        </button>
        <button
          type="button"
          className="mini"
          data-testid="locate-end"
          onClick={() => end && onSelect(end)}
        >
          {end ? `定位终点(${end.r + 1},${end.c + 1})` : '终点未设置'}
        </button>
      </h2>

      <div className="kind-row">
        {(['passage', 'elevator', 'blocked'] as const).map((k) => (
          <label key={k} className={cell.kind === k ? 'kind kind-on' : 'kind'}>
            <input
              type="radio"
              name="cell-kind"
              value={k}
              checked={cell.kind === k}
              onChange={() => setKind(k)}
            />
            {k === 'passage' ? '通行格' : k === 'elevator' ? '电梯格' : '阻断格（封闭）'}
          </label>
        ))}
      </div>

      {cell.kind === 'passage' && (
        <label className="field">
          通行耗时（秒，1–99）
          <input
            data-testid="inspector-cost"
            type="number"
            min={1}
            max={99}
            value={cell.costText}
            aria-invalid={!!errFor('cost')}
            onChange={(e) => onUpdate(p, { costText: e.target.value })}
          />
        </label>
      )}

      {cell.kind === 'elevator' && (
        <>
          <label className="field">
            电梯组号（1–99）
            <input
              data-testid="inspector-group"
              type="number"
              min={1}
              max={99}
              value={cell.groupText}
              aria-invalid={!!errFor('group')}
              onChange={(e) => onUpdate(p, { groupText: e.target.value })}
            />
          </label>
          <label className="field">
            首次等待（秒，0–999）
            <input
              data-testid="inspector-wait"
              type="number"
              min={0}
              max={999}
              value={cell.waitText}
              aria-invalid={!!errFor('wait')}
              onChange={(e) => onUpdate(p, { waitText: e.target.value })}
            />
          </label>
          <p className="hint">
            同组任意两部电梯之间移动固定 8 秒、朝向不变；该组首次乘用只收取一次等待。
            同组等待秒数必须一致。
          </p>
        </>
      )}

      {cell.kind === 'blocked' && (
        <p className="hint">该格因积水封闭，无法通行，也不能作为起点或终点。</p>
      )}

      <div className="field">
        当前初始朝向：
        {heading === null ? (
          <span className="error-text">未选择</span>
        ) : (
          <strong>
            {HEADING_ARROW[heading]} {HEADING_LABEL[heading]}
          </strong>
        )}
      </div>

      {cellErrors.length > 0 && (
        <ul className="cell-errors" data-testid="inspector-errors">
          {cellErrors.map((e, i) => (
            <li key={`${e.field}-${i}`} className="error-text">
              {e.message}
            </li>
          ))}
        </ul>
      )}

      <p className="muted">网格尺寸 {rows}×{cols}（最大 20×20）。</p>
    </section>
  );
}
