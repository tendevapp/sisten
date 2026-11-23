/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Observação Comportamental — FRM.SEG-0042, Rev. 04.
 * Cartão em 2 etapas (rascunho no aparelho, fila offline) e histórico com
 * detalhe, exclusão com motivo, log, Excel e PDF com visualizador.
 */

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import type { Profile } from '../../types';
import SsmaObservacaoForm, { DetalheObservacao } from '../../components/ssma/SsmaObservacaoForm';
import PdfPreviewModal, { type PdfGerado } from '../../components/ui/PdfPreviewModal';
import { useToast } from '../../components/ui/Toast';
import {
  BotoesExportar, CabecalhoSeguranca, HistoricoSeguranca, ItemHistorico, PainelRegistro, rolarParaTopo, type AbaSeguranca,
} from '../../components/ssma/seguranca/PecasSeguranca';
import { useHistoricoSeguranca } from '../../components/ssma/seguranca/useHistoricoSeguranca';
import { dataBR, mensagemErro } from '../../lib/ssmaSegurancaRegistro';
import { listarChecklistObservacao, listarObservacoes, observacoesParaExportar, registrarObservacao, tamanhoPagina,
  type DadosObservacao, type ItemObservacao, type RegistroObservacao } from '../../lib/ssmaObservacaoApi';

const ROTULOS_CAMPO: Record<string, string> = { data: 'Data', nome: 'Observador', local: 'Local', turno_letra: 'Turno / letra', lider_area: 'Líder da área' };
const resumirPendente = (d: DadosObservacao) => ({ titulo: d.local, detalhe: `${dataBR(d.data)} · ${d.turno_letra} · ${d.desvios.length} desvio(s)` });

export default function SsmaObservacaoView({ user, onBack }: { user: Profile; onBack: () => void }) {
  const toast = useToast();
  const [aba, setAba] = useState<AbaSeguranca>('novo');
  const [registro, setRegistro] = useState<RegistroObservacao>();
  const [chaveForm, setChaveForm] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [pdf, setPdf] = useState<{ gerar: () => Promise<PdfGerado> } | null>(null);
  const [itens, setItens] = useState<ItemObservacao[]>([]);
  const [erroChecklist, setErroChecklist] = useState('');
  const [versaoChecklist, setVersaoChecklist] = useState(0);
  const h = useHistoricoSeguranca<RegistroObservacao, DadosObservacao>({
    formulario: 'oc', listar: listarObservacoes, tamanhoPagina, resumirPendente,
  });

  useEffect(() => {
    let vivo = true;
    setErroChecklist('');
    listarChecklistObservacao().then(d => { if (vivo) setItens(d); })
      .catch(e => { if (vivo) { setItens([]); setErroChecklist(mensagemErro(e, 'Checklist indisponível.')); } });
    return () => { vivo = false; };
  }, [versaoChecklist]);

  async function salvar(id: string, dados: DadosObservacao) {
    setErro(''); setOcupado(true);
    try { return await registrarObservacao(id, dados); }
    catch (e) { setErro(mensagemErro(e, 'Não foi possível registrar a observação.')); return null; }
    finally { setOcupado(false); }
  }
  function concluido({ offline }: { offline: boolean }) {
    if (offline) toast.info('Sem rede: a observação ficou guardada no aparelho e sobe sozinha quando a conexão voltar.');
    else toast.success('Observação registrada.');
    setChaveForm(k => k + 1); h.reiniciar(); setAba('historico');
  }
  async function exportar(tipo: 'xlsx' | 'pdf', individual?: RegistroObservacao) {
    const { recorte } = h;
    if (!individual && recorte.de && recorte.ate && recorte.de > recorte.ate) { toast.error('Revise as datas da exportação.'); return; }
    const nome = individual?.codigo ?? ['Observacoes', recorte.de || 'inicio', recorte.ate || 'hoje'].join('_');
    const dados = async () => {
      const lista = individual ? [individual] : await observacoesParaExportar(recorte);
      if (!lista.length) throw new Error('Nenhuma observação no período escolhido.');
      return lista;
    };
    if (tipo === 'pdf') {
      setPdf({ gerar: async () => {
        const [lista, { gerarObservacoesPdf }] = await Promise.all([dados(), import('../../lib/pdfExport/exportSsmaObservacaoPdf')]);
        return gerarObservacoesPdf(lista, itens, nome);
      } });
      return;
    }
    setOcupado(true);
    try {
      const [lista, { exportarObservacoesExcel }] = await Promise.all([dados(), import('../../lib/ssmaObservacaoPlanilha')]);
      exportarObservacoesExcel(lista, itens, nome);
    } catch (e) { toast.error(mensagemErro(e, 'Não foi possível gerar a planilha.')); }
    finally { setOcupado(false); }
  }

  return <div className="mx-auto max-w-5xl space-y-5 pb-16" aria-busy={ocupado}>
    <CabecalhoSeguranca icone={Eye} titulo="Observação Comportamental" codigo="FRM.SEG-0042" revisao="04"
      descricao="Checklist de práticas e condições, práticas seguras e desvios observados por local e turno."
      aba={aba} rotuloNovo="Nova observação" ocupado={ocupado}
      onAba={a => { setAba(a); setRegistro(undefined); setErro(''); }}
      voltarRotulo={registro ? 'Voltar ao histórico' : 'Voltar ao SSMA'}
      onVoltar={() => (registro ? setRegistro(undefined) : onBack())} />

    {erroChecklist && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
      {erroChecklist} <button type="button" className="ml-1 min-h-11 font-bold underline" onClick={() => setVersaoChecklist(v => v + 1)}>Tentar de novo</button></div>}
    {erro && aba === 'novo' && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{erro}</p>}

    {/* Montado enquanto se consulta o histórico, para não perder o preenchimento. */}
    <div hidden={aba !== 'novo'}>
      {itens.length > 0
        ? <SsmaObservacaoForm key={chaveForm} nome={user.name} usuarioId={user.id} itens={itens} ocupado={ocupado} salvar={salvar} onConcluido={concluido} />
        : !erroChecklist && <p role="status" className="p-6 text-center text-sm text-slate-600 dark:text-slate-400">Carregando checklist…</p>}
    </div>

    {aba === 'historico' && (registro ? <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">{registro.codigo}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{dataBR(registro.data)} · {registro.local}</p></div>
        <BotoesExportar disabled={ocupado || !itens.length} onExcel={() => exportar('xlsx', registro)} onPdf={() => exportar('pdf', registro)} />
      </div>
      <DetalheObservacao r={registro} itens={itens} />
      <PainelRegistro formulario="oc" user={user} registro={registro} rotulosCampo={ROTULOS_CAMPO}
        onMudou={() => { setRegistro(undefined); h.recarregar(); }} />
    </div> : <HistoricoSeguranca nome="observações" carregando={h.carregando} erro={h.erro} onAtualizar={h.recarregar}
      filtro={h.filtro} onFiltro={h.setFiltro} recorte={h.recorte} onRecorte={h.setRecorte}
      onExportar={tipo => exportar(tipo)} exportando={ocupado || !itens.length}
      podeVerExcluidos={user.roles.includes('admin')} incluirExcluidos={h.incluirExcluidos} onIncluirExcluidos={h.setIncluirExcluidos}
      pagina={h.pagina} onPagina={h.setPagina} temMais={h.temMais} vazio={!h.lista.length} pendentes={h.pendentes}>
      {h.lista.map(r => <ItemHistorico key={r.id} codigo={r.codigo} titulo={r.local} disabled={ocupado || !itens.length} excluidoEm={r.excluido_em}
        linhas={[`${dataBR(r.data)} · ${r.turno_letra} · ${r.nome}`, `${r.duracao_min} min · ${r.itens.length} item(ns) marcado(s)`]}
        destaque={<><span className="block text-base tabular-nums">{r.desvios.length}</span><span className="font-normal text-slate-500">desvios</span></>}
        onAbrir={() => { setRegistro(r); rolarParaTopo(); }} />)}
    </HistoricoSeguranca>)}

    {pdf && <PdfPreviewModal gerar={pdf.gerar} tituloPadrao="Observação Comportamental" onClose={() => setPdf(null)} />}
  </div>;
}
