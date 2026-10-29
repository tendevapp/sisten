/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Geral › Pendências — o que está parado esperando o setor do usuário.
 *
 * Uma aba por assunto, e cada aba aparece só para quem trata aquela pendência:
 *  - Retiradas sem saldo:
 *    - Almoxarifado (e admin): retiradas (RSS) aguardando baixa — quando a NF é
 *      lançada e o item ganha saldo na ZL0024, "Dar baixa" gera a Requisição no
 *      Balcão e tira a retirada da lista;
 *    - aprovadores de setor (e admin): retiradas do setor aguardando aprovação,
 *      com atalho para Solicitações › Aprovações.
 *  - Processamento de NF: setor Suprimentos (e liberações individuais do admin)
 *    — a tela que antes era Suprimentos › Pendências de Processamento.
 *
 * `?aba=` abre a aba direto (notificações e o endereço antigo usam).
 * Pendência nova de outro módulo entra como mais uma aba aqui.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, CheckCircle2, ListTodo, PackageCheck, PackageOpen, ReceiptText, RefreshCw, XCircle } from 'lucide-react';
import type { Profile } from '../types';
import { useToast } from '../components/ui/Toast';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../components/ui/Modal';
import { localDb } from '../db/localDb';
import { formatarDataBR } from '../lib/fichaEpi';
import { listarRetiradasSemSaldo, type SolExtra } from '../lib/solicitacaoExtraApi';
import { podeDarBaixaRetirada } from '../lib/retiradaSemSaldoBaixa';
import {
  AprovacaoChip, BaixaRetiradaModal, BotaoPdfRetirada, ResumoRetirada, resumoItensRetirada,
} from '../components/almoxarifado/RetiradaSemSaldo';
import { DecisaoModal, setoresDeAprovacao } from '../components/aprovacoes/RetiradasSemSaldoPainel';
import { podeAprovarRetirada } from '../lib/solicitacaoExtra';
import { canAccessPage } from '../lib/pages';
import { contarNotasAguardando } from '../lib/supPendenciasApi';
import PendenciasProcessamento from './PendenciasProcessamento';
import {
  FiltroSaldo, LegendaZl0024, SaldoChip, contarProntidao, useProntidaoSaldo, type FiltroProntidao,
} from '../components/almoxarifado/SaldoRegularizacao';
import type { SaldoParaRegularizar } from '../lib/retiradaSemSaldoBaixa';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Aba = 'retiradas' | 'processamento';

const ehAprovadorDeSetor = (user: Profile) => user.roles.includes('admin') || (user.aprovador_setores?.length ?? 0) > 0;

function abaDaRota(): Aba | null {
  const aba = new URLSearchParams(window.location.hash.split('?')[1] || '').get('aba');
  return aba === 'retiradas' || aba === 'processamento' ? aba : null;
}

export default function Pendencias({ user, onNavigate, abaInicial }: Props & { abaInicial?: Aba }) {
  const nomeSetor = useMemo(() => localDb.getSectors().find(s => s.id === user.sector_id)?.name, [user.sector_id]);
  const abas = useMemo(() => {
    const lista: { id: Aba; rotulo: string; icone: typeof ListTodo }[] = [];
    if (podeDarBaixaRetirada(user) || ehAprovadorDeSetor(user)) lista.push({ id: 'retiradas', rotulo: 'Retiradas sem saldo', icone: PackageOpen });
    if (canAccessPage(user, 'sup_pendencias_processamento')) lista.push({ id: 'processamento', rotulo: 'Processamento de NF', icone: ReceiptText });
    return lista;
  }, [user]);
  const [aba, setAba] = useState<Aba | undefined>(() => {
    const pedida = abaInicial ?? abaDaRota();
    return abas.find(a => a.id === pedida)?.id ?? abas[0]?.id;
  });
  const [notasAguardando, setNotasAguardando] = useState(0);

  useEffect(() => {
    if (!abas.some(a => a.id === 'processamento')) return;
    let vivo = true;
    contarNotasAguardando().then(n => { if (vivo) setNotasAguardando(n); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [abas, aba]);

  const trocarAba = (nova: Aba) => {
    setAba(nova);
    // Sem disparar hashchange: só deixa o endereço certo para recarregar/compartilhar.
    try { window.history.replaceState(null, '', `#/pendencias?aba=${nova}`); } catch { /* sem history: segue igual */ }
  };

  return (
    <div className={`space-y-5 pb-16 ${aba === 'processamento' ? 'w-full' : 'mx-auto max-w-5xl'}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
          <ListTodo className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50 sm:text-2xl">Pendências</h1>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            O que está esperando {nomeSetor ? `o setor ${nomeSetor}` : 'o seu setor'}.
          </p>
        </div>
      </div>

      {abas.length > 1 && (
        <div className="flex min-w-0 overflow-x-auto no-scrollbar rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 sm:inline-flex">
          {abas.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => trocarAba(a.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                aba === a.id ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <a.icone className="h-3.5 w-3.5" /> {a.rotulo}
              {a.id === 'processamento' && notasAguardando > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{notasAguardando}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {!aba ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Nenhuma retirada sem saldo pendente</p>
        </div>
      ) : aba === 'processamento' ? (
        <PendenciasProcessamento user={user} onNavigate={onNavigate} embutida />
      ) : (
        <RetiradasPendentes user={user} onNavigate={onNavigate} />
      )}
    </div>
  );
}

/** Aba "Retiradas sem saldo": baixa do almoxarifado e aprovação dos gestores. */
function RetiradasPendentes({ user, onNavigate }: Props) {
  const toast = useToast();
  const ehAlmox = podeDarBaixaRetirada(user);
  const ehAprovador = ehAprovadorDeSetor(user);

  const [aguardandoBaixa, setAguardandoBaixa] = useState<SolExtra[]>([]);
  const [aguardandoAprovacao, setAguardandoAprovacao] = useState<SolExtra[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<SolExtra | null>(null);
  const [baixando, setBaixando] = useState<SolExtra | null>(null);
  const [decidindo, setDecidindo] = useState<{ registro: SolExtra; aprovar: boolean } | null>(null);
  // Saldo da ZL0024 relido junto com a lista: quais retiradas já dá para baixar.
  const [versaoSaldo, setVersaoSaldo] = useState(0);
  const saldo = useProntidaoSaldo(ehAlmox ? versaoSaldo : 0);
  const [filtroSaldo, setFiltroSaldo] = useState<FiltroProntidao>('todas');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setVersaoSaldo(v => v + 1);
    try {
      const [baixa, aprovacao] = await Promise.all([
        ehAlmox ? listarRetiradasSemSaldo({ status: 'PENDENTE' }) : Promise.resolve([]),
        ehAprovador ? listarRetiradasSemSaldo({ aprovacao: 'PENDENTE', setores: setoresDeAprovacao(user) }) : Promise.resolve([]),
      ]);
      // Mais antigas primeiro: é a fila de trabalho.
      setAguardandoBaixa([...baixa].reverse());
      setAguardandoAprovacao([...aprovacao].reverse());
    } catch (err) {
      toast.error(`Falha ao carregar as pendências: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCarregando(false);
    }
  }, [ehAlmox, ehAprovador, user, toast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const nada = !carregando && aguardandoBaixa.length === 0 && aguardandoAprovacao.length === 0;
  const contagemSaldo = useMemo(() => contarProntidao(aguardandoBaixa.map(r => r.id), saldo.porId), [aguardandoBaixa, saldo.porId]);
  const baixaVisivel = useMemo(
    () => (filtroSaldo === 'todas' ? aguardandoBaixa : aguardandoBaixa.filter(r => saldo.porId?.get(r.id)?.prontidao === filtroSaldo)),
    [aguardandoBaixa, filtroSaldo, saldo.porId],
  );

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:text-blue-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {nada && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Nenhuma pendência para o seu setor</p>
        </div>
      )}

      {ehAlmox && aguardandoBaixa.length > 0 && (
        <Bloco
          icone={PackageCheck}
          titulo="Almoxarifado — retiradas sem saldo aguardando baixa"
          descricao="Quando a NF for lançada e o item tiver saldo na ZL0024, dê baixa: a Requisição no Balcão sai preenchida e a retirada deixa a lista."
          total={aguardandoBaixa.length}
          filtro={
            <div className="space-y-1">
              <FiltroSaldo valor={filtroSaldo} onChange={setFiltroSaldo} contagem={contagemSaldo} />
              <LegendaZl0024 importadoEm={saldo.importadoEm} carregando={saldo.carregando} erro={saldo.erro} />
            </div>
          }
        >
          {baixaVisivel.length === 0 && (
            <li className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700 lg:col-span-2">
              Nenhuma retirada nesta situação.
            </li>
          )}
          {baixaVisivel.map(r => (
            <CartaoRetirada key={r.id} registro={r} saldo={saldo.porId?.get(r.id)} onAbrir={() => setAberto(r)}>
              <BotaoPdfRetirada
                registro={r}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              <button
                type="button"
                disabled={!r.codigo}
                onClick={() => setBaixando(r)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <PackageCheck className="h-3.5 w-3.5" /> Dar baixa
              </button>
            </CartaoRetirada>
          ))}
        </Bloco>
      )}

      {ehAprovador && aguardandoAprovacao.length > 0 && (
        <Bloco
          icone={PackageOpen}
          titulo="Retiradas sem saldo aguardando a sua aprovação"
          descricao="Material retirado no almoxarifado para o setor que você aprova."
          total={aguardandoAprovacao.length}
          acao={
            <button
              type="button"
              onClick={() => onNavigate('/solicitacoes/aprovacoes?tipo=sem-saldo')}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline dark:text-blue-400"
            >
              Abrir em Aprovações <ArrowRight className="h-3.5 w-3.5" />
            </button>
          }
        >
          {aguardandoAprovacao.map(r => (
            <CartaoRetirada key={r.id} registro={r} onAbrir={() => onNavigate(`/solicitacoes/aprovacoes?tipo=sem-saldo&id=${r.id}`)} />
          ))}
        </Bloco>
      )}

      {aberto && (
        <Modal onClose={() => setAberto(null)} maxWidth="max-w-3xl" ariaLabel="Retirada sem saldo">
          <ModalHeader onClose={() => setAberto(null)}>
            <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{aberto.codigo}</p>
            <h3 className="truncate text-base font-bold text-slate-900 dark:text-slate-50">Retirada de Material sem Saldo</h3>
          </ModalHeader>
          <ModalBody>
            <ResumoRetirada registro={aberto} />
          </ModalBody>
          <ModalFooter>
            <BotaoPdfRetirada registro={aberto} />
            <button type="button" onClick={() => setAberto(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              Fechar
            </button>
            {aberto.aprovacao_status === 'PENDENTE' && aberto.codigo && podeAprovarRetirada(aberto, user) && (
              <>
                <button
                  type="button"
                  onClick={() => setDecidindo({ registro: aberto, aprovar: false })}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300"
                >
                  <XCircle className="h-4 w-4" /> Reprovar
                </button>
                <button
                  type="button"
                  onClick={() => setDecidindo({ registro: aberto, aprovar: true })}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-300"
                >
                  <CheckCircle2 className="h-4 w-4" /> Aprovar
                </button>
              </>
            )}
            {ehAlmox && aberto.status === 'PENDENTE' && aberto.codigo && (
              <button
                type="button"
                onClick={() => { setBaixando(aberto); setAberto(null); }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <PackageCheck className="h-4 w-4" /> Dar baixa
              </button>
            )}
          </ModalFooter>
        </Modal>
      )}

      {decidindo && (
        <DecisaoModal
          registros={[decidindo.registro]}
          aprovar={decidindo.aprovar}
          onClose={() => setDecidindo(null)}
          onFeito={() => {
            setDecidindo(null);
            setAberto(null);
            carregar();
          }}
        />
      )}

      {baixando && (
        <BaixaRetiradaModal
          registro={baixando}
          user={user}
          onNavigate={onNavigate}
          onClose={() => setBaixando(null)}
          onFeito={carregar}
        />
      )}
    </div>
  );
}

function Bloco({
  icone: Icone, titulo, descricao, total, acao, filtro, children,
}: {
  icone: typeof ListTodo;
  titulo: string;
  descricao: string;
  total: number;
  acao?: ReactNode;
  /** Entre o cabeçalho e a lista. */
  filtro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icone className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
              {titulo} <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[11px] text-white">{total}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{descricao}</p>
          </div>
        </div>
        {acao}
      </header>
      {filtro}
      <ul className="grid gap-2 lg:grid-cols-2">{children}</ul>
    </section>
  );
}

function CartaoRetirada({
  registro: r, saldo, onAbrir, children,
}: {
  registro: SolExtra;
  /** Situação frente à ZL0024 — só no bloco de baixa do almoxarifado. */
  saldo?: SaldoParaRegularizar;
  onAbrir: () => void;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 transition hover:border-blue-300 dark:border-slate-800">
      <button type="button" onClick={onAbrir} className="block min-w-0 space-y-1 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{r.codigo || 'Pendente de sincronização'}</span>
          <AprovacaoChip status={r.aprovacao_status} />
        </div>
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
          {r.retirante_nome}
          {r.retirante_matricula && <span className="font-normal text-slate-500"> · {r.retirante_matricula}</span>}
        </p>
        <SaldoChip saldo={saldo} />
        <p className="line-clamp-2 text-sm text-slate-700 dark:text-slate-200">{resumoItensRetirada(r)}</p>
        <p className="truncate text-xs text-slate-500">
          {r.setor_solicitante_nome} · {formatarDataBR(r.data)} {r.hora?.slice(0, 5)}
        </p>
      </button>
      {children && <div className="flex flex-wrap justify-end gap-2">{children}</div>}
    </li>
  );
}
