import { FieldError } from '../core/validation';

interface Props {
  errors: FieldError[];
  onLocate: (p: { r: number; c: number }) => void;
}

export function ErrorPanel({ errors, onLocate }: Props): JSX.Element | null {
  if (errors.length === 0) return null;
  const sorted = [...errors].sort((a, b) => {
    const ar = a.cell ? a.cell.r : -1;
    const br = b.cell ? b.cell.r : -1;
    if (ar !== br) return ar - br;
    const ac = a.cell ? a.cell.c : -1;
    const bc = b.cell ? b.cell.c : -1;
    return ac - bc;
  });
  return (
    <section className="panel error-panel" aria-label="校验错误" data-testid="error-panel">
      <h2>非法字段（{errors.length}）</h2>
      <p className="hint">结果已清空，修正后重新求解。点击条目可定位到对应格。</p>
      <ul>
        {sorted.map((e, i) => (
          <li key={i} className="error-item">
            {e.cell ? (
              <button
                type="button"
                className="linklike"
                data-testid={`error-locate-${e.cell.r}-${e.cell.c}-${e.field}`}
                onClick={() => onLocate(e.cell!)}
              >
                第 {e.cell.r + 1} 行第 {e.cell.c + 1} 列 · {fieldName(e.field)}：{e.message}
              </button>
            ) : (
              <span className="error-text">
                {fieldName(e.field)}：{e.message}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function fieldName(f: FieldError['field']): string {
  switch (f) {
    case 'rows':
      return '行数';
    case 'cols':
      return '列数';
    case 'kind':
      return '类型';
    case 'cost':
      return '通行耗时';
    case 'group':
      return '电梯组号';
    case 'wait':
      return '首次等待';
    case 'start':
      return '起点';
    case 'end':
      return '终点';
    case 'heading':
      return '初始朝向';
    case 'general':
      return '整体';
  }
}
