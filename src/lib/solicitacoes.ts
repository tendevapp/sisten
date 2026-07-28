/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regras da página Solicitações — recorte por papel, rótulos, exportação e
 * download de anexos.
 *
 * Fica fora da view para que as regras possam ser lidas e ajustadas sem abrir
 * um arquivo de tela, e para que o recorte por papel exista num lugar só.
 *
 * Ver documentos/superpowers/specs/2026-07-28-pagina-solicitacoes-design.md
 */

import * as XLSX from 'xlsx';
import { Profile, Request, RequestStatus, RequestType, Sector } from '../types';
import { localDb } from '../db/localDb';
import { formatDateBR } from './format';

/** Papéis que enxergam a fila coletiva. Espelha os defaultRoles da página. */
export const PAPEIS_FILA: string[] = [
  'requisitante',
  'gestor',
  'comprador',
  'coordenador_suprimentos',
  'admin',
];

/** Papéis autorizados a marcar um comentário como interno. */
const PAPEIS_COMENTARIO_INTERNO = ['comprador', 'coordenador_suprimentos', 'atendente', 'admin'];

export const podeComentarInternamente = (user: Profile): boolean =>
  user.roles.some(r => PAPEIS_COMENTARIO_INTERNO.includes(r));

/** Status que contam como "em aberto" — o que a página lista por padrão. */
const STATUS_ENCERRADOS: RequestStatus[] = ['fechado', 'cancelada', 'rejeitada', 'rascunho'];

export const estaEmAberto = (r: Request): boolean => !STATUS_ENCERRADOS.includes(r.status);

/**
 * Recorte por papel.
 *
 * O gestor vê apenas o próprio setor — mesma regra que a tela de Aprovações já
 * aplica, para não criar duas verdades sobre o que um gestor enxerga. Os demais
 * papéis da fila veem tudo.
 *
 * Atenção: isto é regra de tela. A policy `requests_read` permite ao gestor ler
 * todas as solicitações; endurecer a RLS por setor é trabalho à parte, anotado
 * no design.
 */
export function solicitacoesVisiveis(todas: Request[], user: Profile): Request[] {
  if (user.roles.includes('admin')) return todas;

  const apenasGestor =
    user.roles.includes('gestor') &&
    !user.roles.some(r => ['requisitante', 'comprador', 'coordenador_suprimentos'].includes(r));

  return apenasGestor ? todas.filter(r => r.solicitante_sector_id === user.sector_id) : todas;
}

/**
 * Rótulo de status. `pendente` numa solicitação de compra é o aguardo da
 * aprovação do gestor — daí o rótulo próprio, sem inventar status novo.
 */
export function rotuloStatus(r: Request): string {
  if (r.type === 'compra' && r.status === 'pendente') return 'Aguardando aprovação';

  const rotulos: Record<string, string> = {
    rascunho: 'Rascunho',
    pendente: 'Pendente',
    aprovada: 'Aprovada',
    rejeitada: 'Rejeitada',
    em_revisao: 'Em revisão',
    aberto: 'Aberta',
    em_atendimento: 'Em atendimento',
    aguardando_solicitante: 'Aguardando solicitante',
    resolvido: 'Resolvida',
    fechado: 'Fechada',
    reaberto: 'Reaberta',
    cancelada: 'Cancelada',
  };
  return rotulos[r.status] || r.status;
}

export const rotuloTipo = (t: RequestType): string =>
  ({ compra: 'Compra', cadastro_sap: 'Cadastro SAP', chamado: 'Chamado' }[t] || t);

const ROTULO_CRITICIDADE: Record<number, string> = {
  1: '1 - Baixa',
  2: '2 - Moderada',
  3: '3 - Urgente',
  4: '4 - Crítica',
  5: '5 - Impeditiva',
};

export const rotuloCriticidade = (n: number): string => ROTULO_CRITICIDADE[n] || String(n);

/* Edição ------------------------------------------------------------------ */

/** Status de compra em que a edição ainda faz sentido. */
const EDITAVEIS_COMPRA: RequestStatus[] = ['pendente', 'em_revisao', 'rejeitada', 'aprovada'];

/** Status em que a solicitação já se encerrou e não se edita mais. */
const ENCERRADOS: RequestStatus[] = ['resolvido', 'fechado', 'cancelada'];

/**
 * Só quem abriu a solicitação pode editá-la.
 *
 * Compra é editável enquanto o gestor não fechou o assunto — inclusive depois
 * de aprovada, caso em que a aprovação é desfeita e quem já trabalhava nela é
 * avisado (ver `saveRequestEdit`). Cadastro SAP e chamado, que não passam por
 * aprovação, são editáveis enquanto não estiverem encerrados.
 */
export function podeEditar(r: Request, user: Profile): boolean {
  if (r.solicitante_id !== user.id) return false;
  if (r.status === 'rascunho') return false;

  return r.type === 'compra'
    ? EDITAVEIS_COMPRA.includes(r.status)
    : !ENCERRADOS.includes(r.status);
}

/**
 * Para onde a solicitação volta depois de editada. Compra precisa de aprovação
 * de novo; os demais tipos voltam para o início da fila de atendimento.
 */
export const statusAposEdicao = (tipo: RequestType): RequestStatus =>
  tipo === 'compra' ? 'pendente' : 'aberto';

/** Aviso exibido no formulário em modo edição. */
export const avisoEdicao = (tipo: RequestType): string =>
  tipo === 'compra'
    ? 'Ao salvar, a solicitação volta para aprovação do gestor.'
    : 'Ao salvar, a solicitação volta para a fila de atendimento.';

/* Exportação -------------------------------------------------------------- */

/**
 * XLSX com uma linha por item da solicitação, repetindo as colunas de
 * cabeçalho — é o formato que serve para dar entrada no SAP e para somar por
 * item. Cadastro SAP e chamado não têm itens e saem em linha única, com as
 * colunas de item vazias.
 */
export function exportarSolicitacoes(selecionadas: Request[], sectors: Sector[]): void {
  const nomeSetor = (id: string) => sectors.find(s => s.id === id)?.name || id;

  // Tipo explícito: sem ele, a linha sem itens (com as colunas de item vazias)
  // e a linha com item divergem em `Quantidade`/`Valor estimado`, e o flatMap
  // não unifica os dois formatos.
  type Linha = Record<string, string | number>;

  const linhas: Linha[] = selecionadas.flatMap<Linha>(r => {
    const cabecalho = {
      'Número': r.number,
      'Tipo': rotuloTipo(r.type),
      'Status': rotuloStatus(r),
      'Criticidade': rotuloCriticidade(r.criticality),
      'Solicitante': r.solicitante_name,
      'Setor': nomeSetor(r.solicitante_sector_id),
      'Aberta em': formatDateBR(r.created_at),
      'Data de necessidade': r.data_necessidade ? formatDateBR(r.data_necessidade) : '',
      'Atendente': r.atendente_name || '',
      'Justificativa': r.justificativa || '',
    };

    const itens = localDb.getRequestItems(r.id);
    if (itens.length === 0) return [{ ...cabecalho, 'Item': '', 'Código SAP': '', 'Quantidade': '', 'Unidade': '', 'Marca': '', 'Valor estimado': '' }];

    return itens.map(it => ({
      ...cabecalho,
      'Item': it.description,
      'Código SAP': it.sap_code || '',
      'Quantidade': it.quantity,
      'Unidade': it.unit,
      'Marca': it.brand || '',
      'Valor estimado': it.estimated_value || 0,
    }));
  });

  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Solicitações');
  const carimbo = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `solicitacoes_${carimbo}.xlsx`);
}

/* Download de anexos ------------------------------------------------------ */

export interface ResultadoDownload {
  baixados: number;
  falhas: string[];
}

/**
 * Baixa os anexos das solicitações selecionadas, um a um.
 *
 * Busca o conteúdo pela URL assinada e salva via object URL em vez de apontar o
 * link direto para o Storage: sem isso o navegador navegaria até a imagem em
 * vez de baixá-la, já que `download` é ignorado em URL de outra origem.
 *
 * O navegador pede autorização uma vez para downloads múltiplos; autorizada, o
 * lote segue. Uma falha isolada não interrompe as demais.
 */
export async function baixarAnexos(selecionadas: Request[]): Promise<ResultadoDownload> {
  const falhas: string[] = [];
  let baixados = 0;

  for (const req of selecionadas) {
    for (const anexo of localDb.getAttachments(req.id)) {
      try {
        const url = await localDb.getAttachmentUrl(anexo.storage_path || anexo.url);
        if (!url) throw new Error('URL assinada indisponível.');

        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

        const blob = await resposta.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `${req.number}_${anexo.name}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);

        baixados++;
      } catch (err) {
        console.error(`Falha ao baixar o anexo "${anexo.name}".`, err);
        falhas.push(`${req.number}/${anexo.name}`);
      }
    }
  }

  return { baixados, falhas };
}

/** Quantos anexos existem na seleção — usado para desabilitar o botão. */
export const contarAnexos = (selecionadas: Request[]): number =>
  selecionadas.reduce((total, r) => total + localDb.getAttachments(r.id).length, 0);
