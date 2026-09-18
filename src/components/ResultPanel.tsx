import { HEADING_ARROW, HEADING_LABEL, Pos, posKey } from '../core/types';
import { PathStep, SolveResult } from '../core/solver';

interface Props {
  result: SolveResult | null;
  start: Pos | null;
  end: Pos | null;
}

export function ResultPanel({ result, start, end }: Props): JSX.Element {
  if (result === null) {
    return (
      <section className="panel result" aria-label="复核结果" data-testid="result-empty">
        <h2>复核结果</h2>
        <p className="muted">编辑网格并点击「开始复核（求解）」后，在此展示逐步费用与累计值。</p>
      </section>
    );
  }

  if (!result.reachable) {
    return (
      <section className="panel result result-fail" aria-label="复核结果" data-testid="result-fail">
        <h2>不可达</h2>
        <p className="fail-text">
          封闭后不存在从起点到终点的任何路线，旧路线已立即清除。
        </p>
        <p data-testid="reachable-count">
          从起点不计成本可达的格数：<strong>{result.reachableCount}</strong>（含起点）
        </p>
        <p className="hint">网格中以圆点标出的即从起点实际可达的格，可逐格核对这一失败证据。</p>
        <ReachableList cells={result.reachableCells} />
      </section>
    );
  }

  return (
    <section className="panel result result-ok" aria-label="复核结果" data-testid="result-ok">
      <h2>最优路线</h2>
      <p>
        总秒数 <strong data-testid="total-seconds">{result.totalSeconds}</strong> 秒；
        转弯 <strong data-testid="total-turns">{result.totalTurns}</strong> 次；
        共 <strong>{result.steps.length}</strong> 步。
      </p>
      <p className="hint">
        起点（{start ? `${start.r + 1},${start.c + 1}` : '-'}）→
        终点（{end ? `${end.r + 1},${end.c + 1}` : '-'}）。
        排序规则：总秒数 → 转弯数 → 从起点起逐项比较的（行,列）坐标序列。
      </p>

      <div className="table-scroll">
        <table data-testid="step-table">
          <thead>
            <tr>
              <th>#</th>
              <th>方式</th>
              <th>到达(行,列)</th>
              <th>朝向</th>
              <th>基础耗时</th>
              <th>转弯费</th>
              <th>电梯费</th>
              <th>其中首等</th>
              <th>累计秒数</th>
            </tr>
          </thead>
          <tbody>
            <tr data-testid="step-row-0" className="row-start">
              <td>0</td>
              <td>起点</td>
              <td>{start ? `${start.r + 1},${start.c + 1}` : '-'}</td>
              <td>—</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
            </tr>
            {result.steps.map((s, i) => (
              <StepRow key={i} index={i + 1} step={s} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StepRow({ index, step }: { index: number; step: PathStep }): JSX.Element {
  const elevatorDetail =
    step.kind === 'elevator'
      ? `电梯组${step.group} 乘用8${step.waitFee > 0 ? `+首等${step.waitFee}` : ''}`
      : '—';
  return (
    <tr data-testid={`step-row-${index}`}>
      <td>{index}</td>
      <td>{step.kind === 'walk' ? '步行' : '电梯'}</td>
      <td>
        {step.to.r + 1},{step.to.c + 1}
      </td>
      <td>
        {HEADING_ARROW[step.headingAfter]} {HEADING_LABEL[step.headingAfter]}
      </td>
      <td>{step.baseCost}</td>
      <td>{step.turnFee}</td>
      <td title={elevatorDetail}>{step.elevatorFee}</td>
      <td>{step.waitFee}</td>
      <td data-testid={`cumulative-${index}`}>{step.totalAfter}</td>
    </tr>
  );
}

function ReachableList({ cells }: { cells: Pos[] }): JSX.Element {
  const sorted = [...cells].sort((a, b) => (a.r - b.r) || (a.c - b.c));
  return (
    <details>
      <summary>可达格清单（{cells.length}）</summary>
      <ul className="reach-list" data-testid="reach-list">
        {sorted.map((p) => (
          <li key={posKey(p)}>
            {p.r + 1},{p.c + 1}
          </li>
        ))}
      </ul>
    </details>
  );
}
