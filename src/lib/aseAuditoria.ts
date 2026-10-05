/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Planilha de auditoria das ASEs (FRM.RHU-0007), exportada pelo admin a
 * partir dos filtros da lista.
 *
 * Diferente das exportações operacionais, aqui entra tudo: rascunho,
 * cancelada, ASE excluída e colaborador removido de dentro da ASE. O que o
 * banco guarda de rastro é criação (`created_at` + solicitante), última
 * alteração (`updated_at`, sem autor) e exclusão lógica (`excluido_em` +
 * `excluido_por`) — não há log de cada edição, e a planilha diz isso em vez
 * de inventar um autor para a alteração.
 *
 * O filtro da lista mora aqui para a tela e a planilha recortarem
 * exatamente o mesmo conjunto.
 */

import type { AseHoraExtraCompleta } from '../types';

export const STATUS_ASE_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADO: 'Enviado',
  CANCELADO: 'Cancelado',
};

export interface FiltroListaAse {
  podeVerTodas: boolean;
  escopo: 'todas' | 'minhas';
  /** `'TODOS'` ou um `AseHoraExtraStatus`. */
  status: string;
  termo: string;
  userId: string;
}

function dataBR(iso?: string | null): string {
  if (!iso) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Timestamp do banco no fuso do navegador, `DD/MM/AAAA HH:MM`. */
export function dataHoraBR(ts?: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Recorte da lista: escopo (todas/minhas), status e busca textual. */
export function filtrarListaAse(lista: AseHoraExtraCompleta[], f: FiltroListaAse): AseHoraExtraCompleta[] {
  const termo = f.termo.toLowerCase().trim();
  return lista.filter(s => {
    if ((!f.podeVerTodas || f.escopo === 'minhas') && s.solicitante_id !== f.userId) return false;
    if (f.status !== 'TODOS' && s.status !== f.status) return false;
    if (!termo) return true;
    const campos = [s.numero_protocolo, s.setor_nome, s.turno_nome, s.solicitante_nome, dataBR(s.data_execucao)];
    if (campos.some(c => (c || '').toLowerCase().includes(termo))) return true;
    return s.itens.some(it =>
      (it.nome || '').toLowerCase().includes(termo) ||
      (it.registro || '').toLowerCase().includes(termo) ||
      (it.cargo || '').toLowerCase().includes(termo),
    );
  });
}

/** Ids gravados em `excluido_por` (ASE e colaboradores), para resolver nomes. */
export function idsUsuariosAuditoria(ases: AseHoraExtraCompleta[]): string[] {
  const ids = new Set<string>();
  for (const s of ases) {
    if (s.excluido_por) ids.add(s.excluido_por);
    for (const it of s.itens) if (it.excluido_por) ids.add(it.excluido_por);
  }
  return [...ids];
}

export interface AuditoriaAse {
  ases: (string | number)[][];
  colaboradores: (string | number)[][];
  eventos: (string | number)[][];
  totais: { ases: number; excluidas: number; colaboradores: number; removidos: number };
}

export const CABECALHO_ASES = [
  'Protocolo', 'Formulário', 'Data execução', 'Setor', 'Turno', 'Status', 'Situação',
  'Criada por', 'Criada em', 'Última alteração em', 'Excluída por', 'Excluída em',
  'Colaboradores ativos', 'Colaboradores removidos', 'Total horas (ativos)', 'Transportes', 'Refeições',
  'Justificativa',
];

export const CABECALHO_COLABORADORES = [
  'Protocolo', 'Data execução', 'Status ASE', 'Situação ASE', 'Matrícula', 'Colaborador', 'Cargo / Função',
  'Hora entrada', 'Hora saída', 'Intervalo (min)', '% HE', 'Total horas (h)', 'Transporte', 'Refeição',
  'Rota', 'Ponto de embarque', 'Observação', 'Situação', 'Incluído em', 'Removido por', 'Removido em',
];

export const CABECALHO_EVENTOS = ['Data/hora', 'Protocolo', 'Evento', 'Usuário', 'Detalhe'];

/** Evento sem autor gravado no banco (não há log por edição). */
export const AUTOR_NAO_REGISTRADO = 'não registrado';

const simNao = (v: boolean) => (v ? 'Sim' : 'Não');
const h2 = (v: number) => Number(v.toFixed(2));

/**
 * Monta as linhas das três abas. `nomes` mapeia id de usuário → nome; um id
 * sem nome conhecido aparece cru, para não sumir com o rastro.
 */
export function montarAuditoriaAse(
  ases: AseHoraExtraCompleta[],
  nomes: Map<string, string>,
): AuditoriaAse {
  const nomeDe = (id?: string | null) => (id ? nomes.get(id) || id : '');
  const linhasAses: (string | number)[][] = [];
  const linhasColab: (string | number)[][] = [];
  const eventos: { ts: string; linha: (string | number)[] }[] = [];

  for (const s of ases) {
    const status = STATUS_ASE_LABEL[s.status] || s.status;
    const situacao = s.excluido_em ? 'Excluída' : 'Ativa';
    const criador = s.solicitante_nome || nomeDe(s.solicitante_id);
    const ativos = s.itens.filter(it => !it.excluido_em);

    linhasAses.push([
      s.numero_protocolo,
      s.codigo_formulario || '',
      dataBR(s.data_execucao),
      s.setor_nome || '',
      s.turno_nome || '',
      status,
      situacao,
      criador,
      dataHoraBR(s.created_at),
      dataHoraBR(s.updated_at),
      nomeDe(s.excluido_por),
      dataHoraBR(s.excluido_em),
      ativos.length,
      s.itens.length - ativos.length,
      h2(ativos.reduce((acc, it) => acc + (it.total_horas || 0), 0)),
      ativos.filter(it => it.transporte).length,
      ativos.filter(it => it.refeicao).length,
      s.justificativa || '',
    ]);

    eventos.push({
      ts: s.created_at,
      linha: [dataHoraBR(s.created_at), s.numero_protocolo, 'ASE criada', criador, `Execução ${dataBR(s.data_execucao)}`],
    });
    // updated_at nasce igual (ou quase) ao created_at; só vira evento quando houve edição depois.
    if (s.updated_at && new Date(s.updated_at).getTime() - new Date(s.created_at).getTime() > 60_000) {
      eventos.push({
        ts: s.updated_at,
        linha: [dataHoraBR(s.updated_at), s.numero_protocolo, 'Última alteração da ASE', AUTOR_NAO_REGISTRADO, `Status atual: ${status}`],
      });
    }
    if (s.excluido_em) {
      eventos.push({
        ts: s.excluido_em,
        linha: [dataHoraBR(s.excluido_em), s.numero_protocolo, 'ASE excluída', nomeDe(s.excluido_por), `Status no momento: ${status}`],
      });
    }

    for (const it of s.itens) {
      const colab = `${it.registro || 's/ matrícula'} - ${it.nome}`;
      linhasColab.push([
        s.numero_protocolo,
        dataBR(s.data_execucao),
        status,
        situacao,
        it.registro || '',
        it.nome || '',
        it.cargo || '',
        it.hora_entrada || '',
        it.hora_saida || '',
        it.intervalo_minutos ?? 0,
        it.percentual_he ?? '',
        it.total_horas != null ? h2(it.total_horas) : '',
        simNao(it.transporte),
        simNao(it.refeicao),
        it.rota_transporte || '',
        it.ponto_embarque_transporte || '',
        it.observacao || '',
        it.excluido_em ? 'Removido' : 'Ativo',
        dataHoraBR(it.created_at),
        nomeDe(it.excluido_por),
        dataHoraBR(it.excluido_em),
      ]);
      if (it.created_at) {
        eventos.push({
          ts: it.created_at,
          linha: [dataHoraBR(it.created_at), s.numero_protocolo, 'Colaborador incluído', AUTOR_NAO_REGISTRADO, colab],
        });
      }
      if (it.excluido_em) {
        eventos.push({
          ts: it.excluido_em,
          linha: [dataHoraBR(it.excluido_em), s.numero_protocolo, 'Colaborador removido', nomeDe(it.excluido_por), colab],
        });
      }
    }
  }

  eventos.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return {
    ases: linhasAses,
    colaboradores: linhasColab,
    eventos: eventos.map(e => e.linha),
    totais: {
      ases: ases.length,
      excluidas: ases.filter(s => s.excluido_em).length,
      colaboradores: linhasColab.length,
      removidos: ases.reduce((acc, s) => acc + s.itens.filter(it => it.excluido_em).length, 0),
    },
  };
}

/** Texto dos filtros aplicados, para o cabeçalho da planilha. */
export function descreverFiltroListaAse(f: FiltroListaAse): string {
  const partes = [
    `Escopo: ${f.podeVerTodas && f.escopo === 'todas' ? 'todas as ASEs' : 'minhas ASEs'}`,
    `Status: ${f.status === 'TODOS' ? 'todos' : STATUS_ASE_LABEL[f.status] || f.status}`,
  ];
  if (f.termo.trim()) partes.push(`Busca: "${f.termo.trim()}"`);
  return partes.join(' | ');
}
