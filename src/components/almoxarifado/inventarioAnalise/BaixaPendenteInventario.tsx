/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Análise de Inventário › "Contados com baixa pendente": itens cuja última
 * contagem foi feita com retirada do balcão (normal ou extraordinária) ainda
 * sem doc. SAP. Ficam fora da acuracidade e do valor do erro; aqui aparecem
 * com a diferença esperada depois da baixa e a situação das requisições hoje,
 * para validar depois da regularização. Regras em `lib/inventarioBaixaPendente.ts`.
 */

import { AlertTriangle, Download } from 'lucide-react';
import { formatDeposito, formatQtd } from '../../../lib/almoxarifado';
import { formatDateBR, formatInt } from '../../../lib/format';
import type { LinhaAnalise } from '../../../lib/inventarioAnalise';
import {
  ROTULO_SITUACAO_REGULARIZACAO, codigosDoRetrato, pendenteNoDeposito, situacaoRegularizacao,
  type SituacaoRegularizacao,
} from '../../../lib/inventarioBaixaPendente';
import type { BaixaPendenteMaterial } from '../../../lib/baixasPendentesCatalogo';
import {
  TableBody, TableCardRow, TableCards, TableDesktop, TableHeadRow, TableShell, Td, Th, Tr,
} from '../../ui/DataTable';

const COR_SITUACAO: Record<SituacaoRegularizacao, string> = {
  pendente: 'var(--status-serious)',
  parcial: 'var(--status-warning)',
  regularizada: 'var(--status-good)',
  desconhecida: 'var(--ink-muted)',
};

function Dif({ valor }: { valor: number | null }) {
  if (valor === null) return <span style={{ color: 'var(--ink-muted)' }}>—</span>;
  const cor = valor < 0 ? 'var(--status-critical)' : valor > 0 ? 'var(--status-warning)' : 'var(--status-good)';
  return <span className="font-bold tabular" style={{ color: cor }}>{valor > 0 ? '+' : ''}{formatQtd(valor)}</span>;
}

function Situacao({ s }: { s: SituacaoRegularizacao }) {
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: `color-mix(in srgb, ${COR_SITUACAO[s]} 14%, transparent)`, color: COR_SITUACAO[s] }}
    >
      {ROTULO_SITUACAO_REGULARIZACAO[s]}
    </span>
  );
}

interface Props {
  linhas: LinhaAnalise[];
  agora: Map<string, BaixaPendenteMaterial> | null;
  onExportar: () => void;
}

export default function BaixaPendenteInventario({ linhas, agora, onExportar }: Props) {
  if (linhas.length === 0) return null;
  const dados = linhas.map((l) => {
    const movs = l.baixaPendente ?? [];
    const noDeposito = pendenteNoDeposito(movs, l.deposito);
    return {
      l,
      noDeposito,
      esperada: l.diferenca === null ? null : Math.round((l.diferenca + noDeposito) * 1000) / 1000,
      situacao: situacaoRegularizacao(l.material, movs, agora),
      codigos: codigosDoRetrato(movs),
    };
  });
  const regularizados = dados.filter((d) => d.situacao === 'regularizada').length;
  const chave = (l: LinhaAnalise) => `${l.inventarioId}-${l.chave}`;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
            <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--status-serious)' }} aria-hidden />
            Contados com baixa pendente
            <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: 'color-mix(in srgb, var(--status-serious) 16%, transparent)', color: 'var(--status-serious)' }}>
              {formatInt(linhas.length)} itens · {formatInt(regularizados)} já regularizados
            </span>
          </h2>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            Contados enquanto havia Requisição no Balcão ou Solicitação Extraordinária sem doc. SAP: a ZL0024 ainda não tinha abatido a saída.
            Não entram na acuracidade, no valor do erro, nos gráficos nem nos reincidentes. “Esperada após baixa” = diferença + o que saiu do
            depósito sem o SAP saber. Recontar depois da regularização devolve o item para a acuracidade.
          </p>
        </div>
        <button
          type="button"
          onClick={onExportar}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer hover:bg-[var(--surface-sunken)]"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Exportar para validar
        </button>
      </div>

      <TableCards>
        {dados.map(({ l, noDeposito, esperada, situacao, codigos }) => (
          <TableCardRow key={chave(l)} accent="var(--status-serious)">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-sm font-bold line-clamp-2" style={{ color: 'var(--ink-primary)' }}>{l.descricao || l.material}</p>
              <Situacao s={situacao} />
            </div>
            <p className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              {l.material} · {formatDeposito(l.deposito)} · {l.inventario} · {formatDateBR(l.data)}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
              Dif. <Dif valor={l.diferenca} /> · pendente no depósito {formatQtd(noDeposito)} · esperada após baixa <Dif valor={esperada} />
            </p>
            <p className="font-mono text-[11px]" style={{ color: 'var(--ink-secondary)' }}>{codigos}</p>
          </TableCardRow>
        ))}
      </TableCards>
      <TableDesktop>
        <TableShell maxHeight="60vh">
          <table className="w-full text-xs">
            <TableHeadRow>
              <Th label="Data" />
              <Th label="Inventário" />
              <Th label="Material" />
              <Th label="Depósito" />
              <Th label="Saldo ZL0024" align="right" />
              <Th label="Contado" align="right" />
              <Th label="Diferença" align="right" />
              <Th label="Pendente no depósito" align="right" />
              <Th label="Esperada após baixa" align="right" />
              <Th label="Requisições" />
              <Th label="Regularização" />
            </TableHeadRow>
            <TableBody>
              {dados.map(({ l, noDeposito, esperada, situacao, codigos }) => (
                <Tr key={chave(l)} accent="var(--status-serious)">
                  <Td numeric>{formatDateBR(l.data)}</Td>
                  <Td mono>{l.inventario}</Td>
                  <Td>
                    <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{l.material}</span>
                    <span className="block max-w-[280px] truncate" title={l.descricao}>{l.descricao || '—'}</span>
                  </Td>
                  <Td>{formatDeposito(l.deposito)}</Td>
                  <Td align="right" numeric>{l.saldo === null ? '—' : formatQtd(l.saldo)}</Td>
                  <Td align="right" numeric>{l.contado === null ? '—' : formatQtd(l.contado)}</Td>
                  <Td align="right"><Dif valor={l.diferenca} /></Td>
                  <Td align="right" numeric>{formatQtd(noDeposito)}</Td>
                  <Td align="right"><Dif valor={esperada} /></Td>
                  <Td mono><span className="block max-w-[220px] truncate" title={codigos}>{codigos}</span></Td>
                  <Td><Situacao s={situacao} /></Td>
                </Tr>
              ))}
            </TableBody>
          </table>
        </TableShell>
      </TableDesktop>
    </section>
  );
}
