/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ronda de Segurança do Trabalho — FRM.SEG-0041, Rev. 00.
 * Novo registro (rascunho no aparelho, fila offline) e histórico com detalhe,
 * exclusão com motivo, log, Excel e PDF com visualizador.
 */

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { Profile } from '../../types';
import SsmaRondaForm from '../../components/ssma/SsmaRondaForm';
import PdfPreviewModal, { type PdfGerado } from '../../components/ui/PdfPreviewModal';
import { useToast } from '../../components/ui/Toast';
import {
  BotoesExportar, CabecalhoSeguranca, Contador, Dado, HistoricoSeguranca, ItemHistorico, PainelRegistro, rolarParaTopo, Secao, type AbaSeguranca,
} from '../../components/ssma/seguranca/PecasSeguranca';
import { blocoSsma } from '../../components/ssma/estilosFormulario';
import { useHistoricoSeguranca } from '../../components/ssma/seguranca/useHistoricoSeguranca';
import { dataBR, mensagemErro } from '../../lib/ssmaSegurancaRegistro';
import { categoriasRonda, listarRondas, obterRonda, paginaRondas, registrarRonda, rondasParaExportar, totalRonda,
  type DadosRonda, type RegistroRonda } from '../../lib/ssmaRondaApi';

const ROTULOS_CAMPO: Record<string, string> = { data: 'Data', hora: 'Hora', gerente: 'Gerente', frentes: 'Frentes de trabalho' };
const resumirPendente = (d: DadosRonda) => ({ titulo: d.frentes, detalhe: `${dataBR(d.data)} · ${d.hora} · ${d.gerente}` });

function DetalheRonda({ r }: { r: RegistroRonda }) {
  const pessoas = [{ papel: 'Gerente da unidade', nome: r.gerente, assinatura: r.assinatura_gerente }, ...r.participantes.map(p => ({ ...p, papel: 'Participante' }))];
  const total = totalRonda(r);
  return <div className="space-y-4">
    <Secao marca="1" cor="blue" titulo="Identificação da ronda">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Dado rotulo="Data">{dataBR(r.data)}</Dado><Dado rotulo="Hora">{r.hora.slice(0, 5)}</Dado><Dado rotulo="Gerente da unidade" largo>{r.gerente}</Dado>
        <Dado rotulo="Frentes de trabalho" largo>{r.frentes}</Dado>
      </dl>
    </Secao>
    <Secao marca="2" cor="amber" titulo="Irregularidades identificadas" extra={<Contador tom={total ? 'alerta' : 'ok'}>{total}</Contador>}>
      <ul className="space-y-2">{categoriasRonda.map(c => <li key={c.chave}
        className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-sm ${r[c.chave] > 0
          ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/25' : 'border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40'}`}>
        <span className="font-medium text-slate-800 dark:text-slate-200">{c.nome}</span>
        <b className="text-lg tabular-nums text-slate-900 dark:text-slate-50">{r[c.chave]}</b></li>)}</ul>
    </Secao>
    <Secao marca="3" cor="emerald" titulo="Relato da ronda">
      <dl className="grid gap-4"><Dado rotulo="Boas práticas">{r.boas_praticas}</Dado><Dado rotulo="Observações e sugestões">{r.observacoes}</Dado></dl>
    </Secao>
    <Secao marca="4" cor="violet" titulo="Participantes e assinaturas" extra={<Contador>{pessoas.length}</Contador>}>
      <ul className="grid gap-2.5 sm:grid-cols-2">{pessoas.map((p, i) => <li key={i} className={blocoSsma}>
        <div><b className="block text-sm text-slate-900 dark:text-slate-100">{p.nome}</b><span className="text-xs text-slate-600 dark:text-slate-400">{p.papel}</span></div>
        {p.assinatura
          ? <img className="h-16 max-w-full rounded-lg border border-slate-200 bg-white object-contain" alt={'Assinatura de ' + p.nome} src={p.assinatura}/>
          : <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Assinatura em branco</p>}
      </li>)}</ul>
    </Secao>
  </div>;
}

export default function SsmaRondaView({ user, onBack }: { user: Profile; onBack: () => void }) {
  const toast = useToast();
  const [aba, setAba] = useState<AbaSeguranca>('novo');
  const [registro, setRegistro] = useState<RegistroRonda>();
  const [chaveForm, setChaveForm] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [pdf, setPdf] = useState<{ gerar: () => Promise<PdfGerado> } | null>(null);
  const h = useHistoricoSeguranca<Awaited<ReturnType<typeof listarRondas>>[number], DadosRonda>({
    formulario: 'ronda', listar: listarRondas, tamanhoPagina: paginaRondas, resumirPendente,
  });

  async function salvar(id: string, dados: DadosRonda) {
    setErro(''); setOcupado(true);
    try { return await registrarRonda(id, dados); }
    catch (e) { setErro(mensagemErro(e, 'Não foi possível registrar a ronda.')); return null; }
    finally { setOcupado(false); }
  }
  function concluido({ offline }: { offline: boolean }) {
    if (offline) toast.info('Sem rede: a ronda ficou guardada no aparelho e sobe sozinha quando a conexão voltar.');
    else toast.success('Ronda registrada.');
    setChaveForm(k => k + 1); h.reiniciar(); setAba('historico');
  }
  async function abrir(id: string) {
    setOcupado(true);
    try { setRegistro(await obterRonda(id)); rolarParaTopo(); }
    catch (e) { toast.error(mensagemErro(e, 'Não foi possível abrir a ronda.')); }
    finally { setOcupado(false); }
  }
  async function exportar(tipo: 'xlsx' | 'pdf', individual?: RegistroRonda) {
    const { recorte } = h;
    if (!individual && recorte.de && recorte.ate && recorte.de > recorte.ate) { toast.error('Revise as datas da exportação.'); return; }
    const nome = individual?.codigo ?? ['Rondas', recorte.de || 'inicio', recorte.ate || 'hoje'].join('_');
    const dados = async () => {
      const lista = individual ? [individual] : await rondasParaExportar(recorte);
      if (!lista.length) throw new Error('Nenhuma ronda no período escolhido.');
      return lista;
    };
    if (tipo === 'pdf') {
      setPdf({ gerar: async () => {
        const [lista, { gerarRondasPdf }] = await Promise.all([dados(), import('../../lib/pdfExport/exportSsmaRondaPdf')]);
        return gerarRondasPdf(lista, nome);
      } });
      return;
    }
    setOcupado(true);
    try {
      const [lista, { exportarRondasExcel }] = await Promise.all([dados(), import('../../lib/ssmaRondaPlanilha')]);
      exportarRondasExcel(lista, nome);
    } catch (e) { toast.error(mensagemErro(e, 'Não foi possível gerar a planilha.')); }
    finally { setOcupado(false); }
  }

  return <div className="mx-auto max-w-5xl space-y-5 pb-16" aria-busy={ocupado}>
    <CabecalhoSeguranca icone={ShieldCheck} titulo="Ronda de Segurança do Trabalho" codigo="FRM.SEG-0041" revisao="00"
      descricao="Frentes visitadas, participantes com assinatura, irregularidades e boas práticas."
      aba={aba} rotuloNovo="Nova ronda" ocupado={ocupado}
      onAba={a => { setAba(a); setRegistro(undefined); setErro(''); }}
      voltarRotulo={registro ? 'Voltar ao histórico' : 'Voltar ao SSMA'}
      onVoltar={() => (registro ? setRegistro(undefined) : onBack())} />

    {erro && aba === 'novo' && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{erro}</p>}
    {/* O formulário fica montado ao consultar o histórico, para não perder o preenchimento. */}
    <div hidden={aba !== 'novo'}>
      <SsmaRondaForm key={chaveForm} usuarioId={user.id} ocupado={ocupado} salvar={salvar} onConcluido={concluido} />
    </div>

    {aba === 'historico' && (registro ? <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">{registro.codigo}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{dataBR(registro.data)} · {registro.hora.slice(0, 5)}</p></div>
        <BotoesExportar disabled={ocupado} onExcel={() => exportar('xlsx', registro)} onPdf={() => exportar('pdf', registro)} />
      </div>
      <DetalheRonda r={registro} />
      <PainelRegistro formulario="ronda" user={user} registro={registro} rotulosCampo={ROTULOS_CAMPO}
        onMudou={() => { setRegistro(undefined); h.recarregar(); }} />
    </div> : <HistoricoSeguranca nome="rondas" carregando={h.carregando} erro={h.erro} onAtualizar={h.recarregar}
      filtro={h.filtro} onFiltro={h.setFiltro} recorte={h.recorte} onRecorte={h.setRecorte}
      onExportar={tipo => exportar(tipo)} exportando={ocupado}
      podeVerExcluidos={user.roles.includes('admin')} incluirExcluidos={h.incluirExcluidos} onIncluirExcluidos={h.setIncluirExcluidos}
      pagina={h.pagina} onPagina={h.setPagina} temMais={h.temMais} vazio={!h.lista.length} pendentes={h.pendentes}>
      {h.lista.map(r => <ItemHistorico key={r.id} codigo={r.codigo} titulo={r.frentes} disabled={ocupado} excluidoEm={r.excluido_em}
        linhas={[`${dataBR(r.data)} · ${r.hora.slice(0, 5)} · ${r.gerente}`]}
        destaque={<><span className="block text-base tabular-nums">{totalRonda(r)}</span><span className="font-normal text-slate-500">irreg.</span></>}
        onAbrir={() => abrir(r.id)} />)}
    </HistoricoSeguranca>)}

    {pdf && <PdfPreviewModal gerar={pdf.gerar} tituloPadrao="Ronda de Segurança do Trabalho" onClose={() => setPdf(null)} />}
  </div>;
}
