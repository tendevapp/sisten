import * as XLSX from 'xlsx';
import { dataHojeLocal } from './dataLocal';

export type CategoriaEquipamento = 'estoque' | 'necessidade' | 'segregados' | 'compras';
export type DadosEquipamento = Record<string, string>;
export interface CampoEquipamento { key: string; label: string; tipo?: 'quantidade' | 'data'; opcoes?: string[] }
const campo = (key: string, label: string, tipo?: CampoEquipamento['tipo']): CampoEquipamento => ({ key, label, tipo });
const comuns = [campo('numero', 'Nº'), campo('equipamento', 'Equipamento / aparelho'), campo('descricao', 'Descrição / especificação')];
const obs = campo('observacoes', 'Observações');
export const CATEGORIAS_EQUIPAMENTOS: Record<CategoriaEquipamento, { label: string; campos: CampoEquipamento[]; situacoes: string[] }> = {
  estoque: { label: 'Estoque atual', campos: [...comuns, campo('fabricante', 'Fabricante / modelo'), campo('patrimonio', 'Patrimônio / ID'), campo('qtd_estoque', 'Qtd. em estoque', 'quantidade'), campo('qtd_necessaria', 'Qtd. necessária', 'quantidade'), campo('qtd_comprar', 'Qtd. a comprar', 'quantidade'), campo('local', 'Local / setor'), campo('responsavel', 'Responsável'), campo('situacao', 'Situação'), obs], situacoes: ['Em uso', 'Atende à necessidade', 'Compra necessária', 'Em cotação', 'Devolver', 'Em manutenção', 'Fora de uso', 'Baixado'] },
  necessidade: { label: 'Necessidade de compra', campos: [...comuns, campo('fabricante', 'Fabricante / modelo / referência'), campo('qtd_necessaria', 'Qtd. necessária', 'quantidade'), campo('prioridade', 'Prioridade'), campo('justificativa', 'Justificativa / aplicação'), campo('local', 'Setor solicitante'), campo('responsavel', 'Responsável'), campo('situacao', 'Situação'), obs], situacoes: ['Criar RM', 'RM criada', 'Em cotação', 'Pedido emitido', 'Atendida', 'Cancelada'] },
  segregados: { label: 'Danificados e segregados', campos: [...comuns, campo('fabricante', 'Fabricante / modelo'), campo('patrimonio', 'Patrimônio / ID'), campo('quantidade', 'Quantidade', 'quantidade'), campo('defeito', 'Defeito / condição identificada'), campo('data_segregacao', 'Data da segregação', 'data'), campo('local', 'Local de segregação'), campo('acao', 'Ação necessária'), campo('responsavel', 'Responsável'), campo('situacao', 'Situação'), obs], situacoes: ['Danificado', 'Segregado', 'Em avaliação', 'Em manutenção', 'Liberado após avaliação', 'Descartado', 'Devolvido'] },
  compras: { label: 'Compras solicitadas', campos: [...comuns, campo('fabricante', 'Fabricante / modelo / referência'), campo('qtd_solicitada', 'Qtd. solicitada', 'quantidade'), campo('rm', 'Nº da RM / solicitação'), campo('data_solicitacao', 'Data da solicitação', 'data'), campo('fornecedor', 'Fornecedor / cotação'), campo('previsao_entrega', 'Previsão de entrega', 'data'), campo('responsavel', 'Responsável'), campo('situacao', 'Situação'), obs], situacoes: ['Aguardando RM', 'Em cotação', 'Pedido emitido', 'Entrega parcial', 'Recebido', 'Cancelado'] },
};
export const CAMPOS_GESTAO: CampoEquipamento[] = [campo('prazo_acao', 'Prazo da ação', 'data'), campo('responsavel_acao', 'Responsável pela ação'), campo('plano_acao', 'Plano de ação'), campo('controle_metrologico', 'Controle metrológico'), campo('proxima_calibracao', 'Próxima calibração / verificação', 'data'), campo('certificado', 'Certificado / referência'), campo('resultado_metrologico', 'Resultado metrológico')];
export const TIPOS_LANCAMENTO = ['Acompanhamento', 'Manutenção', 'Calibração / verificação', 'Segregação', 'Transferência', 'Recebimento', 'Devolução', 'Baixa', 'Correção / estorno'] as const;
export interface EquipamentoQualidade {
  id: string; codigo: string; categoria: CategoriaEquipamento; dados: DadosEquipamento;
  origem_chave: string | null; origem_arquivo: string | null; origem_linha: number | null;
  origem_dados?: Record<string, string> | null;
  versao: number; arquivado: boolean; criado_em: string; atualizado_em: string;
}
export interface EventoEquipamento {
  id: string; equipamento_id: string; tipo: string; descricao: string; data_evento: string;
  autor_id: string | null; autor_nome: string; criado_em: string;
  antes: EquipamentoQualidade | null; depois: EquipamentoQualidade | null;
  anexo_path: string | null; anexo_nome: string | null;
}
export interface LinhaImportacaoEquipamento {
  categoria: CategoriaEquipamento; dados: DadosEquipamento; origem_chave: string;
  origem_linha: number; origem_dados: Record<string, string>;
}
export interface PreviaEquipamentos { linhas: LinhaImportacaoEquipamento[]; avisos: string[]; abas: { nome: string; quantidade: number }[] }
export const normalizarEquipamento = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
export function quantidadeEquipamento(v?: string): number | null {
  if (!v?.trim()) return null;
  const texto = v.trim().replace(/\s/g, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(texto) && !/^\d+\.\d+$/.test(texto)) return null;
  const n = Number(texto.includes(',') || /^\d{1,3}(?:\.\d{3})+$/.test(texto) ? texto.replace(/\./g, '').replace(',', '.') : texto);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function dataEquipamento(v: string): string | null {
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(v.trim()) && !/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(v.trim())) return null;
  // ISO ou DD/MM/AAAA, sem interpretar datas no fuso UTC.
  const iso = v.includes('/') ? `${v.split('/')[2]}-${v.split('/')[1].padStart(2, '0')}-${v.split('/')[0].padStart(2, '0')}` : v.trim();
  const [y, mo, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? iso : null;
}
export function saldoComprar(dados: DadosEquipamento): number | null {
  const estoque = quantidadeEquipamento(dados.qtd_estoque), necessario = quantidadeEquipamento(dados.qtd_necessaria);
  return estoque === null || necessario === null ? null : Math.max(necessario - estoque, 0);
}
export interface AvisoEquipamento { nivel: 'critico' | 'atencao'; texto: string }
export function avisosEquipamento(registro: Pick<EquipamentoQualidade, 'categoria' | 'dados' | 'arquivado'>, hoje = dataHojeLocal(), janela = 30): AvisoEquipamento[] {
  if (registro.arquivado) return [];
  const { dados: d, categoria } = registro;
  const avisos: AvisoEquipamento[] = [];
  const add = (texto: string, nivel: AvisoEquipamento['nivel'] = 'atencao') => avisos.push({ texto, nivel });
  const encerrado = ['recebido', 'atendida', 'cancelada', 'cancelado', 'descartado', 'devolvido', 'baixado', 'liberado apos avaliacao'].includes(normalizarEquipamento(d.situacao || ''));
  const limite = new Date(`${hoje}T12:00:00`); limite.setDate(limite.getDate() + janela);
  const fim = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`;
  for (const [key, label] of [['prazo_acao', 'Ação'], ['previsao_entrega', 'Entrega'], ['proxima_calibracao', 'Calibração / verificação']] as const) {
    const valor = d[key]; if (!valor || (encerrado && key !== 'proxima_calibracao')) continue;
    const data = dataEquipamento(valor);
    if (!data) { add(`${label}: data inválida (${valor})`); continue; }
    if (data < hoje) add(`${label} vencida em ${data.split('-').reverse().join('/')}`, 'critico');
    else if (data <= fim) add(`${label} vence ${data === hoje ? 'hoje' : `em ${data.split('-').reverse().join('/')}`}`);
  }
  if (categoria === 'estoque') {
    const saldo = saldoComprar(d);
    if (saldo !== null && saldo > 0) {
      add(`Déficit de ${saldo} unidade(s)`);
      if (normalizarEquipamento(d.situacao || '') === 'atende a necessidade') add('Situação diverge do déficit de estoque', 'critico');
    }
    if (d.qtd_estoque && quantidadeEquipamento(d.qtd_estoque) === null) add(`Estoque sem saldo numérico: ${d.qtd_estoque}`);
    const informado = quantidadeEquipamento(d.qtd_comprar);
    if (saldo !== null && informado !== null && saldo !== informado) add(`Qtd. a comprar informada (${informado}) difere do cálculo (${saldo})`);
    if (/defeito|danificad/i.test(d.observacoes || '')) add('Defeito registrado nas observações: avaliar e segregar', 'critico');
  }
  if (categoria === 'segregados' && !encerrado) {
    add('Equipamento danificado / segregado: avaliar antes de liberar', 'critico');
    if (!d.data_segregacao) add('Data da segregação não informada');
  }
  if (categoria === 'compras' && !encerrado) {
    if (!d.rm || normalizarEquipamento(d.rm) === 'aguardando') add('RM / solicitação pendente');
    if (!d.previsao_entrega) add('Previsão de entrega não informada');
  }
  if (categoria === 'necessidade' && !encerrado && normalizarEquipamento(d.prioridade || '') === 'alta') add('Compra com prioridade alta');
  if (!encerrado && !d.responsavel?.trim() && !d.responsavel_acao?.trim()) add('Responsável não informado');
  if (d.controle_metrologico === 'Requer controle' && !d.proxima_calibracao) add('Definir prazo da calibração / verificação');
  if (d.resultado_metrologico === 'Reprovado') add('Resultado metrológico reprovado: avaliar impacto nas medições', 'critico');
  return avisos;
}

export function validarDadosEquipamento(categoria: CategoriaEquipamento, dados: DadosEquipamento): string[] {
  const erros: string[] = [];
  if (!dados.equipamento?.trim()) erros.push('Informe o equipamento / aparelho.');
  for (const c of [...CATEGORIAS_EQUIPAMENTOS[categoria].campos, ...CAMPOS_GESTAO]) {
    if (c.tipo === 'data' && dados[c.key] && !dataEquipamento(dados[c.key])) erros.push(`${c.label}: informe uma data válida.`);
    // A planilha usa texto em quantidades. Preservar rótulos, rejeitar apenas números negativos.
    if (c.tipo === 'quantidade' && /^\s*-\d/.test(dados[c.key] || '')) erros.push(`${c.label}: a quantidade não pode ser negativa.`);
  }
  return erros;
}

export function mapearPlanilhaEquipamentos(workbook: XLSX.WorkBook): PreviaEquipamentos {
  const previa: PreviaEquipamentos = { linhas: [], avisos: [], abas: [] };
  const chaves = new Set<string>();
  for (const nome of workbook.SheetNames) {
    const categoria = (Object.keys(CATEGORIAS_EQUIPAMENTOS) as CategoriaEquipamento[]).find(c => normalizarEquipamento(CATEGORIAS_EQUIPAMENTOS[c].label) === normalizarEquipamento(nome));
    if (!categoria) { previa.avisos.push(`Aba “${nome}” não é um dos quatro controles e não será importada.`); continue; }
    const sheet = workbook.Sheets[nome];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '', dateNF: 'dd/mm/yyyy', blankrows: true });
    const headerIndex = rows.findIndex(r => r.some(v => normalizarEquipamento(String(v)) === 'equipamento / aparelho'));
    if (headerIndex < 0) throw new Error(`Aba “${nome}”: cabeçalho Equipamento / aparelho não encontrado.`);
    const campos = [...CATEGORIAS_EQUIPAMENTOS[categoria].campos, ...CAMPOS_GESTAO];
    const headers = rows[headerIndex].map(v => String(v).trim());
    const mapeados = headers.map(h => campos.find(c => normalizarEquipamento(c.label) === normalizarEquipamento(h)));
    const chavesColunas = mapeados.filter((c): c is CampoEquipamento => !!c).map(c => c.key);
    if (new Set(chavesColunas).size !== chavesColunas.length) throw new Error(`Aba “${nome}”: há colunas duplicadas. Revise o cabeçalho.`);
    for (const c of CATEGORIAS_EQUIPAMENTOS[categoria].campos) {
      if (!mapeados.some(m => m?.key === c.key)) throw new Error(`Aba “${nome}”: coluna “${c.label}” ausente.`);
    }
    const inicio = previa.linhas.length;
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i].map(v => String(v ?? ''));
      if (!row.some((v, col) => v.trim() && mapeados[col]?.key !== 'numero')) continue;
      const dados: DadosEquipamento = {}, origem: Record<string, string> = {};
      row.forEach((v, col) => {
        if (mapeados[col]) {
          dados[mapeados[col]!.key] = v.trim(); origem[headers[col]] = v;
          const cell = sheet[XLSX.utils.encode_cell({ r: i, c: col })];
          if (mapeados[col]!.tipo === 'quantidade' && cell?.t === 'n' && typeof cell.v === 'number') dados[mapeados[col]!.key] = String(cell.v).replace('.', ',');
          if (mapeados[col]!.tipo === 'data' && cell?.t === 'n' && typeof cell.v === 'number') {
            const date = XLSX.SSF.parse_date_code(cell.v);
            if (date) dados[mapeados[col]!.key] = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
          }
        }
        else if (v.trim() && !['Código SISTEN', 'Arquivado', 'ID SISTEN'].includes(headers[col])) throw new Error(`Aba “${nome}”, linha ${i + 1}: coluna não reconhecida “${headers[col] || col + 1}”. Nenhum dado foi importado.`);
      });
      for (const c of campos.filter(c => c.tipo === 'data')) if (dados[c.key]) dados[c.key] = dataEquipamento(dados[c.key]) || dados[c.key];
      const erros = validarDadosEquipamento(categoria, dados);
      if (erros.length) throw new Error(`Aba “${nome}”, linha ${i + 1}: ${erros.join(' ')}`);
      const idSisten = row[headers.indexOf('ID SISTEN')]?.trim();
      if (idSisten && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idSisten)) throw new Error(`Aba “${nome}”, linha ${i + 1}: ID SISTEN inválido.`);
      const chave = idSisten ? `sisten:${idSisten}` : `${categoria}:${dados.numero || `linha-${i + 1}`}`;
      if (chaves.has(chave)) throw new Error(`Aba “${nome}”: Nº ${dados.numero} repetido. Corrija a numeração para manter registros distintos.`);
      chaves.add(chave);
      previa.linhas.push({ categoria, dados, origem_chave: chave, origem_linha: i + 1, origem_dados: origem });
    }
    previa.abas.push({ nome, quantidade: previa.linhas.length - inicio });
  }
  if (!previa.linhas.length) throw new Error('Nenhum equipamento encontrado nas quatro abas esperadas.');
  return previa;
}

export function criarWorkbookEquipamentos(registros: EquipamentoQualidade[], eventos: EventoEquipamento[] = []): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  for (const categoria of Object.keys(CATEGORIAS_EQUIPAMENTOS) as CategoriaEquipamento[]) {
    const config = CATEGORIAS_EQUIPAMENTOS[categoria], campos = [...config.campos, ...CAMPOS_GESTAO];
    const rows: (string | number)[][] = [campos.map(c => c.label).concat(['Código SISTEN', 'Arquivado', 'ID SISTEN'])];
    for (const r of registros.filter(r => r.categoria === categoria)) {
      rows.push([...campos.map(c => {
        const v = r.dados[c.key] || '';
        // Identificadores e rótulos permanecem texto; apenas quantidades puramente numéricas viram número.
        return c.tipo === 'quantidade' ? quantidadeEquipamento(v) ?? v : v;
      }), r.codigo, r.arquivado ? 'Sim' : 'Não', r.id]);
    }
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = campos.map(c => ({ wch: c.key === 'equipamento' || c.key === 'observacoes' ? 34 : 24 })).concat([{ wch: 22 }, { wch: 12 }, { wch: 38 }]);
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: rows.length - 1, c: rows[0].length - 1 }) };
    XLSX.utils.book_append_sheet(workbook, sheet, config.label);
  }
  if (eventos.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(eventos.map(e => ({ Equipamento: registros.find(r => r.id === e.equipamento_id)?.codigo || e.equipamento_id, Tipo: e.tipo, Data: e.data_evento, Descrição: e.descricao, Autor: e.autor_nome, 'Registrado em': e.criado_em, 'Anexo (referência)': e.anexo_nome || '', 'Antes (JSON)': JSON.stringify(e.antes), 'Depois (JSON)': JSON.stringify(e.depois) }))), 'Histórico');
  return workbook;
}
