/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Réplica em tela do Termo de Responsabilidade de EPI (FRM.SEG-0008), no
 * mesmo desenho do papel e do PDF. É um documento: fica em fundo branco
 * também no tema escuro e rola na horizontal no celular.
 */

import { Undo2 } from 'lucide-react';
import {
  FICHA_EPI_FORMULARIO,
  MOTIVOS_MED,
  TERMO_FICHA_EPI,
  formatarDataBR,
  linhasGradeFichaEpi,
  type LinhaGradeFichaEpi,
} from '../../../lib/fichaEpi';
import type { SsmaFichaEpi } from '../../../lib/ssmaFichaEpiApi';

interface Props {
  /** Uma ficha ou todas as do colaborador; a mais recente preenche o cabeçalho. */
  fichas: SsmaFichaEpi[];
  mostrarAssinatura: boolean;
  /** Ação na coluna DEVOLUÇÃO de itens ainda não devolvidos. */
  onRegistrarDevolucao?: (linha: LinhaGradeFichaEpi) => void;
  onDesfazerDevolucao?: (linha: LinhaGradeFichaEpi) => void;
}

const LINHAS_MINIMAS = 10;
const borda = 'border border-black';

function Campo({ rotulo, valor, className = '' }: { rotulo: string; valor?: string | null; className?: string }) {
  return (
    <div className={`flex items-baseline gap-1.5 px-1.5 py-1 ${className}`}>
      <span className="shrink-0 font-bold">{rotulo}</span>
      <span className="truncate text-blue-900">{valor || ''}</span>
    </div>
  );
}

function Assinatura({ src, className = '' }: { src?: string; className?: string }) {
  return src ? <img src={src} alt="Assinatura do colaborador" className={`mx-auto object-contain ${className}`} /> : null;
}

export default function FichaEpiDocumento({ fichas, mostrarAssinatura, onRegistrarDevolucao, onDesfazerDevolucao }: Props) {
  const recentes = [...fichas].sort((a, b) => b.data_entrega.localeCompare(a.data_entrega) || b.created_at.localeCompare(a.created_at));
  const ativas = recentes.filter(f => f.status === 'ATIVA');
  const atual = ativas[0] ?? recentes[0];
  if (!atual) return null;

  const unicaCancelada = fichas.length === 1 && fichas[0].status === 'CANCELADA';
  const linhas = linhasGradeFichaEpi(unicaCancelada ? fichas.map(f => ({ ...f, status: 'ATIVA' })) : fichas);
  const assinaturaPorFicha = new Map(fichas.map(f => [f.id, f.assinatura_colaborador]));
  const primeiro = (campo: 'data_admissao' | 'data_demissao') => recentes.find(f => f[campo])?.[campo] ?? null;
  const vazias = Math.max(0, LINHAS_MINIMAS - linhas.length);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-inner dark:border-slate-700">
      <article className="min-w-[760px] bg-white text-[11px] leading-snug text-black" style={{ fontFamily: 'Century Gothic, Futura, "Segoe UI", sans-serif' }}>
        {unicaCancelada && (
          <p className="mb-1 font-bold text-red-700">FICHA CANCELADA — {fichas[0].cancelamento_motivo}</p>
        )}

        {/* Cabeçalho */}
        <div className={`grid grid-cols-[18%_62%_20%] ${borda}`}>
          <div className="flex items-center justify-center border-r border-black p-1.5">
            <img src="/logo-adm.png" alt="TEN — Torres Eólicas do Nordeste" className="h-12 object-contain" />
          </div>
          <div className="flex flex-col items-center justify-center border-r border-black text-center text-[13px]">
            <span>{FICHA_EPI_FORMULARIO.titulo}</span>
            <span>{FICHA_EPI_FORMULARIO.subtitulo}</span>
          </div>
          <div className="flex flex-col items-center justify-center text-[11px]">
            <span>{FICHA_EPI_FORMULARIO.codigo}</span>
            <span>Rev.: {FICHA_EPI_FORMULARIO.revisao}</span>
            <span>Data: {FICHA_EPI_FORMULARIO.data}</span>
          </div>
        </div>

        {/* Dados do funcionário */}
        <div className={`mt-1 ${borda} text-[12px]`}>
          <Campo rotulo="Nome do Funcionário:" valor={atual.nome} className="border-b border-black" />
          <Campo rotulo="Cargo:" valor={atual.funcao_nome} className="border-b border-black" />
          <div className="grid grid-cols-[49%_51%] border-b border-black">
            <Campo rotulo="Matrícula:" valor={atual.registro} className="border-r border-black" />
            <Campo rotulo="Setor" valor={atual.setor} />
          </div>
          <div className="grid grid-cols-[49%_51%]">
            <Campo rotulo="Data de Admissão:" valor={formatarDataBR(primeiro('data_admissao'))} className="border-r border-black" />
            <Campo rotulo="Data de Demissão:" valor={formatarDataBR(primeiro('data_demissao'))} />
          </div>
        </div>

        {/* Termo */}
        <div className={`mt-1 ${borda} px-1.5 pt-1.5`}>
          {TERMO_FICHA_EPI.paragrafos.map((trechos, i) => (
            <p key={i} style={{ marginTop: TERMO_FICHA_EPI.espacoAntes[i] * 8 }}>
              {trechos.map((t, j) => (t.negrito ? <strong key={j}>{t.texto}</strong> : <span key={j}>{t.texto}</span>))}
            </p>
          ))}
          <div className="mx-auto mt-4 w-2/3 pb-2 text-center">
            <div className="flex h-12 items-end justify-center">
              {mostrarAssinatura && <Assinatura src={assinaturaPorFicha.get(atual.id)} className="max-h-12" />}
            </div>
            <div className="border-t border-black pt-0.5 text-[12px]">Assinatura do Funcionário</div>
            {mostrarAssinatura && assinaturaPorFicha.get(atual.id) && (
              <div className="text-[9px] text-slate-500">Assinado digitalmente em {formatarDataBR(atual.assinado_em.slice(0, 10))}</div>
            )}
          </div>
        </div>

        {/* Retirada / Devolução */}
        <table className="mt-1 w-full border-collapse text-center text-[10px]">
          <colgroup>
            {[95, 74, 336, 85, 226, 74, 85, 234].map((w, i) => <col key={i} style={{ width: `${(w / 1209) * 100}%` }} />)}
          </colgroup>
          <thead className="font-bold">
            <tr>
              <th colSpan={3} className={borda} />
              <th colSpan={3} className={`${borda} py-0.5 text-[12px]`}>RETIRADA DO FUNCIONÁRIO</th>
              <th colSpan={2} className={`${borda} py-0.5 text-[12px]`}>DEVOLUÇÃO</th>
            </tr>
            <tr>
              {['C.A.', 'QTD.', 'DESCRIÇÃO', 'DATA', 'ASS. DO FUNCIONÁRIO', 'M.E.D', 'DATA', 'ASS. DO TST'].map((t, i) => (
                <th key={i} className={`${borda} py-0.5`}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(linha => (
              <tr key={linha.itemId} className="h-9">
                <td className={borda}>{linha.ca}</td>
                <td className={borda}>{linha.quantidade}</td>
                <td className={`${borda} px-1 text-left`}>{linha.descricao}</td>
                <td className={borda}>{formatarDataBR(linha.dataEntrega)}</td>
                <td className={borda}>{mostrarAssinatura && <Assinatura src={assinaturaPorFicha.get(linha.fichaId)} className="max-h-8" />}</td>
                <td className={borda} title={MOTIVOS_MED[linha.motivo]}>{linha.motivo}</td>
                <td className={borda}>{formatarDataBR(linha.dataDevolucao)}</td>
                <td className={`${borda} px-1`}>
                  {linha.dataDevolucao ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[9px]">{linha.devolucaoPor}</span>
                      {onDesfazerDevolucao && (
                        <button type="button" onClick={() => onDesfazerDevolucao(linha)} title="Desfazer devolução" className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 print:hidden">
                          <Undo2 className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ) : onRegistrarDevolucao ? (
                    <button type="button" onClick={() => onRegistrarDevolucao(linha)} className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 print:hidden">
                      Registrar devolução
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {Array.from({ length: vazias }).map((_, i) => (
              <tr key={`vazia-${i}`} className="h-9">
                {Array.from({ length: 8 }).map((__, j) => <td key={j} className={borda} />)}
              </tr>
            ))}
          </tbody>
        </table>

        <div className={`mt-0 ${borda} border-t-0 grid grid-cols-2 px-1.5 py-1 text-[10px]`}>
          <p className="col-span-2 font-bold">Legenda M.E.D.: Motivos para a entrega e devolução</p>
          <p>1. {MOTIVOS_MED[1]}</p>
          <p>3. {MOTIVOS_MED[3]}</p>
          <p>2. {MOTIVOS_MED[2]}</p>
          <p>4. {MOTIVOS_MED[4]}</p>
        </div>
      </article>
    </div>
  );
}
