/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GERAL › Treinamentos — hub das trilhas de treinamento, um card por setor
 * (mesmo desenho da página Formulários). O setor com trilha cadastrada em
 * `trein_trilhas` fica "ativo"; os demais aparecem como "em breve". Cada
 * card mostra quantas trilhas o colaborador já concluiu ali.
 */

import React from 'react';
import { ArrowRight, GraduationCap, Loader2, PlayCircle } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { canGerenciarTreinamentos } from '../../lib/pages';
import { localDb } from '../../db/localDb';
import { listarMeuProgresso, listarTrilhas } from '../../lib/treinamentosApi';
import { resumirProgresso, type ProgressoMissao, type TrilhaTreinamento } from '../../lib/treinamentos';
import { areasTreinamento, type VisualSetor } from '../../components/treinamentos/setoresVisual';
import type { Profile } from '../../types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

interface CardSetor {
  /** Setor (`core_setores.id`) ou área que agrupa setores (ex.: 'contab-fin'). */
  id: string;
  nome: string;
  visual: VisualSetor;
  trilhas: TrilhaTreinamento[];
  concluidas: number;
}

export default function TreinamentosHub({ user, onNavigate }: Props) {
  const toast = useToast();
  const gerencia = canGerenciarTreinamentos(user);
  const [trilhas, setTrilhas] = React.useState<TrilhaTreinamento[]>([]);
  const [progresso, setProgresso] = React.useState<ProgressoMissao[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [busca, setBusca] = React.useState('');
  const [filtroStatus, setFiltroStatus] = React.useState<'todos' | 'ativos' | 'em_breve'>('todos');

  React.useEffect(() => {
    let vivo = true;
    Promise.all([listarTrilhas(), listarMeuProgresso(user.id)])
      .then(([t, p]) => {
        if (!vivo) return;
        setTrilhas(t);
        setProgresso(p);
      })
      .catch(err => toast.error(`Não foi possível carregar os treinamentos: ${err?.message ?? err}`))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Quem não gerencia não vê trilha inativa (o RLS já esconde; aqui é defesa).
  const visiveis = React.useMemo(() => trilhas.filter(t => t.ativo || gerencia), [trilhas, gerencia]);

  const cards: CardSetor[] = React.useMemo(() => {
    const lista = areasTreinamento(localDb.getSectors()).map(a => {
      const daArea = visiveis.filter(t => a.setorIds.includes(t.setor_id));
      const concluidas = daArea.filter(t => resumirProgresso(t, progresso).status === 'concluida').length;
      return { id: a.id, nome: a.nome, visual: a.visual, trilhas: daArea, concluidas };
    });
    // Setores com trilha primeiro; dentro de cada bloco, ordem alfabética.
    return lista.sort((a, b) => Number(b.trilhas.length > 0) - Number(a.trilhas.length > 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [visiveis, progresso]);

  const emAndamento = visiveis
    .filter(t => t.ativo)
    .map(t => ({ trilha: t, resumo: resumirProgresso(t, progresso) }))
    .filter(x => x.resumo.status === 'em_andamento');

  const filtrados = cards.filter(c => {
    const termo = busca.toLowerCase().trim();
    const casa =
      !termo ||
      c.nome.toLowerCase().includes(termo) ||
      c.trilhas.some(t => `${t.codigo} ${t.titulo} ${t.descricao ?? ''}`.toLowerCase().includes(termo));
    if (!casa) return false;
    if (filtroStatus === 'ativos') return c.trilhas.length > 0;
    if (filtroStatus === 'em_breve') return c.trilhas.length === 0;
    return true;
  });

  const totalAtivos = cards.filter(c => c.trilhas.length > 0).length;
  const totalTrilhas = visiveis.filter(t => t.ativo).length;
  const totalConcluidas = cards.reduce((s, c) => s + c.concluidas, 0);

  const abrirSetor = (c: CardSetor) => {
    if (c.trilhas.length > 0 || gerencia) {
      onNavigate(`/treinamentos/setor?setor=${encodeURIComponent(c.id)}`);
      return;
    }
    toast.info(`${c.nome}: trilhas de treinamento em preparação. Em breve disponível.`);
  };

  const pill = (valor: typeof filtroStatus, rotulo: string, ativo: string) => (
    <button
      onClick={() => setFiltroStatus(valor)}
      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
        filtroStatus === valor
          ? `bg-white shadow-2xs dark:bg-slate-700 ${ativo}`
          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
      }`}
    >
      {rotulo}
    </button>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
              <GraduationCap className="h-3.5 w-3.5" />
              SISTEN Treinamentos
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              • {totalTrilhas} {totalTrilhas === 1 ? 'trilha' : 'trilhas'} · {totalConcluidas} concluída{totalConcluidas === 1 ? '' : 's'} por você
            </span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Treinamentos
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Trilhas de treinamento de cada setor. O seu progresso fica salvo no seu usuário.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative min-w-[220px]">
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar setor ou trilha..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 shadow-2xs transition-all focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ×
              </button>
            )}
          </div>
          <div className="flex items-center rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
            {pill('todos', `Todos (${cards.length})`, 'text-slate-900 dark:text-white')}
            {pill('ativos', `Ativos (${totalAtivos})`, 'text-emerald-700 dark:text-emerald-400')}
            {pill('em_breve', `Em Breve (${cards.length - totalAtivos})`, 'text-amber-700 dark:text-amber-400')}
          </div>
        </div>
      </div>

      {emAndamento.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Continuar de onde parou:</span>
          {emAndamento.map(({ trilha, resumo }) => (
            <button
              key={trilha.id}
              type="button"
              onClick={() => onNavigate(`/treinamentos/trilha?id=${trilha.id}`)}
              className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800 transition hover:border-orange-400 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              {trilha.codigo} · {trilha.titulo}
              <span className="font-mono text-[11px] opacity-80">{resumo.missoesConcluidas}/{resumo.total}</span>
            </button>
          ))}
        </div>
      )}

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando trilhas...
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Nenhum setor encontrado{busca ? ` para a busca "${busca}"` : ''}.
          </p>
          <button
            onClick={() => { setBusca(''); setFiltroStatus('todos'); }}
            className="mt-3 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtrados.map(c => {
            const vis = c.visual;
            const Icon = vis.icon;
            const disponivel = c.trilhas.length > 0;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => abrirSetor(c)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirSetor(c); } }}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200/90 bg-white p-2 sm:p-4 shadow-2xs transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 ${vis.corBordaHover}`}
              >
                <div className="space-y-1.5 sm:space-y-3">
                  <div className="flex items-center justify-between gap-1 sm:gap-2">
                    <div className={`flex h-7 w-7 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl transition-transform duration-200 group-hover:scale-105 ${vis.corIcone}`}>
                      <Icon className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                    </div>
                    {disponivel && (
                      <span className={`rounded-full px-1 sm:px-2.5 py-0.5 text-[8px] sm:text-[10px] font-bold truncate max-w-[55px] sm:max-w-none ${vis.badgeCor}`}>
                        {c.trilhas.length} {c.trilhas.length === 1 ? 'Trilha' : 'Trilhas'}
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-[7px] sm:text-[10px] font-mono font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase mb-0.5 truncate">
                      Trilhas de treinamento
                    </p>
                    <h2 className="text-[11px] sm:text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors dark:text-slate-100 dark:group-hover:text-blue-400 leading-tight sm:leading-snug line-clamp-2 sm:line-clamp-none">
                      {c.nome}
                    </h2>
                  </div>

                  <div className="hidden sm:block text-xs text-slate-500 leading-relaxed dark:text-slate-400">
                    {disponivel ? (
                      <ul className="space-y-0.5">
                        {c.trilhas.slice(0, 4).map(t => (
                          <li key={t.id} className={`truncate ${t.ativo ? '' : 'line-through opacity-60'}`}>
                            {t.titulo} ({t.codigo})
                          </li>
                        ))}
                        {c.trilhas.length > 4 && <li>+ {c.trilhas.length - 4} trilhas</li>}
                      </ul>
                    ) : (
                      <p>Trilhas de treinamento deste setor em preparação.</p>
                    )}
                  </div>
                </div>

                <div className="mt-2 sm:mt-4 flex items-center justify-between border-t border-slate-100 pt-1.5 sm:pt-2.5 dark:border-slate-800/80">
                  <span className={`inline-flex items-center text-[9px] sm:text-xs font-semibold ${disponivel ? 'text-blue-600 dark:text-blue-400 group-hover:underline' : 'text-slate-400 dark:text-slate-500'}`}>
                    {disponivel
                      ? <span>{c.concluidas > 0 ? `${c.concluidas}/${c.trilhas.length} concluída${c.concluidas === 1 ? '' : 's'}` : 'Acessar'}</span>
                      : <span className="hidden xs:inline sm:inline">{gerencia ? 'Cadastrar' : 'Em breve'}</span>}
                  </span>
                  <div className={`flex h-4 w-4 sm:h-6 sm:w-6 items-center justify-center rounded-md sm:rounded-lg transition-all duration-200 ${
                    disponivel
                      ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-950/80 dark:text-blue-400 dark:group-hover:bg-blue-600 dark:group-hover:text-white'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                  }`}>
                    <ArrowRight className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
