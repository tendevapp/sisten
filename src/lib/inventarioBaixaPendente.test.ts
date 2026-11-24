import { describe, expect, it } from 'vitest';
import {
  baixaPendenteDoItem, pendenteNoDeposito, situacaoRegularizacao, type MovimentoRetrato,
} from './inventarioBaixaPendente';
import { baixasPendentesPorMaterial } from './baixasPendentesCatalogo';
import { resumirInventario, type ItemInventario } from './inventarioCiclico';
import { linhasAnalise, resumirAnalise, contadosComBaixaPendente, maioresDivergencias } from './inventarioAnalise';

const mov = (p: Partial<MovimentoRetrato>): MovimentoRetrato => ({
  origem: 'balcao', codigo: 'RQB-241126-01', data: '2026-11-24', tipo_movimento: 'saida',
  deposito: '0002', deposito_destino: null, quantidade: 2, unidade: 'UN', aguardando_confirmacao: false, ...p,
});

const item = (p: Partial<ItemInventario>, baixa: MovimentoRetrato[] | null = null): ItemInventario => ({
  id: Math.random().toString(36), ordem: 1, material: '601045478', descricao: 'BUCHA', unidade: 'UN', deposito: '0002',
  classe: 'A', status: 'conferido', saldo_sistema: 10, qtd_final: 10, diferenca: 0, alerta: null, encerrado_em: '2026-11-24',
  contagens: [{
    id: 'c1', numero: 1, quantidade: 10, divergente: false, endereco_encontrado: null, validade: null, observacao: null,
    contado_por_nome: null, created_at: '2026-11-24T10:00:00Z', baixa_pendente: baixa,
  }],
  ...p,
});

describe('baixaPendenteDoItem', () => {
  it('vale a última contagem: recontar sem pendência devolve o item', () => {
    const i = item({});
    i.contagens = [
      { ...i.contagens[0], numero: 1, baixa_pendente: [mov({})] },
      { ...i.contagens[0], id: 'c2', numero: 2, baixa_pendente: null },
    ];
    expect(baixaPendenteDoItem(i)).toBeNull();
    i.contagens[1].baixa_pendente = [mov({})];
    expect(baixaPendenteDoItem(i)).toHaveLength(1);
  });

  it('lista vazia conta como sem pendência', () => {
    expect(baixaPendenteDoItem(item({}, []))).toBeNull();
  });
});

describe('pendenteNoDeposito', () => {
  it('saída e transferência do depósito somam; transferência para ele subtrai; sem depósito soma', () => {
    const movs = [
      mov({ quantidade: 2 }),
      mov({ tipo_movimento: 'transferencia', deposito: '0002', deposito_destino: '0105', quantidade: 3 }),
      mov({ tipo_movimento: 'transferencia', deposito: '0001', deposito_destino: '0002', quantidade: 1 }),
      mov({ deposito: '0004', quantidade: 50 }),
      mov({ origem: 'extraordinaria', deposito: null, quantidade: 4 }),
    ];
    expect(pendenteNoDeposito(movs, '2')).toBe(8);
  });
});

describe('situacaoRegularizacao', () => {
  const movs = [mov({ codigo: 'RQB-1' }), mov({ codigo: 'RQB-2' })];
  const agora = (codigos: string[]) => baixasPendentesPorMaterial(
    codigos.map((c) => ({ ...mov({ codigo: c }), material: '601045478' })),
  );
  it('compara com o que está sem baixa agora', () => {
    expect(situacaoRegularizacao('601045478', movs, agora(['RQB-1', 'RQB-2']))).toBe('pendente');
    expect(situacaoRegularizacao('601045478', movs, agora(['RQB-2']))).toBe('parcial');
    expect(situacaoRegularizacao('601045478', movs, agora([]))).toBe('regularizada');
    expect(situacaoRegularizacao('601045478', movs, null)).toBe('desconhecida');
  });
});

describe('fora da acuracidade', () => {
  const itens = [
    item({}),
    item({ status: 'divergente', qtd_final: 8, diferenca: -2 }, [mov({})]),
    item({ status: 'divergente', qtd_final: 7, diferenca: -3 }),
  ];

  it('Inventário Cíclico: acuracidade só com os itens sem baixa pendente', () => {
    const r = resumirInventario(itens);
    expect(r.baixaPendente).toBe(1);
    expect(r.divergentes).toBe(2);
    expect(r.acuracidade).toBe(50);
  });

  it('Análise: fora do resumo e das maiores divergências, listado à parte', () => {
    const linhas = linhasAnalise([{ id: 'inv', codigo: 'INV-241126-01', data: '2026-11-24', criterio: null, itens }]);
    const r = resumirAnalise(linhas);
    expect(r.encerrados).toBe(2);
    expect(r.comBaixaPendente).toBe(1);
    expect(r.acuracidade).toBe(50);
    expect(maioresDivergencias(linhas)).toHaveLength(1);
    expect(contadosComBaixaPendente(linhas)).toHaveLength(1);
  });
});
