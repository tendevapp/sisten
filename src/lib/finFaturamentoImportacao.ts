/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Faturamento GW Jacobina — parsing da planilha de importação.
 *
 * Função pura, sem xlsx nem Supabase: recebe a matriz crua que
 * `XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })` devolve (mesmo
 * formato usado em `projetosImportacao.ts`, `bahiasul.ts` etc.) e devolve
 * linhas prontas para gravar + pendências por linha. Nada é fatal por causa
 * de uma linha ruim — só planilha vazia ou sem as colunas certas interrompe
 * tudo (`erroFatal`); o resto é revisão manual no preview.
 *
 * Duas peculiaridades da planilha de origem, ambas tratadas aqui:
 *   - As primeiras linhas costumam ser um título mesclado antes do
 *     cabeçalho de verdade — a função varre as primeiras linhas procurando
 *     a que tem "Torre" e "Tramo" nas colunas, não assume que é a linha 0.
 *   - A coluna Torre é mesclada: só a primeira linha de cada grupo de 5
 *     tramos traz o número, as outras quatro vêm vazias. Preenche por
 *     arrasto (a torre da linha anterior) até a próxima linha com valor.
 */

export interface LinhaImportadaFaturamento {
  /** Número da linha na planilha (1-based, contando a partir do cabeçalho) — para mensagens. */
  linha: number;
  torre_numero: number;
  tramo: string;
  serie: number | null;
  codigo_cliente: string | null;
  part_number: string | null;
  nota_fiscal: string | null;
  data_faturado: string | null;
  semana_faturamento: number | null;
  data_expedido: string | null;
}

export interface PendenciaImportacao {
  linha: number;
  motivo: string;
}

export interface ResultadoImportacaoFaturamento {
  linhas: LinhaImportadaFaturamento[];
  pendencias: PendenciaImportacao[];
  erroFatal?: string;
}

/**
 * Remove acento e normaliza para comparação de cabeçalho — mesmo critério de
 * `bahiasul.ts`, mas filtrando as marcas diacríticas combinantes por
 * `codePointAt` em vez de uma classe de regex com faixa Unicode escrita à
 * mão: esse literal de faixa (`̀-ͯ`) é frágil de digitar/gravar
 * corretamente em editores que normalizam texto, e comparar código numérico
 * é equivalente e não depende de acertar o escape.
 */
function normalizarCabecalho(v: unknown): string {
  if (v === null || v === undefined) return '';
  const semAcento = Array.from(String(v).normalize('NFD'))
    .filter((ch) => {
      const codigo = ch.codePointAt(0) ?? 0;
      return codigo < 0x300 || codigo > 0x36f; // faixa das marcas diacríticas combinantes
    })
    .join('');
  return semAcento
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

type Campo = 'torre' | 'tramo' | 'seq' | 'codigo_cliente' | 'part_number' | 'nota_fiscal'
  | 'data_faturado' | 'semana_faturamento' | 'data_expedido';

const ALIASES: Record<Campo, string[]> = {
  torre: ['torre'],
  tramo: ['tramo'],
  seq: ['seq', 'seq_', 'sequencia', 'sequencial'],
  codigo_cliente: ['descricao_do_cliente', 'descricao_cliente', 'codigo_de_cliente', 'codigo_cliente'],
  part_number: ['part_number', 'partnumber', 'part_nbr', 'p_n'],
  // "5125" é o nome real da coluna na planilha de origem (código do documento
  // de faturamento no cliente) — a NF fica embaixo dela.
  nota_fiscal: ['5125_faturamento', '5125', 'faturamento', 'nota_fiscal', 'nf', 'numero_nf'],
  data_faturado: ['data_faturamento', 'data_fat', 'dt_faturamento'],
  semana_faturamento: ['semana_week', 'semana', 'week'],
  data_expedido: ['data_expedicao', 'data_de_expedicao', 'dt_expedicao'],
};

/** Só as colunas que identificam a linha de cabeçalho de verdade, distinguindo de um título mesclado acima. */
const CAMPOS_OBRIGATORIOS_NO_CABECALHO: Campo[] = ['torre', 'tramo'];

/**
 * Varre até 20 linhas procurando a que tem Torre e Tramo — a planilha de
 * origem tem um bloco de título mesclado antes do cabeçalho real.
 */
function detectarCabecalho(rows: unknown[][]): { indice: number; mapa: Map<Campo, number> } | null {
  const limite = Math.min(rows.length, 20);
  for (let i = 0; i < limite; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const mapa = new Map<Campo, number>();
    row.forEach((celula, col) => {
      const norm = normalizarCabecalho(celula);
      if (!norm) return;
      for (const campo of Object.keys(ALIASES) as Campo[]) {
        if (mapa.has(campo)) continue;
        if (ALIASES[campo].includes(norm)) mapa.set(campo, col);
      }
    });

    if (CAMPOS_OBRIGATORIOS_NO_CABECALHO.every((c) => mapa.has(c))) {
      return { indice: i, mapa };
    }
  }
  return null;
}

/** `''` | número de série do Excel | `DD/MM/AAAA` | `AAAA-MM-DD` → ISO ou null. Mesmo critério de `parseBahiaSulDate`. */
function parseData(val: unknown): string | null {
  if (val === '' || val === null || val === undefined) return null;

  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) return null;
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (isNaN(dateObj.getTime())) return null;
    return dateObj.toISOString().slice(0, 10);
  }

  const s = String(val).trim();
  if (!s) return null;

  const brMatch = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (brMatch) {
    const dia = brMatch[1].padStart(2, '0');
    const mes = brMatch[2].padStart(2, '0');
    let ano = brMatch[3];
    if (ano.length === 2) ano = (Number(ano) >= 70 ? '19' : '20') + ano;
    return `${ano}-${mes}-${dia}`;
  }

  const isoMatch = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (isoMatch) {
    const [, ano, mesRaw, diaRaw] = isoMatch;
    return `${ano}-${mesRaw.padStart(2, '0')}-${diaRaw.padStart(2, '0')}`;
  }

  return null;
}

function parseInteiro(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null;
  const n = typeof val === 'number' ? val : parseInt(String(val).trim().replace(',', '.'), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function textoOuNull(val: unknown): string | null {
  const s = String(val ?? '').trim();
  return s || null;
}

/**
 * `1`, `"1"`, `"T1"`, `"tramo 1"` → `"T1"`. Devolve null se não reconhecer
 * um número de 1 a 5.
 */
function normalizarTramo(val: unknown): string | null {
  const s = String(val ?? '').trim().toUpperCase();
  if (!s) return null;
  const m = s.match(/([1-5])\s*$/);
  if (!m) return null;
  return `T${m[1]}`;
}

export function parseLinhasImportacaoFaturamento(rows: unknown[][]): ResultadoImportacaoFaturamento {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { linhas: [], pendencias: [], erroFatal: 'Planilha vazia.' };
  }

  const cabecalho = detectarCabecalho(rows);
  if (!cabecalho) {
    return {
      linhas: [],
      pendencias: [],
      erroFatal: 'Não encontrei as colunas "Torre" e "Tramo" nas primeiras 20 linhas da planilha.',
    };
  }

  const { indice: linhaCabecalho, mapa } = cabecalho;
  const pendencias: PendenciaImportacao[] = [];
  // Torre+tramo é a chave natural da tabela — linha repetida na planilha
  // substitui a anterior (última vale), com aviso.
  const porChave = new Map<string, LinhaImportadaFaturamento>();

  let ultimaTorre: number | null = null;

  for (let i = linhaCabecalho + 1; i < rows.length; i++) {
    const row = rows[i];
    const numeroLinha = i - linhaCabecalho; // 1-based, relativo ao cabeçalho
    if (!Array.isArray(row) || row.every((c) => String(c ?? '').trim() === '')) continue;

    const pega = (campo: Campo) => (mapa.has(campo) ? row[mapa.get(campo)!] : '');

    // Coluna Torre mesclada: célula vazia herda a torre da linha anterior.
    const torreRaw = textoOuNull(pega('torre'));
    let torreNumero: number | null;
    if (torreRaw === null) {
      torreNumero = ultimaTorre;
    } else {
      torreNumero = parseInteiro(torreRaw);
      if (torreNumero !== null) ultimaTorre = torreNumero;
    }

    if (torreNumero === null || torreNumero < 1) {
      pendencias.push({ linha: numeroLinha, motivo: 'Torre em branco ou inválida — linha ignorada.' });
      continue;
    }

    const tramo = normalizarTramo(pega('tramo'));
    if (!tramo) {
      pendencias.push({
        linha: numeroLinha,
        motivo: `Tramo "${String(pega('tramo'))}" não reconhecido (esperado 1 a 5) — linha ignorada.`,
      });
      continue;
    }

    const item: LinhaImportadaFaturamento = {
      linha: numeroLinha,
      torre_numero: torreNumero,
      tramo,
      serie: parseInteiro(pega('seq')),
      codigo_cliente: textoOuNull(pega('codigo_cliente')),
      part_number: textoOuNull(pega('part_number')),
      nota_fiscal: textoOuNull(pega('nota_fiscal')),
      data_faturado: parseData(pega('data_faturado')),
      semana_faturamento: parseInteiro(pega('semana_faturamento')),
      data_expedido: parseData(pega('data_expedido')),
    };

    const chave = `${torreNumero}|${tramo}`;
    if (porChave.has(chave)) {
      pendencias.push({
        linha: numeroLinha,
        motivo: `Torre ${torreNumero} / ${tramo} repetida na planilha — ficou o valor desta linha.`,
      });
    }
    porChave.set(chave, item);
  }

  return { linhas: [...porChave.values()], pendencias };
}
