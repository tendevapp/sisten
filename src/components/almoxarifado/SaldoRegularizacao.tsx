/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Saída sem saldo × ZL0024 importada — usado em Solicitação Extraordinária ›
 * Registros e em Geral › Pendências.
 *
 * Quando a NF é lançada e a ZL0024 é reimportada, o item ganha saldo e a
 * saída já pode ser regularizada (Projeto: doc SAP; Sem Saldo: baixa no
 * balcão). A situação é recalculada a cada leitura da lista ("Atualizar"),
 * sempre sobre a última importação.
 *
 * - `useProntidaoSaldo` — lê a ZL0024 e as pendentes e diz a situação de cada uma;
 * - `SaldoChip`         — selo na linha / cartão;
 * - `FiltroSaldo`       — filtro por situação, com contagem;
 * - `LegendaZl0024`     — de quando é a ZL0024 usada.
 */

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, PackageSearch } from 'lucide-react';
import { indexarEstoquePorDeposito } from '../../lib/requisicaoBalcao';
import { buscarEstoqueBalcao } from '../../lib/requisicaoBalcaoApi';
import { listarSolicitacoesExtraPendentes } from '../../lib/solicitacaoExtraApi';
import {
  PRONTIDAO_SALDO_ROTULO, dataImportacaoEstoque, prontidaoRegularizacao,
  type ProntidaoSaldo, type SaldoParaRegularizar,
} from '../../lib/retiradaSemSaldoBaixa';

export type FiltroProntidao = ProntidaoSaldo | 'todas';

/**
 * Situação de cada saída pendente frente à ZL0024. Relê ZL0024 e pendentes
 * quando `versao` muda — a tela soma 1 a cada leitura da lista; 0 = ainda não
 * leu. O saldo é repartido entre TODAS as pendentes, de qualquer tipo, não só
 * as da lista em tela.
 */
export function useProntidaoSaldo(versao: number): {
  porId: Map<string, SaldoParaRegularizar> | null;
  importadoEm: string | null;
  carregando: boolean;
  erro: boolean;
} {
  const [estado, setEstado] = useState<{ porId: Map<string, SaldoParaRegularizar> | null; importadoEm: string | null; carregando: boolean; erro: boolean }>(
    { porId: null, importadoEm: null, carregando: true, erro: false },
  );
  useEffect(() => {
    if (versao === 0) return;
    let vivo = true;
    setEstado(e => ({ ...e, carregando: true }));
    Promise.all([buscarEstoqueBalcao(true), listarSolicitacoesExtraPendentes()])
      .then(([estoque, pendentes]) => {
        if (!vivo) return;
        setEstado({
          porId: prontidaoRegularizacao(pendentes, indexarEstoquePorDeposito(estoque, true)),
          importadoEm: dataImportacaoEstoque(estoque),
          carregando: false,
          erro: false,
        });
      })
      .catch((err) => {
        console.warn('Saldo da ZL0024 para as saídas pendentes não lido:', err);
        if (vivo) setEstado(e => ({ ...e, carregando: false, erro: true }));
      });
    return () => { vivo = false; };
  }, [versao]);
  return estado;
}

const ESTILO: Record<ProntidaoSaldo, { classe: string; icone: typeof Clock }> = {
  pronta: { classe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300', icone: CheckCircle2 },
  parcial: { classe: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300', icone: PackageSearch },
  aguardando: { classe: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', icone: Clock },
};

export function SaldoChip({ saldo }: { saldo: SaldoParaRegularizar | undefined }) {
  if (!saldo) return null;
  const { classe, icone: Icone } = ESTILO[saldo.prontidao];
  const texto = saldo.prontidao === 'parcial'
    ? `Saldo em ${saldo.itensComSaldo} de ${saldo.totalItens} itens`
    : PRONTIDAO_SALDO_ROTULO[saldo.prontidao];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${classe}`}
      title={saldo.prontidao === 'aguardando' ? 'Nenhum item tem saldo na ZL0024 ainda — NF não lançada?' : 'Saldo pela última ZL0024 importada'}
    >
      <Icone className="h-3 w-3" /> {texto}
    </span>
  );
}

/** Contagem por situação dos ids informados (os que a tela mostra). */
export function contarProntidao(
  ids: string[],
  porId: Map<string, SaldoParaRegularizar> | null,
): Record<FiltroProntidao, number> {
  const c: Record<FiltroProntidao, number> = { todas: ids.length, pronta: 0, parcial: 0, aguardando: 0 };
  for (const id of ids) {
    const p = porId?.get(id)?.prontidao;
    if (p) c[p]++;
  }
  return c;
}

export function FiltroSaldo({
  valor, onChange, contagem,
}: {
  valor: FiltroProntidao;
  onChange: (v: FiltroProntidao) => void;
  contagem: Record<FiltroProntidao, number>;
}) {
  const opcoes: [FiltroProntidao, string][] = [
    ['todas', 'Todas'],
    ['pronta', PRONTIDAO_SALDO_ROTULO.pronta],
    ['parcial', PRONTIDAO_SALDO_ROTULO.parcial],
    ['aguardando', PRONTIDAO_SALDO_ROTULO.aguardando],
  ];
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="Filtrar por saldo na ZL0024">
      {opcoes.map(([id, rotulo]) => {
        const ativo = valor === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition ${
              ativo
                ? id === 'pronta'
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {rotulo}
            <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${ativo ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-800'}`}>{contagem[id]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LegendaZl0024({ importadoEm, carregando, erro }: { importadoEm: string | null; carregando: boolean; erro: boolean }) {
  const texto = useMemo(() => {
    if (carregando) return 'Lendo o saldo da ZL0024…';
    if (erro) return 'Não foi possível ler a ZL0024 — a situação de saldo não aparece.';
    if (!importadoEm) return 'Saldo pela ZL0024.';
    return `Saldo pela ZL0024 importada em ${new Date(importadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`;
  }, [importadoEm, carregando, erro]);
  return <p className={`text-[11px] ${erro ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>{texto}</p>;
}
