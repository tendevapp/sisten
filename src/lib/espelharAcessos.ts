import { Profile } from '../types';
import {
  canAccessPage,
  canAccessForm,
  canAccessFormGroup,
  getPageGroups,
  FORMULARIO_SUBPERMISSOES,
  FORMULARIOS_DETALHADOS,
} from './pages';

interface Item {
  /** Chave gravada em page_access. */
  id: string;
  /** O que avaliar: id da página/formulário ou grupoId da subpermissão. */
  chave: string;
  tipo: 'pagina' | 'grupo' | 'form';
  label: string;
}

function itensEditaveis(): Item[] {
  const vistos = new Set<string>();
  const itens: Item[] = [];
  const add = (i: Item) => {
    if (vistos.has(i.id)) return;
    vistos.add(i.id);
    itens.push(i);
  };
  // Páginas primeiro, depois grupos e formulários, na ordem das dependências.
  for (const g of getPageGroups()) {
    for (const p of g.pages) {
      if (p.alwaysAdmin) continue;
      if (FORMULARIO_SUBPERMISSOES.some(s => s.id === p.id)) continue;
      if (FORMULARIOS_DETALHADOS.some(f => f.id === p.id)) continue;
      add({ id: p.id, chave: p.id, tipo: 'pagina', label: `${g.group} › ${p.label}` });
    }
  }
  for (const s of FORMULARIO_SUBPERMISSOES) add({ id: s.id, chave: s.grupoId, tipo: 'grupo', label: `Formulários › ${s.label}` });
  for (const f of FORMULARIOS_DETALHADOS) add({ id: f.id, chave: f.id, tipo: 'form', label: `Formulário › ${f.label}` });
  return itens;
}

function acessoEfetivo(u: Profile, i: Item): boolean {
  if (i.tipo === 'form') return canAccessForm(u, i.chave);
  if (i.tipo === 'grupo') return canAccessFormGroup(u, i.chave);
  return canAccessPage(u, i.chave);
}

/**
 * Monta o `page_access` que dá ao destino o mesmo acesso efetivo da origem
 * em toda página, subpermissão e formulário editável na Gestão de Acessos.
 *
 * Parte das liberações manuais da origem (inclusive flags de tela, como
 * `rh_ase_ver_todas`) e só acrescenta override onde o padrão do perfil do
 * destino (papéis/setor) daria resultado diferente. Assim o destino fica com o
 * mínimo de itens "manuais", e as overrides antigas dele são descartadas.
 *
 * Páginas `alwaysAdmin` ficam de fora: não são editáveis por override.
 */
export function espelharPageAccess(origem: Profile, destino: Profile): Record<string, boolean> {
  const alvo = itensEditaveis().map(i => ({ item: i, valor: acessoEfetivo(origem, i) }));
  const resultado: Record<string, boolean> = { ...(origem.page_access || {}) };

  // As regras dependem umas das outras (o grupo muda o padrão dos formulários,
  // "formularios" libera o hub), então repete até estabilizar.
  for (let passada = 0; passada < 5; passada++) {
    let mudou = false;
    for (const { item, valor } of alvo) {
      if (acessoEfetivo({ ...destino, page_access: resultado }, item) !== valor) {
        resultado[item.id] = valor;
        mudou = true;
      }
    }
    if (!mudou) break;
  }
  // Override acrescentado aqui que não muda nada no destino (módulo travado por
  // setor/pessoa, como Facilities) não é gravado. Confere todos os itens porque
  // um override de formulário também mexe no grupo.
  const fotografia = (pa: Record<string, boolean>) =>
    alvo.map(({ item }) => acessoEfetivo({ ...destino, page_access: pa }, item)).join();
  const atual = fotografia(resultado);
  for (const { item } of alvo) {
    if (resultado[item.id] === undefined || origem.page_access?.[item.id] !== undefined) continue;
    const semOverride = { ...resultado };
    delete semOverride[item.id];
    if (fotografia(semOverride) === atual) delete resultado[item.id];
  }
  return resultado;
}

/** Quantos itens editáveis o usuário acessa — para o resumo na escolha da origem. */
export function contarAcessosEditaveis(u: Profile): number {
  return itensEditaveis().filter(i => acessoEfetivo(u, i)).length;
}

/** Quantos itens editáveis o destino ganha e perde ao espelhar a origem. */
export function resumoEspelhamento(origem: Profile, destino: Profile): { ganha: number; perde: number } {
  const novo = { ...destino, page_access: espelharPageAccess(origem, destino) };
  let ganha = 0;
  let perde = 0;
  for (const i of itensEditaveis()) {
    const antes = acessoEfetivo(destino, i);
    const depois = acessoEfetivo(novo, i);
    if (!antes && depois) ganha++;
    if (antes && !depois) perde++;
  }
  return { ganha, perde };
}

/**
 * Itens que continuam diferentes depois de espelhar. Acontece com módulos
 * travados por pessoa ou setor (Facilities, RH), que não aceitam liberação
 * manual — o destino não ganha esse acesso mesmo que a origem tenha.
 */
export function itensNaoEspelhados(origem: Profile, destinoNovo: Profile): string[] {
  return itensEditaveis()
    .filter(i => acessoEfetivo(origem, i) !== acessoEfetivo(destinoNovo, i))
    .map(i => i.label);
}
