/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Página "Sobre" — explica o que o SISTEN faz e onde cada área vive no menu.
 *
 * Aberta a todos os perfis (sem gate de permissão). Os cartões consultam
 * `localDb.hasPermission` apenas para dizer, com honestidade, o que o perfil de
 * quem está lendo consegue abrir — em vez de levar a pessoa a uma rota que a
 * App.tsx devolveria para o Início.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Search, PlusCircle, FileCheck, Database, Boxes, Route, LayoutDashboard,
  Building2, PackageSearch, History, Radio, BarChart3, Shield, Upload,
  Activity, ArrowRight, Lock, Home, KeyRound, User
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile } from '../types';

interface SobreProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

/** Marca o elemento como visível quando ele entra na viewport (revelação em cascata). */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    el.querySelectorAll('.sobre-reveal, .sobre-track').forEach(node => obs.observe(node));
    return () => obs.disconnect();
  }, []);
  return ref;
}

type Acesso = { module: string; action: string } | 'universal';

interface Modulo {
  label: string;
  path: string;
  icon: React.ElementType;
  desc: string;
  acesso: Acesso;
}

const ETAPAS: (Modulo & { etapa: string })[] = [
  {
    etapa: 'Encontrar',
    label: 'Catálogo SAP',
    path: '/materiais/busca',
    icon: Search,
    desc: 'Busque o material pelo código ou pela descrição antes de pedir. Evita item duplicado e cadastro novo sem necessidade.',
    acesso: { module: 'materiais', action: 'visualizar' },
  },
  {
    etapa: 'Pedir',
    label: 'Nova Solicitação',
    path: '/solicitacoes/nova',
    icon: PlusCircle,
    desc: 'Monte a solicitação com itens, quantidade, criticidade e justificativa. O acompanhamento fica em Minhas Solicitações.',
    acesso: { module: 'solicitacoes', action: 'criar' },
  },
  {
    etapa: 'Aprovar',
    label: 'Aprovações',
    path: '/solicitacoes/aprovacoes',
    icon: FileCheck,
    desc: 'O gestor do setor libera, devolve para revisão ou recusa. Nada segue para suprimentos sem passar por aqui.',
    acesso: { module: 'compras', action: 'visualizar_setor' },
  },
  {
    etapa: 'Comprar',
    label: 'Painel SAP',
    path: '/suprimentos/painel',
    icon: Database,
    desc: 'Suprimentos trata a requisição no painel, negocia com o fornecedor e emite o pedido de compra.',
    acesso: { module: 'sap', action: 'visualizar_painel' },
  },
  {
    etapa: 'Receber',
    label: 'Estoque',
    path: '/almoxarifado/estoque',
    icon: Boxes,
    desc: 'O almoxarifado registra a entrada, controla saldo por depósito e devolve o item ao giro da obra.',
    acesso: { module: 'almoxarifado', action: 'visualizar' },
  },
];

const MODULOS: { grupo: string; itens: Modulo[] }[] = [
  {
    grupo: 'Suprimentos',
    itens: [
      {
        label: 'Central Compras', path: '/suprimentos/fornecedores-sem-po', icon: PackageSearch,
        desc: 'Requisições que ainda não viraram pedido, agrupadas por fornecedor.',
        acesso: { module: 'sap', action: 'fornecedores' },
      },
      {
        label: 'Fornecedores', path: '/suprimentos/fornecedores', icon: Building2,
        desc: 'Cadastro, contatos, cidade e país de quem atende a operação.',
        acesso: { module: 'sap', action: 'fornecedores' },
      },
      {
        label: 'Histórico', path: '/suprimentos/historico', icon: History,
        desc: 'Todo pedido já emitido, com preço, prazo e quem comprou.',
        acesso: { module: 'sap', action: 'fornecedores' },
      },
      {
        label: 'Dashboards', path: '/suprimentos/dashboards', icon: LayoutDashboard,
        desc: 'Demandas, análise de compras e indicadores sob o mesmo filtro.',
        acesso: { module: 'sap', action: 'dashboards' },
      },
      {
        label: 'Cadastros SAP', path: '/suprimentos/cadastros-sap', icon: KeyRound,
        desc: 'Pedidos de cadastro de material e fornecedor no SAP.',
        acesso: { module: 'cadastro_sap', action: 'atender' },
      },
      {
        label: 'Importar SAP', path: '/suprimentos/importar', icon: Upload,
        desc: 'Carga das planilhas do SAP que alimentam painel e histórico.',
        acesso: { module: 'sap', action: 'importar' },
      },
    ],
  },
  {
    grupo: 'Apoio e leitura',
    itens: [
      {
        label: 'Início', path: '/', icon: Home,
        desc: 'Suas pendências do dia e atalhos para o que está em aberto.',
        acesso: { module: 'solicitacoes', action: 'visualizar_proprias' },
      },
      {
        label: 'Relatórios', path: '/relatorios', icon: BarChart3,
        desc: 'Exportações e recortes para levar o dado para fora do sistema.',
        acesso: { module: 'materiais', action: 'visualizar' },
      },
      {
        label: 'Almox. Dashboards', path: '/almoxarifado/dashboards', icon: LayoutDashboard,
        desc: 'Giro, cobertura e curva ABC do material parado em estoque.',
        acesso: { module: 'almoxarifado', action: 'visualizar' },
      },
      {
        label: 'Atendimento', path: '/helpdesk', icon: Radio,
        desc: 'Fila de chamados do seu setor, do abrir ao resolver.',
        acesso: { module: 'chamados', action: 'atender_setor' },
      },
      {
        label: 'Uso do App', path: '/admin/uso', icon: Activity,
        desc: 'Quem usa o SISTEN, com que frequência e em quais telas.',
        acesso: { module: 'admin', action: 'uso' },
      },
      {
        label: 'Permissões', path: '/admin/permissoes', icon: Shield,
        desc: 'O que cada perfil enxerga e pode fazer em cada módulo.',
        acesso: { module: 'admin', action: 'auditoria' },
      },
    ],
  },
];

/** Linhas de vento do herói — sem aleatoriedade, para não mudar a cada render. */
const CORRENTES = [
  { top: '14%', width: '38%', delay: '0s', dur: '11s', opacity: 0.55 },
  { top: '27%', width: '22%', delay: '2.4s', dur: '8.5s', opacity: 0.35 },
  { top: '41%', width: '52%', delay: '1.1s', dur: '14s', opacity: 0.28 },
  { top: '58%', width: '30%', delay: '3.6s', dur: '9.5s', opacity: 0.45 },
  { top: '71%', width: '44%', delay: '0.7s', dur: '12.5s', opacity: 0.22 },
  { top: '86%', width: '26%', delay: '4.8s', dur: '10s', opacity: 0.4 },
];

export default function Sobre({ user, onNavigate }: SobreProps) {
  const rootRef = useReveal<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);

  const podeAbrir = (acesso: Acesso) =>
    acesso === 'universal' || localDb.hasPermission(user, acesso.module, acesso.action);

  const primeiroNome = (user.name || '').trim().split(' ')[0];

  return (
    <div ref={rootRef} className="sobre space-y-6 text-left">
      {/* ---------------------------------------------------------------- */}
      {/* Herói                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="sobre-hero relative overflow-hidden rounded-3xl bg-[#071223] px-6 py-14 sm:px-12 sm:py-20">
        {/* Céu e chão da marca, em campo aberto */}
        <div className="pointer-events-none absolute inset-0 opacity-90"
          style={{ background: 'radial-gradient(120% 90% at 78% 12%, rgba(10,131,230,0.34) 0%, rgba(7,18,35,0) 60%), radial-gradient(70% 65% at 84% 112%, rgba(245,130,31,0.26) 0%, rgba(7,18,35,0) 62%)' }}
        />
        {/* Correntes de ar */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-60" aria-hidden="true">
          {CORRENTES.map((c, i) => (
            <span
              key={i}
              className="sobre-stream absolute h-px rounded-full"
              style={{
                top: c.top,
                width: c.width,
                opacity: c.opacity,
                animationDuration: c.dur,
                animationDelay: c.delay,
                background: 'linear-gradient(90deg, rgba(226,232,240,0) 0%, rgba(226,232,240,0.9) 55%, rgba(226,232,240,0) 100%)',
              }}
            />
          ))}
        </div>

        {/* Véu sobre a coluna de texto: sem ele as correntes de ar cruzam as
            linhas do título e leem como texto riscado. */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-full lg:w-[70%]"
          aria-hidden="true"
          style={{ background: 'linear-gradient(90deg, #071223 0%, rgba(7,18,35,0.92) 45%, rgba(7,18,35,0) 100%)' }}
        />

        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
          <div>
            <p className="sobre-reveal text-[11px] font-bold uppercase tracking-[0.42em] text-[#7fbcf5]">
              Torres Eólicas do Nordeste
            </p>

            <h1
              className="sobre-reveal sobre-d1 mt-5 font-display text-4xl leading-[1.16] text-white sm:text-6xl sm:leading-[1.04]"
              style={{ fontStretch: '115%', fontWeight: 700, letterSpacing: '-0.015em' }}
            >
              O caminho de cada compra,
              <br className="hidden sm:block" />{' '}
              <span className="sobre-grifo">em um só sistema.</span>
            </h1>

            <p className="sobre-reveal sobre-d2 mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              {primeiroNome ? `${primeiroNome}, o ` : 'O '}SISTEN liga catálogo SAP, solicitações, aprovações,
              suprimentos, almoxarifado e helpdesk na mesma trilha. Esta página mostra
              o que cada área resolve e onde encontrá-la no menu.
            </p>

            <p className="sobre-reveal sobre-d3 mt-8 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
              Catálogo · Solicitações · Suprimentos · Almoxarifado · Helpdesk
            </p>
          </div>

          {/* Rotor — a assinatura da página */}
          <div className="sobre-reveal sobre-d2 relative mx-auto hidden h-56 w-56 lg:block" aria-hidden="true">
            <svg viewBox="0 0 200 200" className="h-full w-full">
              <circle cx="100" cy="100" r="86" fill="none" stroke="#1e3a5f" strokeWidth="1" />
              <circle cx="100" cy="100" r="62" fill="none" stroke="#1e3a5f" strokeWidth="1" strokeDasharray="2 7" />
              <g className="sobre-rotor">
                <path d="M100 100 L100 18" stroke="#e2e8f0" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M100 100 L29 141" stroke="#e2e8f0" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M100 100 L171 141" stroke="#e2e8f0" strokeWidth="3.5" strokeLinecap="round" />
              </g>
              <circle cx="100" cy="100" r="7" fill="#f5821f" />
              <circle cx="100" cy="100" r="13" fill="none" stroke="#f5821f" strokeWidth="1" strokeOpacity="0.5" />
            </svg>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* A trilha de uma compra                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-10 sm:px-10 sm:py-12 dark:border-slate-800">
        <header className="sobre-reveal max-w-2xl">
          <h2 className="font-display text-2xl text-slate-900 sm:text-3xl dark:text-slate-50" style={{ fontStretch: '112%', fontWeight: 700 }}>
            A trilha de uma compra
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            As cinco etapas acontecem nesta ordem, sempre. Cada uma tem uma tela própria —
            e a etapa seguinte só enxerga o que a anterior liberou.
          </p>
        </header>

        <div className="relative mt-10">
          {/* Trilho horizontal (desktop) e vertical (mobile) */}
          <div className="sobre-track absolute left-0 top-7 hidden h-px w-full bg-gradient-to-r from-[#0a83e6] via-[#0a83e6] to-[#f5821f] md:block" />
          <div className="sobre-track sobre-track-v absolute left-7 top-0 h-full w-px bg-gradient-to-b from-[#0a83e6] via-[#0a83e6] to-[#f5821f] md:hidden" />

          <ol className="relative grid gap-8 md:grid-cols-5 md:gap-5">
            {ETAPAS.map((etapa, i) => {
              const Icon = etapa.icon;
              const liberado = podeAbrir(etapa.acesso);
              const ativo = hover === etapa.path;
              return (
                <li
                  key={etapa.path}
                  className="sobre-reveal relative pl-20 md:pl-0"
                  style={{ transitionDelay: `${120 + i * 90}ms` }}
                >
                  <div className="absolute left-0 top-0 md:relative md:mb-5">
                    <span
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl border transition-all duration-300 ${
                        ativo
                          ? 'border-[#0a83e6] bg-[#0a83e6] text-white shadow-lg shadow-[#0a83e6]/25 -translate-y-0.5'
                          : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                  </div>

                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#0a83e6]">
                    {etapa.etapa}
                  </p>

                  {liberado ? (
                    <button
                      type="button"
                      onClick={() => onNavigate(etapa.path)}
                      onMouseEnter={() => setHover(etapa.path)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(etapa.path)}
                      onBlur={() => setHover(null)}
                      className="group mt-1 flex items-center gap-1.5 rounded text-left text-base font-bold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a83e6] focus-visible:ring-offset-2 dark:text-slate-50"
                    >
                      {etapa.label}
                      <ArrowRight className="h-4 w-4 shrink-0 text-[#0a83e6] transition-transform duration-300 group-hover:translate-x-1" />
                    </button>
                  ) : (
                    <p className="mt-1 flex items-center gap-1.5 text-base font-bold text-slate-500 dark:text-slate-400">
                      {etapa.label}
                      <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    </p>
                  )}

                  <p className="mt-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
                    {etapa.desc}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Rastreio atravessa a trilha inteira — por isso vive fora da sequência. */}
        <div
          className="sobre-reveal sobre-d2 group relative mt-10 overflow-hidden rounded-2xl border border-[#f5821f]/30 px-6 py-6 sm:px-8"
          style={{ background: 'linear-gradient(100deg, rgba(245,130,31,0.10) 0%, rgba(255,204,0,0.06) 100%)' }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f5821f] to-[#ffcc00] text-white">
                <Route className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#b45309] dark:text-[#f5821f]">
                  Atravessa as cinco etapas
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-50">Rastreio Compras</h3>
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
                  Onde está o seu item agora: solicitação, aprovação, requisição SAP, pedido e recebimento
                  em uma linha do tempo só. Aberto a todos os perfis, somente leitura.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/rastreio')}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5821f] focus-visible:ring-offset-2 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Abrir rastreio
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Demais módulos                                                    */}
      {/* ---------------------------------------------------------------- */}
      {MODULOS.map(({ grupo, itens }) => (
        <section key={grupo} className="rounded-3xl border border-slate-200 bg-white px-5 py-10 sm:px-10 dark:border-slate-800">
          <h2 className="sobre-reveal font-display text-2xl text-slate-900 dark:text-slate-50" style={{ fontStretch: '112%', fontWeight: 700 }}>
            {grupo}
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {itens.map((mod, i) => {
              const Icon = mod.icon;
              const liberado = podeAbrir(mod.acesso);
              // `flex flex-col` na classe do cartão é o que mantém título e texto
              // alinhados no topo: um <button> centraliza o próprio conteúdo por
              // padrão, e os cartões liberados desciam em relação aos bloqueados.
              const Wrapper = liberado ? 'button' : 'div';
              return (
                <Wrapper
                  key={mod.path}
                  {...(liberado
                    ? { type: 'button' as const, onClick: () => onNavigate(mod.path) }
                    : {})}
                  className={`sobre-reveal sobre-card group relative flex flex-col overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 ${
                    liberado
                      ? 'cursor-pointer border-slate-200 hover:-translate-y-1 hover:border-[#0a83e6]/40 hover:shadow-xl hover:shadow-slate-900/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a83e6] dark:border-slate-800 dark:hover:border-[#0a83e6]/50'
                      : 'border-dashed border-slate-200 opacity-70 dark:border-slate-800'
                  }`}
                  style={{ transitionDelay: `${i * 60}ms` }}
                >
                  {/* Barra de acento que sobe no hover */}
                  {liberado && (
                    <span className="sobre-acento absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-[#0a83e6] to-[#f5821f]" />
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-300 ${
                        liberado
                          ? 'bg-slate-100 text-slate-600 group-hover:bg-[#0a83e6] group-hover:text-white dark:bg-slate-800 dark:text-slate-300'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    {liberado ? (
                      <ArrowRight className="mt-2.5 h-4 w-4 shrink-0 text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-[#0a83e6]" />
                    ) : (
                      <Lock className="mt-2.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                  </div>

                  <h3 className="mt-4 text-[15px] font-bold text-slate-900 dark:text-slate-50">{mod.label}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{mod.desc}</p>

                  {!liberado && (
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                      Fora do seu perfil
                    </p>
                  )}
                </Wrapper>
              );
            })}
          </div>
        </section>
      ))}

      {/* ---------------------------------------------------------------- */}
      {/* Acesso e ajuda                                                    */}
      {/* ---------------------------------------------------------------- */}
      <section className="sobre-reveal relative overflow-hidden rounded-3xl bg-[#071223] px-6 py-10 sm:px-10">
        <div className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(90% 120% at 100% 0%, rgba(10,131,230,0.25) 0%, rgba(7,18,35,0) 60%)' }}
        />
        <div className="relative grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl text-white" style={{ fontStretch: '112%', fontWeight: 700 }}>
              O menu mostra só o que o seu perfil abre
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-300">
              Cada perfil — solicitante, gestor, comprador, almoxarife, atendente, administrador —
              enxerga um recorte diferente do menu lateral. Os cartões marcados com cadeado nesta página
              existem no SISTEN, mas ficam fora do seu acesso. Precisa de um deles? Peça ao administrador
              pelo Helpdesk.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3 sm:flex-row sm:items-center lg:justify-end">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071223]"
            >
              <Home className="h-4 w-4" />
              Ir para o Início
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/perfil')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition-colors duration-200 hover:border-slate-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071223]"
            >
              <User className="h-4 w-4" />
              Ver meu perfil
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
