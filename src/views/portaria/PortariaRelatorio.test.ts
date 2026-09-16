import { describe, expect, it } from 'vitest';
import { localizarRelatorioDoLancamento } from './PortariaRelatorio';
import type { PortRelatorioPortaria } from '../../types';

function relatorio(
  id: string,
  data: string,
  turno: PortRelatorioPortaria['turno'],
  status: PortRelatorioPortaria['status'] = 'EM_ANDAMENTO',
): PortRelatorioPortaria {
  return {
    id,
    codigo_formulario: 'FRM.SGP-0010',
    numero_protocolo: `REL-${id}`,
    data,
    turno,
    horario_inicio: '06:00',
    horario_fim: '18:00',
    vigilante_principal: 'VIGILANTE',
    vigilante_ronda01: null,
    vigilante_ronda02: null,
    status,
    observacoes_gerais: null,
    criado_por: 'usuario-1',
    created_at: '2026-09-16T10:00:00Z',
    updated_at: '2026-09-16T10:00:00Z',
  };
}

describe('localizarRelatorioDoLancamento', () => {
  it('não reutiliza um plantão aberto de data anterior', () => {
    const resultado = localizarRelatorioDoLancamento(
      [
        relatorio('aberto-antigo', '2026-08-30', 'TARDE'),
        relatorio('do-dia', '2026-09-16', 'TARDE'),
      ],
      '2026-09-16',
    );

    expect(resultado?.id).toBe('do-dia');
  });

  it('reutiliza o livro em andamento do mesmo dia, sem exigir abertura de outro turno', () => {
    const resultado = localizarRelatorioDoLancamento(
      [relatorio('aberto-pela-manha', '2026-09-16', 'MANHA')],
      '2026-09-16',
    );

    expect(resultado?.id).toBe('aberto-pela-manha');
  });

  it('solicita a criação de outro livro quando não há plantão aberto na data e turno', () => {
    const resultado = localizarRelatorioDoLancamento(
      [
        relatorio('aberto-antigo', '2026-08-30', 'TARDE'),
        relatorio('encerrado-hoje', '2026-09-16', 'TARDE', 'CONCLUIDO'),
      ],
      '2026-09-16',
    );

    expect(resultado).toBeNull();
  });
});
