import { describe, expect, it } from 'vitest';
import { shouldShowChartBarLabel } from './AcompanhamentoDiarioDashboard';

describe('AcompanhamentoDiarioDashboard - rótulos', () => {
  it('não mostra rótulo de barra quando o valor é zero', () => {
    expect(shouldShowChartBarLabel(0)).toBe(false);
    expect(shouldShowChartBarLabel('0')).toBe(false);
    expect(shouldShowChartBarLabel(3)).toBe(true);
    expect(shouldShowChartBarLabel(-2)).toBe(true);
  });
});
