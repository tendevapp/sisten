/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Solicitações › Aprovações › Retiradas sem saldo.
 *
 * O gestor aprova (ou reprova, com motivo) as retiradas de material sem saldo
 * dos setores que aprova — `aprovador_setores`, a mesma lista das compras; o
 * admin vê todas. Uma a uma no detalhe ou várias de uma vez na lista. O nome
 * e a hora da aprovação vão para o PDF da retirada.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, PackageOpen, RefreshCw, Search, XCircle } from 'lucide-react';
import type { Profile } from '../../types';
import { useToast } from '../ui/Toast';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { TableEmpty } from '../ui/DataTable';
import { formatarDataBR } from '../../lib/fichaEpi';
import { podeAprovarRetirada, type AprovacaoSolExtra } from '../../lib/solicitacaoExtra';
import { aprovarRetiradasSemSaldo, listarRetiradasSemSaldo, type SolExtra } from '../../lib/solicitacaoExtraApi';
import { AprovacaoChip, BotaoPdfRetirada, ResumoRetirada, resumoItensRetirada } from '../almoxarifado/RetiradaSemSaldo';

type Filtro = AprovacaoSolExtra | 'todas';

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'PENDENTE', rotulo: 'Pendentes' },
  { valor: 'APROVADA', rotulo: 'Aprovadas' },
  { valor: 'REPROVADA', rotulo: 'Reprovadas' },
  { valor: 'todas', rotulo: 'Todas' },
];

/** Setores cujas retiradas o usuário vê aqui; `undefined` = todos (admin). */
export function setoresDeAprovacao(user: Profile): string[] | undefined {
  return user.roles.includes('admin') ? undefined : user.aprovador_setores ?? [];
}

export default function RetiradasSemSaldoPainel({
  user, idInicial, onPendentes,
}: {
  user: Profile;
  /** Deep link da notificação: abre esta retirada. */
  idInicial?: string | null;
  onPendentes?: (n: number) => void;
}) {
  const toast = useToast();
  const [lista, setLista] = useState<SolExtra[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('PENDENTE');
  const [busca, setBusca] = useState('');
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [abertoId, setAbertoId] = useState<string | null>(idInicial ?? null);
  const [decidindo, setDecidindo] = useState<{ registros: SolExtra[]; aprovar: boolean } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const todas = await listarRetiradasSemSaldo({ setores: setoresDeAprovacao(user) });
      setLista(todas);
      onPendentes?.(todas.filter(r => r.aprovacao_status === 'PENDENTE').length);
    } catch (err) {
      toast.error(`Falha ao carregar as retiradas: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCarregando(false);
    }
  }, [user, toast, onPendentes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista.filter(r => {
      if (filtro !== 'todas' && r.aprovacao_status !== filtro) return false;
      if (!termo) return true;
      return [r.codigo, r.retirante_nome, r.retirante_matricula, r.setor_solicitante_nome, r.criado_por_nome, ...r.itens.flatMap(i => [i.material, i.descricao])]
        .some(v => (v || '').toLowerCase().includes(termo));
    });
  }, [lista, filtro, busca]);

  const pendentesVisiveis = filtradas.filter(r => r.aprovacao_status === 'PENDENTE' && podeAprovarRetirada(r, user));
  const marcadas = lista.filter(r => selecionadas.has(r.id));
  const todasMarcadas = pendentesVisiveis.length > 0 && pendentesVisiveis.every(r => selecionadas.has(r.id));
  const aberto = lista.find(r => r.id === abertoId) || null;

  const alternar = (id: string) =>
    setSelecionadas(atual => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="flex min-w-0 overflow-x-auto no-scrollbar rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80">
          {FILTROS.map(f => (
            <button
              key={f.valor}
              type="button"
              onClick={() => { setFiltro(f.valor); setSelecionadas(new Set()); }}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold transition ${
                filtro === f.valor ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              {f.rotulo}
              {f.valor !== 'todas' && ` (${lista.filter(r => r.aprovacao_status === f.valor).length})`}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por código, quem retirou, setor ou material..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:text-blue-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {pendentesVisiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs dark:border-amber-900 dark:bg-amber-950/30">
          <label className="inline-flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
            <input
              type="checkbox"
              checked={todasMarcadas}
              onChange={() => setSelecionadas(todasMarcadas ? new Set() : new Set(pendentesVisiveis.map(r => r.id)))}
              className="h-4 w-4 accent-blue-600"
            />
            {marcadas.length > 0 ? `${marcadas.length} selecionada(s)` : 'Selecionar pendentes'}
          </label>
          <button
            type="button"
            disabled={marcadas.length === 0}
            onClick={() => setDecidindo({ registros: marcadas, aprovar: true })}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar selecionadas
          </button>
        </div>
      )}

      {filtradas.length === 0 ? (
        <TableEmpty
          icon={PackageOpen}
          title={carregando ? 'Carregando...' : filtro === 'PENDENTE' ? 'Nenhuma retirada aguardando aprovação' : 'Nenhuma retirada encontrada'}
          hint={carregando ? undefined : 'As retiradas sem saldo registradas no almoxarifado para os setores que você aprova aparecem aqui.'}
        />
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {filtradas.map(r => {
            const marcavel = r.aprovacao_status === 'PENDENTE' && podeAprovarRetirada(r, user);
            return (
              <li key={r.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900">
                {marcavel && (
                  <input
                    type="checkbox"
                    checked={selecionadas.has(r.id)}
                    onChange={() => alternar(r.id)}
                    aria-label={`Selecionar ${r.codigo}`}
                    className="mt-1 h-4 w-4 accent-blue-600"
                  />
                )}
                <button type="button" onClick={() => setAbertoId(r.id)} className="block min-w-0 flex-1 space-y-1 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{r.codigo}</span>
                    <AprovacaoChip status={r.aprovacao_status} />
                  </div>
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {r.retirante_nome}
                    {r.retirante_matricula && <span className="font-normal text-slate-500"> · {r.retirante_matricula}</span>}
                  </p>
                  <p className="line-clamp-2 text-sm text-slate-700 dark:text-slate-200">{resumoItensRetirada(r)}</p>
                  <p className="truncate text-xs text-slate-500">
                    {r.setor_solicitante_nome} · {formatarDataBR(r.data)} {r.hora?.slice(0, 5)} · registrado por {r.criado_por_nome || '—'}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {aberto && (
        <Modal onClose={() => setAbertoId(null)} maxWidth="max-w-3xl" ariaLabel="Retirada sem saldo">
          <ModalHeader onClose={() => setAbertoId(null)}>
            <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{aberto.codigo}</p>
            <h3 className="truncate text-base font-bold text-slate-900 dark:text-slate-50">Retirada de Material sem Saldo</h3>
          </ModalHeader>
          <ModalBody>
            <ResumoRetirada registro={aberto} />
          </ModalBody>
          <ModalFooter>
            <BotaoPdfRetirada registro={aberto} />
            <button type="button" onClick={() => setAbertoId(null)} className="mr-auto rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:order-first">
              Fechar
            </button>
            {aberto.aprovacao_status === 'PENDENTE' && podeAprovarRetirada(aberto, user) && (
              <>
                <button
                  type="button"
                  onClick={() => setDecidindo({ registros: [aberto], aprovar: false })}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300"
                >
                  <XCircle className="h-4 w-4" /> Reprovar
                </button>
                <button
                  type="button"
                  onClick={() => setDecidindo({ registros: [aberto], aprovar: true })}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4" /> Aprovar
                </button>
              </>
            )}
          </ModalFooter>
        </Modal>
      )}

      {decidindo && (
        <DecisaoModal
          registros={decidindo.registros}
          aprovar={decidindo.aprovar}
          onClose={() => setDecidindo(null)}
          onFeito={() => {
            setDecidindo(null);
            setSelecionadas(new Set());
            carregar();
          }}
        />
      )}
    </div>
  );
}

function DecisaoModal({
  registros, aprovar, onClose, onFeito,
}: {
  registros: SolExtra[];
  aprovar: boolean;
  onClose: () => void;
  onFeito: () => void;
}) {
  const toast = useToast();
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    if (!aprovar && !obs.trim()) {
      toast.warning('Informe o motivo da reprovação.');
      return;
    }
    setSalvando(true);
    try {
      const qtd = await aprovarRetiradasSemSaldo(registros.map(r => r.id), aprovar, obs);
      const verbo = aprovar ? 'aprovada(s)' : 'reprovada(s)';
      if (qtd < registros.length) toast.warning(`${qtd} de ${registros.length} ${verbo} — as demais já tinham sido decididas.`);
      else toast.success(`${qtd} retirada(s) ${verbo}.`);
      onFeito();
    } catch (err) {
      toast.error(`Não foi possível registrar a decisão: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-md" ariaLabel={aprovar ? 'Aprovar retirada' : 'Reprovar retirada'} disableOutsideClose={salvando}>
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
          {aprovar ? 'Aprovar' : 'Reprovar'} {registros.length > 1 ? `${registros.length} retiradas` : 'retirada'}
        </h3>
        <p className="truncate text-xs text-slate-500">{registros.map(r => r.codigo).join(', ')}</p>
      </ModalHeader>
      <ModalBody className="space-y-2">
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
          {aprovar ? 'Parecer (opcional)' : <>Motivo da reprovação <span className="text-red-500">*</span></>}
        </label>
        <textarea
          value={obs}
          onChange={e => setObs(e.target.value)}
          rows={3}
          autoFocus
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <p className="text-[11px] text-slate-500">Seu nome e a hora da decisão saem no PDF da retirada.</p>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={salvando} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800">
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={salvando}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60 ${aprovar ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : aprovar ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {aprovar ? 'Aprovar' : 'Reprovar'}
        </button>
      </ModalFooter>
    </Modal>
  );
}
