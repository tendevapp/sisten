import React, { useEffect, useState } from 'react';
import { Download, Loader2, Upload } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { importarBaseInventario, ultimoResumoImportacaoInventario } from '../../lib/inventarioCiclicoApi';
import { baixarResumoImportacao, lerBaseLancamento, type LinhaImportacaoInventario, type ResumoImportacaoInventario } from '../../lib/inventarioCiclicoImportacao';
import { formatDateBR } from '../../lib/format';

export default function ImportarInventarioModal({ onClose, onImportado }: { onClose: () => void; onImportado: () => Promise<void> }) {
  const [linhas, setLinhas] = useState<LinhaImportacaoInventario[]>([]);
  const [arquivo, setArquivo] = useState('');
  const [resumo, setResumo] = useState<ResumoImportacaoInventario | null>(null);
  const [ultimo, setUltimo] = useState<ResumoImportacaoInventario | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [gravado, setGravado] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => { let ativo = true; ultimoResumoImportacaoInventario().then(r => { if (ativo) setUltimo(r); }).catch(e => { if (ativo) setErro(e.message); }); return () => { ativo = false; }; }, []);

  async function selecionar(file?: File) {
    if (!file) return;
    setOcupado(true); setErro(''); setResumo(null); setLinhas([]); setGravado(false); setArquivo(file.name);
    try {
      const dados = lerBaseLancamento(await file.arrayBuffer());
      const r = await importarBaseInventario(dados, file.name);
      setLinhas(dados); setResumo(r);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível analisar a planilha.'); }
    finally { setOcupado(false); }
  }
  async function importar() {
    setOcupado(true); setErro('');
    try {
      // A comparação é refeita na mesma transação da inserção para evitar duplicatas concorrentes.
      const r = await importarBaseInventario(linhas, arquivo, true);
      setResumo(r); setGravado(true); setUltimo(r);
      await onImportado();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível importar.'); }
    finally { setOcupado(false); }
  }
  const exibido = resumo ?? (!arquivo ? ultimo : null);
  const valor = (v: unknown, campo: string) => {
    if (v == null || v === '') return 'Vazio';
    if (campo === 'Valor Divergente' && Number.isFinite(Number(v))) return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return String(v);
  };
  return <Modal onClose={ocupado ? () => {} : onClose} disableOutsideClose={ocupado} maxWidth="max-w-4xl" ariaLabel="Importar inventário">
    <ModalHeader onClose={ocupado ? () => {} : onClose}>Importar inventário</ModalHeader>
    <ModalBody>
      <div className="space-y-4 text-sm" style={{ color: 'var(--ink-primary)' }}>
        <p>Selecione a planilha de controle. Apenas a aba <strong>Base Lançamento</strong> será lida, com cabeçalho na linha 3. A importação acrescenta registros novos e preserva os já gravados.</p>
        <label className="block rounded-xl border p-4" style={{ borderColor: 'var(--hairline)' }}>
          <span className="mb-2 flex items-center gap-2 font-bold"><Upload className="h-4 w-4" /> Planilha atualizada (.xlsm ou .xlsx)</span>
          <input type="file" accept=".xlsm,.xlsx" disabled={ocupado} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void selecionar(file); }} className="block w-full text-xs" />
        </label>
        {ocupado && <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Processando planilha…</p>}
        {erro && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{erro}</p>}
        {exibido && <>
          <h3 className="font-bold">{resumo ? gravado ? `Importação concluída: ${exibido.inseridos} registro(s) inserido(s)` : `Análise: ${arquivo}` : 'Resumo da última importação'}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[[exibido.novos, 'Novos'], [exibido.iguais, 'Iguais'], [exibido.alterados, 'Com alterações'], [exibido.ausentes, 'Ausentes da planilha']].map(([n, label]) => <div key={label} className="rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}><strong className="block text-xl">{n}</strong><span className="text-xs">{label}</span></div>)}
          </div>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Comparação por data, material, depósito e ocorrência na ordem da fonte. Linhas repetidas são preservadas. Alterações e ausências são informadas para revisão; o botão mantém o histórico existente.</p>
          {linhas.length > 0 && <p className="text-xs">{linhas.filter(l => l.dados['Qtde Física'] == null).length} linha(s) sem quantidade física; {linhas.filter(l => l.deposito === '0000').length} sem depósito (identificadas como 0000). Nº Contagem e validades parciais são preservados na origem.</p>}
          {!!exibido.diferencas.length && <>
            <button className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold" onClick={() => baixarResumoImportacao(exibido)}><Download className="h-4 w-4" /> Baixar resumo completo ({exibido.diferencas.length})</button>
            <div className="max-h-72 overflow-auto rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
              <table className="w-full text-left text-xs"><thead><tr><th className="p-2">Data / material / depósito</th><th className="p-2">Diferenças</th></tr></thead><tbody>
                {exibido.diferencas.slice(0, 100).map(d => <tr key={d.chave} className="border-t" style={{ borderColor: 'var(--hairline)' }}><td className="p-2 align-top">{formatDateBR(d.data)}<br />{d.material} · {d.deposito}{d.linha && <><br />Linha {d.linha}</>}</td><td className="p-2">{d.tipo === 'ausente' ? 'Registro anterior ausente desta planilha.' : d.campos.map(c => <div key={c.campo}><strong>{c.campo}:</strong> {valor(c.anterior, c.campo)} → {valor(c.planilha, c.campo)}</div>)}</td></tr>)}
              </tbody></table>
            </div>
            {exibido.diferencas.length > 100 && <p className="text-xs">Exibindo as primeiras 100 diferenças. O download contém todas.</p>}
          </>}
        </>}
      </div>
    </ModalBody>
    <ModalFooter>
      <button disabled={ocupado} onClick={onClose} className="rounded-lg border px-4 py-2 text-xs font-bold disabled:opacity-50">Fechar</button>
      <button disabled={ocupado || !resumo || gravado || resumo.novos === 0} onClick={() => void importar()} className="rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>Inserir {resumo?.novos ?? 0} novos registros</button>
    </ModalFooter>
  </Modal>;
}
