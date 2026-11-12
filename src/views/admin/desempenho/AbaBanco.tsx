/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Monitor de Desempenho › Banco: pg_stat_statements acumulado desde o último
 * zerar (as consultas que mais custaram, com média e disco temporário), saúde
 * das maiores tabelas (linhas mortas, leituras sequenciais) e o log de ações.
 * "Zerar" serve para medir antes/depois de uma correção.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Eraser, History, ListOrdered, Table2 } from 'lucide-react';
import { apiDesempenho, type Estatisticas } from '../../../lib/desempenho/api';
import { formatarBytes, formatarDuracao, formatarNumero, nomeConsulta, razao } from '../../../lib/desempenho/diagnostico';
import { confirmar } from '../../../lib/confirmar';
import { Carregando, ErroCarga, Secao, TabelaResponsiva, TextoConsulta, haQuanto, horaCurta } from './comum';

export default function AbaBanco() {
  const [dados, setDados] = useState<Estatisticas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [zerando, setZerando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await apiDesempenho.estatisticas());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const zerar = async () => {
    const ok = await confirmar({
      titulo: 'Zerar as estatísticas de consultas?',
      mensagem: 'O acumulado do pg_stat_statements recomeça do zero (útil para medir o efeito de uma correção). A linha do tempo por minuto não se perde.',
      confirmarLabel: 'Zerar',
      variante: 'perigo',
    });
    if (!ok) return;
    setZerando(true);
    try {
      await apiDesempenho.zerarEstatisticas();
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setZerando(false);
    }
  };

  if (erro && !dados) return <ErroCarga mensagem={erro} />;
  if (!dados) return <Carregando />;

  const total = dados.consultas.reduce((s, q) => s + Number(q.total_ms), 0);

  return (
    <div className="space-y-6">
      {erro && <ErroCarga mensagem={erro} />}
      <Secao
        titulo="Consultas que mais custaram"
        icone={ListOrdered}
        descricao={`Acumulado ${dados.desde ? `desde ${horaCurta(dados.desde)}` : 'desde o último reinício do banco'}. Média alta = consulta pesada; muitas chamadas com média baixa = tela que chama demais.`}
        acoes={
          <button
            type="button"
            onClick={() => void zerar()}
            disabled={zerando}
            className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold disabled:opacity-60"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)', background: 'var(--surface-card)' }}
          >
            <Eraser className="h-3.5 w-3.5" /> Zerar estatísticas
          </button>
        }
      >
        <TabelaResponsiva
          linhas={dados.consultas}
          chave={q => q.id}
          destaque={q => (Number(q.media_ms) > 2000 ? 'var(--status-warning)' : undefined)}
          vazio={{ titulo: 'Sem consultas registradas' }}
          colunas={[
            {
              rotulo: 'Consulta',
              valor: q => {
                const n = nomeConsulta(q.texto);
                return (
                  <div className="min-w-[220px] max-w-[460px]">
                    <span className="break-all">{n.alvo}</span>
                    {n.tipo && <span className="ml-1 font-normal" style={{ color: 'var(--ink-muted)' }}>({n.tipo})</span>}
                    <TextoConsulta texto={q.texto} />
                  </div>
                );
              },
            },
            { rotulo: 'Tempo total', valor: q => formatarDuracao(q.total_ms), direita: true },
            { rotulo: '% do total', valor: q => (total ? `${Math.round((Number(q.total_ms) / total) * 100)}%` : '—'), direita: true },
            { rotulo: 'Chamadas', valor: q => formatarNumero(q.chamadas), direita: true },
            { rotulo: 'Média', valor: q => formatarDuracao(q.media_ms), direita: true },
            { rotulo: 'Máx.', valor: q => formatarDuracao(q.max_ms), direita: true },
            { rotulo: 'Linhas/chamada', valor: q => formatarNumero(Math.round(razao(q.linhas, q.chamadas) ?? 0)), direita: true, soDesktop: true },
            { rotulo: 'Disco temporário', valor: q => formatarBytes(Number(q.temp_blks) * 8192), direita: true },
          ]}
        />
      </Secao>

      <Secao
        titulo="Maiores tabelas"
        icone={Table2}
        descricao="Linhas mortas acima de ~20% pedem VACUUM. Muitas leituras sequenciais com milhares de linhas cada indicam filtro sem índice."
      >
        <TabelaResponsiva
          linhas={dados.tabelas}
          chave={t => t.nome}
          destaque={t => (t.vivas && Number(t.mortas) / Number(t.vivas) > 0.2 ? 'var(--status-warning)' : undefined)}
          vazio={{ titulo: 'Sem tabelas' }}
          colunas={[
            { rotulo: 'Tabela', valor: t => <span className="break-all">{t.nome}</span> },
            { rotulo: 'Tamanho', valor: t => formatarBytes(t.bytes), direita: true },
            { rotulo: 'Linhas', valor: t => formatarNumero(t.vivas), direita: true },
            {
              rotulo: 'Mortas',
              valor: t => `${formatarNumero(t.mortas)}${t.vivas ? ` (${Math.round((Number(t.mortas) / Number(t.vivas)) * 100)}%)` : ''}`,
              direita: true,
            },
            { rotulo: 'Leituras seq.', valor: t => formatarNumero(t.seq_scan), direita: true },
            { rotulo: 'Linhas/leitura seq.', valor: t => formatarNumero(Math.round(razao(t.seq_tup_read, t.seq_scan) ?? 0)), direita: true, soDesktop: true },
            { rotulo: 'Pelo índice', valor: t => formatarNumero(t.idx_scan), direita: true, soDesktop: true },
            { rotulo: 'Último vacuum', valor: t => haQuanto(t.ultimo_vacuum) },
          ]}
        />
      </Secao>

      {dados.matviews.length > 0 && (
        <Secao titulo="Views materializadas" icone={Table2}>
          <TabelaResponsiva
            linhas={dados.matviews}
            chave={m => m.nome}
            destaque={m => (m.populada ? undefined : 'var(--status-critical)')}
            vazio={{ titulo: 'Nenhuma' }}
            colunas={[
              { rotulo: 'View', valor: m => m.nome },
              { rotulo: 'Tamanho', valor: m => formatarBytes(m.bytes), direita: true },
              { rotulo: 'Populada', valor: m => (m.populada ? 'sim' : 'não') },
            ]}
          />
        </Secao>
      )}

      <Secao titulo="Ações feitas pelo monitor" icone={History}>
        <TabelaResponsiva
          linhas={dados.acoes}
          chave={(a, i) => `${a.em}:${i}`}
          vazio={{ titulo: 'Nenhuma ação ainda', dica: 'Cancelamentos de consulta e zeragens aparecem aqui com o autor.' }}
          colunas={[
            { rotulo: 'Quando', valor: a => horaCurta(a.em) },
            { rotulo: 'Quem', valor: a => a.user_name || '—' },
            { rotulo: 'Ação', valor: a => a.acao },
            { rotulo: 'Consulta', valor: a => (a.consulta ? nomeConsulta(a.consulta).alvo : '—') },
          ]}
        />
      </Secao>
    </div>
  );
}
