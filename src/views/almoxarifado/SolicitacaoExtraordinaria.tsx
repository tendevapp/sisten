/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulários › Almoxarifado › Solicitação Extraordinária de Materiais
 * Estruturais (FRM.ALM-0013, código SEM-DDMMYY-NN).
 *
 * Saída de material sem saldo na ZL0024 porque a NF ainda não foi lançada.
 * O material sai agora; a baixa fica "Aguardando regularização" até alguém
 * do almoxarifado informar o documento SAP — uma a uma no detalhe ou várias
 * de uma vez na lista (a baixa no SAP costuma juntar saídas).
 *
 * Todos veem; só autor/admin edita ou exclui, e só enquanto pendente.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BadgeCheck, ClipboardPlus, FileSpreadsheet, ListChecks, Loader2, Pencil, PlusCircle, RefreshCw, Search, Trash2,
} from 'lucide-react';
import type { Profile } from '../../types';
import { useToast } from '../../components/ui/Toast';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import {
  TableBody, TableCardRow, TableCards, TableDesktop, TableEmpty, TableHeadRow, TableShell, Td, Th, Tr,
} from '../../components/ui/DataTable';
import SolicitacaoExtraForm from '../../components/almoxarifado/SolicitacaoExtraForm';
import { formatarDataBR } from '../../lib/fichaEpi';
import { formatQtd } from '../../lib/format';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import {
  CODIGO_FRM_SOL_EXTRA, STATUS_SOL_EXTRA_ROTULO, descreverMotivo, type StatusSolExtra,
} from '../../lib/solicitacaoExtra';
import {
  excluirSolicitacaoExtra, listarSolicitacoesExtra, regularizarSolicitacoesExtra, type SolExtra,
} from '../../lib/solicitacaoExtraApi';
import { exportarPlanilhaSolExtra } from '../../lib/solicitacaoExtraPlanilha';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Aba = 'nova' | 'registros';

const COR_STATUS: Record<StatusSolExtra, string> = {
  PENDENTE: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  REGULARIZADA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
};

function Status({ status }: { status: StatusSolExtra }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${COR_STATUS[status]}`}>{STATUS_SOL_EXTRA_ROTULO[status]}</span>;
}

const resumoItens = (s: SolExtra) =>
  s.itens.length === 1 ? `${s.itens[0].material} · ${s.itens[0].descricao}` : `${s.itens.length} materiais`;

export default function SolicitacaoExtraordinaria({ user, onNavigate }: Props) {
  const toast = useToast();
  const [aba, setAba] = useState<Aba>('nova');
  const [lista, setLista] = useState<SolExtra[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<StatusSolExtra | 'todos'>('PENDENTE');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [regularizando, setRegularizando] = useState<SolExtra[] | null>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await listarSolicitacoesExtra());
    } catch (err) {
      toast.error(`Falha ao carregar as solicitações: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista.filter(s => {
      if (filtroStatus !== 'todos' && s.status !== filtroStatus) return false;
      if (!termo) return true;
      return [s.codigo, s.projeto, s.tramo, s.doc_sap, s.criado_por_nome, s.motivo_detalhe, ...s.itens.flatMap(i => [i.material, i.descricao])]
        .some(v => (v || '').toLowerCase().includes(termo));
    });
  }, [lista, busca, filtroStatus]);

  const projetosSugeridos = useMemo(
    () => [...new Set(lista.map(s => s.projeto).filter((p): p is string => !!p))].sort(),
    [lista],
  );

  const pendentes = lista.filter(s => s.status === 'PENDENTE').length;
  const aberto = lista.find(s => s.id === abertoId) || null;
  const pendentesVisiveis = filtrados.filter(s => s.status === 'PENDENTE' && s.codigo);
  const selecionadas = lista.filter(s => selecionados.has(s.id));

  const alternar = (id: string) =>
    setSelecionados(atual => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const exportarExcel = () => {
    try {
      const { arquivo, linhas } = exportarPlanilhaSolExtra(filtrados);
      toast.success(`${arquivo} — ${filtrados.length} solicitação(ões), ${linhas} linha(s).`);
    } catch (err) {
      toast.error(`Não foi possível gerar o Excel: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const todosMarcados = pendentesVisiveis.length > 0 && pendentesVisiveis.every(s => selecionados.has(s.id));
  const alternarTodos = () =>
    setSelecionados(todosMarcados ? new Set() : new Set(pendentesVisiveis.map(s => s.id)));

  const abaClasse = (ativa: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
      ativa ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  const caixa = (s: SolExtra) =>
    s.status === 'PENDENTE' && s.codigo ? (
      <input
        type="checkbox"
        checked={selecionados.has(s.id)}
        onChange={() => alternar(s.id)}
        onClick={e => e.stopPropagation()}
        aria-label={`Selecionar ${s.codigo}`}
        className="h-4 w-4 accent-blue-600"
      />
    ) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-16">
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/formularios/almoxarifado')}
          className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
          Voltar ao Almoxarifado
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
            <ClipboardPlus className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50 sm:text-2xl">Solicitação Extraordinária de Materiais</h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Estruturais · {CODIGO_FRM_SOL_EXTRA} — saída de material ainda sem saldo (NF não lançada); a baixa é regularizada no SAP depois.
            </p>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 overflow-x-auto no-scrollbar rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 sm:inline-flex">
        <button type="button" className={abaClasse(aba === 'nova')} onClick={() => setAba('nova')}>
          <PlusCircle className="h-3.5 w-3.5" /> Nova solicitação
        </button>
        <button type="button" className={abaClasse(aba === 'registros')} onClick={() => setAba('registros')}>
          <ListChecks className="h-3.5 w-3.5" /> Registros ({lista.length})
          {pendentes > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white" title="Aguardando regularização">{pendentes}</span>}
        </button>
      </div>

      {aba === 'nova' ? (
        <SolicitacaoExtraForm
          user={user}
          projetosSugeridos={projetosSugeridos}
          onSalvo={() => {
            carregar();
            setAba('registros');
          }}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por código, material, projeto, tramo ou doc. SAP..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <select
              value={filtroStatus}
              onChange={e => {
                setFiltroStatus(e.target.value as StatusSolExtra | 'todos');
                setSelecionados(new Set());
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="PENDENTE">Aguardando regularização</option>
              <option value="REGULARIZADA">Regularizadas no SAP</option>
              <option value="todos">Todas</option>
            </select>
            <button
              type="button"
              onClick={carregar}
              disabled={carregando}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:text-blue-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
            </button>
            <button
              type="button"
              onClick={exportarExcel}
              disabled={filtrados.length === 0}
              title="Baixa em Excel as solicitações da lista (filtro e busca atuais), uma linha por material"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:border-emerald-400 disabled:opacity-50 dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-400"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar Excel
            </button>
          </div>

          {pendentesVisiveis.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs dark:border-amber-900 dark:bg-amber-950/30">
              <label className="inline-flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
                <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} className="h-4 w-4 accent-blue-600" />
                {selecionadas.length > 0 ? `${selecionadas.length} selecionada(s)` : 'Selecionar pendentes'}
              </label>
              <button
                type="button"
                disabled={selecionadas.length === 0}
                onClick={() => setRegularizando(selecionadas)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                <BadgeCheck className="h-3.5 w-3.5" /> Regularizar no SAP
              </button>
            </div>
          )}

          {filtrados.length === 0 ? (
            <TableEmpty
              icon={ClipboardPlus}
              title={carregando ? 'Carregando...' : filtroStatus === 'PENDENTE' ? 'Nenhuma solicitação aguardando regularização' : 'Nenhuma solicitação encontrada'}
              hint={carregando ? undefined : 'Registre uma saída na aba "Nova solicitação".'}
            />
          ) : (
            <>
              <TableCards>
                {filtrados.map(s => (
                  <TableCardRow key={s.id}>
                    <div className="flex items-start gap-2">
                      {caixa(s)}
                      <button type="button" onClick={() => setAbertoId(s.id)} className="block min-w-0 flex-1 space-y-1.5 text-left">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{s.codigo || 'Pendente de sincronização'}</span>
                          <Status status={s.status} />
                        </div>
                        <p className="line-clamp-2 text-sm text-slate-800 dark:text-slate-100">{resumoItens(s)}</p>
                        <p className="truncate text-xs text-slate-500">
                          {formatarDataBR(s.data)}{s.tramo && ` · ${s.tramo}`} · {descreverMotivo(s)}
                        </p>
                        {s.doc_sap && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Doc. SAP {s.doc_sap}</p>}
                      </button>
                    </div>
                  </TableCardRow>
                ))}
              </TableCards>
              <TableDesktop>
                <TableShell>
                  <table className="w-full text-xs">
                    <TableHeadRow>
                      <Th label="" />
                      <Th label="Código" />
                      <Th label="Data" />
                      <Th label="Tramo" />
                      <Th label="Materiais" />
                      <Th label="Motivo" />
                      <Th label="Doc. SAP" />
                      <Th label="Situação" />
                    </TableHeadRow>
                    <TableBody>
                      {filtrados.map(s => (
                        <Tr key={s.id} onClick={() => setAbertoId(s.id)}>
                          <Td>{caixa(s)}</Td>
                          <Td><span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{s.codigo || '—'}</span></Td>
                          <Td>{formatarDataBR(s.data)}</Td>
                          <Td>{s.tramo || '—'}</Td>
                          <Td><span className="line-clamp-1 max-w-xs">{resumoItens(s)}</span></Td>
                          <Td><span className="line-clamp-1 max-w-[14rem]">{descreverMotivo(s)}</span></Td>
                          <Td><span className="font-mono">{s.doc_sap || '—'}</span></Td>
                          <Td><Status status={s.status} /></Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </table>
                </TableShell>
              </TableDesktop>
            </>
          )}
        </div>
      )}

      {aberto && (
        <DetalheModal
          user={user}
          registro={aberto}
          projetosSugeridos={projetosSugeridos}
          onClose={() => setAbertoId(null)}
          onAlterado={carregar}
          onRegularizar={() => setRegularizando([aberto])}
        />
      )}

      {regularizando && (
        <RegularizarModal
          registros={regularizando}
          onClose={() => setRegularizando(null)}
          onFeito={() => {
            setRegularizando(null);
            setSelecionados(new Set());
            carregar();
          }}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Detalhe
// ===========================================================================

function DetalheModal({
  user, registro, projetosSugeridos, onClose, onAlterado, onRegularizar,
}: {
  user: Profile;
  registro: SolExtra;
  projetosSugeridos: string[];
  onClose: () => void;
  onAlterado: () => void;
  onRegularizar: () => void;
}) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const pendente = registro.status === 'PENDENTE';
  const ehAdmin = !!user.roles?.includes('admin');
  // Regularizada fica como foi baixada no SAP; só o admin mexe (o banco trava igual).
  const podeEditar = podeEditarFormulario(user, registro) && (pendente || ehAdmin);

  if (editando) {
    return (
      <Modal onClose={() => setEditando(false)} maxWidth="max-w-4xl" ariaLabel="Editar solicitação" disableOutsideClose>
        <ModalHeader onClose={() => setEditando(false)}>
          <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{registro.codigo || 'Aguardando sincronização'}</p>
          <h3 className="truncate text-base font-bold text-slate-900 dark:text-slate-50">Editar solicitação extraordinária</h3>
        </ModalHeader>
        <ModalBody className="bg-slate-50 dark:bg-slate-950/40">
          <SolicitacaoExtraForm
            user={user}
            registro={registro}
            projetosSugeridos={projetosSugeridos}
            onCancelar={() => setEditando(false)}
            onSalvo={() => {
              setEditando(false);
              onAlterado();
            }}
          />
        </ModalBody>
      </Modal>
    );
  }

  const excluir = async () => {
    setExcluindo(true);
    try {
      await excluirSolicitacaoExtra(registro.id, user.id);
      toast.success('Solicitação excluída.');
      setConfirmarExclusao(false);
      onAlterado();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Detalhe da solicitação extraordinária">
      <ModalHeader onClose={onClose}>
        <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{registro.codigo || 'Aguardando sincronização'}</p>
        <h3 className="truncate text-base font-bold text-slate-900 dark:text-slate-50">Solicitação Extraordinária de Materiais Estruturais</h3>
      </ModalHeader>

      <ModalBody className="space-y-5">
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50 sm:grid-cols-4">
          <Info rotulo="Projeto" valor={registro.projeto} />
          <Info rotulo="Nº tramo" valor={registro.tramo} />
          <Info rotulo="Data" valor={formatarDataBR(registro.data)} />
          <Info rotulo="Hora · turno" valor={[registro.hora?.slice(0, 5), registro.turno && `${registro.turno}º turno`].filter(Boolean).join(' · ')} />
          <Info rotulo="Registrado por" valor={registro.criado_por_nome} />
          <div className="col-span-1 sm:col-span-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Situação</p>
            <Status status={registro.status} />
          </div>
        </div>

        <section className="space-y-1.5">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Materiais</h4>
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-1.5 text-left">Item</th>
                  <th className="px-3 py-1.5 text-left">Código SAP</th>
                  <th className="px-3 py-1.5 text-right">Quant.</th>
                  <th className="px-3 py-1.5 text-left">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {registro.itens.map((it, i) => (
                  <tr key={`${it.material}-${i}`}>
                    <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-1.5 font-mono font-semibold text-slate-800 dark:text-slate-100">{it.material}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-100">{formatQtd(it.quantidade)} {it.unidade}</td>
                    <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">{it.descricao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Motivo</h4>
          <p className="text-sm text-slate-800 dark:text-slate-100">{descreverMotivo(registro)}</p>
          {registro.observacao && <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{registro.observacao}</p>}
        </section>

        {registro.status === 'REGULARIZADA' && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <p className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
              <BadgeCheck className="h-4 w-4" /> Baixa regularizada — doc. SAP {registro.doc_sap}
            </p>
            <p className="mt-1 text-emerald-900 dark:text-emerald-200">
              Por {registro.regularizado_por_nome || '—'}
              {registro.regularizado_em && ` em ${new Date(registro.regularizado_em).toLocaleString('pt-BR')}`}
            </p>
            {registro.regularizacao_obs && <p className="mt-1 whitespace-pre-wrap text-emerald-900 dark:text-emerald-200">{registro.regularizacao_obs}</p>}
          </section>
        )}
      </ModalBody>

      <ModalFooter>
        {podeEditar && (
          <button
            type="button"
            onClick={() => setConfirmarExclusao(true)}
            className="mr-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </button>
        )}
        {podeEditar && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Pencil className="h-4 w-4" /> Editar
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          Fechar
        </button>
        {pendente && registro.codigo && (
          <button
            type="button"
            onClick={onRegularizar}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            <BadgeCheck className="h-4 w-4" /> Regularizar no SAP
          </button>
        )}
      </ModalFooter>

      {confirmarExclusao && (
        <ConfirmDialog
          titulo="Excluir solicitação?"
          mensagem={`A solicitação ${registro.codigo || ''} sai da lista. Um administrador pode recuperá-la no banco.`}
          confirmarLabel="Excluir"
          variante="perigo"
          confirmando={excluindo}
          onCancelar={() => setConfirmarExclusao(false)}
          onConfirmar={excluir}
        />
      )}
    </Modal>
  );
}

// ===========================================================================
// Regularização (doc SAP da baixa)
// ===========================================================================

function RegularizarModal({ registros, onClose, onFeito }: { registros: SolExtra[]; onClose: () => void; onFeito: () => void }) {
  const toast = useToast();
  const [docSap, setDocSap] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    if (!docSap.trim()) {
      toast.warning('Informe o documento SAP da baixa.');
      return;
    }
    setSalvando(true);
    try {
      const qtd = await regularizarSolicitacoesExtra(registros.map(r => r.id), docSap, obs);
      if (qtd < registros.length) toast.warning(`${qtd} de ${registros.length} regularizada(s) — as demais já estavam regularizadas ou foram excluídas.`);
      else toast.success(`${qtd} solicitação(ões) regularizada(s) com o doc. SAP ${docSap.trim()}.`);
      onFeito();
    } catch (err) {
      toast.error(`Não foi possível regularizar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-md" ariaLabel="Regularizar no SAP" disableOutsideClose={salvando}>
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Regularizar baixa no SAP</h3>
        <p className="truncate text-xs text-slate-500">{registros.map(r => r.codigo).join(', ')}</p>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
            Documento SAP da baixa <span className="text-red-500">*</span>
          </label>
          <input
            value={docSap}
            onChange={e => setDocSap(e.target.value)}
            autoFocus
            inputMode="numeric"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">Observação</label>
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            rows={2}
            placeholder="Ex.: NF 12345 lançada em 22/10"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={salvando} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800">
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
          Regularizar {registros.length > 1 ? `${registros.length} solicitações` : ''}
        </button>
      </ModalFooter>
    </Modal>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="truncate font-medium text-slate-800 dark:text-slate-100">{valor || '—'}</p>
    </div>
  );
}
