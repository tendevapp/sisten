import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { classeCampoFiltro } from '../ui/FiltrosSheet';
import { estaVencida, nomeFornecedor } from '../../lib/contasPagar';
import { formatBRL, formatDateBR, formatDateTimeBR, formatPct } from '../../lib/format';
import {
  chaveFornecedor, janeiroParaPagamento, metodoSimulacao, referenciaCotacoes,
  simularAtraso, taxasReferencia, validarCenario, type PartidaSimulacao,
} from '../../lib/simulacaoAtraso';

const dinheiro = (centavos: number) => formatBRL(centavos / 100);
const campo = 'flex min-w-0 flex-col gap-1 text-xs font-semibold';
const celula = 'px-3 py-2.5 text-right whitespace-nowrap tabular-nums';

export default function SimulacaoAtrasoModal({ linhas, base, cargaFbl1n, onClose }: {
  linhas: PartidaSimulacao[]; base: string; cargaFbl1n: string | null; onClose: () => void;
}) {
  const janeiro = janeiroParaPagamento(base);
  const [pagamento, setPagamento] = useState(janeiro.inicial);
  const [multa, setMulta] = useState(String(taxasReferencia.multa));
  const [juros, setJuros] = useState(String(taxasReferencia.juros));
  const [vencimentoDe, setVencimentoDe] = useState('');
  const [vencimentoAte, setVencimentoAte] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [expandido, setExpandido] = useState('');
  const [exportando, setExportando] = useState(false);
  const [erroExportacao, setErroExportacao] = useState('');
  const opcoes = useMemo(() => {
    const nomes = new Map<string, string>();
    for (const l of linhas) {
      if (estaVencida(l, base)) nomes.set(chaveFornecedor(l), [nomeFornecedor(l), l.fornecedor].filter(Boolean).join(' · '));
    }
    return [...nomes].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [linhas, base]);
  const cenario = useMemo(() => ({
    base, pagamento, multa: multa === '' ? NaN : Number(multa), juros: juros === '' ? NaN : Number(juros),
    vencimentoDe, vencimentoAte, fornecedor, cargaFbl1n,
  }), [base, pagamento, multa, juros, vencimentoDe, vencimentoAte, fornecedor, cargaFbl1n]);
  const erro = validarCenario(cenario);
  const resultado = useMemo(() => erro ? null : simularAtraso(linhas, cenario), [erro, linhas, cenario]);
  const totais = resultado?.totais;

  async function exportar() {
    if (!resultado?.fornecedores.length) return;
    setExportando(true);
    setErroExportacao('');
    try {
      const { exportarSimulacao } = await import('../../lib/exportSimulacaoAtraso');
      exportarSimulacao(cenario, resultado);
    } catch {
      setErroExportacao('Falha ao gerar a planilha. Tente exportar novamente.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-6xl" ariaLabel="Simulação de pagamento em atraso">
      <ModalHeader onClose={onClose}>
        <h2 className="text-xl font-bold">Simulação de pagamento em atraso</h2>
        <p className="mt-1 text-sm text-slate-500">Carteira FBL1N em reais · vencida e em aberto em {formatDateBR(base)}
          {cargaFbl1n && ' · Carga de ' + formatDateTimeBR(cargaFbl1n)}</p>
      </ModalHeader>
      <ModalBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={campo}>Pagamento em janeiro
            <input type="date" className={classeCampoFiltro} min={janeiro.minimo} max={janeiro.maximo} value={pagamento} onChange={e => setPagamento(e.target.value)} />
          </label>
          <label className={campo}>Multa única (%)
            <input type="number" className={classeCampoFiltro} min="0" max="100" step="any" value={multa} onChange={e => setMulta(e.target.value)} />
          </label>
          <label className={campo}>Juros ao mês (%)
            <input type="number" className={classeCampoFiltro} min="0" max="100" step="any" value={juros} onChange={e => setJuros(e.target.value)} />
          </label>
        </div>
        <details className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
          <summary className="cursor-pointer font-semibold">Referência das cotações e método de cálculo</summary>
          <p className="mt-2">{referenciaCotacoes}</p>
          <p className="mt-2">{metodoSimulacao}</p>
        </details>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <label className={campo}>Fornecedor
            <select value={fornecedor} className={classeCampoFiltro} onChange={e => setFornecedor(e.target.value)}>
              <option value="">Todos os fornecedores</option>
              {opcoes.map(([k, nome]) => <option key={k} value={k}>{nome}</option>)}
            </select>
          </label>
          <label className={campo}>Vencimento de
            <input type="date" className={classeCampoFiltro} value={vencimentoDe} onChange={e => setVencimentoDe(e.target.value)} />
          </label>
          <label className={campo}>Vencimento até
            <input type="date" className={classeCampoFiltro} value={vencimentoAte} onChange={e => setVencimentoAte(e.target.value)} />
          </label>
        </div>
        {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
        {!!resultado?.foraDaBase && <p className="text-sm text-amber-700">{resultado.foraDaBase} partida(s) vencida(s) fora do cálculo em reais por moeda diferente de BRL, moeda ausente ou valor ausente.</p>}
        {resultado && totais && <>
          <dl className="grid gap-2 sm:grid-cols-3">
            {[
              ['Saldo vencido', totais.saldo, 'Créditos abatidos de ' + dinheiro(totais.creditos)],
              ['Multa + Juros', totais.encargos, 'Valor estimado desde o vencimento'],
              ['Saldo projetado', totais.projetado, 'Pagamento em ' + formatDateBR(pagamento)],
            ].map(([titulo, valor, detalhe]) => (
              <div key={titulo} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <dt className="text-xs font-semibold text-slate-500">{titulo}</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">{dinheiro(Number(valor))}</dd>
                <dd className="text-xs text-slate-500">{detalhe}</dd>
              </div>
            ))}
          </dl>
          {!!resultado.fornecedores.length && <p className="text-sm">
            Cada dia adicional até o pagamento acrescenta cerca de <strong>{dinheiro((totais.saldo + totais.creditos) * cenario.juros / 3000)}</strong> em juros neste recorte.
          </p>}
          <div>
            <h3 className="font-bold">Impacto por fornecedor</h3>
            <p className="mb-2 text-xs text-slate-500">Do maior para o menor valor de Multa + Juros. Selecione um fornecedor para conferir suas partidas.</p>
            {!resultado.fornecedores.length ? <p className="py-4 text-sm">Nenhuma partida vencida em reais neste recorte.</p> :
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs dark:bg-slate-800"><tr>
                    <th className="px-3 py-2 text-left">Fornecedor</th>
                    {['Partidas', 'Saldo vencido', 'Multa', 'Juros', 'Multa + Juros', '% do total de Multa + Juros', 'Saldo projetado'].map(t => <th key={t} className={celula}>{t}</th>)}
                  </tr></thead>
                  <tbody>{resultado.fornecedores.map(f => {
                    const aberto = expandido === f.chave;
                    const alternar = () => setExpandido(aberto ? '' : f.chave);
                    return <Fragment key={f.chave}>
                      <tr onClick={alternar} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                        <th className="px-3 py-2 text-left">
                          <button type="button" aria-expanded={aberto} onClick={e => { e.stopPropagation(); alternar(); }} className="flex items-center gap-1.5 text-left">
                            <ChevronDown className={'h-4 w-4 shrink-0 ' + (aberto ? '' : '-rotate-90')} />
                            <span>{f.nome}<small className="block font-normal text-slate-500">{f.codigo}</small></span>
                          </button>
                        </th>
                        <td className={celula}>{f.titulos.length}</td>
                        {[f.saldo, f.multa, f.juros, f.encargos].map((v, i) => <td key={i} className={celula}>{dinheiro(v)}</td>)}
                        <td className={celula}>{formatPct(totais.encargos ? 100 * f.encargos / totais.encargos : 0)}</td>
                        <td className={celula}>{dinheiro(f.projetado)}</td>
                      </tr>
                      {aberto && f.titulos.map(t => <tr key={t.partida.id} className="bg-emerald-50/60 text-xs dark:bg-emerald-950/30">
                        <td className="px-3 py-2 pl-7">Doc. {t.partida.numero_documento} · {t.partida.tipo_documento}
                          <span className="block">Venc. {formatDateBR(t.partida.vencimento_liquido)} · {t.dias} dias</span>
                          <span className="block">{[t.partida.referencia, t.partida.parcela && 'Parcela ' + t.partida.parcela].filter(Boolean).join(' · ')}</span>
                        </td>
                        <td />
                        {[t.saldo, t.multa, t.juros, t.encargos].map((v, i) => <td key={i} className={celula}>{dinheiro(v)}</td>)}
                        <td /><td className={celula}>{dinheiro(t.projetado)}</td>
                      </tr>)}
                    </Fragment>;
                  })}</tbody>
                  <tfoot className="bg-slate-50 font-bold dark:bg-slate-800"><tr>
                    <th className="px-3 py-2 text-left">Total</th>
                    <td className={celula}>{resultado.fornecedores.reduce((n, f) => n + f.titulos.length, 0)}</td>
                    {[totais.saldo, totais.multa, totais.juros, totais.encargos].map((v, i) => <td key={i} className={celula}>{dinheiro(v)}</td>)}
                    <td /><td className={celula}>{dinheiro(totais.projetado)}</td>
                  </tr></tfoot>
                </table>
              </div>}
          </div>
        </>}
      </ModalBody>
      <ModalFooter>
        {erroExportacao && <p role="alert" className="text-sm text-red-600">{erroExportacao}</p>}
        <button type="button" disabled={exportando || !resultado?.fornecedores.length} onClick={exportar}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          <Download size={16} />{exportando ? 'Exportando…' : 'Exportar simulação em Excel'}
        </button>
      </ModalFooter>
    </Modal>
  );
}
