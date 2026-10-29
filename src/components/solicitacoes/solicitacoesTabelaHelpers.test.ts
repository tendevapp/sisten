import { describe, expect, it } from 'vitest';
import {
  calcularPrazoSolicitacao,
  chaveOrdenacaoBasica,
  formatarTempoRelativoAbertura,
  ordenarSolicitacoes,
  proximaOrdenacao,
  obterEstilosCriticidade,
  obterEstilosStatus,
  obterIniciaisNome,
  obterTituloEJustificativa,
} from './solicitacoesTabelaHelpers';
import type { Request } from '../../types';

describe('solicitacoesTabelaHelpers', () => {
  it('obterIniciaisNome extrai as duas letras corretas', () => {
    expect(obterIniciaisNome('Isadora Santos')).toBe('IS');
    expect(obterIniciaisNome('Lucas de Queiróz')).toBe('LQ');
    expect(obterIniciaisNome('Adriano Costa')).toBe('AC');
    expect(obterIniciaisNome('Arthur')).toBe('AR');
    expect(obterIniciaisNome('')).toBe('—');
  });

  it('formatarTempoRelativoAbertura calcula a diferenca relativa corretamente', () => {
    const dataBase = new Date(2026, 8, 9); // 09/09/2026
    expect(formatarTempoRelativoAbertura('2026-09-08', dataBase)).toBe('há 1 dia');
    expect(formatarTempoRelativoAbertura('2026-08-18', dataBase)).toBe('há 22 dias');
    expect(formatarTempoRelativoAbertura('2026-09-09', dataBase)).toBe('hoje');
  });

  it('calcularPrazoSolicitacao identifica prazos futuros e vencidos', () => {
    const dataBase = new Date(2026, 8, 9); // 09/09/2026

    const reqVencida = {
      prazo_conclusao: '2026-09-04',
      criticality: 4,
    } as Request;
    const resVencida = calcularPrazoSolicitacao(reqVencida, dataBase);
    expect(resVencida.textoRelativo).toBe('Vencido');
    expect(resVencida.estaVencido).toBe(true);

    const reqFutura = {
      prazo_conclusao: '2026-09-12',
      criticality: 5,
    } as Request;
    const resFutura = calcularPrazoSolicitacao(reqFutura, dataBase);
    expect(resFutura.textoRelativo).toBe('em 3 dias');
    expect(resFutura.urgente).toBe(true);

    const reqLonge = {
      data_necessidade: '2026-09-16',
      criticality: 1,
    } as Request;
    const resLonge = calcularPrazoSolicitacao(reqLonge, dataBase);
    expect(resLonge.textoRelativo).toBe('em 7 dias');
    expect(resLonge.urgente).toBe(false);
  });

  it('calcularPrazoSolicitacao: encerrada não vence, compara com a data de conclusão', () => {
    const dataBase = new Date(2026, 9, 28); // 28/10/2026
    const prazo = { prazo_conclusao: '2026-10-16', criticality: 3 };

    const noPrazo = calcularPrazoSolicitacao({ ...prazo, status: 'resolvido', resolved_at: '2026-10-15T14:00:00Z' } as Request, dataBase);
    expect(noPrazo.textoRelativo).toBe('Concluída no prazo');
    expect(noPrazo.estaVencido).toBe(false);
    expect(noPrazo.urgente).toBe(false);
    expect(noPrazo.encerrada).toBe(true);

    const atrasada = calcularPrazoSolicitacao({ ...prazo, status: 'fechado', resolved_at: '2026-10-20T14:00:00Z' } as Request, dataBase);
    expect(atrasada.textoRelativo).toBe('Concluída com atraso');
    expect(atrasada.concluidaComAtraso).toBe(true);
    expect(atrasada.estaVencido).toBe(false);

    const cancelada = calcularPrazoSolicitacao({ ...prazo, status: 'cancelada' } as Request, dataBase);
    expect(cancelada.textoRelativo).toBe('');
    expect(cancelada.estaVencido).toBe(false);

    const aberta = calcularPrazoSolicitacao({ ...prazo, status: 'aberto' } as Request, dataBase);
    expect(aberta.textoRelativo).toBe('Vencido');
  });

  it('ordenarSolicitacoes: crescente, decrescente, vazios no fim e empate estável', () => {
    const reqs = [
      { id: 'a', number: '3001113', criticality: 3, created_at: '2026-10-26T10:00:00Z' },
      { id: 'b', number: '3000981', criticality: 5, created_at: '2026-10-27T10:00:00Z' },
      { id: 'c', number: '3001200', criticality: 3, created_at: '' },
    ] as Request[];
    const ids = (l: Request[]) => l.map(r => r.id);
    const chave = (r: Request, c: Parameters<typeof chaveOrdenacaoBasica>[1]) => chaveOrdenacaoBasica(r, c);

    expect(ids(ordenarSolicitacoes(reqs, { coluna: 'numero', direcao: 'asc' }, chave))).toEqual(['b', 'a', 'c']);
    expect(ids(ordenarSolicitacoes(reqs, { coluna: 'criticidade', direcao: 'desc' }, chave))).toEqual(['b', 'a', 'c']);
    expect(ids(ordenarSolicitacoes(reqs, { coluna: 'abertura', direcao: 'desc' }, chave))).toEqual(['b', 'a', 'c']);
    expect(ids(ordenarSolicitacoes(reqs, { coluna: 'abertura', direcao: 'asc' }, chave))).toEqual(['a', 'b', 'c']);
  });

  it('proximaOrdenacao: crescente → decrescente → ordem da fila', () => {
    const a = proximaOrdenacao(null, 'prazo');
    expect(a).toEqual({ coluna: 'prazo', direcao: 'asc' });
    const b = proximaOrdenacao(a, 'prazo');
    expect(b).toEqual({ coluna: 'prazo', direcao: 'desc' });
    expect(proximaOrdenacao(b, 'prazo')).toBeNull();
    expect(proximaOrdenacao(b, 'status')).toEqual({ coluna: 'status', direcao: 'asc' });
  });

  it('obterTituloEJustificativa retorna titulo e subtitulo adequados', () => {
    const reqCompraGen = {
      type: 'compra',
      solicitante_name: 'Lucas de Queiróz',
      justificativa: 'Material urgente para continuidade da...',
    } as Request;
    const resCompraGen = obterTituloEJustificativa(reqCompraGen, [{ is_generic: true } as any]);
    expect(resCompraGen.titulo).toBe('ITEM GENÉRICO');
    expect(resCompraGen.subtitulo).toContain('Material urgente');

    const reqSap = {
      type: 'cadastro_sap',
      registration_type: 'Fornecedor',
      justificativa: 'Inclusão de novo fornecedor no SAP.',
    } as Request;
    const resSap = obterTituloEJustificativa(reqSap);
    expect(resSap.titulo).toBe('Cadastro de fornecedor');

    const reqChamado = {
      type: 'chamado',
      titulo: 'Aditivo Guimarães',
      justificativa: 'ISADORA SILVA DOS SANTOS · Suprimentos',
    } as Request;
    const resChamado = obterTituloEJustificativa(reqChamado);
    expect(resChamado.titulo).toBe('Aditivo Guimarães');
    expect(resChamado.subtitulo).toBe('ISADORA SILVA DOS SANTOS · Suprimentos');
  });

  it('obterEstilosCriticidade mapeia os 5 graus com rotulo', () => {
    expect(obterEstilosCriticidade(5).rotulo).toBe('5 - Impeditiva');
    expect(obterEstilosCriticidade(4).rotulo).toBe('4 - Crítica');
    expect(obterEstilosCriticidade(3).rotulo).toBe('3 - Alta');
    expect(obterEstilosCriticidade(2).rotulo).toBe('2 - Média');
    expect(obterEstilosCriticidade(1).rotulo).toBe('1 - Baixa');
  });

  it('obterEstilosStatus mapeia status para rotulos', () => {
    expect(obterEstilosStatus('aberto', 'chamado').rotulo).toBe('Aberta');
    expect(obterEstilosStatus('em_atendimento', 'chamado').rotulo).toBe('Em análise');
    expect(obterEstilosStatus('pendente', 'compra').rotulo).toBe('Aguardando aprovação');
  });

  it('obterEstilosStatus distingue compra aprovada sem e com RM vinculada', () => {
    expect(obterEstilosStatus('aprovada', 'compra').rotulo).toBe('Aguardando RM');
    expect(obterEstilosStatus('aprovada', 'compra', false).rotulo).toBe('Aguardando RM');
    expect(obterEstilosStatus('aprovada', 'compra', true).rotulo).toBe('RM Aberta');
    // A distinção é só para compra: cadastro SAP aprovado segue "Resolvida".
    expect(obterEstilosStatus('aprovada', 'cadastro_sap').rotulo).toBe('Resolvida');
  });

  it('obterEstilosStatus exibe Aprovada para compra de servico em vez de Aguardando RM', () => {
    expect(obterEstilosStatus('aprovada', 'compra', false, 'Serviço').rotulo).toBe('Aprovada');
    expect(obterEstilosStatus('aprovada', 'compra', false, 'servico').rotulo).toBe('Aprovada');
    expect(obterEstilosStatus('aprovada', 'compra', false, 'Direta').rotulo).toBe('Aguardando RM');
  });
});
