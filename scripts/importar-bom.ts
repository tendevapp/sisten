/**
 * Valida e importa uma revisão completa da BOM do projeto GW_JACOBINA.
 *
 * Uso:
 *   npx tsx scripts/importar-bom.ts <arquivo.xlsx> --dry-run
 *   npx tsx scripts/importar-bom.ts <arquivo.xlsx> --execute
 *
 * A execução exige a migration `versionar_e_importar_bom_revisada` aplicada.
 * O SHA-256 torna a carga idempotente e a troca da revisão ativa acontece em
 * uma única transação no banco, sem apagar as revisões históricas.
 */
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const PROJETO = 'GW_JACOBINA';
const COLUNAS = [
  'Level',
  'Section',
  'Group',
  'Find Number',
  'Item',
  'Código Equivalente QINGDAO',
  'Revision',
  'Description',
  'Quantity',
  'Each Weight (kg)',
  'Total weight (kg)',
  'UOM',
  'Source',
  'Delivery at',
  'KIT ATLANTA',
] as const;

type LinhaBom = {
  linha_origem: number;
  level: number;
  section: string | null;
  group: string | null;
  find_number: string | null;
  part_number: string | null;
  codigo_equivalente_qingdao: string | null;
  revision: string | null;
  description: string;
  quantity: number | null;
  each_weight_kg: number | null;
  total_weight_kg: number | null;
  uom: string | null;
  source: string | null;
  delivery_at: string | null;
  kit_atlanta: string | null;
  ajuste_colunas_deslocadas: boolean;
};

function texto(valor: unknown): string | null {
  if (valor == null) return null;
  const resultado = String(valor).trim();
  return resultado || null;
}

function numero(valor: unknown, coluna: string, linha: number): number | null {
  if (valor == null || texto(valor) == null) return null;
  const resultado = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(resultado)) {
    throw new Error(`Linha ${linha}: valor inválido em ${coluna}: ${String(valor)}`);
  }
  return resultado;
}

function normalizarPartNumber(valor: string | null): string {
  return (valor || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Nas linhas 1319–1358 do arquivo revisado, os valores a partir de UOM vieram
 * uma célula à esquerda: Total weight="each", UOM="Qindao" e Source="Atlanta".
 * A assinatura abaixo é inequívoca (peso total textual + Delivery vazio) e
 * permite reposicionar os três campos sem inferir conteúdo novo.
 */
function corrigirColunasDeslocadas(linha: unknown[]): {
  totalWeight: unknown;
  uom: unknown;
  source: unknown;
  deliveryAt: unknown;
  ajustada: boolean;
} {
  const totalWeight = texto(linha[10]);
  const uom = texto(linha[11]);
  const source = texto(linha[12]);
  const deliveryAt = texto(linha[13]);
  const unidadeNoPeso = totalWeight?.toLowerCase() === 'each';

  if (unidadeNoPeso && uom && source && !deliveryAt) {
    return {
      totalWeight: null,
      uom: totalWeight,
      source: uom,
      deliveryAt: source,
      ajustada: true,
    };
  }
  return { totalWeight: linha[10], uom: linha[11], source: linha[12], deliveryAt: linha[13], ajustada: false };
}

function lerBom(bytes: Uint8Array): { linhas: LinhaBom[]; aba: string } {
  const workbook = XLSX.read(bytes, { type: 'array', raw: true, cellDates: false });
  const aba = workbook.SheetNames[0];
  if (!aba) throw new Error('A planilha não possui uma aba para importar.');

  const linhasPlanilha = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[aba], {
    header: 1,
    raw: true,
    defval: null,
  });
  const cabecalho = (linhasPlanilha[0] || []).slice(0, COLUNAS.length).map(texto);
  if (JSON.stringify(cabecalho) !== JSON.stringify([...COLUNAS])) {
    throw new Error(`Cabeçalho inesperado. Esperado: ${COLUNAS.join(' | ')}`);
  }

  const linhas = linhasPlanilha.slice(1).flatMap((linha, indice): LinhaBom[] => {
    const linhaOrigem = indice + 2;
    if (!linha.some(celula => texto(celula) != null)) return [];

    const level = numero(linha[0], 'Level', linhaOrigem);
    const description = texto(linha[7]);
    if (!Number.isInteger(level) || level! < 1 || level! > 6) {
      throw new Error(`Linha ${linhaOrigem}: Level deve ser um inteiro entre 1 e 6.`);
    }
    if (!description) throw new Error(`Linha ${linhaOrigem}: Description é obrigatória.`);

    const corrigida = corrigirColunasDeslocadas(linha);
    return [{
      linha_origem: linhaOrigem,
      level: level!,
      section: texto(linha[1]),
      group: texto(linha[2]),
      find_number: texto(linha[3]),
      part_number: texto(linha[4]),
      codigo_equivalente_qingdao: texto(linha[5]),
      revision: texto(linha[6]),
      description,
      quantity: numero(linha[8], 'Quantity', linhaOrigem),
      each_weight_kg: numero(linha[9], 'Each Weight (kg)', linhaOrigem),
      total_weight_kg: numero(corrigida.totalWeight, 'Total weight (kg)', linhaOrigem),
      uom: texto(corrigida.uom),
      source: texto(corrigida.source),
      delivery_at: texto(corrigida.deliveryAt),
      kit_atlanta: texto(linha[14]),
      ajuste_colunas_deslocadas: corrigida.ajustada,
    }];
  });

  if (!linhas.length) throw new Error('A planilha não contém linhas de BOM.');
  if (linhas[0].level !== 1) throw new Error('A primeira linha da BOM deve começar no Level 1.');
  for (let indice = 1; indice < linhas.length; indice += 1) {
    if (linhas[indice].level > linhas[indice - 1].level + 1) {
      throw new Error(
        `Linha ${linhas[indice].linha_origem}: salto de Level ${linhas[indice - 1].level} para ${linhas[indice].level}.`,
      );
    }
  }
  return { linhas, aba };
}

function valorEnv(conteudo: string, chave: string): string | null {
  return conteudo.match(new RegExp(`^${chave}=(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') || null;
}

function resumir(linhas: LinhaBom[]) {
  const folhas = linhas.filter((linha, indice) => !linhas[indice + 1] || linhas[indice + 1].level <= linha.level);
  const partNumbers = new Set(linhas.map(linha => normalizarPartNumber(linha.part_number)).filter(Boolean));
  return {
    linhas: linhas.length,
    folhas: folhas.length,
    raizes: linhas.filter(linha => linha.level === 1).length,
    partNumbersDistintos: partNumbers.size,
    itensSemPartNumber: linhas.filter(linha => !linha.part_number).length,
    folhasSemPartNumber: folhas.filter(linha => !linha.part_number).length,
    linhasSemQuantidade: linhas.filter(linha => linha.quantity == null).length,
    linhasComColunasReposicionadas: linhas.filter(linha => linha.ajuste_colunas_deslocadas).length,
  };
}

async function main() {
  const [arquivo, modo] = process.argv.slice(2);
  if (!arquivo || !['--dry-run', '--execute'].includes(modo || '')) {
    throw new Error('Uso: npx tsx scripts/importar-bom.ts <arquivo.xlsx> --dry-run|--execute');
  }

  const bytes = await readFile(arquivo);
  const { linhas, aba } = lerBom(bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const resumo = {
    projeto: PROJETO,
    arquivo: basename(arquivo),
    aba,
    sha256,
    ...resumir(linhas),
  };
  console.log(JSON.stringify(resumo));
  if (modo === '--dry-run') return;

  const env = await readFile('.env', 'utf8');
  const url = valorEnv(env, 'VITE_SUPABASE_URL');
  const chaveServico = valorEnv(env, 'service_role') || valorEnv(env, 'VITE_SUPABASE_SERVICE_ROLE_KEY');
  if (!url?.includes('fwezzgduywgyhxinjurn.supabase.co') || !chaveServico) {
    throw new Error('A configuração local não aponta para o projeto supabase-sisten ou não possui service role.');
  }

  const supabase = createClient(url, chaveServico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc('proj_substituir_bom' as never, {
    p_projeto: PROJETO,
    p_arquivo_nome: basename(arquivo),
    p_arquivo_sha256: sha256,
    p_linhas: linhas,
  } as never);
  if (error) throw error;

  const [{ count: linhasAtivas, error: erroLinhas }, { count: folhasAtivas, error: erroFolhas }, { data: revisoes, error: erroRevisoes }] = await Promise.all([
    supabase.from('vw_proj_bom_arvore').select('id', { count: 'exact', head: true }).eq('projeto', PROJETO),
    supabase.from('vw_proj_bom_arvore').select('id', { count: 'exact', head: true }).eq('projeto', PROJETO).eq('folha', true),
    supabase.from('proj_bom_importacoes').select('id,arquivo_sha256,total_linhas,ativa,resumo').eq('projeto', PROJETO).eq('ativa', true),
  ]);
  if (erroLinhas) throw erroLinhas;
  if (erroFolhas) throw erroFolhas;
  if (erroRevisoes) throw erroRevisoes;
  if (linhasAtivas !== resumo.linhas || folhasAtivas !== resumo.folhas || revisoes?.length !== 1) {
    throw new Error(
      `Conferência falhou: linhas=${linhasAtivas}/${resumo.linhas}, folhas=${folhasAtivas}/${resumo.folhas}, revisões ativas=${revisoes?.length}.`,
    );
  }

  console.log(JSON.stringify({ resultado: data, linhasAtivas, folhasAtivas, revisaoAtiva: revisoes[0] }));
}

main().catch(erro => {
  if (erro && typeof erro === 'object' && 'message' in erro) console.error(String(erro.message));
  else console.error(erro);
  process.exitCode = 1;
});
