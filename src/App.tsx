import { useMemo, useState } from 'react';
import {
  FieldError,
  RawCell,
  RawScenario,
  makeRawCell,
  validateScenario,
} from './core/validation';
import {
  HEADINGS,
  HEADING_ARROW,
  HEADING_LABEL,
  Heading,
  Pos,
  posKey,
} from './core/types';
import { SolveResult, solve } from './core/solver';
import { GridBoard } from './components/GridBoard';
import { Inspector } from './components/Inspector';
import { ErrorPanel } from './components/ErrorPanel';
import { ResultPanel } from './components/ResultPanel';

type Tool = 'start' | 'end' | 'passage' | 'blocked' | 'elevator';

const TOOL_ITEMS: ReadonlyArray<{ id: Tool; label: string; hint: string }> = [
  { id: 'start', label: '设为起点', hint: '在网格上点选起点格' },
  { id: 'end', label: '设为终点', hint: '在网格上点选终点格' },
  { id: 'passage', label: '通行格', hint: '点击后成为耗时 1–99 秒的通行格' },
  { id: 'blocked', label: '阻断格', hint: '点击后成为积水封闭的阻断格' },
  { id: 'elevator', label: '电梯格', hint: '点击后成为带组号与等待的电梯格' },
];

function buildCells(
  rows: number,
  cols: number,
  old: RawCell[],
  oldRows: number,
  oldCols: number,
): RawCell[] {
  const next: RawCell[] = Array.from(
    { length: rows * cols },
    () => makeRawCell('passage'),
  );
  const copyRows = Math.min(rows, oldRows);
  const copyCols = Math.min(cols, oldCols);
  for (let r = 0; r < copyRows; r++) {
    for (let c = 0; c < copyCols; c++) {
      next[r * cols + c] = old[r * oldCols + c];
    }
  }
  return next;
}

export default function App(): JSX.Element {
  const [rowsText, setRowsText] = useState('5');
  const [colsText, setColsText] = useState('5');
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [cells, setCells] = useState<RawCell[]>(() =>
    Array.from({ length: 25 }, () => makeRawCell('passage')),
  );
  const [start, setStart] = useState<Pos | null>({ r: 0, c: 0 });
  const [end, setEnd] = useState<Pos | null>({ r: 4, c: 4 });
  const [heading, setHeading] = useState<Heading | null>(1);
  const [tool, setTool] = useState<Tool>('passage');
  const [selected, setSelected] = useState<Pos | null>({ r: 0, c: 0 });
  const [errors, setErrors] = useState<FieldError[] | null>(null);
  const [result, setResult] = useState<SolveResult | null>(null);

  // 任何编辑都立即清空旧路线与旧报错，避免展示与现状不符的结果。
  const invalidate = (): void => {
    setResult(null);
    setErrors(null);
  };

  const applySize = (): void => {
    const r = Number(rowsText);
    const c = Number(colsText);
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 1 || c < 1 || r > 20 || c > 20) {
      setErrors([
        {
          cell: null,
          field: Number.isInteger(r) && r >= 1 && r <= 20 ? 'cols' : 'rows',
          message: '行数与列数必须是 1 至 20 的整数后才能应用尺寸',
        },
      ]);
      return;
    }
    setRows(r);
    setCols(c);
    setCells((prev) => buildCells(r, c, prev, rows, cols));
    setStart((p) => (p && p.r < r && p.c < c ? p : null));
    setEnd((p) => (p && p.r < r && p.c < c ? p : null));
    setSelected((p) => (p && p.r < r && p.c < c ? p : { r: 0, c: 0 }));
    invalidate();
  };

  const updateCell = (p: Pos, patch: Partial<RawCell>): void => {
    setCells((prev) => {
      const next = prev.slice();
      next[p.r * cols + p.c] = { ...next[p.r * cols + p.c], ...patch };
      return next;
    });
    invalidate();
  };

  const onCellClick = (p: Pos): void => {
    setSelected(p);
    if (tool === 'start') {
      setStart(p);
      invalidate();
    } else if (tool === 'end') {
      setEnd(p);
      invalidate();
    } else if (tool === 'passage') {
      updateCell(p, {
        kind: 'passage',
        costText: cells[p.r * cols + p.c].costText || '1',
      });
    } else if (tool === 'blocked') {
      updateCell(p, { kind: 'blocked' });
    } else {
      const cur = cells[p.r * cols + p.c];
      updateCell(p, {
        kind: 'elevator',
        groupText: cur.groupText || '1',
        waitText: cur.waitText === '' ? '0' : cur.waitText,
      });
    }
  };

  const raw: RawScenario = { rowsText, colsText, cells, start, end, heading };

  const onSolve = (): void => {
    const v = validateScenario(raw);
    if (!v.ok) {
      setErrors(v.errors);
      setResult(null); // 非法字段：清空结果
      const firstCellError = v.errors.find((e) => e.cell !== null);
      if (firstCellError?.cell) setSelected(firstCellError.cell);
      return;
    }
    const solved = solve(v.scenario);
    setErrors(null);
    setResult(solved);
  };

  const errorMap = useMemo(() => {
    const m = new Map<string, FieldError[]>();
    for (const e of errors ?? []) {
      if (e.cell) {
        const k = posKey(e.cell);
        const list = m.get(k);
        if (list) list.push(e);
        else m.set(k, [e]);
      }
    }
    return m;
  }, [errors]);

  const globalErrorFor = (field: FieldError['field']): FieldError | undefined =>
    (errors ?? []).find((e) => e.cell === null && e.field === field);

  const pathSet = useMemo(() => {
    if (!result || !result.reachable) return new Set<string>();
    return new Set(
      [start!, ...result.positions].map(posKey),
    );
  }, [result, start]);

  const reachableSet = useMemo(() => {
    if (!result || result.reachable) return new Set<string>();
    return new Set(result.reachableCells.map(posKey));
  }, [result]);

  const stepIndexByPos = useMemo(() => {
    const m = new Map<string, number>();
    if (result?.reachable) {
      result.steps.forEach((s, i) => m.set(posKey(s.to), i + 1));
    }
    return m;
  }, [result]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>车站无障碍通道复核器</h1>
        <p>
          暴雨倒灌后复核最近无障碍通道：在最多 20×20 的网格中编辑阻断格、1–99
          秒的通行格与带组号、首次等待的电梯格，点选起点、终点与初始朝向，
          按「总秒数 → 转弯数 → 坐标序列字典序」求最优路线。
        </p>
      </header>

      <section className="toolbar" aria-label="网格尺寸">
        <label>
          行数
          <input
            data-testid="rows-input"
            type="number"
            min={1}
            max={20}
            value={rowsText}
            aria-invalid={!!globalErrorFor('rows')}
            onChange={(e) => setRowsText(e.target.value)}
          />
        </label>
        <label>
          列数
          <input
            data-testid="cols-input"
            type="number"
            min={1}
            max={20}
            value={colsText}
            aria-invalid={!!globalErrorFor('cols')}
            onChange={(e) => setColsText(e.target.value)}
          />
        </label>
        <button type="button" data-testid="apply-size" onClick={applySize}>
          应用尺寸
        </button>
        <div className="heading-group" role="group" aria-label="初始朝向">
          <span className={globalErrorFor('heading') ? 'label-error' : ''}>
            初始朝向：
          </span>
          {HEADINGS.map((h) => (
            <button
              key={h}
              type="button"
              data-testid={`heading-${h}`}
              className={heading === h ? 'chip chip-on' : 'chip'}
              aria-pressed={heading === h}
              onClick={() => {
                setHeading(h);
                invalidate();
              }}
            >
              {HEADING_ARROW[h]} {HEADING_LABEL[h]}
            </button>
          ))}
        </div>
      </section>

      <section className="tools" role="group" aria-label="编辑工具">
        {TOOL_ITEMS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.hint}
            data-testid={`tool-${t.id}`}
            className={tool === t.id ? 'chip chip-on' : 'chip'}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          className="solve"
          data-testid="solve-button"
          onClick={onSolve}
        >
          开始复核（求解）
        </button>
      </section>

      <div className="global-field-errors">
        {(['rows', 'cols', 'heading', 'start', 'end', 'general'] as const).map(
          (f) =>
            globalErrorFor(f) && (
              <p key={f} className="error-text" data-testid={`global-error-${f}`}>
                {globalErrorFor(f)!.message}
              </p>
            ),
        )}
      </div>

      <main className="layout">
        <div className="board-wrap">
          <GridBoard
            rows={rows}
            cols={cols}
            cells={cells}
            start={start}
            end={end}
            heading={heading}
            selected={selected}
            errorMap={errorMap}
            pathSet={pathSet}
            reachableSet={reachableSet}
            stepIndexByPos={stepIndexByPos}
            resultReachable={result ? result.reachable : null}
            onCellClick={onCellClick}
          />
          <Legend />
        </div>

        <div className="side">
          <Inspector
            rows={rows}
            cols={cols}
            cells={cells}
            selected={selected}
            start={start}
            end={end}
            heading={heading}
            errors={errors ?? []}
            onUpdate={updateCell}
            onSelect={setSelected}
          />
          <ErrorPanel
            errors={errors ?? []}
            onLocate={(p) => {
              setSelected(p);
              setTool('passage');
            }}
          />
          <ResultPanel result={result} start={start} end={end} />
        </div>
      </main>
    </div>
  );
}

function Legend(): JSX.Element {
  return (
    <ul className="legend">
      <li><span className="sw sw-start" />起点</li>
      <li><span className="sw sw-end" />终点</li>
      <li><span className="sw sw-passage" />通行格（数字为秒）</li>
      <li><span className="sw sw-elevator" />电梯格（组/等待）</li>
      <li><span className="sw sw-blocked" />阻断格（积水封闭）</li>
      <li><span className="sw sw-path" />最优路线</li>
      <li><span className="sw sw-reach" />起点可达（失败证据）</li>
    </ul>
  );
}
