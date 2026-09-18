import { FieldError, RawCell } from '../core/validation';
import { HEADING_ARROW, Heading, Pos, posKey, samePos } from '../core/types';

interface Props {
  rows: number;
  cols: number;
  cells: RawCell[];
  start: Pos | null;
  end: Pos | null;
  heading: Heading | null;
  selected: Pos | null;
  errorMap: Map<string, FieldError[]>;
  pathSet: Set<string>;
  reachableSet: Set<string>;
  stepIndexByPos: Map<string, number>;
  resultReachable: boolean | null;
  onCellClick: (p: Pos) => void;
}

export function GridBoard({
  rows,
  cols,
  cells,
  start,
  end,
  heading,
  selected,
  errorMap,
  pathSet,
  reachableSet,
  stepIndexByPos,
  resultReachable,
  onCellClick,
}: Props): JSX.Element {
  const maxDim = Math.max(rows, cols);
  const cellPx = maxDim > 15 ? 32 : maxDim > 10 ? 42 : 54;

  const gridItems: JSX.Element[] = [];

  // 左上角占位 + 列号
  gridItems.push(<div key="corner" className="corner" />);
  for (let c = 0; c < cols; c++) {
    gridItems.push(
      <div key={`axis-c-${c}`} className="axis axis-col">
        {c + 1}
      </div>,
    );
  }

  for (let r = 0; r < rows; r++) {
    gridItems.push(
      <div key={`axis-r-${r}`} className="axis axis-row">
        {r + 1}
      </div>,
    );
    for (let c = 0; c < cols; c++) {
      const p: Pos = { r, c };
      const k = posKey(p);
      const cell = cells[r * cols + c];
      const isStart = start !== null && samePos(start, p);
      const isEnd = end !== null && samePos(end, p);
      const isSelected = selected !== null && samePos(selected, p);
      const errs = errorMap.get(k);
      const inPath = pathSet.has(k);
      const inReach = reachableSet.has(k);
      const stepNo = stepIndexByPos.get(k);

      const cls = [
        'cell',
        `cell-${cell.kind}`,
        isStart ? 'is-start' : '',
        isEnd ? 'is-end' : '',
        isSelected ? 'is-selected' : '',
        errs ? 'has-error' : '',
        inPath ? 'in-path' : '',
        inReach ? 'in-reach' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const ariaLabel = [
        `第 ${r + 1} 行第 ${c + 1} 列`,
        cell.kind === 'blocked'
          ? '阻断格'
          : cell.kind === 'elevator'
            ? `电梯组 ${cell.groupText || '?'}，首次等待 ${cell.waitText || '?'} 秒`
            : `通行格，耗时 ${cell.costText || '?'} 秒`,
        isStart ? '起点' : '',
        isEnd ? '终点' : '',
        stepNo !== undefined ? `路线第 ${stepNo} 步` : '',
      ]
        .filter(Boolean)
        .join('，');

      gridItems.push(
        <button
          key={k}
          type="button"
          role="gridcell"
          data-testid={`cell-${r}-${c}`}
          data-row={r}
          data-col={c}
          data-kind={cell.kind}
          className={cls}
          style={{ width: cellPx, height: cellPx }}
          aria-label={ariaLabel}
          aria-invalid={errs ? true : undefined}
          onClick={() => onCellClick(p)}
        >
          {cell.kind === 'blocked' && <span className="glyph">▨</span>}
          {cell.kind === 'passage' && (
            <span className="cost">{cell.costText || '…'}</span>
          )}
          {cell.kind === 'elevator' && (
            <span className="elev">
              <span className="elev-g">梯{cell.groupText || '?'}</span>
              <span className="elev-w">{cell.waitText || '?'}s</span>
            </span>
          )}
          {(isStart || isEnd) && (
            <span className="marker">{isStart && isEnd ? '起/终' : isStart ? '起' : '终'}</span>
          )}
          {isStart && heading !== null && (
            <span className="start-arrow" aria-hidden>
              {HEADING_ARROW[heading]}
            </span>
          )}
          {stepNo !== undefined && !isStart && (
            <span className="step-no">{stepNo}</span>
          )}
          {resultReachable === false && inReach && (
            <span className="reach-dot" aria-hidden />
          )}
        </button>,
      );
    }
  }

  return (
    <div
      className="grid"
      role="grid"
      aria-label="车站网格"
      style={{ gridTemplateColumns: `24px repeat(${cols}, ${cellPx}px)` }}
    >
      {gridItems}
    </div>
  );
}
