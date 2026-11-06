import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../db/localDb', () => ({ localDb: {} }));

import { PDFDocument } from 'pdf-lib';
import { gerarRelatorioSolExtraPdf, type DadosRelatorioSolExtra } from './exportRelatorioSolExtraPdf';
import { linhasRelatorio, pendenciaNfDoMaterial, type AgrupamentoRelatorio, type ModoRelatorio } from '../relatorioSolExtra';
import type { SolExtra } from '../solicitacaoExtraApi';

function reg(i: number): SolExtra {
  const semSaldo = i % 3 === 0;
  const dia = String((i % 27) + 1).padStart(2, '0');
  return {
    id: `r${i}`, tipo: semSaldo ? 'SEM_SALDO' : 'PROJETO', codigo: `${semSaldo ? 'RSS' : 'SEM'}-${dia}1026-${String(i).padStart(2, '0')}`,
    data: `2026-10-${dia}`, hora: '08:00:00', turno: '1', projeto: semSaldo ? null : 'GOLDWIND GW-165', tramo: semSaldo ? null : `T${i}`,
    itens: [
      { material: '1258015', descricao: 'TINTA EPOXI POLIAMIDA ALTA ESPESSURA CINZA N6.5 COMPONENTE A', unidade: 'L', quantidade: 18 + i },
      { material: String(2000000 + (i % 5)), descricao: `DILUENTE ${i} – “especial”`, unidade: 'UN', quantidade: 2 },
    ],
    motivo: semSaldo ? null : 'REPARO_PINTURA', motivo_detalhe: semSaldo ? null : 'Dano no transporte', area_reparada_m2: semSaldo ? null : 3.5,
    rugosidade_um: null, observacao: null, status: i % 4 === 0 ? 'REGULARIZADA' : 'PENDENTE', doc_sap: i % 4 === 0 && !semSaldo ? '4900012345' : null,
    regularizacao_obs: null, regularizado_por: null, regularizado_por_nome: null, regularizado_em: null,
    retirante_id: null, retirante_nome: semSaldo ? 'JOSÉ DA SILVA SAURO' : null, retirante_matricula: semSaldo ? '12345' : null,
    setor_solicitante_id: null, setor_solicitante_nome: semSaldo ? 'Manutenção' : null, aprovacao_status: semSaldo ? 'APROVADA' : null,
    aprovado_por: null, aprovado_por_nome: null, aprovado_em: null, aprovacao_obs: null,
    requisicao_balcao_codigo: i % 4 === 0 && semSaldo ? 'RQB-121026-07' : null, fotos: [], assinatura_retirante: null, assinatura_retirante_em: null,
    criado_por: null, criado_por_nome: null, created_at: `2026-10-${dia}T11:00:00Z`, updated_at: `2026-10-${dia}T11:00:00Z`, excluido_em: null,
  };
}

function dados(saldoLido = true): DadosRelatorioSolExtra {
  const registros = Array.from({ length: 40 }, (_, i) => reg(i + 1));
  const cobertura = saldoLido ? new Map(registros.map((r, i) => [r.id, [i % 2 === 0, false]])) : null;
  const pedido = (pedido: string, remessa: string) => ({
    pedido, item: '00010', ri: null, requisicao: null, data: null, remessa_prevista: remessa, data_migo: null, fornecedor: 'WEG TINTAS LTDA',
    deposito: null, quantidade_pedida: 100, quantidade_fornecida: 0, quantidade_pendente: 100, recebido_mb51: null, ultima_entrada: null, chegada_almox: null,
  });
  return {
    linhas: linhasRelatorio(registros, cobertura),
    pendenciaNf: new Map([
      ['1258015', pendenciaNfDoMaterial({ pedidos: [pedido('4500123456', '2026-11-12'), pedido('4500123999', '2026-11-30')], rms: [], chegadas: [{ pedido: '4500123456', migo_em: null } as never] })],
      ['2000001', pendenciaNfDoMaterial({ pedidos: [], rms: [{ situacao: 'sem_pedido', requisicao: '1000555', item: '10' } as never], chegadas: [] })],
    ]),
    filtro: { de: '2026-10-01', ate: '2026-10-31', tipo: 'todos', status: 'todos' },
    estoqueImportadoEm: saldoLido ? '2026-11-06T10:00:00Z' : null,
    saldoLido,
    geradoPor: 'ANDRÉ',
  };
}

describe('PDF do relatório de solicitações extraordinárias', () => {
  const modos: [ModoRelatorio, AgrupamentoRelatorio][] = [
    ['analitico', 'item'], ['sintetico', 'item'], ['sintetico', 'dia'], ['sintetico', 'semana'], ['sintetico', 'mes'],
  ];

  it.each(modos)('gera %s / %s em várias páginas', async (modo, agrupamento) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pdf = await gerarRelatorioSolExtraPdf(dados(), { modo, agrupamento });
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(pdf.nomeArquivo).toMatch(modo === 'analitico' ? /-analitico-\d{4}-\d{2}-\d{2}\.pdf$/ : new RegExp(`-sintetico-${agrupamento}-`));
    const destino = process.env.RELATORIO_PDF_DIR;
    if (destino) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(`${destino}/${modo}-${agrupamento}.pdf`, pdf.bytes);
    }
  });

  it('sem ZL0024 lida e sem linhas, ainda gera', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const semSaldo = await gerarRelatorioSolExtraPdf(dados(false), { modo: 'analitico', agrupamento: 'item' });
    expect((await PDFDocument.load(semSaldo.bytes)).getPageCount()).toBeGreaterThan(0);
    const vazio = await gerarRelatorioSolExtraPdf({ ...dados(), linhas: [] }, { modo: 'sintetico', agrupamento: 'semana' });
    expect((await PDFDocument.load(vazio.bytes)).getPageCount()).toBe(1);
  });
});
