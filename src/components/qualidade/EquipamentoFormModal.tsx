import React, { useState } from 'react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { CAMPOS_GESTAO, CATEGORIAS_EQUIPAMENTOS, TIPOS_LANCAMENTO, saldoComprar, validarDadosEquipamento } from '../../lib/qualidadeEquipamentos';
import type { CampoEquipamento, CategoriaEquipamento, DadosEquipamento, EquipamentoQualidade } from '../../lib/qualidadeEquipamentos';
import { enviarAnexoEquipamento, removerAnexoOrfaoEquipamento, salvarEquipamentoQualidade } from '../../lib/qualidadeEquipamentosApi';
import { dataHojeLocal } from '../../lib/dataLocal';

export const inputEquipamento = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
export const botaoEquipamento = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
export const primarioEquipamento = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-wait disabled:opacity-50';

function Campo({ campo, dados, onChange, categoria }: { campo: CampoEquipamento; dados: DadosEquipamento; onChange: (key: string, value: string) => void; categoria: CategoriaEquipamento }) {
  let opcoes: string[] | undefined;
  if (campo.key === 'situacao') opcoes = CATEGORIAS_EQUIPAMENTOS[categoria].situacoes;
  if (campo.key === 'prioridade') opcoes = ['Baixa', 'Média', 'Alta', 'Crítica'];
  if (campo.key === 'controle_metrologico') opcoes = ['A avaliar', 'Requer controle', 'Não aplicável'];
  if (campo.key === 'resultado_metrologico') opcoes = ['Não avaliado', 'Aprovado', 'Reprovado', 'Aprovado com restrição'];
  const value = dados[campo.key] || '';
  if (opcoes && value && !opcoes.includes(value)) opcoes = [value, ...opcoes];
  const longo = ['observacoes', 'descricao', 'justificativa', 'defeito', 'acao', 'plano_acao'].includes(campo.key);
  return <label className={`block space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300 ${longo ? 'sm:col-span-2' : ''}`}>
    <span>{campo.label}{campo.key === 'equipamento' ? ' *' : ''}</span>
    {opcoes ? <select className={inputEquipamento} value={value} onChange={e => onChange(campo.key, e.target.value)}><option value="">Não informado</option>{opcoes.map(o => <option key={o}>{o}</option>)}</select>
      : longo ? <textarea className={inputEquipamento} rows={2} value={value} onChange={e => onChange(campo.key, e.target.value)} />
        : <input className={inputEquipamento} type={campo.tipo === 'data' ? 'date' : 'text'} required={campo.key === 'equipamento'} value={value} onChange={e => onChange(campo.key, e.target.value)} />}
  </label>;
}

export default function EquipamentoFormModal({ registro, categoriaInicial, modo = 'editar', onClose, onSalvo }: {
  registro: EquipamentoQualidade | null; categoriaInicial: CategoriaEquipamento; modo?: 'editar' | 'lancamento' | 'arquivar'; onClose: () => void; onSalvo: () => void;
}) {
  const toast = useToast();
  const [categoria, setCategoria] = useState(registro?.categoria || categoriaInicial);
  const [dados, setDados] = useState<DadosEquipamento>(registro?.dados || { controle_metrologico: 'A avaliar' });
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState<string>(TIPOS_LANCAMENTO[0]);
  const [dataEvento, setDataEvento] = useState(dataHojeLocal());
  const [anexo, setAnexo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const arquivar = modo === 'arquivar';
  const titulo = arquivar ? `${registro?.arquivado ? 'Restaurar' : 'Arquivar'} registro` : modo === 'lancamento' ? 'Lançar acompanhamento' : registro ? 'Editar equipamento' : 'Novo registro';
  const alterar = (key: string, value: string) => setDados(d => ({ ...d, [key]: value }));
  const saldo = saldoComprar(dados);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const validacao = validarDadosEquipamento(categoria, dados);
    if (validacao.length) { setErros(validacao); return; }
    setSalvando(true); setErros([]);
    let enviado: Awaited<ReturnType<typeof enviarAnexoEquipamento>> | undefined;
    try {
      if (anexo) enviado = await enviarAnexoEquipamento(anexo);
      await salvarEquipamentoQualidade(categoria, dados, registro, {
        tipo: arquivar ? (registro?.arquivado ? 'Restauração' : 'Arquivamento') : modo === 'lancamento' ? tipo : registro ? 'Edição' : 'Cadastro',
        descricao: descricao.trim(), data_evento: dataEvento, ...enviado,
      }, arquivar ? !registro?.arquivado : registro?.arquivado);
      toast.success('Registro salvo com histórico.'); onSalvo();
    } catch (e) {
      if (enviado) { try { await removerAnexoOrfaoEquipamento(enviado.anexo_path); } catch { /* O bucket impede remover anexos de eventos já confirmados. */ } }
      setErros([e instanceof Error ? e.message : 'Não foi possível salvar.']);
    } finally { setSalvando(false); }
  }
  return <Modal onClose={onClose} disableOutsideClose maxWidth="max-w-4xl" ariaLabel={titulo}>
    <ModalHeader onClose={salvando ? undefined : onClose}>{titulo}{registro && <span className="ml-2 font-mono text-xs text-slate-500">{registro.codigo}</span>}</ModalHeader>
    <form onSubmit={salvar} className="flex min-h-0 flex-1 flex-col">
      <ModalBody>
        <fieldset disabled={salvando} className="space-y-5">
          {erros.length > 0 && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">{erros.map(e => <p key={e}>{e}</p>)}</div>}
          {arquivar ? <p className="text-sm text-slate-600 dark:text-slate-300">{registro?.arquivado ? 'O registro voltará à lista ativa.' : 'O registro sairá da lista ativa e continuará disponível no filtro Arquivados, com todo o histórico.'}</p> : <>
            {!registro && <label className="block space-y-1 text-xs font-semibold">Controle<select className={inputEquipamento} value={categoria} onChange={e => { setCategoria(e.target.value as CategoriaEquipamento); setDados({ controle_metrologico: 'A avaliar' }); }}>{Object.entries(CATEGORIAS_EQUIPAMENTOS).map(([key, c]) => <option key={key} value={key}>{c.label}</option>)}</select></label>}
            {modo === 'lancamento' && <label className="block space-y-1 text-xs font-semibold">Tipo de lançamento<select className={inputEquipamento} value={tipo} onChange={e => setTipo(e.target.value)}>{TIPOS_LANCAMENTO.map(t => <option key={t}>{t}</option>)}</select></label>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{CATEGORIAS_EQUIPAMENTOS[categoria].campos.map(c => <Campo key={c.key} campo={c} dados={dados} onChange={alterar} categoria={categoria} />)}</div>
            {categoria === 'estoque' && <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800"><span>Déficit calculado: <strong>{saldo ?? 'saldo numérico não informado'}</strong></span>{saldo !== null && <button type="button" className={botaoEquipamento} onClick={() => alterar('qtd_comprar', String(saldo))}>Aplicar em qtd. a comprar</button>}<p className="w-full text-xs text-slate-500">O cálculo não desconta segregados nem compras de outras abas automaticamente.</p></div>}
            <div className="border-t border-slate-200 pt-4 dark:border-slate-700"><h3 className="mb-3 text-sm font-bold">Prazos, ações e controle metrológico</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{CAMPOS_GESTAO.map(c => <Campo key={c.key} campo={c} dados={dados} onChange={alterar} categoria={categoria} />)}</div><p className="mt-3 text-xs text-slate-500">A calibração / verificação exige avaliação técnica e certificado aplicável. Informe o resultado e o próximo prazo após a avaliação.</p></div>
          </>}
          <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 dark:border-slate-700">
            <label className="block space-y-1 text-xs font-semibold">Data do registro / ocorrência *<input className={inputEquipamento} type="date" required value={dataEvento} onChange={e => setDataEvento(e.target.value)} /></label>
            <label className="block space-y-1 text-xs font-semibold">Evidência (imagem ou PDF, até 10 MB)<input className={inputEquipamento} type="file" accept="image/*,application/pdf" onChange={e => setAnexo(e.target.files?.[0] || null)} /></label>
            <label className="block space-y-1 text-xs font-semibold sm:col-span-2">{modo === 'lancamento' ? 'Descrição do lançamento' : 'Motivo / observação do registro'} *<textarea className={inputEquipamento} required rows={3} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descreva a ação, alteração ou avaliação realizada." /></label>
          </div>
        </fieldset>
      </ModalBody>
      <ModalFooter><button type="button" className={botaoEquipamento} disabled={salvando} onClick={onClose}>Cancelar</button><button type="submit" className={primarioEquipamento} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar registro'}</button></ModalFooter>
    </form>
  </Modal>;
}
