/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Inspeção de SST (ISP) — FRM.SEG-0036, Rev. 01.
 * 43 verificações, ações de correção e fotos (rascunho no aparelho, fila
 * offline) e histórico com detalhe, exclusão com motivo, log, Excel e PDF com
 * visualizador.
 */

import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { Profile } from '../../types';
import SsmaIspForm from '../../components/ssma/SsmaIspForm';
import PdfPreviewModal, { type PdfGerado } from '../../components/ui/PdfPreviewModal';
import { useToast } from '../../components/ui/Toast';
import {
  BotoesExportar, CabecalhoSeguranca, HistoricoSeguranca, ItemHistorico, PainelRegistro, rolarParaTopo, type AbaSeguranca,
} from '../../components/ssma/seguranca/PecasSeguranca';
import { useHistoricoSeguranca } from '../../components/ssma/seguranca/useHistoricoSeguranca';
import { dataBR, mensagemErro } from '../../lib/ssmaSegurancaRegistro';
import { inspecoesParaExportar, listarInspecoesIsp, listarItensIsp, TAMANHO_PAGINA_ISP, totalIsp,
  type DadosIsp, type ItemIsp, type RegistroIsp } from '../../lib/ssmaIspApi';

const ROTULOS_CAMPO: Record<string, string> = {
  data: 'Data', area: 'Área', responsavel_area: 'Responsável pela área', inspetor: 'Responsável pela inspeção', tst: 'TST', inicio: 'Início',
};
const resumirPendente = (d: DadosIsp) => ({
  titulo: d.area, detalhe: `${dataBR(d.data)} · ${d.inspetor} · ${totalIsp(d.respostas)} irregularidade(s)`,
});

export default function SsmaIspView({ user, onBack }: { user: Profile; onBack: () => void }) {
  const toast = useToast();
  const [aba, setAba] = useState<AbaSeguranca>('novo');
  const [registro, setRegistro] = useState<RegistroIsp>();
  const [chaveForm, setChaveForm] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [pdf, setPdf] = useState<{ gerar: () => Promise<PdfGerado> } | null>(null);
  const [itens, setItens] = useState<ItemIsp[]>([]);
  const [erroChecklist, setErroChecklist] = useState('');
  const [versaoChecklist, setVersaoChecklist] = useState(0);
  const h = useHistoricoSeguranca<RegistroIsp, DadosIsp>({
    formulario: 'isp', listar: listarInspecoesIsp, tamanhoPagina: TAMANHO_PAGINA_ISP, resumirPendente,
  });

  useEffect(() => {
    let vivo = true;
    setErroChecklist('');
    listarItensIsp().then(d => { if (vivo) setItens(d); })
      .catch(e => { if (vivo) { setItens([]); setErroChecklist(mensagemErro(e, 'Checklist indisponível.')); } });
    return () => { vivo = false; };
  }, [versaoChecklist]);

  function concluido({ offline }: { offline: boolean }) {
    if (offline) toast.info('Sem rede: a inspeção e as fotos ficaram guardadas no aparelho e sobem sozinhas quando a conexão voltar.');
    else toast.success('Inspeção registrada.');
    setChaveForm(k => k + 1); h.reiniciar(); setAba('historico');
  }
  async function exportar(tipo: 'xlsx' | 'pdf', individual?: RegistroIsp) {
    const { recorte } = h;
    if (!individual && recorte.de && recorte.ate && recorte.de > recorte.ate) { toast.error('Revise as datas da exportação.'); return; }
    const nome = individual?.codigo ?? ['ISP', recorte.de || 'inicio', recorte.ate || 'hoje'].join('_');
    const dados = async () => {
      const lista = individual ? [individual] : await inspecoesParaExportar(recorte);
      if (!lista.length) throw new Error('Nenhuma inspeção no período escolhido.');
      return lista;
    };
    if (tipo === 'pdf') {
      setPdf({ gerar: async () => {
        const [lista, { gerarIspPdf }] = await Promise.all([dados(), import('../../lib/pdfExport/exportSsmaIspPdf')]);
        return gerarIspPdf(lista, itens, nome);
      } });
      return;
    }
    setOcupado(true);
    try {
      const [lista, { exportarPlanilhaIsp }] = await Promise.all([dados(), import('../../lib/ssmaIspPlanilha')]);
      exportarPlanilhaIsp(lista, itens, nome);
    } catch (e) { toast.error(mensagemErro(e, 'Não foi possível gerar a planilha.')); }
    finally { setOcupado(false); }
  }

  return <div className="mx-auto max-w-5xl space-y-5 pb-16" aria-busy={ocupado}>
    <CabecalhoSeguranca icone={ClipboardCheck} titulo="Inspeção de SST (ISP)" codigo="FRM.SEG-0036" revisao="01"
      descricao="Índice de Segurança Praticada: 43 verificações por área, ações de correção e registro fotográfico."
      aba={aba} rotuloNovo="Nova inspeção" ocupado={ocupado}
      onAba={a => { setAba(a); setRegistro(undefined); }}
      voltarRotulo={registro ? 'Voltar ao histórico' : 'Voltar ao SSMA'}
      onVoltar={() => (registro ? setRegistro(undefined) : onBack())} />

    {erroChecklist && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
      {erroChecklist} <button type="button" className="ml-1 min-h-11 font-bold underline" onClick={() => setVersaoChecklist(v => v + 1)}>Tentar de novo</button></div>}

    {/* Montado enquanto se consulta o histórico, para não perder o preenchimento. */}
    <div hidden={aba !== 'novo'}>
      {itens.length > 0
        ? <SsmaIspForm key={chaveForm} user={user} itens={itens} onSalvo={concluido} />
        : !erroChecklist && <p role="status" className="p-6 text-center text-sm text-slate-600 dark:text-slate-400">Carregando checklist…</p>}
    </div>

    {aba === 'historico' && (registro ? <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">{registro.codigo}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{dataBR(registro.data)} · {registro.area}</p></div>
        <BotoesExportar disabled={ocupado || !itens.length} onExcel={() => exportar('xlsx', registro)} onPdf={() => exportar('pdf', registro)} />
      </div>
      <SsmaIspForm key={registro.id} user={user} itens={itens} registro={registro} onSalvo={() => {}} />
      <PainelRegistro formulario="isp" user={user} registro={registro} rotulosCampo={ROTULOS_CAMPO}
        onMudou={() => { setRegistro(undefined); h.recarregar(); }} />
    </div> : <HistoricoSeguranca nome="inspeções" carregando={h.carregando} erro={h.erro} onAtualizar={h.recarregar}
      filtro={h.filtro} onFiltro={h.setFiltro} recorte={h.recorte} onRecorte={h.setRecorte}
      onExportar={tipo => exportar(tipo)} exportando={ocupado || !itens.length}
      podeVerExcluidos={user.roles.includes('admin')} incluirExcluidos={h.incluirExcluidos} onIncluirExcluidos={h.setIncluirExcluidos}
      pagina={h.pagina} onPagina={h.setPagina} temMais={h.temMais} vazio={!h.lista.length} pendentes={h.pendentes}>
      {h.lista.map(r => <ItemHistorico key={r.id} codigo={r.codigo} titulo={r.area} disabled={!itens.length} excluidoEm={r.excluido_em}
        linhas={[`${dataBR(r.data)} · ${r.inicio.slice(0, 5)} · ${r.inspetor}`, `${r.acoes.length} ação(ões) · ${r.fotos.length} foto(s)`]}
        destaque={<><span className="block text-base tabular-nums">{totalIsp(r.respostas)}</span><span className="font-normal text-slate-500">irreg.</span></>}
        onAbrir={() => { setRegistro(r); rolarParaTopo(); }} />)}
    </HistoricoSeguranca>)}

    {pdf && <PdfPreviewModal gerar={pdf.gerar} tituloPadrao="Inspeção de SST" onClose={() => setPdf(null)} />}
  </div>;
}
