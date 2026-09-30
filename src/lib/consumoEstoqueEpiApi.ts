import { supabase } from '../db/supabaseClient';
import {
  DEPOSITO_EPI,
  TMV_SAIDA_ESTOQUE,
  ehEstornoConsumo,
  normalizarFinalidade,
  type SaidaEstoque,
  type SaldoEstoque,
} from './consumoEstoqueEpi';

const TAMANHO_LOTE = 1000;

const numero = (valor: unknown): number => {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
};

const texto = (valor: unknown): string | null => {
  if (valor === null || valor === undefined) return null;
  const limpo = String(valor).trim();
  return limpo ? limpo : null;
};

export function normalizarSaidaEstoque(linha: Record<string, unknown>): SaidaEstoque {
  const tipo = String(linha.tipo_movimento ?? '').trim();
  return {
    id: String(linha.id),
    material: String(linha.material ?? '').trim(),
    descricao: texto(linha.texto_breve_material),
    data: String(linha.data_lancamento ?? '').slice(0, 10),
    tipo,
    quantidade: numero(linha.qtd_um_registro),
    valor: numero(linha.montante_mi),
    documento: texto(linha.doc_material),
    finalidade: normalizarFinalidade(texto(linha.texto_cabecalho_doc)),
    pep: texto(linha.elemento_pep),
    usuario: texto(linha.nome_usuario),
    estorno: ehEstornoConsumo(tipo),
  };
}

/** Baixas de consumo (e estornos) do depósito 0002, da MB51. */
export async function listarSaidasEstoqueEpi(): Promise<SaidaEstoque[]> {
  const saidas: SaidaEstoque[] = [];
  for (let inicio = 0; ; inicio += TAMANHO_LOTE) {
    const { data, error } = await (supabase as any)
      .from('sap_mb51_mov')
      .select('id, material, texto_breve_material, data_lancamento, tipo_movimento, qtd_um_registro, montante_mi, doc_material, texto_cabecalho_doc, elemento_pep, nome_usuario')
      .eq('deposito', DEPOSITO_EPI)
      .in('tipo_movimento', TMV_SAIDA_ESTOQUE)
      .not('material', 'is', null)
      .not('data_lancamento', 'is', null)
      .order('data_lancamento')
      .order('id')
      .range(inicio, inicio + TAMANHO_LOTE - 1);
    if (error) throw error;
    const lote = (data ?? []) as Record<string, unknown>[];
    saidas.push(...lote.map(normalizarSaidaEstoque));
    if (lote.length < TAMANHO_LOTE) break;
  }
  return saidas;
}

export interface PosicaoEstoqueEpi {
  saldos: SaldoEstoque[];
  importadoEm: string | null;
}

/** Posição atual do depósito 0002 (ZL0024), um registro por material. */
export async function listarSaldoEstoqueEpi(): Promise<PosicaoEstoqueEpi> {
  const materiais = new Map<string, SaldoEstoque>();
  let importadoEm: string | null = null;

  for (let inicio = 0; ; inicio += TAMANHO_LOTE) {
    const { data, error } = await (supabase as any)
      .from('sap_zl0024_stk')
      .select('material, txt_breve_material, umb, quantidade, valor_total, imported_at')
      .eq('deposito', DEPOSITO_EPI)
      .not('material', 'is', null)
      .order('material')
      .range(inicio, inicio + TAMANHO_LOTE - 1);
    if (error) throw error;
    const lote = (data ?? []) as Record<string, unknown>[];
    for (const linha of lote) {
      const material = String(linha.material).trim();
      const atual = materiais.get(material) ?? {
        material,
        descricao: texto(linha.txt_breve_material),
        umb: texto(linha.umb),
        saldo: 0,
        valor: 0,
      };
      atual.saldo += numero(linha.quantidade);
      atual.valor += numero(linha.valor_total);
      materiais.set(material, atual);
      const importado = texto(linha.imported_at);
      if (importado && (!importadoEm || importado > importadoEm)) importadoEm = importado;
    }
    if (lote.length < TAMANHO_LOTE) break;
  }

  return { saldos: Array.from(materiais.values()), importadoEm };
}

/** Data do último lançamento da MB51 (qualquer depósito): mostra até quando a base vai. */
export async function ultimaDataMb51(): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from('sap_mb51_mov')
    .select('data_lancamento')
    .not('data_lancamento', 'is', null)
    .order('data_lancamento', { ascending: false })
    .limit(1);
  if (error) throw error;
  return texto(data?.[0]?.data_lancamento)?.slice(0, 10) ?? null;
}
