/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ícone e cores de cada setor (`core_setores.id`) nos cards de Treinamentos —
 * mesmo visual dos módulos da página Formulários. Setor novo sem entrada aqui
 * cai no visual padrão; as classes ficam literais para o Tailwind enxergá-las.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Users2, Boxes, Building2, Megaphone, PackageSearch, Landmark, Calculator,
  CalendarRange, Cpu, DraftingCompass, ClipboardCheck, HeartPulse, ShieldCheck,
  Factory, Wrench, Briefcase, Scale, BarChart3, DoorOpen, GraduationCap,
} from 'lucide-react';

export interface VisualSetor {
  icon: LucideIcon;
  corIcone: string;
  corBordaHover: string;
  badgeCor: string;
}

const v = (icon: LucideIcon, corIcone: string, corBordaHover: string, badgeCor: string): VisualSetor => ({
  icon, corIcone, corBordaHover, badgeCor,
});

const VISUAL: Record<string, VisualSetor> = {
  '1': v(Users2, 'bg-gradient-to-br from-violet-500 to-purple-700 text-white shadow-violet-500/20 shadow-lg', 'hover:border-violet-500/50 hover:shadow-violet-500/10', 'bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300'),
  '2': v(Boxes, 'bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-amber-500/20 shadow-lg', 'hover:border-amber-500/50 hover:shadow-amber-500/10', 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'),
  '3': v(Building2, 'bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-slate-500/20 shadow-lg', 'hover:border-slate-500/50 hover:shadow-slate-500/10', 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'),
  '4': v(Megaphone, 'bg-gradient-to-br from-pink-500 to-rose-700 text-white shadow-pink-500/20 shadow-lg', 'hover:border-pink-500/50 hover:shadow-pink-500/10', 'bg-pink-100 text-pink-800 dark:bg-pink-950/70 dark:text-pink-300'),
  '5': v(PackageSearch, 'bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-orange-500/20 shadow-lg', 'hover:border-orange-500/50 hover:shadow-orange-500/10', 'bg-orange-100 text-orange-800 dark:bg-orange-950/70 dark:text-orange-300'),
  '6': v(Landmark, 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-emerald-500/20 shadow-lg', 'hover:border-emerald-500/50 hover:shadow-emerald-500/10', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'),
  '7': v(Calculator, 'bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-teal-500/20 shadow-lg', 'hover:border-teal-500/50 hover:shadow-teal-500/10', 'bg-teal-100 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300'),
  '8': v(CalendarRange, 'bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-blue-500/20 shadow-lg', 'hover:border-blue-500/50 hover:shadow-blue-500/10', 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300'),
  '9': v(Cpu, 'bg-gradient-to-br from-cyan-500 to-cyan-700 text-white shadow-cyan-500/20 shadow-lg', 'hover:border-cyan-500/50 hover:shadow-cyan-500/10', 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300'),
  '10': v(DraftingCompass, 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-indigo-500/20 shadow-lg', 'hover:border-indigo-500/50 hover:shadow-indigo-500/10', 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300'),
  '11': v(ClipboardCheck, 'bg-gradient-to-br from-sky-500 to-sky-700 text-white shadow-sky-500/20 shadow-lg', 'hover:border-sky-500/50 hover:shadow-sky-500/10', 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300'),
  '12': v(HeartPulse, 'bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-rose-500/20 shadow-lg', 'hover:border-rose-500/50 hover:shadow-rose-500/10', 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'),
  '13': v(ShieldCheck, 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-emerald-500/20 shadow-lg', 'hover:border-emerald-500/50 hover:shadow-emerald-500/10', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'),
  '14': v(Factory, 'bg-gradient-to-br from-red-500 to-red-700 text-white shadow-red-500/20 shadow-lg', 'hover:border-red-500/50 hover:shadow-red-500/10', 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300'),
  '15': v(Wrench, 'bg-gradient-to-br from-stone-500 to-stone-700 text-white shadow-stone-500/20 shadow-lg', 'hover:border-stone-500/50 hover:shadow-stone-500/10', 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-300'),
  '16': v(Briefcase, 'bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-slate-500/20 shadow-lg', 'hover:border-slate-500/50 hover:shadow-slate-500/10', 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'),
  '17': v(Scale, 'bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-purple-500/20 shadow-lg', 'hover:border-purple-500/50 hover:shadow-purple-500/10', 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300'),
  '18': v(BarChart3, 'bg-gradient-to-br from-lime-500 to-lime-700 text-white shadow-lime-500/20 shadow-lg', 'hover:border-lime-500/50 hover:shadow-lime-500/10', 'bg-lime-100 text-lime-800 dark:bg-lime-950/70 dark:text-lime-300'),
  '19': v(DoorOpen, 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-indigo-500/20 shadow-lg', 'hover:border-indigo-500/50 hover:shadow-indigo-500/10', 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300'),
};

const PADRAO = v(GraduationCap, 'bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-slate-500/20 shadow-lg', 'hover:border-slate-500/50 hover:shadow-slate-500/10', 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300');

/**
 * Áreas de Treinamentos que juntam vários setores num card só. Contab / Fin
 * é o mesmo trio do módulo Financeiro (SETORES_FINANCEIRO_IDS em lib/pages):
 * Contabilidade, Controladoria e Financeiro. A trilha continua gravada com o
 * setor de origem (`trein_trilhas.setor_id`); a área só agrupa na tela.
 */
const AREAS_AGRUPADAS: { id: string; nome: string; setorIds: string[]; visual: VisualSetor }[] = [
  {
    id: 'contab-fin',
    nome: 'Contab / Fin',
    setorIds: ['7', '18', '6'],
    visual: v(Calculator, 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-emerald-500/20 shadow-lg', 'hover:border-emerald-500/50 hover:shadow-emerald-500/10', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'),
  },
];

export interface AreaTreinamento {
  /** Id do setor (`core_setores.id`) ou da área agrupada (ex.: 'contab-fin'). */
  id: string;
  nome: string;
  setorIds: string[];
  visual: VisualSetor;
}

/** Cards do hub: setores agrupados viram uma área; os demais seguem um por setor. */
export function areasTreinamento(setores: { id: string; name: string }[]): AreaTreinamento[] {
  const agrupados = new Set(AREAS_AGRUPADAS.flatMap(a => a.setorIds));
  return [
    ...AREAS_AGRUPADAS.map(a => ({ id: a.id, nome: a.nome, setorIds: a.setorIds, visual: a.visual })),
    ...setores
      .filter(s => !agrupados.has(s.id))
      .map(s => ({ id: s.id, nome: s.name, setorIds: [s.id], visual: VISUAL[s.id] ?? PADRAO })),
  ];
}

/** Área pelo id da área ou de qualquer setor que ela agrupa (links antigos `?setor=7`). */
export function areaTreinamento(id: string, setores: { id: string; name: string }[]): AreaTreinamento | undefined {
  return areasTreinamento(setores).find(a => a.id === id || a.setorIds.includes(id));
}

/** Id da área (para a URL) de um setor. */
export function areaIdDoSetor(setorId: string): string {
  return AREAS_AGRUPADAS.find(a => a.setorIds.includes(setorId))?.id ?? setorId;
}

/** Nome do setor com a área agrupada entre parênteses (select do cadastro). */
export function rotuloSetor(setor: { id: string; name: string }): string {
  const area = AREAS_AGRUPADAS.find(a => a.setorIds.includes(setor.id));
  return area ? `${area.nome} — ${setor.name}` : setor.name;
}

export function visualSetor(setorId: string): VisualSetor {
  return AREAS_AGRUPADAS.find(a => a.id === setorId || a.setorIds.includes(setorId))?.visual ?? VISUAL[setorId] ?? PADRAO;
}

/** Lê `?chave=` do hash atual (`#/treinamentos/setor?setor=5`). */
export function parametroDoHash(chave: string): string | null {
  const hash = window.location.hash || '';
  const idx = hash.indexOf('?');
  if (idx < 0) return null;
  return new URLSearchParams(hash.slice(idx + 1)).get(chave);
}
