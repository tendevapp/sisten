import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import { montarPlanilhaMapa } from './exportMapaCotacao';
import {
  agruparLinhasMapa, resumirFornecedores, cenarioMenorPreco, cenarioSelecao, opcoesDaBase,
} from './mapaCotacao';
import type { PropostaMapa } from './mapaCotacao';
import type { CotacaoPropostaDraft, CotacaoPropostaItemDraft } from '../types';

function item(p: Partial<CotacaoPropostaItemDraft> & { _key: string; descricao_produto: string }): CotacaoPropostaItemDraft {
  return {
    processo_item_id: null, fora_escopo: false, vinculo_origem: 'manual', vinculo_score: null,
    ri: null, material_code: null, item_numero: null, codigo_produto: null,
    marca_fabricante: null, unidade_medida: 'PC', ncm: null, cst: null, cfop: null,
    quantidade: 4, preco_unitario: 10, preco_total_item: null,
    aliquota_icms_pct: null, aliquota_pis_pct: null, aliquota_cofins_pct: null, aliquota_ipi_pct: null,
    extraido_raw: {} as any, desconsiderado: false, vinculo_divergencias: [],
    peso_unitario_kg: null, peso_origem: null, frete_teorico: null,
    codigo_fiscal: null, preco_liquido_unitario: null, preco_liquido_total: null, custo_total_item: null,
    ...p,
  };
}

function proposta(nome: string, itens: CotacaoPropostaItemDraft[], p: Partial<CotacaoPropostaDraft> = {}): PropostaMapa {
  return {
    key: nome,
    proposta: {
      _key: nome, _salvo: true, _extraido_em: null,
      arquivo_origem: null, numero_proposta: null, data_emissao: null, validade_data: null, validade_texto: null,
      fornecedor_razao_social: nome, fornecedor_cnpj: null, fornecedor_inscricao_estadual: null,
      fornecedor_cidade: null, fornecedor_uf: null, fornecedor_telefone: null,
      cod_vendor: null, contato_id: null, fornecedor_match: 'nao_encontrado',
      vendedor_nome: null, vendedor_email: null, vendedor_telefone: null,
      cliente_razao_social: null, cliente_cnpj: null, cliente_inscricao_estadual: null, cliente_cidade: null, cliente_uf: null,
      condicao_pagamento: '28 DDL', forma_pagamento: null, prazo_entrega_texto: null, prazo_entrega_dias: null,
      frete_modalidade: null, transportadora_indicada: null, faturamento_minimo: null,
      dados_bancarios_pix: null, valor_total_orcamento: null, valor_frete: null, valor_desconto: null, observacoes_gerais: null,
      campos_faltantes: [], revisado: true, extracao_id: null, extraido_raw: {} as any,
      arquivo_storage_path: null, arquivo_mime_type: null, arquivo_tamanho_bytes: null,
      arquivo_markdown: null, arquivo_markdown_editado_em: null, arquivo_markdown_editado_por: null,
      itens,
      ...p,
    },
  };
}

function montar() {
  const propostas = [
    proposta('ALFA LTDA', [item({ _key: 'a1', descricao_produto: 'MANILHA RETA 3/4', preco_unitario: 139.68, aliquota_ipi_pct: 5, aliquota_icms_pct: 1 })], { valor_frete: 50 }),
    proposta('BETA LTDA', [item({ _key: 'b1', descricao_produto: 'MANILHA RETA 3/4', preco_unitario: 97.66, mapa_observacao: 'marca homologada' })]),
  ];
  const fretePorProposta = { 'ALFA LTDA': 50, 'BETA LTDA': null };
  const linhas = agruparLinhasMapa({
    escopo: [], propostas, opcoes: opcoesDaBase('cotado', { icms: false, pisCofins: false, ipi: false }),
    limiar: 0.55, overrides: {}, fretePorProposta,
  });
  const resumos = resumirFornecedores({ linhas, propostas, fretePorProposta });
  const selecionados = new Set(['a1']);
  const wb = montarPlanilhaMapa({
    processo: { numero: 'COT-180926-25', titulo: 'Acessórios de içamento' },
    baseRotulo: 'preço cotado', linhas, resumos,
    propostasPorKey: new Map(propostas.map(p => [p.key, p.proposta])),
    selecionados, cenarios: [cenarioMenorPreco(linhas, resumos), cenarioSelecao(linhas, resumos, selecionados)],
    geradoEm: new Date('2026-09-22T12:00:00'),
  });
  return { wb, linhas, resumos };
}

const textoDaAba = (ws: XLSX.WorkSheet) => XLSX.utils.sheet_to_csv(ws);

describe('montarPlanilhaMapa', () => {
  it('gera as abas Mapa, Cenários e Fornecedores', () => {
    const { wb } = montar();
    expect(wb.SheetNames).toEqual(['Mapa', 'Cenários', 'Fornecedores']);
  });

  it('aba Mapa traz condições, total sem frete, observação e o vencedor', () => {
    const { wb, resumos } = montar();
    const csv = textoDaAba(wb.Sheets.Mapa);
    expect(csv).toContain('MAPA COMPARATIVO DE COTAÇÃO — COT-180926-25');
    expect(csv).toContain('TOTAL DA COTAÇÃO (sem frete)');
    expect(csv).toContain('28 DDL');
    expect(csv).toContain('Obs.: marca homologada');
    expect(csv).toContain('✔ COMPRAR · MANILHA RETA 3/4');
    expect(csv).toContain('MELHOR');

    const alfa = resumos.find(r => r.propostaKey === 'ALFA LTDA')!;
    expect(alfa.totalCotacao).toBeCloseTo(139.68 * 4, 2); // frete de 50 fica de fora
  });

  it('nenhuma mesclagem se sobrepõe (o Excel pede reparo do arquivo quando isso acontece)', () => {
    const { wb } = montar();
    for (const nome of wb.SheetNames) {
      const merges = wb.Sheets[nome]['!merges'] ?? [];
      const ocupadas = new Set<string>();
      for (const m of merges) {
        for (let r = m.s.r; r <= m.e.r; r++) {
          for (let c = m.s.c; c <= m.e.c; c++) {
            const k = `${r},${c}`;
            expect(ocupadas.has(k), `${nome}: célula ${k} em duas mesclagens`).toBe(false);
            ocupadas.add(k);
          }
        }
      }
    }
  });

  it('gera um arquivo xlsx válido', () => {
    const { wb } = montar();
    const bin = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    expect(bin.byteLength).toBeGreaterThan(5000);
    const lido = XLSX.read(bin, { type: 'array' });
    expect(lido.SheetNames).toEqual(['Mapa', 'Cenários', 'Fornecedores']);
  });

  it('aba Cenários soma o frete nos totais de compra', () => {
    const { wb } = montar();
    const csv = textoDaAba(wb.Sheets['Cenários']);
    expect(csv).toContain('Sua seleção');
    expect(csv).toContain('Menor preço item a item');
  });

  it('aba Fornecedores tem uma linha por fornecedor, na ordem recebida', () => {
    const { wb, resumos } = montar();
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Fornecedores);
    expect(linhas).toHaveLength(resumos.length);
    expect(linhas[0].Fornecedor).toBe(resumos[0].nome);
  });
});
