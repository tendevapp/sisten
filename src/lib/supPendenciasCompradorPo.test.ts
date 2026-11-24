import { describe, it, expect } from 'vitest';
import {
  aplicarCompradoresDoPo,
  assuntoEmailChamadosPendencia,
  camposExibicao,
  justificativaPendenciaDocumento,
  montarCorpoEmailChamadosPendencia,
  parseColagemPlanilha,
  resumoValores,
  type CompradorDoPo,
} from './supPendenciasProcessamento';

const CAB = 'STATUS\tNúmero de documento de nove posições\tData da Emissão\tSéries\tUF emissor\tChegou ?\tNome do Fornecedor\tDocumento de compras\tOBSERVAÇÕES\tCOMPRADOR\tDATA ENVIO';
const COLAGEM = [
  CAB,
  'ERRO / AÇÃO NECESSARIA\t000014252\t27/07/2026\t001\tBA\tSIM\tJacobina Ltda\t4100477772\tCONVERSÃO\tCENTRAL FISCAL\t11/08/2026',
  'ERRO / AÇÃO NECESSARIA\t000005682\t28/07/2026\t001\tBA\tSIM\tOutro Ltda\tSN\tSEM PEDIDO\tISADORA\t11/08/2026',
].join('\n');

const mapa = new Map<string, CompradorDoPo>([
  ['4100477772', { grupo: '610', comprador_id: 'u-giulia', comprador_nome: 'GIULIA VIEIRA DE AQUINO' }],
]);

describe('comprador do PO', () => {
  const { linhas } = parseColagemPlanilha(COLAGEM);
  const comComprador = aplicarCompradoresDoPo(linhas, mapa);

  it('troca o comprador da planilha pelo de quem colocou o PO e guarda o original', () => {
    expect(comComprador[0]).toMatchObject({
      comprador: 'GIULIA VIEIRA DE AQUINO', comprador_id: 'u-giulia', comprador_grupo: '610', comprador_planilha: 'CENTRAL FISCAL',
    });
    expect(resumoValores(comComprador[0])[4]).toBe('GIULIA VIEIRA DE AQUINO (610)');
    const campos = camposExibicao(comComprador[0]);
    expect(campos.find(c => c.label === 'Comprador')?.value).toBe('GIULIA VIEIRA DE AQUINO (610)');
    expect(campos.find(c => c.label === 'Comprador na planilha')?.value).toBe('CENTRAL FISCAL');
  });

  it('PO fora da ZL0132 mantém o nome da planilha, sem vínculo', () => {
    expect(comComprador[1]).toMatchObject({ comprador: 'ISADORA', comprador_planilha: 'ISADORA' });
    expect(comComprador[1].comprador_id).toBeUndefined();
    expect(camposExibicao(comComprador[1]).some(c => c.label === 'Comprador na planilha')).toBe(false);
  });

  it('texto do chamado de um documento', () => {
    expect(justificativaPendenciaDocumento('SUP-241126-03', comComprador[0])).toBe(
      'Documento 000014252 · Jacobina Ltda · PO 4100477772 · comprador GIULIA VIEIRA DE AQUINO (610) — pendente de processamento (protocolo SUP-241126-03).',
    );
  });

  it('um e-mail com um bloco por chamado', () => {
    const chamados = comComprador.map((linha, i) => ({
      protocolo: `SUP-241126-0${i + 3}`, numeroChamado: `10${i}`, linkChamado: `https://x/#/solicitacoes?id=r${i}`, linha,
    }));
    expect(assuntoEmailChamadosPendencia(chamados)).toBe('[SUP-241126-03 a SUP-241126-04] - Pendências de Processamento (2 chamados)');
    expect(assuntoEmailChamadosPendencia(chamados.slice(0, 1))).toBe('[SUP-241126-03] - Pendência de Processamento - Documento 000014252 · PO 4100477772');
    const corpo = montarCorpoEmailChamadosPendencia({ solicitante: 'Fulano', chamados });
    expect(corpo).toContain('2 chamados abertos no SISTEN, um por documento.');
    expect(corpo).toContain('1. [SUP-241126-03] Chamado #100 — Documento 000014252');
    expect(corpo).toContain('2. [SUP-241126-04] Chamado #101 — Documento 000005682');
    expect(corpo).toContain('vinculado ao comprador que colocou o PO');
  });
});
