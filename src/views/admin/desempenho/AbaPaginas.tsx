/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Monitor de Desempenho › Páginas e gargalos: o que os aparelhos viveram.
 * Por página (requisições e MB por visita, tempo de espera, travamentos), por
 * chamada (endpoint) com as páginas que a disparam, e por usuário. É a visão
 * do usuário: inclui a rede e a cópia offline, não só o banco.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { FileWarning, Network, Smartphone } from 'lucide-react';
import KpiCard from '../../../components/charts/KpiCard';
import { apiDesempenho, type Aparelhos, type OpcaoPeriodo } from '../../../lib/desempenho/api';
import { formatarBytes, formatarDuracao, formatarNumero, razao, rotuloEndpoint } from '../../../lib/desempenho/diagnostico';
import { Carregando, ErroCarga, Secao, TabelaResponsiva, haQuanto, nomePagina } from './comum';

export default function AbaPaginas({ periodo }: { periodo: OpcaoPeriodo }) {
  const [dados, setDados] = useState<Aparelhos | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    const ate = new Date();
    // O detalhe dos aparelhos fica 7 dias no banco (dias mais antigos: Resumo do dia).
    apiDesempenho
      .aparelhos(new Date(ate.getTime() - Math.min(periodo.horas, 24 * 7) * 3_600_000), ate)
      .then(d => vivo && (setDados(d), setErro(null)))
      .catch(e => vivo && setErro((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [periodo]);

  const paginasPorEndpoint = useMemo(() => {
    const m = new Map<string, { pagina: string; n: number }[]>();
    for (const l of dados?.endpoint_paginas ?? []) {
      const lista = m.get(l.endpoint) ?? [];
      lista.push({ pagina: l.pagina, n: l.n });
      m.set(l.endpoint, lista);
    }
    return m;
  }, [dados]);

  if (erro && !dados) return <ErroCarga mensagem={erro} />;
  if (!dados) return <Carregando />;

  const tot = dados.usuarios.reduce(
    (s, u) => ({
      req: s.req + Number(u.requisicoes),
      ms: s.ms + Number(u.tempo_ms),
      lentas: s.lentas + Number(u.lentas),
      erros: s.erros + Number(u.erros),
      trav: s.trav + Number(u.travamento_ms),
      bytes: s.bytes + Number(u.bytes) + Number(u.storage_bytes),
    }),
    { req: 0, ms: 0, lentas: 0, erros: 0, trav: 0, bytes: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Usuários"
          value={dados.usuarios.length}
          detail={periodo.horas > 24 * 7 ? 'últimos 7 dias (limite do detalhe)' : `no período (${periodo.rotulo})`}
        />
        <KpiCard label="Requisições" value={tot.req} format={formatarNumero} detail={`média ${formatarDuracao(razao(tot.ms, tot.req) ?? 0)}`} />
        <KpiCard
          label="Lentas (≥ 3 s)"
          value={tot.lentas}
          format={formatarNumero}
          accent={tot.lentas ? 'var(--status-warning)' : 'var(--status-good)'}
          share={tot.req ? tot.lentas / tot.req : undefined}
          detail={tot.req ? `${((tot.lentas / tot.req) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% das chamadas` : undefined}
        />
        <KpiCard
          label="Erros"
          value={tot.erros}
          format={formatarNumero}
          accent={tot.erros ? 'var(--status-critical)' : 'var(--status-good)'}
          detail="5xx, 429 e falha de rede"
        />
        <KpiCard label="Tela travada" display={formatarDuracao(tot.trav)} detail="somando todos os aparelhos" accent={tot.trav > 60_000 ? 'var(--status-warning)' : undefined} />
        <KpiCard label="Volume baixado" display={formatarBytes(tot.bytes)} detail="dados + arquivos (teto do egress)" />
      </div>

      <Secao
        titulo="Páginas — onde o usuário espera"
        icone={FileWarning}
        descricao="Ordenado pelo tempo total de espera. Muitas requisições ou MB por visita indicam tela que carrega a base inteira; tempo travado indica processamento pesado no próprio aparelho."
      >
        <TabelaResponsiva
          linhas={dados.paginas}
          chave={p => p.pagina}
          destaque={p => (Number(p.lentas) > 0 || Number(p.travamento_ms) > 30_000 ? 'var(--status-warning)' : undefined)}
          vazio={{ titulo: 'Nenhum aparelho reportou neste período', dica: 'Os aparelhos reportam a cada 5 min depois de receber esta versão do SISTEN.' }}
          colunas={[
            { rotulo: 'Página', valor: p => <span title={p.pagina}>{nomePagina(p.pagina)}</span> },
            { rotulo: 'Espera total', valor: p => formatarDuracao(p.ms), direita: true },
            { rotulo: 'Visitas', valor: p => formatarNumero(p.visitas), direita: true },
            { rotulo: 'Req./visita', valor: p => formatarNumero(Math.round((razao(p.n, p.visitas) ?? Number(p.n)) * 10) / 10), direita: true },
            { rotulo: 'MB/visita', valor: p => formatarBytes(razao(p.bytes, p.visitas) ?? Number(p.bytes)), direita: true },
            { rotulo: 'Requisições', valor: p => formatarNumero(p.n), direita: true, soDesktop: true },
            { rotulo: 'Volume', valor: p => formatarBytes(p.bytes), direita: true },
            { rotulo: 'Lentas', valor: p => formatarNumero(p.lentas), direita: true },
            { rotulo: 'Erros', valor: p => formatarNumero(p.erros), direita: true },
            { rotulo: 'Travada', valor: p => formatarDuracao(p.travamento_ms), direita: true },
            { rotulo: 'Usuários', valor: p => p.usuarios, direita: true, soDesktop: true },
          ]}
        />
      </Secao>

      <Secao
        titulo="Chamadas ao Supabase"
        icone={Network}
        descricao="Cada tabela, view ou função chamada, com o tempo que o usuário esperou (rede incluída) e as páginas que mais a disparam."
      >
        <TabelaResponsiva
          linhas={dados.endpoints}
          chave={e => e.endpoint}
          destaque={e => (Number(e.erros) > 0 ? 'var(--status-critical)' : Number(e.lentas) > 0 ? 'var(--status-warning)' : undefined)}
          vazio={{ titulo: 'Nenhuma chamada registrada neste período' }}
          colunas={[
            { rotulo: 'Chamada', valor: e => <span className="break-all">{rotuloEndpoint(e.endpoint)}</span> },
            { rotulo: 'Espera total', valor: e => formatarDuracao(e.ms), direita: true },
            { rotulo: 'Chamadas', valor: e => formatarNumero(e.n), direita: true },
            { rotulo: 'Média', valor: e => formatarDuracao(razao(e.ms, e.n) ?? 0), direita: true },
            { rotulo: 'Máx.', valor: e => formatarDuracao(e.mx), direita: true },
            { rotulo: 'Lentas', valor: e => formatarNumero(e.lentas), direita: true },
            { rotulo: 'Erros', valor: e => formatarNumero(e.erros), direita: true },
            { rotulo: 'Volume', valor: e => formatarBytes(e.bytes), direita: true },
            {
              rotulo: 'Páginas que chamam',
              valor: e => {
                const lista = paginasPorEndpoint.get(e.endpoint) ?? [];
                if (!lista.length) return '—';
                return (
                  <span className="block max-w-[280px] truncate" title={lista.map(p => `${nomePagina(p.pagina)} (${p.n})`).join('\n')}>
                    {lista.slice(0, 3).map(p => `${nomePagina(p.pagina)} (${formatarNumero(p.n)})`).join(' · ')}
                  </span>
                );
              },
            },
          ]}
        />
      </Secao>

      <Secao titulo="Usuários e aparelhos" icone={Smartphone} descricao="Quem mais esperou. Muito tempo travado ou memória alta aponta aparelho fraco ou aba aberta há dias.">
        <TabelaResponsiva
          linhas={dados.usuarios}
          chave={u => u.user_id}
          vazio={{ titulo: 'Nenhum usuário reportou neste período' }}
          colunas={[
            { rotulo: 'Usuário', valor: u => u.user_name || 'Usuário' },
            { rotulo: 'Espera total', valor: u => formatarDuracao(u.tempo_ms), direita: true },
            { rotulo: 'Requisições', valor: u => formatarNumero(u.requisicoes), direita: true },
            { rotulo: 'Lentas', valor: u => formatarNumero(u.lentas), direita: true },
            { rotulo: 'Erros', valor: u => formatarNumero(u.erros), direita: true },
            { rotulo: 'Travada', valor: u => `${formatarDuracao(u.travamento_ms)}${u.travamento_max_ms ? ` (máx. ${formatarDuracao(u.travamento_max_ms)})` : ''}`, direita: true },
            { rotulo: 'Volume', valor: u => formatarBytes(Number(u.bytes) + Number(u.storage_bytes)), direita: true },
            { rotulo: 'Memória', valor: u => (u.memoria_mb ? `${u.memoria_mb} MB` : '—'), direita: true },
            { rotulo: 'Aparelhos', valor: u => `${u.aparelhos}${u.plataformas ? ` · ${u.plataformas}` : ''}`, soDesktop: true },
            { rotulo: 'Último sinal', valor: u => haQuanto(u.ultimo) },
          ]}
        />
      </Secao>
    </div>
  );
}
