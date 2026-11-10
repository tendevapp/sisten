import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { CATEGORIAS_EQUIPAMENTOS, mapearPlanilhaEquipamentos } from '../../lib/qualidadeEquipamentos';
import type { EquipamentoQualidade, PreviaEquipamentos } from '../../lib/qualidadeEquipamentos';
import { importarEquipamentosQualidade } from '../../lib/qualidadeEquipamentosApi';
import { botaoEquipamento, inputEquipamento, primarioEquipamento } from './EquipamentoFormModal';

export default function EquipamentosImportModal({ registros, onClose, onImportado }: { registros: EquipamentoQualidade[]; onClose: () => void; onImportado: () => void }) {
  const toast = useToast();
  const [arquivo, setArquivo] = useState('');
  const [previa, setPrevia] = useState<PreviaEquipamentos | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const existentes = useMemo(() => new Map(registros.flatMap(r => [[`sisten:${r.id}`, r] as const, ...(r.origem_chave ? [[r.origem_chave, r] as const] : [])])), [registros]);
  const repetidos = previa?.linhas.filter(l => existentes.has(l.origem_chave)) || [];
  const novos = (previa?.linhas.length || 0) - repetidos.length;
  async function ler(file?: File) {
    setPrevia(null); setErro(''); setArquivo('');
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) { setErro('Selecione uma planilha .xlsx ou .xls.'); return; }
    if (file.size > 10 * 1024 * 1024) { setErro('A planilha deve ter até 10 MB.'); return; }
    setOcupado(true);
    try {
      const mapeamento = mapearPlanilhaEquipamentos(XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false }));
      if (mapeamento.linhas.length > 5000) throw new Error('O limite é de 5.000 registros por arquivo.');
      setPrevia(mapeamento); setArquivo(file.name);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao ler o arquivo.'); }
    finally { setOcupado(false); }
  }
  async function importar() {
    if (!previa) return;
    setOcupado(true); setErro('');
    try {
      const resultado = await importarEquipamentosQualidade(previa.linhas, arquivo);
      toast.success(`${resultado.novos} registros importados; ${resultado.ignorados} já cadastrados preservados.`);
      onImportado();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível importar.'); }
    finally { setOcupado(false); }
  }
  return <Modal onClose={onClose} disableOutsideClose maxWidth="max-w-5xl" ariaLabel="Importar equipamentos">
    <ModalHeader onClose={ocupado ? undefined : onClose}>Importar planilha de equipamentos</ModalHeader>
    <ModalBody>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">Selecione a Lista de Equipamentos ou uma exportação desta página. As quatro abas e todas as colunas serão mapeadas antes da gravação.</p>
        <label className="block space-y-1 text-xs font-semibold">Planilha Excel<input type="file" disabled={ocupado} className={inputEquipamento} accept=".xlsx,.xls" onChange={e => void ler(e.target.files?.[0])} /></label>
        {erro && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">{erro}</p>}
        {previa && <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{previa.abas.map(a => <div key={a.nome} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><p className="text-xs text-slate-500">{a.nome}</p><p className="text-2xl font-bold">{a.quantidade}</p></div>)}</div>
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"><strong>{novos} novos • {repetidos.length} já cadastrados</strong><p className="mt-1">A chave é o Nº dentro de cada aba, ou o ID SISTEN em arquivos exportados. Registros já cadastrados serão preservados, inclusive se o conteúdo do arquivo mudou. Edite esses registros pela página. As abas não são somadas entre si.</p>{previa.avisos.map(a => <p key={a} className="mt-2">{a}</p>)}</div>
          {repetidos.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-semibold">Ver registros que serão preservados ({repetidos.length})</summary><ul className="mt-2 max-h-40 overflow-auto space-y-1">{repetidos.map(l => <li key={l.origem_chave}>{CATEGORIAS_EQUIPAMENTOS[l.categoria].label} • Nº {l.dados.numero} • arquivo: {l.dados.equipamento} • cadastrado: {existentes.get(l.origem_chave)?.dados.equipamento}</li>)}</ul></details>}
          <p className="text-xs text-slate-500">Prévia das primeiras 20 linhas. Todo o arquivo ({previa.linhas.length} registros) foi validado. O conteúdo original de cada linha ficará no histórico de origem.</p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr>{['Controle', 'Nº', 'Equipamento', 'Especificação', 'Situação', 'Importação'].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{previa.linhas.slice(0, 20).map(l => <tr key={l.origem_chave} className="border-t border-slate-100 dark:border-slate-800"><td className="p-3">{CATEGORIAS_EQUIPAMENTOS[l.categoria].label}</td><td className="p-3">{l.dados.numero}</td><td className="p-3">{l.dados.equipamento}</td><td className="p-3">{l.dados.descricao}</td><td className="p-3">{l.dados.situacao}</td><td className="p-3">{existentes.has(l.origem_chave) ? 'Preservar existente' : 'Novo'}</td></tr>)}</tbody></table></div>
        </>}
      </div>
    </ModalBody>
    <ModalFooter><button className={botaoEquipamento} disabled={ocupado} onClick={onClose}>Cancelar</button><button className={primarioEquipamento} disabled={ocupado || !previa || !novos} onClick={() => void importar()}>{ocupado ? 'Processando…' : `Importar ${novos} novos registros`}</button></ModalFooter>
  </Modal>;
}
