import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useToast } from '../../ui/Toast';
import {
  compararCadastroTramos,
  listarCatalogoTramos,
  prepararImportacaoCatalogoTramos,
  reconciliarCatalogoTramos,
} from '../../../lib/producaoTramosCatalogo';
import {
  lerPlanilhaTramos,
  montarLoteCatalogoTramos,
  resumoImportacao,
  validarPlanilhaTramos,
  type ResultadoLeituraPlanilhaTramos,
} from '../../../lib/producaoTramosImportacao';
import { importarHistoricoTramos } from '../../../lib/producaoTramosApi';

async function calcularSha256(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export default function ImportarPlanilhaTramos({ onImportado }: { onImportado?: () => void } = {}) {
  const toast = useToast();
  const [resultado, setResultado] = useState<ResultadoLeituraPlanilhaTramos | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [sha256, setSha256] = useState('');
  const [divergenciasCatalogo, setDivergenciasCatalogo] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    listarCatalogoTramos().catch(erro => toast.error(erro instanceof Error ? erro.message : 'Não foi possível ler o catálogo de tramos.'));
  }, []);

  const selecionarArquivo = async (selecionado?: File) => {
    if (!selecionado) return;
    if (!/\.xlsx$/i.test(selecionado.name)) {
      toast.error('Selecione uma planilha .xlsx.');
      return;
    }
    setCarregando(true);
    try {
      const [bytes, catalogo] = await Promise.all([selecionado.arrayBuffer(), listarCatalogoTramos()]);
      const leitura = lerPlanilhaTramos(bytes);
      const bloqueios = validarPlanilhaTramos(leitura).filter(item => item.bloqueante);
      if (bloqueios.length) throw new Error(`A planilha possui ${bloqueios.length} bloqueio(s) e não pode ser importada.`);
      setArquivo(selecionado);
      setSha256(await calcularSha256(selecionado));
      setResultado(leitura);
      setDivergenciasCatalogo(compararCadastroTramos(
        leitura.cadastro.map(item => ({ ...item, sequencial: item.sequencial === 3102 ? 3202 : item.sequencial })),
        catalogo,
      ).length);
    } catch (erro) {
      setResultado(null);
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível validar a planilha.');
    } finally {
      setCarregando(false);
    }
  };

  const importarCadastro = async () => {
    if (!resultado || !arquivo || !sha256) return;
    setImportando(true);
    try {
      const lote = montarLoteCatalogoTramos(resultado, sha256, arquivo.name);
      const loteId = await prepararImportacaoCatalogoTramos(lote);
      await reconciliarCatalogoTramos(loteId);
      const importacao = await importarHistoricoTramos(loteId, resultado.snapshots);
      toast.success(
        importacao.jaImportado
          ? 'Esta planilha já foi importada; nada foi duplicado.'
          : `Cadastro reconciliado e ${importacao.eventosInseridos} apontamentos históricos importados.`,
      );
      setDivergenciasCatalogo(0);
      onImportado?.();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível importar o cadastro de tramos.');
    } finally {
      setImportando(false);
    }
  };

  const resumo = resultado ? resumoImportacao(resultado) : null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900 dark:text-slate-50"><FileSpreadsheet className="h-5 w-5 text-sky-600" /> Importar planilha TRAMOS</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Valida as colunas apontadas, registra o SHA-256 e reconcilia a matriz de torres. A série confirmada para Torre 8/T5 é 3202.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900">
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Selecionar planilha
          <input className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => selecionarArquivo(event.target.files?.[0])} />
        </label>
      </div>

      {resumo && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-6">
            {[['Cadastro', resumo.cadastro], ['Apontamentos', resumo.snapshots], ['Início', resumo.inicio], ['NAV02', resumo.liberadoNav02], ['Jato', resumo.liberadoJato], ['Expedido', resumo.expedido]].map(([rotulo, valor]) => (
              <div key={String(rotulo)} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800"><span className="block text-xs text-slate-500">{rotulo}</span><strong>{valor}</strong></div>
            ))}
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {divergenciasCatalogo} divergência(s) de cadastro serão reconciliadas. Os marcos históricos serão carregados no mesmo razão por tramo usado nos próximos lançamentos.
          </div>
          <button type="button" onClick={importarCadastro} disabled={importando} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Importar e reconciliar cadastro
          </button>
        </div>
      )}
    </section>
  );
}
