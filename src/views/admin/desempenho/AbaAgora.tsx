/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Monitor de Desempenho › Agora: retrato do banco a cada 15 s (pausa com a aba
 * escondida), alertas automáticos, usuários online e o que está rodando —
 * com botão para cancelar uma consulta do app que travou.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Ban, Database, Lock, Plug, Timer, Users, Wifi } from 'lucide-react';
import KpiCard from '../../../components/charts/KpiCard';
import { apiDesempenho } from '../../../lib/desempenho/api';
import {
  diagnosticar, formatarBytes, formatarDuracao, nomeConsulta, type ProcessoBanco, type RetratoAgora,
} from '../../../lib/desempenho/diagnostico';
import { confirmar } from '../../../lib/confirmar';
import { Carregando, ErroCarga, ListaAlertas, Secao, TabelaResponsiva, TextoConsulta, haQuanto } from './comum';

const ATUALIZAR_MS = 15_000;

function corDuracao(p: ProcessoBanco): string | undefined {
  if ((p.bloqueado_por?.length ?? 0) > 0) return 'var(--status-critical)';
  if (p.estado !== 'active') return (p.tx_s ?? 0) > 60 ? 'var(--status-warning)' : undefined;
  if ((p.dur_s ?? 0) > 30) return 'var(--status-critical)';
  if ((p.dur_s ?? 0) > 5) return 'var(--status-warning)';
  return undefined;
}

export default function AbaAgora({ aoAtualizar }: { aoAtualizar: (em: number) => void }) {
  const [retrato, setRetrato] = useState<RetratoAgora | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<number | null>(null);
  const [soAtivas, setSoAtivas] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const r = await apiDesempenho.agora();
      setRetrato(r);
      setErro(null);
      aoAtualizar(Date.now());
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [aoAtualizar]);

  useEffect(() => {
    void carregar();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar();
    }, ATUALIZAR_MS);
    return () => window.clearInterval(id);
  }, [carregar]);

  const alertas = useMemo(() => (retrato ? diagnosticar(retrato) : []), [retrato]);

  const cancelar = async (p: ProcessoBanco) => {
    const nome = nomeConsulta(p.consulta);
    const ok = await confirmar({
      titulo: 'Cancelar esta consulta?',
      mensagem: `${nome.alvo} (${nome.tipo}) está rodando há ${formatarDuracao((p.dur_s ?? 0) * 1000)}. Quem disparou recebe um erro e pode tentar de novo; a conexão continua aberta.`,
      confirmarLabel: 'Cancelar consulta',
      variante: 'perigo',
    });
    if (!ok) return;
    setCancelando(p.pid);
    try {
      await apiDesempenho.cancelar(p.pid);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCancelando(null);
    }
  };

  if (erro && !retrato) return <ErroCarga mensagem={erro} />;
  if (!retrato) return <Carregando />;

  const clientes = retrato.conexoes.reduce((s, c) => s + c.n, 0);
  const ativas = retrato.processos.filter(p => p.estado === 'active');
  const lentas = ativas.filter(p => (p.dur_s ?? 0) > 5);
  const esperando = retrato.processos.filter(p => (p.bloqueado_por?.length ?? 0) > 0);
  const onlineUsuarios = new Set(retrato.online.map(o => o.user_id)).size;
  const processos = soAtivas ? ativas : retrato.processos;

  return (
    <div className="space-y-6">
      {erro && <ErroCarga mensagem={erro} />}
      <ListaAlertas alertas={alertas} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Usuários online" value={onlineUsuarios} icon={Users} detail={`${retrato.online.length} aparelho(s) nos últimos 7 min`} />
        <KpiCard
          label="Conexões"
          value={clientes}
          icon={Plug}
          share={retrato.max_conexoes ? clientes / retrato.max_conexoes : undefined}
          accent={clientes / Math.max(1, retrato.max_conexoes) >= 0.8 ? 'var(--status-critical)' : undefined}
          detail={`de ${retrato.max_conexoes} no limite`}
        />
        <KpiCard label="Consultas ativas" value={ativas.length} icon={Activity} detail="rodando neste instante" />
        <KpiCard
          label="Lentas (> 5 s)"
          value={lentas.length}
          icon={Timer}
          accent={lentas.length ? 'var(--status-warning)' : 'var(--status-good)'}
          emphasize={lentas.length > 0}
          detail={lentas.length ? `a mais longa: ${formatarDuracao(Math.max(...lentas.map(p => p.dur_s ?? 0)) * 1000)}` : 'nenhuma'}
        />
        <KpiCard
          label="Esperando lock"
          value={esperando.length}
          icon={Lock}
          accent={esperando.length ? 'var(--status-critical)' : 'var(--status-good)'}
          emphasize={esperando.length > 0}
          detail="travadas por outra consulta"
        />
        <KpiCard
          label="Cache do banco"
          display={retrato.banco?.cache_hit != null ? `${retrato.banco.cache_hit.toLocaleString('pt-BR')}%` : '—'}
          icon={Database}
          detail={retrato.banco ? `banco com ${formatarBytes(retrato.banco.tamanho_bytes)}` : undefined}
        />
      </div>

      <Secao
        titulo="Em execução no banco"
        icone={Activity}
        descricao="Cada linha é uma conexão fazendo algo agora. Leituras do app chegam pelo PostgREST (authenticator). Só elas podem ser canceladas por aqui."
        acoes={
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
            <input type="checkbox" checked={soAtivas} onChange={e => setSoAtivas(e.target.checked)} className="h-4 w-4 rounded" />
            Só ativas
          </label>
        }
      >
        <TabelaResponsiva
          linhas={processos}
          chave={p => String(p.pid)}
          destaque={corDuracao}
          vazio={{ titulo: 'Nada rodando agora', dica: 'O banco está ocioso neste instante.' }}
          colunas={[
            {
              rotulo: 'Consulta',
              valor: p => {
                const n = nomeConsulta(p.consulta);
                return (
                  <div className="min-w-[220px] max-w-[460px]">
                    <span className="break-all">{n.alvo}</span>
                    {n.tipo && <span className="ml-1 font-normal" style={{ color: 'var(--ink-muted)' }}>({n.tipo})</span>}
                    <TextoConsulta texto={p.consulta} />
                  </div>
                );
              },
            },
            { rotulo: 'Há', valor: p => formatarDuracao((p.dur_s ?? 0) * 1000), direita: true },
            { rotulo: 'Estado', valor: p => p.estado || '—' },
            { rotulo: 'Esperando', valor: p => (p.espera_tipo ? `${p.espera_tipo}: ${p.espera}` : '—') },
            {
              rotulo: 'Travada por',
              valor: p => (p.bloqueado_por?.length ? p.bloqueado_por.map(pid => `pid ${pid}`).join(', ') : '—'),
            },
            { rotulo: 'Origem', valor: p => `${p.usuario || '—'}${p.app ? ` · ${p.app}` : ''}`, soDesktop: true },
            { rotulo: 'pid', valor: p => p.pid, direita: true, soDesktop: true },
            {
              rotulo: 'Ação',
              valor: p =>
                p.usuario === 'authenticator' && p.estado === 'active' ? (
                  <button
                    type="button"
                    onClick={() => void cancelar(p)}
                    disabled={cancelando === p.pid}
                    aria-label={`Cancelar consulta pid ${p.pid}`}
                    className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-bold text-rose-700 disabled:opacity-50 dark:text-rose-300"
                    style={{ borderColor: 'var(--hairline)' }}
                  >
                    <Ban className="h-3.5 w-3.5" /> Cancelar
                  </button>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </Secao>

      <Secao
        titulo="Quem está online"
        icone={Wifi}
        descricao="Aparelhos com o SISTEN aberto nos últimos 7 min (cada aba manda um batimento a cada 5 min). Atualiza depois que os aparelhos recebem esta versão."
      >
        <TabelaResponsiva
          linhas={retrato.online}
          chave={o => `${o.user_id}:${o.device_id}`}
          vazio={{ titulo: 'Ninguém reportou ainda', dica: 'Os aparelhos começam a reportar 30 s depois de abrir esta versão do SISTEN.' }}
          colunas={[
            { rotulo: 'Usuário', valor: o => o.user_name || 'Usuário' },
            { rotulo: 'Página', valor: o => <span className="font-mono">{o.pagina_atual || '—'}</span> },
            { rotulo: 'Aparelho', valor: o => o.plataforma || '—' },
            { rotulo: 'Rede', valor: o => o.conexao || '—' },
            { rotulo: 'Aba', valor: o => (o.visivel ? 'à vista' : 'em segundo plano') },
            { rotulo: 'Último sinal', valor: o => haQuanto(o.ultimo) },
          ]}
        />
      </Secao>

      <Secao titulo="Conexões por origem" icone={Plug} descricao="Quem ocupa as conexões do banco. PostgREST = app; Storage = arquivos; o resto é infraestrutura do Supabase.">
        <TabelaResponsiva
          linhas={retrato.conexoes}
          chave={(c, i) => `${c.usuario}:${c.app}:${c.estado}:${i}`}
          vazio={{ titulo: 'Sem conexões' }}
          colunas={[
            { rotulo: 'Origem', valor: c => c.app || c.usuario },
            { rotulo: 'Papel', valor: c => c.usuario },
            { rotulo: 'Estado', valor: c => c.estado },
            { rotulo: 'Conexões', valor: c => c.n, direita: true },
          ]}
        />
      </Secao>

      {retrato.banco && (
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          Desde o último reinício das estatísticas: {formatarBytes(retrato.banco.temp_bytes)} em arquivos temporários
          ({retrato.banco.temp_arquivos.toLocaleString('pt-BR')} arquivos — consultas que não couberam na memória),{' '}
          {retrato.banco.deadlocks} deadlock(s), {retrato.banco.rollbacks.toLocaleString('pt-BR')} rollback(s).
          {retrato.statement_timeout && ` Limite por consulta do app: ${retrato.statement_timeout.replace('statement_timeout=', '')}.`}
        </p>
      )}
    </div>
  );
}
