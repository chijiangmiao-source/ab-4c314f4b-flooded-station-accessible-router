import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';

describe('App 交互集成', () => {
  it('默认场景求解并展示逐步累计；编辑后旧结果立即清空', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('solve-button'));
    expect(screen.getByTestId('result-ok')).toBeTruthy();
    expect(screen.getByTestId('total-seconds').textContent).toBe('13');

    // 改动任意格（点击一个通行格工具格）后，旧结果立即消失
    fireEvent.click(screen.getByTestId('tool-blocked'));
    fireEvent.click(screen.getByTestId('cell-0-1'));
    expect(screen.getByTestId('result-empty')).toBeTruthy();
    expect(document.querySelectorAll('.cell.in-path').length).toBe(0);
  });

  it('非法耗时字段定位到具体格，结果保持清空', () => {
    render(<App />);
    // 默认选中 (0,0)
    fireEvent.change(screen.getByTestId('inspector-cost'), { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('solve-button'));

    const panel = screen.getByTestId('error-panel');
    expect(panel.textContent).toContain('第 1 行第 1 列');
    expect(screen.getByTestId('cell-0-0').classList.contains('has-error')).toBe(true);
    expect(screen.queryByTestId('result-ok')).toBeNull();
  });

  it('阻断终点唯一通路后给出不可达与可达格数', () => {
    render(<App />);
    // 1×3 走廊，封住中间格 => 终点不可达，可达格数 1（仅起点）
    fireEvent.change(screen.getByTestId('rows-input'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('cols-input'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('apply-size'));

    // 起点默认 (0,0) 保留；终点需要重新点选
    fireEvent.click(screen.getByTestId('tool-end'));
    fireEvent.click(screen.getByTestId('cell-0-2'));

    fireEvent.click(screen.getByTestId('tool-blocked'));
    fireEvent.click(screen.getByTestId('cell-0-1'));

    fireEvent.click(screen.getByTestId('solve-button'));
    expect(screen.getByTestId('result-fail')).toBeTruthy();
    expect(within(screen.getByTestId('reachable-count')).getByText('1')).toBeTruthy();
  });
});
