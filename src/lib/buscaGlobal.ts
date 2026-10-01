/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Busca global (Ctrl+K): uma caixa que acha páginas, formulários, solicitações,
 * itens de RM (rastreio) e materiais e leva direto ao destino.
 *
 * Só entra aqui o que tem destino certo: telas com deep link (`?q=`, `?id=`,
 * `?ri=`) e permissão resolvida no cliente. Fornecedores, RID e histórico de
 * pedidos ficam de fora até as telas aceitarem um parâmetro de busca (o
 * `pageCache` é zerado a cada navegação, então não dá para "pré-filtrar" por ele).
 *
 * A parte de ranking é pura (`classificar`) e testada em Node; as buscas
 * síncronas recebem os dados por parâmetro, e só as finas (`buscarSolicitacoes`,
 * `buscarRastreio`, `buscarMateriaisGlobal`) tocam `localDb`/Supabase.
 */

import type { LucideIcon } from 'lucide-react';
import { ClipboardList, FileText, Package, Route, UserRound } from 'lucide-react';
import { localDb } from '../db/localDb';
import type { Profile, Request, SAPRequisicao } from '../types';
import {
  classificar,
  ehSoDigitos,
  rastreioDeRequisicoes,
  type GrupoBusca,
  type ResultadoBusca,
} from './buscaGlobalRank';
import { buscarMateriais } from './materiais';
import { MODULE_HOMES } from './moduleHomes';
import {
  FORMULARIOS_DETALHADOS,
  GROUP_ORDER,
  PAGES,
  canAccessForm,
  canAccessPage,
} from './pages';
import { universoVisivel } from './solicitacoesCentral';
import { getRecentPages } from './homePrefs';

const LIMITES: Record<GrupoBusca, number> = {
  Páginas: 6,
  Formulários: 5,
  Solicitações: 5,
  Rastreio: 4,
  Materiais: 6,
};

// ---------------------------------------------------------------------------
// Páginas e formulários
// ---------------------------------------------------------------------------

/** Legenda de cada página, vinda dos hubs de módulo (`moduleHomes.ts`). */
function descricoesDePaginas(): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const modulo of MODULE_HOMES) {
    for (const [id, texto] of Object.entries(modulo.cardDescriptions)) mapa.set(id, texto);
  }
  return mapa;
}

interface PaginaBuscavel {
  id: string;
  label: string;
  path: string;
  grupo: string;
  descricao?: string;
  icone?: LucideIcon;
}

/** Rotas que existem no roteador mas não estão em `PAGES` (nem no menu). */
function paginasExtras(user: Profile): PaginaBuscavel[] {
  const extras: PaginaBuscavel[] = [
    { id: 'extra_perfil', label: 'Meu perfil', path: '/perfil', grupo: 'GERAL', descricao: 'Dados da conta, senha e preferências', icone: UserRound },
    { id: 'extra_sol_minhas', label: 'Minhas solicitações', path: '/solicitacoes/minhas', grupo: 'SOLICITAÇÕES', icone: ClipboardList },
  ];
  if (canAccessPage(user, 'sol_todas')) {
    extras.push({ id: 'extra_sol_todas', label: 'Todas as solicitações', path: '/solicitacoes/todas', grupo: 'SOLICITAÇÕES', descricao: 'Fila coletiva', icone: ClipboardList });
  }
  return extras;
}

export function paginasDoUsuario(user: Profile): PaginaBuscavel[] {
  const descricoes = descricoesDePaginas();
  const doMenu = PAGES.filter(p => p.path && canAccessPage(user, p.id)).map(p => ({
    id: p.id,
    label: p.label,
    path: p.path as string,
    grupo: p.group,
    descricao: descricoes.get(p.id),
    icone: p.icon,
  }));
  return [...doMenu, ...paginasExtras(user)];
}

export function buscarPaginas(user: Profile, termo: string): ResultadoBusca[] {
  const ordemGrupo = (g: string) => {
    const i = (GROUP_ORDER as readonly string[]).indexOf(g);
    return i < 0 ? 999 : i;
  };
  const paginas = paginasDoUsuario(user).sort((a, b) => ordemGrupo(a.grupo) - ordemGrupo(b.grupo));
  return classificar(paginas, termo, p => ({ principal: p.label, extra: [p.grupo, p.descricao] }), LIMITES.Páginas).map(p => ({
    id: p.id,
    grupo: 'Páginas',
    titulo: p.label,
    subtitulo: p.grupo,
    path: p.path,
    icone: p.icone,
  }));
}

export function buscarFormularios(user: Profile, termo: string): ResultadoBusca[] {
  const permitidos = FORMULARIOS_DETALHADOS.filter(f => canAccessForm(user, f.id));
  return classificar(permitidos, termo, f => ({ principal: f.label, extra: [f.codigo, f.descricao, f.grupoId] }), LIMITES.Formulários).map(f => ({
    id: f.id,
    grupo: 'Formulários',
    titulo: f.label,
    subtitulo: f.codigo ? `${f.codigo} · ${f.descricao}` : f.descricao,
    path: f.path,
    icone: FileText,
  }));
}

/** Atalhos de quem já visitou: mostrados com o campo vazio. */
export function paginasRecentes(user: Profile, limite = 6): ResultadoBusca[] {
  const porPath = new Map(paginasDoUsuario(user).map(p => [p.path, p]));
  const resultado: ResultadoBusca[] = [];
  for (const recente of getRecentPages()) {
    const pagina = porPath.get(recente.path);
    if (!pagina) continue;
    resultado.push({ id: pagina.id, grupo: 'Páginas', titulo: pagina.label, subtitulo: pagina.grupo, path: pagina.path, icone: pagina.icone });
    if (resultado.length >= limite) break;
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Solicitações e rastreio (dados em cache local)
// ---------------------------------------------------------------------------

export function buscarSolicitacoes(user: Profile, termo: string, todas: Request[] = localDb.getRequests()): ResultadoBusca[] {
  const visiveis = universoVisivel(todas, user);
  const digitos = termo.trim().replace(/^#/, '');
  const achadas = ehSoDigitos(digitos)
    ? visiveis.filter(r => r.number.startsWith(digitos))
    : classificar(visiveis, termo, r => ({ principal: r.titulo || r.justificativa || r.number, extra: [r.number, r.solicitante_name, r.linked_rm_number] }));
  return achadas.slice(0, LIMITES.Solicitações).map(r => ({
    id: r.id,
    grupo: 'Solicitações',
    titulo: `#${r.number} · ${r.titulo || r.justificativa || 'Solicitação'}`,
    subtitulo: `${r.solicitante_name} · ${r.status}`,
    path: `/solicitacoes?id=${encodeURIComponent(r.id)}`,
    icone: ClipboardList,
  }));
}

export function buscarRastreio(termo: string, requisicoes: SAPRequisicao[] = localDb.getRequisicoes()): ResultadoBusca[] {
  return rastreioDeRequisicoes(termo, requisicoes, LIMITES.Rastreio).map(r => ({ ...r, icone: Route }));
}

// ---------------------------------------------------------------------------
// Materiais (RPC) e composição
// ---------------------------------------------------------------------------

export async function buscarMateriaisGlobal(termo: string): Promise<ResultadoBusca[]> {
  const linhas = await buscarMateriais(termo, { limite: LIMITES.Materiais });
  return linhas.slice(0, LIMITES.Materiais).map(m => ({
    id: m.materialCode,
    grupo: 'Materiais',
    titulo: m.description,
    subtitulo: `${m.materialCode} · ${m.unit}`,
    path: `/materiais/busca?q=${encodeURIComponent(m.materialCode)}`,
    icone: Package,
  }));
}

/** Tudo que não depende de rede, já na ordem dos grupos. */
export function buscarLocal(user: Profile, termo: string): ResultadoBusca[] {
  return [
    ...buscarPaginas(user, termo),
    ...buscarFormularios(user, termo),
    ...buscarSolicitacoes(user, termo),
    ...buscarRastreio(termo),
  ];
}

export { combinarResultados, ORDEM_GRUPOS, type GrupoBusca, type ResultadoBusca } from './buscaGlobalRank';
