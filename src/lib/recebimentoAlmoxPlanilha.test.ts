import { describe, expect, it } from 'vitest';
import {
  exportarRelatorioRecebimentoExcel,
  gerarWorkbookRecebimento,
  montarLinhasItensRecebimento,
  montarLinhasNaoConformidades,
  montarLinhasResumoConferencias,
  nomeArquivoRelatorioRecebimento,
} from './recebimentoAlmoxPlanilha';
import type { ConferenciaRow, ConferenciaItemRow, NaoConformidadeRow } from './recebimentoAlmoxApi';

describe('recebimentoAlmoxPlanilha', () => {
  const itemMock: ConferenciaItemRow = {
    id: 'it-1',
    material_code: '1000123',
    descricao: 'PARAFUSO SEXTAVADO M12',
    unidade: 'PC',
    qtd_pedido: 100,
    qtd_ja_fornecida: 20,
    qtd_recebida: 80,
    conferido: true,
    divergencia: false,
    item_manual: false,
    parcial: false,
    observacao: 'Lote aprovado',
    evidencias: [],
  };

  const itemDivergenteMock: ConferenciaItemRow = {
    id: 'it-2',
    material_code: '2000456',
    descricao: 'CABO DE COBRE 50MM',
    unidade: 'M',
    qtd_pedido: 50,
    qtd_ja_fornecida: 0,
    qtd_recebida: 30,
    conferido: false,
    divergencia: true,
    tipo_divergencia: 'falta',
    item_manual: false,
    parcial: false,
    observacao: 'Falta no volume',
    evidencias: [],
  };

  const ncMock: NaoConformidadeRow = {
    id: 'nc-1',
    codigo: 'NCR-151026-01',
    carga_id: null,
    conferencia_id: 'conf-1',
    tipo: 'falta',
    severidade: 'alta',
    status: 'aberta',
    fornecedor: 'FORNECEDOR TESTE',
    nro_pedido: '4100470001',
    responsavel: 'Almoxarifado',
    descricao: 'Faltaram 20 metros de cabo',
    resolucao: null,
    resolvida_em: null,
    itens_resumo: [],
    evidencias: [],
    acoes: [],
    created_at: '2026-10-15T10:00:00Z',
  };

  const confMock: ConferenciaRow = {
    id: 'conf-1',
    codigo: 'RCM-151026-01',
    data: '2026-10-15',
    carga_id: null,
    nro_pedido: '4100470001',
    pedidos: ['4100470001'],
    fornecedor: 'FORNECEDOR TESTE',
    rm: 'RM-999',
    tipo_item: 'consumo',
    deposito: '1001',
    fonte_pedido: 'cache_sap',
    retorno_remessa: false,
    total_itens: 2,
    itens_ok: 1,
    itens_divergentes: 1,
    tem_nc: true,
    encaminhado_projetos: false,
    evidencias: [],
    observacao: 'Conferência regular com pendência',
    status: 'concluida',
    criado_por_id: 'usr-1',
    criado_por_nome: 'João Conferente',
    created_at: '2026-10-15T10:30:00Z',
    itens: [itemMock, itemDivergenteMock],
    nc: [ncMock],
  };

  describe('nomeArquivoRelatorioRecebimento', () => {
    it('gera nome com intervalo de datas quando de e ate sao informados', () => {
      const nome = nomeArquivoRelatorioRecebimento(new Date(), '2026-10-01', '2026-10-15');
      expect(nome).toBe('relatorio_recebimento_20261001_a_20261015.xlsx');
    });

    it('gera nome a partir de data inicial', () => {
      const nome = nomeArquivoRelatorioRecebimento(new Date(), '2026-10-01');
      expect(nome).toBe('relatorio_recebimento_a_partir_20261001.xlsx');
    });

    it('gera nome com timestamp quando sem filtros de data', () => {
      const dataRef = new Date(2026, 9, 16, 14, 30);
      const nome = nomeArquivoRelatorioRecebimento(dataRef);
      expect(nome).toBe('relatorio_recebimento_20261016_1430.xlsx');
    });
  });

  describe('montarLinhasItensRecebimento', () => {
    it('mapeia os itens com colunas detalhadas e calculos de pendencia', () => {
      const linhas = montarLinhasItensRecebimento([confMock]);
      expect(linhas).toHaveLength(2);

      const l1 = linhas[0];
      expect(l1['Código RCM']).toBe('RCM-151026-01');
      expect(l1['Data Conferência']).toBe('15/10/2026');
      expect(l1['Fornecedor']).toBe('FORNECEDOR TESTE');
      expect(l1['Cód. Material']).toBe('1000123');
      expect(l1['Descrição Material']).toBe('PARAFUSO SEXTAVADO M12');
      expect(l1['Qtd Pedido']).toBe(100);
      expect(l1['Qtd Já Fornecida']).toBe(20);
      expect(l1['Qtd Pendente']).toBe(80);
      expect(l1['Qtd Recebida']).toBe(80);
      expect(l1['Status Item']).toBe('Conferido');
      expect(l1['Divergência']).toBe('NÃO');

      const l2 = linhas[1];
      expect(l2['Cód. Material']).toBe('2000456');
      expect(l2['Qtd Pendente']).toBe(50);
      expect(l2['Qtd Recebida']).toBe(30);
      expect(l2['Status Item']).toBe('Pendente');
      expect(l2['Divergência']).toBe('SIM');
      expect(l2['Tipo Divergência']).toBe('Faltou');
    });

    it('lida com lista vazia sem estourar erro', () => {
      expect(montarLinhasItensRecebimento([])).toEqual([]);
    });
  });

  describe('montarLinhasResumoConferencias', () => {
    it('resume cada conferencia com totais e status', () => {
      const linhas = montarLinhasResumoConferencias([confMock]);
      expect(linhas).toHaveLength(1);

      const r = linhas[0];
      expect(r['Código RCM']).toBe('RCM-151026-01');
      expect(r['Data']).toBe('15/10/2026');
      expect(r['PO(s)']).toBe('4100470001');
      expect(r['Fornecedor']).toBe('FORNECEDOR TESTE');
      expect(r['Total Itens']).toBe(2);
      expect(r['Itens OK']).toBe(1);
      expect(r['Itens Divergentes']).toBe(1);
      expect(r['Possui NCR']).toBe('SIM');
      expect(r['Status']).toBe('Concluída');
      expect(r['Conferente']).toBe('João Conferente');
    });
  });

  describe('montarLinhasNaoConformidades', () => {
    it('extrai informacoes de NCR vinculadas', () => {
      const linhas = montarLinhasNaoConformidades([confMock]);
      expect(linhas).toHaveLength(1);

      const ncLinha = linhas[0];
      expect(ncLinha['Código NCR']).toBe('NCR-151026-01');
      expect(ncLinha['Código RCM']).toBe('RCM-151026-01');
      expect(ncLinha['Fornecedor']).toBe('FORNECEDOR TESTE');
      expect(ncLinha['Tipo Divergência']).toBe('Falta');
      expect(ncLinha['Severidade']).toBe('ALTA');
      expect(ncLinha['Status']).toBe('ABERTA');
      expect(ncLinha['Descrição']).toBe('Faltaram 20 metros de cabo');
    });

    it('retorna vazio se nenhuma conferencia tiver NCR', () => {
      const confSemNc = { ...confMock, nc: [] };
      expect(montarLinhasNaoConformidades([confSemNc])).toEqual([]);
    });
  });

  describe('gerarWorkbookRecebimento', () => {
    it('cria o workbook com abas de Itens, Resumo e NCR', () => {
      const wb = gerarWorkbookRecebimento([confMock]);
      expect(wb.SheetNames).toContain('Itens Conferidos');
      expect(wb.SheetNames).toContain('Resumo Conferências');
      expect(wb.SheetNames).toContain('Não Conformidades');
    });

    it('cria workbook sem aba de NCR quando nao ha divergencias com NC', () => {
      const confLimpa: ConferenciaRow = {
        ...confMock,
        itens_divergentes: 0,
        tem_nc: false,
        itens: [itemMock],
        nc: [],
      };
      const wb = gerarWorkbookRecebimento([confLimpa]);
      expect(wb.SheetNames).toContain('Itens Conferidos');
      expect(wb.SheetNames).toContain('Resumo Conferências');
      expect(wb.SheetNames).not.toContain('Não Conformidades');
    });
  });

  describe('exportarRelatorioRecebimentoExcel', () => {
    it('lanca erro se chamada com array vazio', () => {
      expect(() => exportarRelatorioRecebimentoExcel([])).toThrow('Nenhuma conferência para exportar.');
    });
  });
});
