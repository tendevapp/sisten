import React, { useEffect, useState } from 'react';
import { Archive, FileText, Pencil, Plus, RotateCcw } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { avisosEquipamento, CAMPOS_GESTAO, CATEGORIAS_EQUIPAMENTOS } from '../../lib/qualidadeEquipamentos';
import type { EquipamentoQualidade, EventoEquipamento } from '../../lib/qualidadeEquipamentos';
import { abrirAnexoEquipamento, listarEventosEquipamento } from '../../lib/qualidadeEquipamentosApi';
import { botaoEquipamento, primarioEquipamento } from './EquipamentoFormModal';

export default function EquipamentoDetalhesModal({ registro, onClose, onEditar }: { registro: EquipamentoQualidade; onClose: () => void; onEditar: (modo: 'editar' | 'lancamento' | 'arquivar') => void }) {
  const toast = useToast();
  const [eventos, setEventos] = useState<EventoEquipamento[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    setCarregando(true); setErro('');
    listarEventosEquipamento(registro.id).then(e => { if (ativo) setEventos(e); }).catch(e => { if (ativo) setErro(e.message); }).finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [registro.id, tentativa]);
  const avisos = avisosEquipamento(registro);
  const campos = [...CATEGORIAS_EQUIPAMENTOS[registro.categoria].campos, ...CAMPOS_GESTAO];
  async function abrir(path: string) {
    const janela = window.open('', '_blank');
    if (janela) janela.opener = null;
    try { const url = await abrirAnexoEquipamento(path); if (janela) janela.location.href = url; else toast.warning('Permita abrir novas abas para visualizar a evidência.'); }
    catch (e) { janela?.close(); toast.error(e instanceof Error ? e.message : 'Falha ao abrir evidência.'); }
  }
  return <Modal onClose={onClose} maxWidth="max-w-5xl" ariaLabel={`Detalhes de ${registro.dados.equipamento}`}>
    <ModalHeader onClose={onClose}><span className="block text-xs font-normal text-slate-500">{registro.codigo} • {CATEGORIAS_EQUIPAMENTOS[registro.categoria].label}{registro.arquivado ? ' • Arquivado' : ''}</span>{registro.dados.equipamento}</ModalHeader>
    <ModalBody>
      <div className="space-y-6">
        {avisos.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{avisos.map(a => <p key={a.texto} className="py-0.5">{a.nivel === 'critico' ? '● ' : '• '}{a.texto}</p>)}</div>}
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{campos.map(c => <div key={c.key}><dt className="text-xs font-semibold text-slate-500">{c.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{registro.dados[c.key] || 'Não informado'}</dd></div>)}</dl>
        {registro.origem_arquivo && <details className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800"><summary className="cursor-pointer font-semibold">Origem: {registro.origem_arquivo} • linha {registro.origem_linha}</summary><p className="mt-2">Chave de importação: {registro.origem_chave}. A primeira importação preserva a linha original abaixo.</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{JSON.stringify(registro.origem_dados, null, 2)}</pre></details>}
        <section className="border-t border-slate-200 pt-4 dark:border-slate-700"><h3 className="text-base font-bold">Histórico e evidências</h3><p className="mt-1 text-xs text-slate-500">O histórico é permanente. Para corrigir um lançamento, registre uma correção / estorno e explique a referência.</p>
          {carregando && <p className="py-4 text-sm" role="status">Carregando histórico…</p>}
          {erro && <div role="alert" className="mt-3 text-sm text-rose-700">{erro}<button className={`${botaoEquipamento} ml-2`} onClick={() => setTentativa(t => t + 1)}>Tentar novamente</button></div>}
          {!carregando && !erro && eventos.length === 0 && <p className="py-4 text-sm text-slate-500">Nenhum lançamento registrado.</p>}
          <ol className="mt-4 space-y-3">{eventos.map(e => {
            const alterados = campos.filter(c => e.antes && (e.antes.dados[c.key] || '') !== (e.depois?.dados[c.key] || ''));
            return <li key={e.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{e.tipo} • {e.data_evento.split('-').reverse().join('/')}</strong><span className="text-xs text-slate-500">{e.autor_nome} • {new Date(e.criado_em).toLocaleString('pt-BR')}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{e.descricao}</p>
              {alterados.length > 0 && <dl className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">{alterados.map(c => <div key={c.key}><dt className="inline font-semibold">{c.label}: </dt><dd className="inline whitespace-pre-wrap">{e.antes?.dados[c.key] || '(vazio)'} → {e.depois?.dados[c.key] || '(vazio)'}</dd></div>)}</dl>}
              {e.anexo_path && <button className={`${botaoEquipamento} mt-3`} onClick={() => void abrir(e.anexo_path!)}><FileText size={16} />{e.anexo_nome || 'Abrir evidência'}</button>}
            </li>;
          })}</ol>
        </section>
      </div>
    </ModalBody>
    <ModalFooter><button className={botaoEquipamento} onClick={() => onEditar('arquivar')}>{registro.arquivado ? <RotateCcw size={16} /> : <Archive size={16} />}{registro.arquivado ? 'Restaurar' : 'Arquivar'}</button>{!registro.arquivado && <><button className={botaoEquipamento} onClick={() => onEditar('editar')}><Pencil size={16} />Editar</button><button className={primarioEquipamento} onClick={() => onEditar('lancamento')}><Plus size={16} />Lançamento</button></>}</ModalFooter>
  </Modal>;
}
