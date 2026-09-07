/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Utilitário de carga em lote de cotações catalogadas a partir de arquivos CSV/Excel
 * diretamente para as tabelas sup_cotacao_processos, sup_cotacao_propostas e
 * sup_cotacao_proposta_itens do Supabase.
 *
 * Uso:
 *   node scripts/importar_cotacoes_csv.mjs [caminho_do_arquivo.csv]
 */

import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://fwezzgduywgyhxinjurn.supabase.co';
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.service_role || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3ZXp6Z2R1eXdneWh4aW5qdXJuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzI2NDE3NywiZXhwIjoyMDk4ODQwMTc3fQ.JRDHILtVGZUY66YsxS9Vjgyw5_Q1jv1zfLfsoBnWviQ';

const supabase = createClient(supabaseUrl, serviceRoleKey);

const filePath = process.argv[2] || 'C:\\Users\\andre.araujo\\OneDrive - Andrade Gutierrez\\Bases SAP\\Novo\\cotações 2026.csv';

function parseDateBR(val) {
  if (!val) return null;
  val = val.trim();
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    const y = m[3];
    return `${y}-${mo}-${d}`;
  }
  if (val.match(/^\d{4}-\d{2}-\d{2}$/)) return val;
  return null;
}

function parseNumberBR(val) {
  if (!val) return null;
  val = String(val).trim().replace(/[R$\s%]/g, '');
  if (!val) return null;
  if (val.includes(',') && val.includes('.')) {
    val = val.replace(/\./g, '').replace(',', '.');
  } else if (val.includes(',')) {
    val = val.replace(',', '.');
  }
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parsePercentual(val) {
  const n = parseNumberBR(val);
  if (n == null || isNaN(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

function normalizarCnpj(val) {
  if (!val) return null;
  const digitos = String(val).replace(/\D/g, '');
  return digitos.length === 14 ? digitos : null;
}

function normalizarFrete(val) {
  if (!val) return null;
  const upper = String(val).trim().toUpperCase();
  if (upper.includes('FOB')) return 'FOB';
  if (upper.includes('CIF')) return 'CIF';
  return 'OUTRO';
}

function separarCidadeUf(str) {
  if (!str) return { cidade: null, uf: null };
  const partes = str.split('/');
  if (partes.length >= 2) {
    return {
      cidade: partes[0].trim() || null,
      uf: partes[1].trim().slice(0, 2).toUpperCase() || null
    };
  }
  return { cidade: str.trim() || null, uf: null };
}

const unidades = new Set(['UN', 'PC', 'PÇ', 'KG', 'M', 'MT', 'L', 'LT', 'CJ', 'PAR', 'RL', 'GL', 'FD', 'KT', 'ROLO', 'LATA', 'BD']);

async function run() {
  console.log('Iniciando importacao de cotacoes para o Supabase...');
  console.log('Arquivo:', filePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo nao encontrado: ${filePath}`);
  }

  // 1. Obter ou criar o processo COT-2026-CATALOGO
  let processoId = null;
  const { data: procExistente } = await supabase
    .from('sup_cotacao_processos')
    .select('id, numero')
    .eq('numero', 'COT-2026-CATALOGO')
    .maybeSingle();

  if (procExistente) {
    processoId = procExistente.id;
    console.log(`Processo ativo: ${procExistente.numero} (ID: ${processoId})`);
  } else {
    const { data: novoProc, error: errCriaProc } = await supabase
      .from('sup_cotacao_processos')
      .insert({
        numero: 'COT-2026-CATALOGO',
        titulo: 'Base Historica de Cotacoes 2026',
        status: 'concluido',
        observacoes: 'Base importada de cotacoes catalogadas',
        criado_por_nome: 'Importacao Cotacoes 2026'
      })
      .select('id, numero')
      .single();

    if (errCriaProc || !novoProc) {
      throw new Error('Erro ao criar processo: ' + errCriaProc?.message);
    }
    processoId = novoProc.id;
    console.log(`Processo criado: ${novoProc.numero} (ID: ${processoId})`);
  }

  // 2. Buscar propostas existentes para mapear IDs
  const { data: propostasSalvas } = await supabase
    .from('sup_cotacao_propostas')
    .select('id, arquivo_origem, fornecedor_razao_social, numero_proposta')
    .eq('processo_id', processoId);

  const idMap = new Map();
  (propostasSalvas || []).forEach(p => {
    if (p.arquivo_origem) idMap.set(p.arquivo_origem, p.id);
    const altChave = `${p.fornecedor_razao_social}__${p.numero_proposta}`;
    idMap.set(altChave, p.id);
  });

  // 3. Ler e parsear CSV
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  const header = lines[0].split(';').map(c => c.trim().replace(/^"|"$/g, ''));

  const propostasMap = new Map();

  for (let i = 1; i < lines.length; i++) {
    let cols = lines[i].split(';').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 5) continue;

    // Alinhamento inteligente
    if (unidades.has(cols[26]?.toUpperCase()) || /^\d{4}\.\d{2}\.\d{2}$|^\d{8}$/.test(cols[27])) {
      cols.splice(22, 0, '');
    }
    if (cols[33] && cols[33].includes('%') && cols[30] && !isNaN(parseNumberBR(cols[30])) && parseNumberBR(cols[30]) < 1000) {
      cols.splice(30, 0, '');
    }

    const row = {};
    header.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });

    const chave = row.Arquivo_Origem || `${row.Fornecedor_Razao_Social}__${row.Numero_Proposta}`;
    const propostaId = idMap.get(chave) || idMap.get(row.Arquivo_Origem) || crypto.randomUUID();

    if (!propostasMap.has(chave)) {
      const fornCidadeUf = separarCidadeUf(row.Fornecedor_Cidade_UF);
      const cliCidadeUf = separarCidadeUf(row.Cliente_Cidade_UF);
      const cnpjForn = normalizarCnpj(row.Fornecedor_CNPJ);
      const cnpjCli = normalizarCnpj(row.Cliente_CNPJ);
      const dataEmissao = parseDateBR(row.Data_Emissao);
      const validadeData = parseDateBR(row.Validade_Proposta);

      propostasMap.set(chave, {
        id: propostaId,
        processo_id: processoId,
        arquivo_origem: row.Arquivo_Origem || null,
        numero_proposta: row.Numero_Proposta || null,
        data_emissao: dataEmissao,
        validade_data: validadeData,
        validade_texto: row.Validade_Proposta || null,
        fornecedor_razao_social: row.Fornecedor_Razao_Social || null,
        fornecedor_cnpj: cnpjForn,
        fornecedor_inscricao_estadual: row.Fornecedor_Inscricao_Estadual || null,
        fornecedor_cidade: fornCidadeUf.cidade,
        fornecedor_uf: fornCidadeUf.uf,
        fornecedor_telefone: row.Fornecedor_Telefone || null,
        vendedor_nome: row.Vendedor_Nome || null,
        vendedor_email: row.Vendedor_Email || null,
        vendedor_telefone: row.Vendedor_Telefone || null,
        cliente_razao_social: row.Cliente_Razao_Social || null,
        cliente_cnpj: cnpjCli,
        cliente_inscricao_estadual: row.Cliente_Inscricao_Estadual || null,
        cliente_cidade: cliCidadeUf.cidade,
        cliente_uf: cliCidadeUf.uf,
        condicao_pagamento: row.Condicao_Pagamento || null,
        forma_pagamento: row.Forma_Pagamento || null,
        prazo_entrega_texto: row.Prazo_Entrega || null,
        frete_modalidade: normalizarFrete(row.Frete_Modalidade),
        transportadora_indicada: row.Transportadora_Indicada || null,
        faturamento_minimo: parseNumberBR(row.Faturamento_Minimo),
        dados_bancarios_pix: row.Dados_Bancarios_PIX || null,
        valor_total_orcamento: parseNumberBR(row.Valor_Total_Orcamento),
        observacoes_gerais: row.Observacoes_Gerais || null,
        campos_faltantes: [],
        revisado: true,
        fornecedor_match: cnpjForn ? 'cnpj' : 'nao_encontrado',
        criado_por_nome: 'Importacao Cotacoes 2026',
        created_at: dataEmissao ? `${dataEmissao}T12:00:00Z` : new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _itensRaw: []
      });
    }

    const qtd = parseNumberBR(row.Quantidade);
    const pu = parseNumberBR(row.Preco_Unitario);
    const pt = parseNumberBR(row.Preco_Total_Item);
    const icms = parsePercentual(row.Aliquota_ICMS_Pct);
    const pis = parsePercentual(row.Aliquota_PIS_Pct);
    const cofins = parsePercentual(row.Aliquota_COFINS_Pct);

    propostasMap.get(chave)._itensRaw.push({
      item_numero: parseInt(row.Item_Numero, 10) || (propostasMap.get(chave)._itensRaw.length + 1),
      codigo_produto: row.Codigo_Produto || null,
      descricao_produto: row.Descricao_Produto || 'Item sem descricao',
      marca_fabricante: row.Marca_Fabricante || null,
      unidade_medida: row.Unidade_Medida || 'UN',
      ncm: row.NCM ? row.NCM.replace(/\D/g, '') : null,
      cst: row.CST || null,
      cfop: row.CFOP || null,
      quantidade: qtd != null && qtd >= 0 ? qtd : 1,
      preco_unitario: pu != null && pu >= 0 ? pu : 0,
      preco_total_item: pt != null && pt >= 0 ? pt : 0,
      aliquota_icms_pct: icms,
      aliquota_pis_pct: pis,
      aliquota_cofins_pct: cofins,
    });
  }

  const propostasPayload = [];
  const itensPayload = [];

  for (const p of propostasMap.values()) {
    const { _itensRaw, ...propostaData } = p;
    propostasPayload.push(propostaData);

    for (const it of _itensRaw) {
      itensPayload.push({
        id: crypto.randomUUID(),
        proposta_id: propostaData.id,
        item_numero: it.item_numero,
        codigo_produto: it.codigo_produto,
        descricao_produto: it.descricao_produto,
        marca_fabricante: it.marca_fabricante,
        unidade_medida: it.unidade_medida,
        ncm: it.ncm,
        cst: it.cst,
        cfop: it.cfop,
        quantidade: it.quantidade,
        preco_unitario: it.preco_unitario,
        preco_total_item: it.preco_total_item,
        aliquota_icms_pct: it.aliquota_icms_pct,
        aliquota_pis_pct: it.aliquota_pis_pct,
        aliquota_cofins_pct: it.aliquota_cofins_pct,
        aliquota_ipi_pct: null,
        fora_escopo: false,
        vinculo_origem: 'manual',
        campos_faltantes: [],
        created_at: propostaData.created_at
      });
    }
  }

  // 4. Salvar no Supabase
  const LOTE_PROPOSTAS = 50;
  for (let i = 0; i < propostasPayload.length; i += LOTE_PROPOSTAS) {
    const lote = propostasPayload.slice(i, i + LOTE_PROPOSTAS);
    const { error } = await supabase.from('sup_cotacao_propostas').upsert(lote, { onConflict: 'id' });
    if (error) throw error;
  }

  const LOTE_ITENS = 100;
  for (let i = 0; i < itensPayload.length; i += LOTE_ITENS) {
    const lote = itensPayload.slice(i, i + LOTE_ITENS);
    const { error } = await supabase.from('sup_cotacao_proposta_itens').upsert(lote, { onConflict: 'id' });
    if (error) throw error;
  }

  console.log(`Sucesso: ${propostasPayload.length} propostas e ${itensPayload.length} itens gravados.`);
}

run().catch(err => {
  console.error('Falha:', err);
  process.exit(1);
});
