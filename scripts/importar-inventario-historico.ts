/**
 * Importa o histórico de inventário cíclico preservando cada linha da base.
 *
 * Uso:
 *   npx tsx scripts/importar-inventario-historico.ts <arquivo.xlsx> --dry-run
 *   npx tsx scripts/importar-inventario-historico.ts <arquivo.xlsx> --execute
 *
 * Requer que a migration `alm_inventario_historico_importacao` já esteja
 * aplicada. O lote é identificado pelo SHA-256 do arquivo, portanto uma
 * segunda execução do mesmo arquivo é bloqueada antes de gravar duplicados.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const COLUNAS = [
  'Data', 'Material', 'Descrição', 'Depósito', 'Endereço SAP', 'Qtde Física',
  'Endereço Encontrado', 'Data Validade', 'Stock UL (Dep)', 'Diferença',
  'Status', 'Valor Divergente', 'Nº Contagem',
] as const;

type LinhaHistorica = {
  linha: number;
  data: string;
  material: string;
  descricao: string | null;
  deposito: string;
  quantidade: number | null;
  saldo: number | null;
  diferenca: number | null;
  divergente: boolean;
  enderecoEncontrado: string | null;
  validade: string | null;
  dadosOrigem: Record<string, unknown>;
};

function texto(valor: unknown): string | null {
  if (valor == null) return null;
  const resultado = String(valor).trim();
  return resultado || null;
}

function numero(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const resultado = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  return Number.isFinite(resultado) ? resultado : null;
}

function dataExcel(valor: unknown): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.valueOf())) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'number') {
    const partes = XLSX.SSF.parse_date_code(valor);
    if (partes) return `${partes.y}-${String(partes.m).padStart(2, '0')}-${String(partes.d).padStart(2, '0')}`;
  }
  const textoData = texto(valor);
  if (!textoData) return null;
  const iso = textoData.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const br = textoData.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

function validadeExcel(valor: unknown): string | null {
  const iso = dataExcel(valor);
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function dataHora(data: string): string {
  return `${data}T12:00:00.000Z`;
}

function lerLinhas(bytes: Uint8Array): LinhaHistorica[] {
  const workbook = XLSX.read(bytes, { type: 'array', raw: true, cellDates: true });
  const primeiraAba = workbook.SheetNames[0];
  if (!primeiraAba) throw new Error('A planilha não possui uma aba para importar.');
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[primeiraAba], { header: 1, raw: true, defval: null });
  const cabecalho = linhas[0]?.map(celula => texto(celula));
  if (JSON.stringify(cabecalho) !== JSON.stringify([...COLUNAS])) {
    throw new Error(`Cabeçalho inesperado. Esperado: ${COLUNAS.join(' | ')}`);
  }

  return linhas.slice(1).flatMap((linha, indice) => {
    if (!linha.some(celula => celula != null && String(celula).trim() !== '')) return [];
    const data = dataExcel(linha[0]);
    const material = texto(linha[1]);
    if (!data || !material) throw new Error(`Linha ${indice + 2}: data ou material ausente.`);
    const depositoOrigem = texto(linha[3]);
    const statusOrigem = texto(linha[10]) || '';
    const dadosOrigem = Object.fromEntries(COLUNAS.map((coluna, posicao) => [coluna, linha[posicao] instanceof Date
      ? linha[posicao].toISOString().slice(0, 10)
      : linha[posicao]]));
    return [{
      linha: indice + 2,
      data,
      material,
      descricao: texto(linha[2]),
      // A única linha sem depósito é preservada em dados_origem; 0000 é o
      // marcador operacional para que a evidência continue visível no SISTEN.
      deposito: (depositoOrigem || '0000').padStart(4, '0'),
      quantidade: numero(linha[5]),
      saldo: numero(linha[8]),
      diferenca: numero(linha[9]),
      divergente: statusOrigem.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'divergencia',
      enderecoEncontrado: texto(linha[6]),
      validade: validadeExcel(linha[7]),
      dadosOrigem,
    }];
  });
}

function valorEnv(conteudo: string, chave: string): string | null {
  return conteudo.match(new RegExp(`^${chave}=(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') || null;
}

function proximoCodigo(data: string, codigos: string[]): string {
  const parteData = data.slice(8, 10) + data.slice(5, 7) + data.slice(2, 4);
  const prefixo = `INV-${parteData}-`;
  const maior = codigos
    .filter(codigo => codigo.startsWith(prefixo))
    .map(codigo => Number(codigo.slice(prefixo.length)))
    .filter(numeroCodigo => Number.isInteger(numeroCodigo) && numeroCodigo >= 0)
    .reduce((acumulado, numeroCodigo) => Math.max(acumulado, numeroCodigo), 0);
  return `${prefixo}${String(maior + 1).padStart(2, '0')}`;
}

async function main() {
  const [arquivo, modo] = process.argv.slice(2);
  if (!arquivo || !['--dry-run', '--execute'].includes(modo || '')) {
    throw new Error('Uso: npx tsx scripts/importar-inventario-historico.ts <arquivo.xlsx> --dry-run|--execute');
  }

  const [bytes, env] = await Promise.all([readFile(arquivo), readFile('.env', 'utf8')]);
  const linhas = lerLinhas(bytes);
  const lote = `base-inventario-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`;
  const porData = Map.groupBy(linhas, linha => linha.data);
  const resumo = {
    lote,
    inventarios: porData.size,
    linhas: linhas.length,
    divergencias: linhas.filter(linha => linha.divergente).length,
    qtdFisicaAusente: linhas.filter(linha => linha.quantidade == null).length,
    depositoAusente: linhas.filter(linha => linha.deposito === '0000').length,
  };
  console.log(JSON.stringify(resumo));
  if (modo === '--dry-run') return;

  const url = valorEnv(env, 'VITE_SUPABASE_URL');
  // O checkout usa `service_role` para scripts internos. A variável com
  // prefixo VITE é aceita apenas por compatibilidade, nunca pelo navegador.
  const chaveServico = valorEnv(env, 'service_role') || valorEnv(env, 'VITE_SUPABASE_SERVICE_ROLE_KEY');
  if (!url?.includes('fwezzgduywgyhxinjurn.supabase.co') || !chaveServico) {
    throw new Error('A configuração local não aponta para o projeto Supabase do SISTEN ou não possui service role.');
  }
  const supabase = createClient(url, chaveServico, { auth: { persistSession: false, autoRefreshToken: false } });
  const { count: jaImportadas, error: erroLote } = await supabase
    .from('alm_inventarios')
    .select('id', { count: 'exact', head: true })
    .eq('lote_importacao', lote);
  if (erroLote) throw erroLote;
  if ((jaImportadas || 0) > 0) throw new Error(`O lote ${lote} já foi importado (${jaImportadas} inventário(s)).`);

  const datas = [...porData.keys()].sort();
  const { data: existentes, error: erroExistentes } = await supabase
    .from('alm_inventarios')
    .select('codigo,data')
    .in('data', datas);
  if (erroExistentes) throw erroExistentes;
  const codigosPorData = new Map<string, string[]>();
  for (const existente of existentes || []) {
    const codigos = codigosPorData.get(existente.data) || [];
    codigos.push(existente.codigo);
    codigosPorData.set(existente.data, codigos);
  }
  const cabecalhos = datas.map(data => {
    const codigos = codigosPorData.get(data) || [];
    const codigo = proximoCodigo(data, codigos);
    codigos.push(codigo);
    return {
      codigo,
      data,
      criterio: 'Histórico importado',
      observacao: `Histórico importado da planilha base inventário.xlsx. Lote ${lote}.`,
      status: 'concluido',
      concluido_em: dataHora(data),
      criado_por_nome: 'IMPORTAÇÃO HISTÓRICA',
      origem: 'importacao_historica',
      lote_importacao: lote,
      created_at: dataHora(data),
      updated_at: dataHora(data),
    };
  });
  const { data: inventarios, error: erroInventarios } = await supabase
    .from('alm_inventarios')
    .insert(cabecalhos)
    .select('id,data');
  if (erroInventarios) throw erroInventarios;
  const idPorData = new Map((inventarios || []).map(inventario => [inventario.data, inventario.id]));
  if (idPorData.size !== datas.length) throw new Error('A inserção dos cabeçalhos retornou menos inventários que o esperado.');

  const itens = linhas.map((linha, indice) => ({
    inventario_id: idPorData.get(linha.data),
    ordem: indice + 1,
    material: linha.material,
    descricao: linha.descricao,
    deposito: linha.deposito,
    status: linha.divergente ? 'divergente' : 'conferido',
    saldo_sistema: linha.saldo ?? 0,
    qtd_final: linha.quantidade ?? 0,
    diferenca: linha.diferenca ?? ((linha.quantidade ?? 0) - (linha.saldo ?? 0)),
    alerta: linha.divergente ? 'Divergência registrada no histórico importado.' : null,
    encerrado_em: dataHora(linha.data),
    encerrado_por: 'IMPORTAÇÃO HISTÓRICA',
    created_at: dataHora(linha.data),
    origem_linha: linha.linha,
    dados_origem: linha.dadosOrigem,
  }));
  const idItemPorLinha = new Map<number, string>();
  for (let inicio = 0; inicio < itens.length; inicio += 200) {
    const { data: inseridos, error } = await supabase
      .from('alm_inventario_itens')
      .insert(itens.slice(inicio, inicio + 200))
      .select('id,origem_linha');
    if (error) throw error;
    for (const item of inseridos || []) idItemPorLinha.set(item.origem_linha, item.id);
  }
  if (idItemPorLinha.size !== linhas.length) throw new Error('A inserção dos itens retornou menos linhas que o esperado.');

  const contagens = linhas.map(linha => ({
    item_id: idItemPorLinha.get(linha.linha),
    numero: 1,
    quantidade: linha.quantidade ?? 0,
    divergente: linha.divergente,
    saldo_ref: linha.saldo ?? 0,
    endereco_encontrado: linha.enderecoEncontrado,
    validade: linha.validade,
    observacao: 'Importado da base inventário.xlsx.',
    contado_por_nome: 'IMPORTAÇÃO HISTÓRICA',
    created_at: dataHora(linha.data),
  }));
  for (let inicio = 0; inicio < contagens.length; inicio += 200) {
    const { error } = await supabase.from('alm_inventario_contagens').insert(contagens.slice(inicio, inicio + 200));
    if (error) throw error;
  }

  const { data: conferência, error: erroConferencia } = await supabase
    .from('alm_inventarios')
    .select('id,itens:alm_inventario_itens(id,contagens:alm_inventario_contagens(id))')
    .eq('lote_importacao', lote);
  if (erroConferencia) throw erroConferencia;
  const itensImportados = (conferência || []).reduce((total, inventario: any) => total + (inventario.itens?.length || 0), 0);
  const contagensImportadas = (conferência || []).reduce((total, inventario: any) => total
    + (inventario.itens || []).reduce((subtotal: number, item: any) => subtotal + (item.contagens?.length || 0), 0), 0);
  if (conferência?.length !== datas.length || itensImportados !== linhas.length || contagensImportadas !== linhas.length) {
    throw new Error(`Conferência falhou: inventários=${conferência?.length}, itens=${itensImportados}, contagens=${contagensImportadas}.`);
  }
  console.log(JSON.stringify({ ...resumo, itensImportados, contagensImportadas }));
}

main().catch(erro => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
