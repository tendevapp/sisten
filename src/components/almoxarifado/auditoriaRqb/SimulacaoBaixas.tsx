import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { carregarSimulacaoBaixas, movimentosParaSimular } from '../../../lib/requisicaoBalcaoAuditoriaApi';
import { lerBaixasSimulacao, type LinhaBaixasSimulacao } from '../../../lib/requisicaoBalcaoPlanilha';
import { dentroDoPeriodo, filtrarDivergenciasDoc, ROTULO_SITUACAO_DOC, type FiltroPeriodo } from '../../../lib/requisicaoBalcaoAuditoria';
import { acaoCaso, calcularPosicoes, detalheCaso, simularArquivoBaixas, type PosicaoSimulada } from '../../../lib/simulacaoBaixas';
import { formatDateBR, formatDateTimeBR, formatQtd } from '../../../lib/format';
import { carregarCodigosEpiBook } from '../../../lib/requisicaoBalcaoApi';
import { indexarPosicoes } from '../../../lib/inventarioRoteiro';
import { posicoesParaContar, type ApontamentoSimulacao } from '../../../lib/apontamentoSimulacao';
import { listarApontamentosSimulacao } from '../../../lib/apontamentoSimulacaoApi';
import ApontamentoSimulacaoModal from './ApontamentoSimulacaoModal';

type Dados = Awaited<ReturnType<typeof carregarSimulacaoBaixas>>;
const campo = 'rounded-lg border px-2 py-1.5 text-xs';
const chave = (p: PosicaoSimulada) => [p.material, p.deposito, p.unidade].join('|');
const orientacao = 'Conte no mesmo corte da ZL0024. Se o físico coincidir, confirme a entrega, o destino e eventuais documentos avulsos antes de lançar o residual. Em caso de diferença ou físico esperado negativo, reconcilie os movimentos e reconte.';

export default function SimulacaoBaixas({ periodo, busca, versao, usuarioNome }: { periodo: FiltroPeriodo; busca: string; versao: number; usuarioNome: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [tipo, setTipo] = useState('todas');
  const [escopo, setEscopo] = useState('recorte');
  const [contagens, setContagens] = useState<Record<string, string>>({});
  const [arquivo, setArquivo] = useState<{ nome: string; linhas: LinhaBaixasSimulacao[] } | null>(null);
  const [analise, setAnalise] = useState<ReturnType<typeof simularArquivoBaixas> | null>(null);
  const [erroArquivo, setErroArquivo] = useState('');
  const [lendoArquivo, setLendoArquivo] = useState(false);
  // Apontamento de contagem (temporário, não é inventário): sem os itens sem
  // saldo na ZL0024 e sem EPI; o contado vem gravado por corte da ZL0024.
  const [codigosEpi, setCodigosEpi] = useState<Set<string>>(new Set());
  const [apontamentos, setApontamentos] = useState<Map<string, ApontamentoSimulacao>>(new Map());
  const [apontando, setApontando] = useState(false);
  useEffect(() => {
    let ativo = true;
    carregarCodigosEpiBook().then(c => { if (ativo) setCodigosEpi(c); });
    return () => { ativo = false; };
  }, []);
  useEffect(() => {
    if (!dados?.zlEm) return;
    let ativo = true;
    listarApontamentosSimulacao(dados.zlEm).then(lista => {
      if (!ativo) return;
      const mapa = new Map(lista.map(a => [[a.material, a.deposito, a.unidade].join('|'), a]));
      setApontamentos(mapa);
      setContagens(v => ({ ...Object.fromEntries([...mapa].map(([k, a]) => [k, String(a.contado)])), ...v }));
    }).catch(e => console.warn('Apontamentos da simulação não lidos:', e));
    return () => { ativo = false; };
  }, [dados?.zlEm]);
  useEffect(() => {
    let ativo = true;
    setDados(null); setErro(''); setContagens({});
    carregarSimulacaoBaixas().then(d => { if (ativo) setDados(d); })
      .catch(e => { if (ativo) setErro(e?.message || 'Falha ao carregar MB51 e ZL0024.'); });
    return () => { ativo = false; };
  }, [versao]);
  useEffect(() => {
    if (!arquivo || !dados) return;
    let ativo = true;
    setAnalise(null); setErroArquivo('');
    const conhecidos = new Set(dados.movimentos.map(m => m.doc_material));
    const faltam = [...new Set(arquivo.linhas.map(l => l.doc))].filter(doc => !conhecidos.has(doc));
    movimentosParaSimular(faltam).then(ms => {
      if (ativo) setAnalise(simularArquivoBaixas(arquivo.linhas, [...dados.movimentos,...ms], dados.itens, dados.estoque, dados.pares));
    }).catch(e => { if (ativo) setErroArquivo(e?.message || 'Falha ao conferir os documentos da planilha.'); });
    return () => { ativo = false; };
  }, [arquivo, dados]);
  const historico = arquivo ? analise?.casos : dados?.casos;
  const casos = useMemo(() => {
    const noPeriodo = (historico || []).filter(c =>
      c.par.rqbs.some(r => dentroDoPeriodo(periodo, r.data_criacao, r.data_exportacao)));
    const pares = new Set(filtrarDivergenciasDoc(noPeriodo.map(c => c.par), { busca, situacao: 'todas' }));
    return noPeriodo.filter(c => pares.has(c.par) && (tipo === 'todas' || c.par.situacao === tipo));
  }, [historico, periodo, busca, tipo]);
  const filtroContagem = useMemo(() => posicoesParaContar(calcularPosicoes(casos, dados?.estoque || []), codigosEpi), [casos, dados, codigosEpi]);
  const posicoes = filtroContagem.contar;
  const posicoesEstoque = useMemo(() => indexarPosicoes(dados?.estoque || []), [dados]);
  if (erro) return <p role="alert">{erro}</p>;
  if (!dados) return <p role="status">Carregando divergências, movimentos e posição de estoque…</p>;
  const revisar = casos.filter(c => c.revisar).length;
  function exportar() {
    if (!dados) return;
    const todos = escopo === 'historico';
    const lista = todos ? historico || [] : casos;
    const pos = todos ? posicoesParaContar(calcularPosicoes(lista, dados.estoque), codigosEpi).contar : posicoes;
    const wb = XLSX.utils.book_new();
    const linhas: (string | number | null)[][] = [['Material', 'Descrição', 'Depósito', 'UM', 'Saldo ZL0024', 'Saídas', 'Entradas', 'Físico esperado', 'Contado', 'Contado − esperado', 'Conferência']];
    for (const p of pos) {
      const valor = contagens[chave(p)];
      linhas.push([p.material, p.descricao, p.deposito, p.unidade, p.saldo, p.saidas, p.entradas, p.esperado, valor ? Number(valor) : null, null]);
    }
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    pos.forEach((p, i) => {
      const n = i + 2;
      ws['H' + n] = { t: p.esperado == null ? 's' : 'n', v: p.esperado ?? '', f: 'IF(ISNUMBER(E'+n+'),ROUND(E'+n+'-F'+n+'+G'+n+',6),"")' };
      const contado = contagens[chave(p)];
      const desvio = contado && p.esperado != null ? Math.round((Number(contado) - p.esperado) * 1e6) / 1e6 : null;
      ws['J' + n] = { t: desvio == null ? 's' : 'n', v: desvio ?? '', f: 'IF(AND(ISNUMBER(I'+n+'),ISNUMBER(H'+n+')),ROUND(I'+n+'-H'+n+',6),"")' };
      const situacao = p.esperado == null ? 'Validar saldo e UM' : p.esperado < 0 ? 'Saldo insuficiente' : desvio == null ? 'Contar' : desvio === 0 ? 'Validar documentos' : 'Investigar diferença';
      ws['K' + n] = { t: 's', v: situacao, f: 'IF(NOT(ISNUMBER(H'+n+')),"Validar saldo e UM",IF(H'+n+'<0,"Saldo insuficiente",IF(I'+n+'="","Contar",IF(J'+n+'=0,"Validar documentos","Investigar diferença"))))' };
    });
    ws['!ref'] = 'A1:K' + linhas.length;
    ws['!cols'] = [15,46,12,8,17,14,14,18,15,21,24].map(wch => ({ wch }));
    ws['!autofilter'] = { ref: ws['!ref'] };
    XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
    const detalhe = XLSX.utils.json_to_sheet(lista.map(detalheCaso));
    detalhe['!cols'] = [15,15,45,22,8,14,15,14,22,36,60,45,70,85].map(wch => ({ wch }));
    if (detalhe['!ref']) detalhe['!autofilter'] = { ref: detalhe['!ref'] };
    XLSX.utils.book_append_sheet(wb, detalhe, 'Documentos');
    const ref = XLSX.utils.aoa_to_sheet([['Referência','Valor'],['Centro','TEN2'],['Importação ZL0024',formatDateTimeBR(dados.zlEm)],['MB51 até',formatDateBR(dados.mbAte)],
      ['Fonte',arquivo?.nome || 'RQBs exportadas do SISTEN'], ['Documentos ainda sem MB51',arquivo ? analise?.docsAusentes.join(', ') : ''],
      ['Escopo',todos ? 'Toda a fonte selecionada' : [periodo.base,periodo.de || 'início',periodo.ate || 'hoje',busca,tipo].join(' / ')],
      ['Documentos × material no cenário',lista.length],['Pares sujeitos a revisão e excluídos das contas',lista.filter(c => c.revisar).length],['Conferência',orientacao]]);
    ref['!cols'] = [{ wch: 52 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, ref, 'Critérios');
    XLSX.writeFile(wb, 'Simulacao_Baixas_MB51.xlsx');
  }
  return <section className="space-y-3 rounded-xl border p-4 text-xs" style={{ borderColor: 'var(--hairline)' }}>
    <h2 className="text-base font-bold">Simulação de baixa e contagem física</h2>
    <p>Centro TEN2 · ZL0024 importada em {formatDateTimeBR(dados.zlEm)} · MB51 até {formatDateBR(dados.mbAte)}</p>
    <div className="flex flex-wrap items-center gap-3">
      <strong>Fonte · {arquivo?.nome || 'RQBs exportadas do SISTEN'}</strong>
      <label className={campo}>Comparar arquivo BAIXAS <input type="file" accept=".xlsx,.xlsm" disabled={lendoArquivo}
        onChange={async e => {
          const file = e.target.files?.[0]; e.target.value = '';
          if (!file) return;
          setLendoArquivo(true); setErroArquivo('');
          try {
            const linhas = lerBaixasSimulacao(XLSX.read(await file.arrayBuffer(), { type: 'array' }));
            setAnalise(null); setArquivo({ nome: file.name, linhas });
          } catch (err) { setErroArquivo(err instanceof Error ? err.message : 'Falha ao ler o arquivo.'); }
          finally { setLendoArquivo(false); }
        }} /></label>
      {arquivo && <button className={campo} onClick={() => { setArquivo(null); setAnalise(null); setErroArquivo(''); }}>Usar RQBs do SISTEN</button>}
    </div>
    {erroArquivo && <p role="alert">{erroArquivo}</p>}
    {(lendoArquivo || (arquivo && !analise && !erroArquivo)) && <p role="status">Conferindo as linhas BAIXAS com os documentos da MB51…</p>}
    {!!analise?.docsAusentes.length && <p>Documentos fora da MB51, pendentes de conferência: {analise.docsAusentes.join(', ')}.</p>}
    <p>O físico esperado é o saldo SAP menos as saídas pendentes, mais as transferências a receber no depósito. O período e a busca selecionam pares completos de documento e material. {orientacao}</p>
    <div className="flex flex-wrap items-end gap-3">
      <label>Cenário <select aria-label="Cenário" className={campo} value={tipo} onChange={e => setTipo(e.target.value)}>
        <option value="todas">Fora do documento e quantidade menor</option><option value="fora_do_doc">Só fora do documento</option><option value="parcial">Só quantidade menor</option>
      </select></label>
      <label>Exportar <select aria-label="Escopo da exportação" className={campo} value={escopo} onChange={e => setEscopo(e.target.value)}>
        <option value="recorte">Período e cenário selecionados</option><option value="historico">Fonte completa, ambos os cenários</option>
      </select></label>
      <button type="button" disabled={lendoArquivo || !(escopo === 'historico' ? historico?.length : casos.length)} onClick={exportar} className={campo}>Baixar Excel</button>
      <button type="button" disabled={!posicoes.length || !dados.zlEm} onClick={() => setApontando(true)}
        className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
        Apontar contagem ({posicoes.length - posicoes.filter(p => apontamentos.has(chave(p))).length} a contar)
      </button>
    </div>
    <p><strong>{casos.length}</strong> pares de documento e material · <strong>{posicoes.length}</strong> posições para contar · <strong>{revisar}</strong> pares exigem revisão antes de entrar nas contas.
      {(filtroContagem.semSaldo + filtroContagem.epi + filtroContagem.deposito) > 0 && <> Fora da lista: {filtroContagem.semSaldo} sem saldo na ZL0024, {filtroContagem.epi} EPI e {filtroContagem.deposito} nos depósitos 0105 e 0006.</>}</p>
    {posicoes.length > 0 && <div className="overflow-auto max-h-[32rem]"><table className="w-full text-left [&_td]:p-2 [&_th]:p-2">
      <thead className="sticky top-0" style={{background:'var(--surface-raised)'}}><tr>{['Depósito','Material','Descrição','UM','Saldo SAP','Saídas','Entradas','Físico esperado','Contado','Conferência'].map(t => <th key={t}>{t}</th>)}</tr></thead>
      <tbody>{posicoes.map(p => {
        const key = chave(p), contado = contagens[key] || '';
        const dif = p.esperado != null && contado !== '' ? Math.round((Number(contado) - p.esperado) * 1e6) / 1e6 : null;
        const resultado = p.esperado == null ? 'Validar saldo e UM' : p.esperado < 0 ? 'Saldo insuficiente' : dif == null ? 'Contar' : dif === 0 ? 'Coincide · validar documentos' : 'Diferença de ' + formatQtd(dif);
        return <tr key={key} className="border-t"><td>{p.deposito}</td><td>{p.material}</td><td>{p.descricao}</td><td>{p.unidade}</td>
          <td>{formatQtd(p.saldo)}</td><td>{formatQtd(p.saidas)}</td><td>{formatQtd(p.entradas)}</td><td><strong>{formatQtd(p.esperado)}</strong></td>
          <td><input className={campo + ' w-24'} aria-label={'Contado ' + p.material + ' depósito ' + p.deposito} type="number" step="any" min="0" value={contado}
            onChange={e => { const valor = e.target.value; if (e.target.validity.valid) setContagens(v => ({ ...v, [key]: valor })); }} /></td><td>{resultado}</td></tr>;
      })}</tbody></table></div>}
    <details><summary className="cursor-pointer font-bold">Documentos, requisições e providências ({casos.length})</summary>
      <div className="max-h-96 overflow-auto"><table className="w-full text-left [&_td]:p-2 [&_th]:p-2"><thead><tr>{['Documento / material','Situação','RQBs','Pedido','MB51','Residual','Providência'].map(t => <th key={t}>{t}</th>)}</tr></thead>
        <tbody>{casos.map(c => <tr key={c.par.doc + '|' + c.par.material} className="border-t"><td>{c.par.doc} / {c.par.material}</td>
          <td>{ROTULO_SITUACAO_DOC[c.par.situacao]}</td><td>{c.par.rqbs.map(r => r.codigo).join(', ')}</td>
          <td>{formatQtd(c.par.qtd_rqbs)}</td><td>{formatQtd(c.par.qtd_doc)}</td><td>{formatQtd(c.par.falta)} {c.par.unidade}</td><td>{acaoCaso(c)} {c.par.avulsos}</td></tr>)}</tbody>
      </table></div>
    </details>
    {apontando && dados.zlEm && <ApontamentoSimulacaoModal
      posicoes={posicoes} posicoesEstoque={posicoesEstoque} zlEm={dados.zlEm} usuarioNome={usuarioNome}
      apontamentos={apontamentos} onClose={() => setApontando(false)}
      onSalvo={a => {
        const k = [a.material, a.deposito, a.unidade].join('|');
        setApontamentos(m => new Map(m).set(k, a));
        setContagens(v => ({ ...v, [k]: String(a.contado) }));
      }} />}
  </section>;
}
