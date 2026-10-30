/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Solicitações › Aprovações › Validação técnica.
 *
 * Chamados que o comprador abriu na Central de Compras pedindo validação
 * técnica de um item. Aparecem para quem pode decidir: aprovador do setor do
 * chamado, admin ou usuário marcado. Ao aprovar/reprovar, o item volta ao
 * comprador com a tag correspondente (RPC `sup_validacao_tecnica_decidir`).
 * Quem decide também pode redirecionar para outra área, marcando quem recebe
 * (RPC `sup_validacao_tecnica_redirecionar`); depois disso só acompanha.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Forward, RefreshCw, Search, ShieldCheck, XCircle } from 'lucide-react';
import type { Profile } from '../../types';
import { useToast } from '../ui/Toast';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { formatDateTimeBR } from '../../lib/format';
import {
  podeDecidirValidacao, podeVerValidacao, type StatusValidacao, type UsuarioMarcado, type ValidacaoTecnica,
} from '../../lib/validacaoTecnica';
import { decidirValidacaoTecnica, listarValidacoesTecnicas, redirecionarValidacaoTecnica } from '../../lib/validacaoTecnicaApi';
import { DetalheValidacao, RedirecionarValidacao, ValidacaoTag } from '../suprimentos/ValidacaoTecnica';

type Filtro = StatusValidacao | 'todas';

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'PENDENTE', rotulo: 'Pendentes' },
  { valor: 'APROVADA', rotulo: 'Aprovadas' },
  { valor: 'REPROVADA', rotulo: 'Reprovadas' },
  { valor: 'todas', rotulo: 'Todas' },
];

export default function ValidacaoTecnicaPainel({
  user, idInicial, onPendentes,
}: {
  user: Profile;
  /** Deep link da notificação: abre este chamado. */
  idInicial?: string | null;
  onPendentes?: (n: number) => void;
}) {
  const toast = useToast();
  const [lista, setLista] = useState<ValidacaoTecnica[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('PENDENTE');
  const [busca, setBusca] = useState('');
  const [abertoId, setAbertoId] = useState<string | null>(idInicial ?? null);
  const [parecer, setParecer] = useState('');
  const [decidindo, setDecidindo] = useState(false);
  const [redirecionando, setRedirecionando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const todas = (await listarValidacoesTecnicas()).filter(v => podeVerValidacao(v, user));
      setLista(todas);
      onPendentes?.(todas.filter(v => v.status === 'PENDENTE' && podeDecidirValidacao(v, user)).length);
    } catch (err) {
      toast.error(`Falha ao carregar as validações: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCarregando(false);
    }
  }, [user, toast, onPendentes]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista.filter(v => {
      if (filtro !== 'todas' && v.status !== filtro) return false;
      if (!termo) return true;
      return [v.codigo, v.rm, v.material_code, v.texto_breve, v.criado_por_nome, v.setor_nome, v.descricao]
        .some(x => (x || '').toLowerCase().includes(termo));
    });
  }, [lista, filtro, busca]);

  const aberto = lista.find(v => v.id === abertoId) ?? null;
  const abertoDecidivel = !!aberto && aberto.status === 'PENDENTE' && podeDecidirValidacao(aberto, user);

  const abrir = (id: string | null) => {
    setAbertoId(id);
    setParecer('');
    setRedirecionando(false);
  };

  const redirecionar = async (setor: { id: string; nome: string | null }, marcados: UsuarioMarcado[], motivo: string) => {
    if (!aberto) return;
    setDecidindo(true);
    try {
      await redirecionarValidacaoTecnica(aberto.id, setor, marcados, motivo);
      toast.success(`${aberto.codigo} redirecionado para ${setor.nome ?? 'a nova área'} (${marcados.map(m => m.nome).join(', ')}).`);
      abrir(null);
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDecidindo(false);
    }
  };

  const decidir = async (aprovar: boolean) => {
    if (!aberto) return;
    if (!aprovar && !parecer.trim()) { toast.warning('Escreva o motivo da reprovação.'); return; }
    setDecidindo(true);
    try {
      await decidirValidacaoTecnica(aberto.id, aprovar, parecer.trim());
      toast.success(`${aberto.codigo} ${aprovar ? 'aprovado' : 'reprovado'} — o item voltou para o comprador.`);
      abrir(null);
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDecidindo(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTROS.map(f => (
            <button
              key={f.valor}
              type="button"
              onClick={() => setFiltro(f.valor)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${filtro === f.valor
                ? 'bg-violet-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
            >
              {f.rotulo}
              {f.valor === 'PENDENTE' && ` (${lista.filter(v => v.status === 'PENDENTE' && podeDecidirValidacao(v, user)).length})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar código, RM, material..."
              className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>
          <button
            type="button"
            onClick={carregar}
            disabled={carregando}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:text-violet-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {!carregando && filtradas.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <ShieldCheck className="h-8 w-8 text-violet-500" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Nenhum chamado de validação técnica neste filtro</p>
        </div>
      )}

      <ul className="grid gap-2 lg:grid-cols-2">
        {filtradas.map(v => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => abrir(v.id)}
              className="w-full space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-violet-300 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-violet-700 dark:text-violet-400">{v.codigo}</span>
                <span className="flex items-center gap-1.5">
                  {v.status === 'PENDENTE' && !podeDecidirValidacao(v, user) && (
                    <span className="inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-500 dark:border-slate-700">
                      <Forward className="h-2.5 w-2.5" /> Redirecionado
                    </span>
                  )}
                  <ValidacaoTag v={v} />
                </span>
              </div>
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{v.texto_breve || v.material_code}</p>
              <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{v.descricao}</p>
              <p className="truncate text-[11px] text-slate-500">
                RM {v.rm} / Item {v.item_reqc} · {v.setor_nome} · {v.criado_por_nome} · {formatDateTimeBR(v.created_at)}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {aberto && (
        <Modal onClose={() => abrir(null)} maxWidth="max-w-2xl" ariaLabel={`Validação técnica ${aberto.codigo ?? ''}`} disableOutsideClose={decidindo}>
          <ModalHeader onClose={() => abrir(null)}>
            <p className="font-mono text-xs font-bold text-violet-700 dark:text-violet-400">{aberto.codigo}</p>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Validação técnica de item</h3>
          </ModalHeader>
          <ModalBody className="space-y-4">
            <DetalheValidacao v={aberto} />
            {aberto.status === 'PENDENTE' && !abertoDecidivel && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                Você redirecionou este chamado; agora quem decide é {aberto.setor_nome || 'a nova área'}
                {aberto.marcados.length > 0 ? ` (${aberto.marcados.map(m => m.nome).join(', ')})` : ''}.
              </p>
            )}
            {abertoDecidivel && redirecionando && (
              <RedirecionarValidacao
                user={user}
                v={aberto}
                enviando={decidindo}
                onCancelar={() => setRedirecionando(false)}
                onRedirecionar={redirecionar}
              />
            )}
            {abertoDecidivel && !redirecionando && (
              <div>
                <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Parecer (obrigatório para reprovar)</label>
                <textarea
                  value={parecer}
                  onChange={e => setParecer(e.target.value)}
                  rows={2}
                  placeholder="Ex.: atende, pode comprar o similar."
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <button type="button" onClick={() => abrir(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              Fechar
            </button>
            {abertoDecidivel && !redirecionando && (
              <>
                <button
                  type="button"
                  disabled={decidindo}
                  onClick={() => setRedirecionando(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-900 dark:bg-slate-900 dark:text-violet-300"
                >
                  <Forward className="h-4 w-4" /> Redirecionar
                </button>
                <button
                  type="button"
                  disabled={decidindo}
                  onClick={() => decidir(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300"
                >
                  <XCircle className="h-4 w-4" /> Reprovar
                </button>
                <button
                  type="button"
                  disabled={decidindo}
                  onClick={() => decidir(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {decidindo ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aprovar
                </button>
              </>
            )}
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
