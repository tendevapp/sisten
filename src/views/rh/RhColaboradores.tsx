/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo RH — cadastro de colaboradores (`rh_pessoas`).
 *
 * A base chega pela importação da planilha do RH (Admin › Importação de
 * Planilhas), mas correção pontual não deveria exigir reimportar a planilha
 * inteira: aqui o RH cadastra, edita e inativa um colaborador direto.
 *
 * Os filtros são os mesmos campos da planilha — macroárea, área, subsetor,
 * cargo, turno e situação — encadeados, para que cada seleção só ofereça o que
 * ainda existe dentro das anteriores.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, Plus, Search, Edit2, RefreshCw, ArrowLeft, Loader2, Filter,
  CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import type { Profile, RhPessoa } from '../../types';
import * as api from '../../lib/rhApi';
import { useToast } from '../../components/ui/Toast';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type CampoFiltro = 'macroarea' | 'area' | 'subsetor' | 'cargo' | 'turno';

const ROTULO: Record<CampoFiltro, string> = {
  macroarea: 'Macroárea',
  area: 'Área',
  subsetor: 'Subsetor',
  cargo: 'Cargo',
  turno: 'Turno',
};

const CAMPOS: CampoFiltro[] = ['macroarea', 'area', 'subsetor', 'cargo', 'turno'];

const FORM_VAZIO = {
  registro: '', nome: '', chave_nome: '', macroarea: '', area: '',
  subsetor: '', cargo: '', lideranca: '', turno: '', situacao: '',
};

const semAcento = (v: string) => v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function RhColaboradores({ user, onNavigate }: Props) {
  const toast = useToast();

  const [pessoas, setPessoas] = useState<RhPessoa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useState<Record<CampoFiltro, string>>({
    macroarea: '', area: '', subsetor: '', cargo: '', turno: '',
  });
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('ATIVOS');

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<RhPessoa | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      setPessoas(await api.listarRhPessoas());
    } catch (err: any) {
      toast.error('Erro ao carregar os colaboradores: ' + (err.message || ''));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  /** Aplica os filtros até `pararEm` (exclusive) — base das opções encadeadas. */
  const filtrarAte = (lista: RhPessoa[], pararEm: number) =>
    lista.filter(p => CAMPOS.slice(0, pararEm).every(campo => {
      const escolhido = filtros[campo];
      return !escolhido || (p[campo] || '') === escolhido;
    }));

  const opcoes = useMemo(() => {
    const mapa = {} as Record<CampoFiltro, string[]>;
    CAMPOS.forEach((campo, i) => {
      const valores = new Set<string>();
      filtrarAte(pessoas, i).forEach(p => {
        const valor = (p[campo] || '').trim();
        if (valor) valores.add(valor);
      });
      if (filtros[campo]) valores.add(filtros[campo]);
      mapa[campo] = Array.from(valores).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    });
    return mapa;
  }, [pessoas, filtros]);

  const filtradas = useMemo(() => {
    const q = semAcento(busca.trim());
    return filtrarAte(pessoas, CAMPOS.length)
      .filter(p => {
        if (filtroStatus === 'ATIVOS' && !p.ativo) return false;
        if (filtroStatus === 'INATIVOS' && p.ativo) return false;
        if (!q) return true;
        return semAcento(p.nome).includes(q)
          || p.registro.toLowerCase().includes(q)
          || semAcento(p.chave_nome || '').includes(q);
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [pessoas, filtros, busca, filtroStatus]);

  const totalAtivos = useMemo(() => pessoas.filter(p => p.ativo).length, [pessoas]);
  const filtrosAtivos = CAMPOS.filter(c => filtros[c]).length + (busca.trim() ? 1 : 0);

  const abrirNovo = () => {
    setEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  };

  const abrirEdicao = (p: RhPessoa) => {
    setEditando(p);
    setForm({
      registro: p.registro, nome: p.nome, chave_nome: p.chave_nome || '',
      macroarea: p.macroarea || '', area: p.area || '', subsetor: p.subsetor || '',
      cargo: p.cargo || '', lideranca: p.lideranca || '', turno: p.turno || '',
      situacao: p.situacao || '',
    });
    setModalAberto(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.registro.trim() || !form.nome.trim()) {
      toast.warning('Matrícula e nome são obrigatórios.');
      return;
    }
    setSalvando(true);
    try {
      // Campo em branco vira `null`: string vazia poluiria as listas de filtro
      // com uma opção sem rótulo.
      const ou = (v: string) => v.trim() || null;
      const dados = {
        registro: form.registro.trim(),
        nome: form.nome.trim(),
        chave_nome: ou(form.chave_nome),
        macroarea: ou(form.macroarea),
        area: ou(form.area),
        subsetor: ou(form.subsetor),
        cargo: ou(form.cargo),
        lideranca: ou(form.lideranca),
        turno: ou(form.turno),
        situacao: ou(form.situacao),
      };

      if (editando) {
        await api.atualizarRhPessoa(editando.id, dados, user.id);
        toast.success(`Cadastro de ${dados.nome} atualizado.`);
      } else {
        await api.criarRhPessoa(dados);
        toast.success(`${dados.nome} cadastrado(a).`);
      }
      setModalAberto(false);
      await carregar();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (p: RhPessoa) => {
    try {
      await api.atualizarRhPessoa(p.id, { ativo: !p.ativo }, user.id);
      toast.success(`${p.nome} ${p.ativo ? 'inativado(a)' : 'reativado(a)'}.`);
      await carregar();
    } catch (err: any) {
      toast.error('Erro ao alterar a situação: ' + (err.message || ''));
    }
  };

  const campo = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50';
  const selectFiltro = 'h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 cursor-pointer';

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/rh')}
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para RH
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
              <Users className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">Colaboradores</h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Base que alimenta a ASE e a busca de pessoas nos formulários
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={carregar}
              disabled={carregando}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={abrirNovo}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Novo colaborador
            </button>
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">Cadastrados</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{pessoas.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">Ativos</p>
          <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{totalAtivos}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">Inativos</p>
          <p className="mt-1 text-xl font-bold text-slate-500 dark:text-slate-400">{pessoas.length - totalAtivos}</p>
        </div>
      </div>

      {/* Busca e filtros */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, matrícula ou chave do nome..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-base text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <select
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value as any)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base font-semibold text-slate-700 sm:text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 cursor-pointer"
          >
            <option value="ATIVOS">Somente ativos</option>
            <option value="INATIVOS">Somente inativos</option>
            <option value="TODOS">Todas as situações</option>
          </select>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <Filter className="h-3 w-3" /> Filtros
            </span>
            {filtrosAtivos > 0 && (
              <button
                type="button"
                onClick={() => { setFiltros({ macroarea: '', area: '', subsetor: '', cargo: '', turno: '' }); setBusca(''); }}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
              >
                Limpar filtros ({filtrosAtivos})
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {CAMPOS.map((c, i) => (
              <select
                key={c}
                value={filtros[c]}
                aria-label={ROTULO[c]}
                onChange={e => {
                  const valor = e.target.value;
                  // Trocar um filtro invalida os de baixo: a área escolhida pode
                  // não existir dentro da nova macroárea.
                  setFiltros(prev => {
                    const proximo = { ...prev, [c]: valor };
                    CAMPOS.slice(i + 1).forEach(abaixo => { proximo[abaixo] = ''; });
                    return proximo;
                  });
                }}
                className={selectFiltro}
              >
                <option value="">{ROTULO[c]}: todas</option>
                {opcoes[c].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            ))}
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
            {filtradas.length} colaborador(es)
          </span>
        </div>

        {carregando ? (
          <div className="flex justify-center py-12 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtradas.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-400">
            Nenhum colaborador encontrado com esses filtros.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtradas.map(p => {
              const local = [p.macroarea, p.area, p.subsetor].filter(Boolean).join(' › ');
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-50">{p.nome}</span>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {p.registro}
                      </span>
                      {!p.ativo && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {p.situacao || 'Inativo'}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {[p.cargo, local, p.turno, p.lideranca && `Liderança: ${p.lideranca}`]
                        .filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className="hidden items-center gap-1 text-[10px] text-slate-400 sm:inline-flex"
                      title="Última atualização do cadastro"
                    >
                      <Clock className="h-3 w-3" />
                      {new Date(p.updated_at).toLocaleDateString('pt-BR')}
                    </span>
                    <button
                      type="button"
                      onClick={() => alternarAtivo(p)}
                      title={p.ativo ? 'Inativar' : 'Reativar'}
                      className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                        p.ativo
                          ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                          : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {p.ativo ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirEdicao(p)}
                      title="Editar cadastro"
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 cursor-pointer"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {modalAberto && (
        <Modal onClose={() => setModalAberto(false)} maxWidth="max-w-2xl" ariaLabel="Cadastro de colaborador">
          <ModalHeader onClose={() => setModalAberto(false)}>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
              {editando ? `Editar ${editando.nome}` : 'Novo colaborador'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Os mesmos campos da planilha do RH.
            </p>
          </ModalHeader>
          <form onSubmit={salvar}>
            <ModalBody className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="f-registro" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Matrícula *</label>
                  <input
                    id="f-registro"
                    value={form.registro}
                    onChange={e => setForm(f => ({ ...f, registro: e.target.value }))}
                    // A matrícula é a chave natural do cadastro: trocá-la criaria
                    // outro colaborador em vez de corrigir este.
                    disabled={Boolean(editando)}
                    className={`${campo} disabled:cursor-not-allowed disabled:opacity-60`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="f-nome" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Colaborador *</label>
                  <input
                    id="f-nome"
                    value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value.toUpperCase() }))}
                    className={campo}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="f-chave" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Chave do nome</label>
                  <input id="f-chave" value={form.chave_nome} onChange={e => setForm(f => ({ ...f, chave_nome: e.target.value.toUpperCase() }))} className={campo} />
                </div>
                <div>
                  <label htmlFor="f-cargo" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Cargo</label>
                  <input id="f-cargo" value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value.toUpperCase() }))} className={campo} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="f-macro" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Macroárea</label>
                  <input id="f-macro" list="lista-macroarea" value={form.macroarea} onChange={e => setForm(f => ({ ...f, macroarea: e.target.value.toUpperCase() }))} className={campo} />
                </div>
                <div>
                  <label htmlFor="f-area" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Área</label>
                  <input id="f-area" list="lista-area" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value.toUpperCase() }))} className={campo} />
                </div>
                <div>
                  <label htmlFor="f-subsetor" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Subsetor</label>
                  <input id="f-subsetor" list="lista-subsetor" value={form.subsetor} onChange={e => setForm(f => ({ ...f, subsetor: e.target.value.toUpperCase() }))} className={campo} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="f-lideranca" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Liderança</label>
                  <input id="f-lideranca" value={form.lideranca} onChange={e => setForm(f => ({ ...f, lideranca: e.target.value.toUpperCase() }))} className={campo} />
                </div>
                <div>
                  <label htmlFor="f-turno" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Turno</label>
                  <input id="f-turno" list="lista-turno" value={form.turno} onChange={e => setForm(f => ({ ...f, turno: e.target.value.toUpperCase() }))} className={campo} />
                </div>
                <div>
                  <label htmlFor="f-situacao" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Situação</label>
                  <input id="f-situacao" value={form.situacao} onChange={e => setForm(f => ({ ...f, situacao: e.target.value.toUpperCase() }))} placeholder="ATIVO, DEMITIDO..." className={campo} />
                </div>
              </div>

              {/* Sugestões vindas do que já está cadastrado — evita criar
                  "PRODUÇÃO" e "PRODUCAO" como áreas diferentes. */}
              <datalist id="lista-macroarea">{opcoes.macroarea.map(v => <option key={v} value={v} />)}</datalist>
              <datalist id="lista-area">{opcoes.area.map(v => <option key={v} value={v} />)}</datalist>
              <datalist id="lista-subsetor">{opcoes.subsetor.map(v => <option key={v} value={v} />)}</datalist>
              <datalist id="lista-turno">{opcoes.turno.map(v => <option key={v} value={v} />)}</datalist>

              <p className="text-[10px] leading-relaxed text-slate-400">
                A situação define se o colaborador continua ativo: termos como DEMITIDO, DESLIGADO
                ou RESCISÃO inativam o cadastro; AFASTADO, FÉRIAS e LICENÇA mantêm ativo.
              </p>
            </ModalBody>
            <ModalFooter>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer"
              >
                {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editando ? 'Salvar alterações' : 'Cadastrar'}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}
    </div>
  );
}
