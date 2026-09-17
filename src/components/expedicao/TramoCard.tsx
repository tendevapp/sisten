import React, { useState, useEffect } from 'react';
import {
  ChevronDown, Clock, Hash, FileText, Trash2, MessageSquare,
  Paperclip, Camera, Send, Loader2, AlertCircle, AlertTriangle, Eye, Download, X, Plus,
} from 'lucide-react';
import type {
  EtapaExpedicao, ExpedicaoFoto, ExpedicaoTramo, Tramo, Profile,
  TipoObservacaoTramo, ExpedicaoTramoObservacao,
} from '../../types';
import { TRAMOS } from '../../types';
import { calcularLeadTimesTramo, normalizarDataISO } from '../../lib/expedicaoEmail';
import * as api from '../../lib/expedicaoApi';
import Modal, { ModalBody, ModalHeader, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import EtapaHorario from './EtapaHorario';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const ETAPAS: {
  etapa: EtapaExpedicao;
  rotulo: string;
  campoData: keyof ExpedicaoTramo;
  campo: keyof ExpedicaoTramo;
  campoObs: keyof ExpedicaoTramo;
}[] = [
  { etapa: 'chegada_portaria', rotulo: 'Chegada na portaria', campoData: 'data_chegada_portaria', campo: 'hora_chegada_portaria', campoObs: 'obs_chegada_portaria' },
  { etapa: 'entrada_patio', rotulo: 'Entrada no pátio', campoData: 'data_entrada_patio', campo: 'hora_entrada_patio', campoObs: 'obs_entrada_patio' },
  { etapa: 'expedicao', rotulo: 'Expedição', campoData: 'data_expedicao', campo: 'hora_expedicao', campoObs: 'obs_expedicao' },
];

/**
 * Base sem largura de propósito. Quando a largura vinha aqui como `w-full`, o
 * `w-24` do seletor de UF colidia com ela — duas utilidades de largura têm a
 * mesma especificidade, então quem vencia era a ordem no CSS gerado, não a
 * ordem na string de classes. O resultado era o campo de placa espremido e a
 * UF ocupando a linha toda. Agora cada uso declara a sua largura.
 */
const campoBase =
  'h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50';

const campoClasse = `${campoBase} w-full`;
/** Placa: fica com toda a sobra da linha. `min-w-0` impede o flex de espremê-la. */
const campoPlaca = `${campoBase} min-w-0 flex-1 font-semibold uppercase tracking-wide`;
/** UF: dois caracteres + seta do select. Estreito e fixo — sem `px` próprio, que colidiria com o da base. */
const campoUf = `${campoBase} w-20 shrink-0`;

const rotuloClasse = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

const PLACAS: { campoPlaca: 'cavalo_placa' | 'carreta_placa' | 'dolly_placa'; campoUf: 'cavalo_uf' | 'carreta_uf' | 'dolly_uf'; rotulo: string }[] = [
  { campoPlaca: 'cavalo_placa', campoUf: 'cavalo_uf', rotulo: 'Cavalo' },
  { campoPlaca: 'carreta_placa', campoUf: 'carreta_uf', rotulo: 'Carreta' },
  { campoPlaca: 'dolly_placa', campoUf: 'dolly_uf', rotulo: 'Dolly' },
];

interface TramoCardProps {
  tramo: ExpedicaoTramo;
  fotos: ExpedicaoFoto[];
  aberto: boolean;
  somenteLeitura?: boolean;
  user?: Profile;
  onAlternar: () => void;
  onChange: (patch: Partial<ExpedicaoTramo>) => void;
  /** Ausente quando o tramo é o único do carregamento — remover deixaria o carregamento vazio. */
  onExcluir?: () => void;
  onAnexarFoto: (etapa: EtapaExpedicao, arquivos: FileList) => Promise<void>;
  onExcluirFoto: (foto: ExpedicaoFoto) => Promise<void>;
  /** Aviso parcial de chegada — só a etapa da portaria o oferece. */
  onEnviarChegada: () => Promise<void>;
}

export default function TramoCard({
  tramo, fotos, aberto, somenteLeitura, user, onAlternar, onChange, onExcluir, onAnexarFoto, onExcluirFoto,
  onEnviarChegada,
}: TramoCardProps) {
  const horas = ETAPAS.map(e => tramo[e.campo] as string | null);
  const concluidas = horas.filter(Boolean).length;
  const leadTimes = calcularLeadTimesTramo(tramo);

  const toast = useToast();
  const [novoTexto, setNovoTexto] = useState('');
  const [novoTipo, setNovoTipo] = useState<TipoObservacaoTramo>('observacao');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [mostrarFormObs, setMostrarFormObs] = useState(false);
  const [observacoesComUrls, setObservacoesComUrls] = useState<ExpedicaoTramoObservacao[]>(tramo.historico_observacoes || []);
  const [previewUrl, setPreviewUrl] = useState<{ url: string; nome: string } | null>(null);

  useEffect(() => {
    setObservacoesComUrls(tramo.historico_observacoes || []);
    if (tramo.historico_observacoes && tramo.historico_observacoes.length > 0) {
      api.carregarUrlsEvidencias(tramo.historico_observacoes)
        .then(comUrls => setObservacoesComUrls(comUrls))
        .catch(err => console.error('Erro ao carregar urls de evidências no tramo:', err));
    }
  }, [tramo.historico_observacoes]);

  const handleArquivoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const novos = Array.from(e.target.files);
      setArquivos(prev => [...prev, ...novos]);
      e.target.value = '';
    }
  };

  const handleSalvarObs = async () => {
    if (!novoTexto.trim()) return;
    setSalvando(true);
    try {
      const atualizado = await api.adicionarObservacaoTramo({
        carregamentoId: tramo.carregamento_id,
        tramoId: tramo.id,
        texto: novoTexto.trim(),
        tipo: novoTipo,
        usuarioId: user?.id || 'operador',
        usuarioNome: user?.name || user?.email || 'Operador',
        arquivos,
        historicoExistente: tramo.historico_observacoes,
      });
      setObservacoesComUrls(atualizado);
      onChange({
        historico_observacoes: atualizado,
        observacoes: novoTexto.trim(),
      });
      setNovoTexto('');
      setArquivos([]);
      setMostrarFormObs(false);
      toast.success('Observação e evidências salvas na carreta!');
    } catch (err: any) {
      toast.error(`Erro ao salvar observação: ${err?.message || 'Falha de rede'}`);
    } finally {
      setSalvando(false);
    }
  };

  const rotuloIdentificacao = tramo.numero_tramo ? `${tramo.tramo} - ${tramo.numero_tramo}` : tramo.tramo;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Cabeçalho: identifica e resume o tramo mesmo recolhido */}
      <div className="flex items-center gap-2 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={aberto}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex min-w-10 max-w-[170px] sm:max-w-none px-2.5 h-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs sm:text-sm font-extrabold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 text-center">
            <span className="truncate">{rotuloIdentificacao}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 truncate text-sm font-bold text-slate-900 dark:text-slate-50">
              <span className="truncate">{tramo.motorista?.trim() || 'Motorista não informado'}</span>
              {tramo.cnh && (
                <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  CNH: {tramo.cnh}
                </span>
              )}
              {tramo.numero_nf && (
                <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  NF: {tramo.numero_nf}
                </span>
              )}
              {tramo.historico_observacoes && tramo.historico_observacoes.length > 0 && (
                <span
                  title={`${tramo.historico_observacoes.length} observação(ões) / ocorrência(s)`}
                  className="shrink-0 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/70 dark:text-blue-200 flex items-center gap-1"
                >
                  <MessageSquare className="h-2.5 w-2.5" />
                  {tramo.historico_observacoes.length}
                </span>
              )}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5">
              {horas.map((h, i) => (
                <span
                  key={i}
                  title={ETAPAS[i].rotulo}
                  className={`h-1.5 w-5 rounded-full ${h ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                />
              ))}
              <span className="ml-1 text-[11px] font-medium text-slate-400">{concluidas}/3 horários</span>
            </span>
          </span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
          />
        </button>

        {!somenteLeitura && onExcluir && (
          <button
            type="button"
            onClick={onExcluir}
            aria-label={`Remover tramo ${tramo.tramo}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {aberto && (
        <div className="border-t border-slate-100 px-3 pb-5 pt-4 sm:px-4 dark:border-slate-800">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-tour="expedicao-edicao-tramo">
            {/* Tipo do Tramo */}
            <div className="sm:col-span-1">
              <label htmlFor={`tramo-${tramo.id}`} className={rotuloClasse}>Tramo</label>
              <select
                id={`tramo-${tramo.id}`}
                value={tramo.tramo}
                disabled={somenteLeitura}
                onChange={e => onChange({ tramo: e.target.value as Tramo })}
                className={`${campoClasse} mt-1.5 font-semibold`}
              >
                {TRAMOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Data Geral */}
            <div className="sm:col-span-1">
              <label htmlFor={`data-${tramo.id}`} className={rotuloClasse}>Data</label>
              <input
                id={`data-${tramo.id}`}
                type="date"
                min="2020-01-01"
                max="2099-12-31"
                value={normalizarDataISO(tramo.data) || ''}
                disabled={somenteLeitura}
                onChange={e => onChange({ data: normalizarDataISO(e.target.value) || null })}
                onBlur={e => {
                  const c = normalizarDataISO(e.target.value);
                  if (c && c !== tramo.data) onChange({ data: c });
                }}
                className={`${campoClasse} mt-1.5`}
              />
            </div>

            {/* Motorista */}
            <div className="sm:col-span-1">
              <label htmlFor={`motorista-${tramo.id}`} className={rotuloClasse}>Motorista</label>
              <input
                id={`motorista-${tramo.id}`}
                type="text"
                value={tramo.motorista}
                disabled={somenteLeitura}
                placeholder="Nome completo"
                autoCapitalize="characters"
                onChange={e => onChange({ motorista: e.target.value.toUpperCase() })}
                className={`${campoClasse} uppercase mt-1.5`}
              />
            </div>

            {/* CNH */}
            <div className="sm:col-span-1">
              <label htmlFor={`cnh-${tramo.id}`} className={rotuloClasse}>CNH</label>
              <input
                id={`cnh-${tramo.id}`}
                type="text"
                value={tramo.cnh || ''}
                disabled={somenteLeitura}
                placeholder="Nº da CNH"
                maxLength={20}
                onChange={e => onChange({ cnh: e.target.value ? e.target.value.trim() : null })}
                className={`${campoClasse} mt-1.5`}
              />
            </div>

            {PLACAS.map(p => (
              <div key={p.campoPlaca}>
                <label htmlFor={`${p.campoPlaca}-${tramo.id}`} className={rotuloClasse}>
                  {p.rotulo}
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id={`${p.campoPlaca}-${tramo.id}`}
                    type="text"
                    value={tramo[p.campoPlaca]}
                    disabled={somenteLeitura}
                    placeholder="Placa"
                    autoCapitalize="characters"
                    onChange={e => onChange({ [p.campoPlaca]: e.target.value.toUpperCase() } as Partial<ExpedicaoTramo>)}
                    className={campoPlaca}
                  />
                  <select
                    aria-label={`UF — ${p.rotulo}`}
                    value={tramo[p.campoUf] || ''}
                    disabled={somenteLeitura}
                    onChange={e => onChange({ [p.campoUf]: e.target.value || null } as Partial<ExpedicaoTramo>)}
                    className={campoUf}
                  >
                    <option value="">UF</option>
                    {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {/* Trilha de horários — o que é preenchido ao longo do dia */}
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/40" data-tour="expedicao-edicao-etapas">
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">
              Horários e fotos
            </p>
            {ETAPAS.map((e, i) => (
              <EtapaHorario
                key={e.etapa}
                etapa={e.etapa}
                rotulo={e.rotulo}
                data={tramo[e.campoData] as string | null}
                hora={tramo[e.campo] as string | null}
                fotos={fotos.filter(f => f.etapa === e.etapa)}
                ultima={i === ETAPAS.length - 1}
                desabilitado={somenteLeitura}
                onDataChange={data => onChange({ [e.campoData]: data } as Partial<ExpedicaoTramo>)}
                onHoraChange={hora => onChange({ [e.campo]: hora } as Partial<ExpedicaoTramo>)}
                onAnexar={arquivos => onAnexarFoto(e.etapa, arquivos)}
                onExcluirFoto={onExcluirFoto}
                onEnviarEmail={e.etapa === 'chegada_portaria' ? onEnviarChegada : undefined}
              />
            ))}

            {/* Identificação de Expedição: Nº do Tramo e Número da NF (Posicionado antes do Lead Time) */}
            <div className="mt-5 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Dados de Faturamento & Expedição
                </h4>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`numero-tramo-${tramo.id}`} className={rotuloClasse}>
                    Nº Tramo (4 dígitos)
                  </label>
                  <input
                    id={`numero-tramo-${tramo.id}`}
                    type="text"
                    maxLength={4}
                    value={tramo.numero_tramo || ''}
                    disabled={somenteLeitura}
                    placeholder="Ex.: 1234"
                    inputMode="numeric"
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                      onChange({ numero_tramo: v || null });
                    }}
                    className={`${campoClasse} mt-1.5 font-mono font-bold tracking-wider`}
                  />
                </div>

                <div>
                  <label htmlFor={`numero-nf-${tramo.id}`} className={rotuloClasse}>
                    Número da NF
                  </label>
                  <input
                    id={`numero-nf-${tramo.id}`}
                    type="text"
                    value={tramo.numero_nf || ''}
                    disabled={somenteLeitura}
                    placeholder="Ex.: 001234"
                    onChange={e => onChange({ numero_nf: e.target.value ? e.target.value.toUpperCase() : null })}
                    className={`${campoClasse} mt-1.5 font-semibold`}
                  />
                </div>
              </div>
            </div>

            {/* Painel de Cálculo de Lead Time das Etapas */}
            <div className="mt-4 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-center gap-2 mb-2.5">
                <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Cálculo de Tempos (Lead Time)
                </h4>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">
                    Portaria ➔ Pátio
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                    {leadTimes.portariaAtePatio || <span className="font-normal text-slate-400">Aguardando etapas</span>}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">
                    Pátio ➔ Expedição
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                    {leadTimes.patioAteExpedicao || <span className="font-normal text-slate-400">Aguardando etapas</span>}
                  </p>
                </div>

                <div className="rounded-lg bg-blue-50/70 p-2.5 border border-blue-100 dark:bg-blue-950/40 dark:border-blue-900/60">
                  <p className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">
                    Lead Time Total (Portaria ➔ Exp.)
                  </p>
                  <p className="mt-0.5 text-xs font-extrabold text-blue-700 dark:text-blue-300">
                    {leadTimes.leadTimeTotal || <span className="font-normal text-slate-400">Aguardando conclusão</span>}
                  </p>
                </div>
              </div>
            </div>

            {/* Seção de Observações, Justificativas & Evidências da Carreta */}
            <div className="mt-4 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Observações & Evidências da Carreta
                  </h4>
                  {observacoesComUrls.length > 0 && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950/70 dark:text-blue-300">
                      {observacoesComUrls.length}
                    </span>
                  )}
                </div>
                {!somenteLeitura && (
                  <button
                    type="button"
                    onClick={() => setMostrarFormObs(!mostrarFormObs)}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 cursor-pointer transition-colors"
                  >
                    {mostrarFormObs ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    <span>{mostrarFormObs ? 'Fechar' : 'Nova Observação'}</span>
                  </button>
                )}
              </div>

              {/* Formulário inline para nova observação */}
              {mostrarFormObs && !somenteLeitura && (
                <div className="mb-3.5 rounded-xl border border-blue-100 bg-blue-50/40 p-3 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300">
                      Adicionar Apontamento / Ocorrência
                    </span>
                    <select
                      value={novoTipo}
                      onChange={(e) => setNovoTipo(e.target.value as TipoObservacaoTramo)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <option value="observacao">Observação Geral</option>
                      <option value="justificativa_atraso">Justificativa de Lead Time (&gt; 24h)</option>
                      <option value="ocorrencia">Ocorrência Operacional / Pátio</option>
                      <option value="outro">Outro Apontamento</option>
                    </select>
                  </div>

                  <textarea
                    rows={2}
                    value={novoTexto}
                    onChange={(e) => setNovoTexto(e.target.value)}
                    placeholder="Descreva a observação, justificativa de atraso ou ocorrência..."
                    className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />

                  {/* Anexo de fotos de evidência */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer">
                      <Camera className="h-3.5 w-3.5 text-blue-600" />
                      <span>Anexar Fotos / Docs</span>
                      <input
                        type="file"
                        multiple
                        accept="image/*,application/pdf"
                        onChange={handleArquivoChange}
                        className="sr-only"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={salvando || !novoTexto.trim()}
                      onClick={handleSalvarObs}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-all"
                    >
                      {salvando ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Salvando...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3 w-3" />
                          <span>Salvar</span>
                        </>
                      )}
                    </button>
                  </div>

                  {arquivos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {arquivos.map((arq, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                        >
                          <Paperclip className="h-2.5 w-2.5 text-blue-500" />
                          <span className="truncate max-w-[120px]">{arq.name}</span>
                          <button
                            type="button"
                            onClick={() => setArquivos(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-600 ml-1 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Lista de observações */}
              {observacoesComUrls.length > 0 ? (
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {observacoesComUrls.map((obs) => {
                    const ehJustificativa = obs.tipo === 'justificativa_atraso';
                    const ehOcorrencia = obs.tipo === 'ocorrencia';
                    const badgeCor = ehJustificativa
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                      : ehOcorrencia
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300';

                    return (
                      <div
                        key={obs.id}
                        className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-800/30 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{obs.usuario_nome}</span>
                            <span className={`rounded px-1.5 py-0.2 text-[9px] font-extrabold ${badgeCor}`}>
                              {ehJustificativa ? 'Justificativa SLA' : ehOcorrencia ? 'Ocorrência' : 'Observação'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {new Date(obs.criado_em).toLocaleDateString('pt-BR')} {new Date(obs.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{obs.texto}</p>

                        {/* Evidências anexadas */}
                        {obs.evidencias && obs.evidencias.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {obs.evidencias.map((evi) => {
                              const ehImg = evi.tipo?.startsWith('image/') || evi.nome_arquivo.match(/\.(jpg|jpeg|png|webp|gif)$/i);
                              return (
                                <div
                                  key={evi.id}
                                  className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white p-1 text-[10px] dark:border-slate-700 dark:bg-slate-900"
                                >
                                  {ehImg && evi.url ? (
                                    <div
                                      onClick={() => setPreviewUrl({ url: evi.url!, nome: evi.nome_arquivo })}
                                      className="relative h-9 w-9 overflow-hidden rounded cursor-pointer bg-slate-100"
                                    >
                                      <img src={evi.url} alt={evi.nome_arquivo} className="h-full w-full object-cover" />
                                    </div>
                                  ) : (
                                    <FileText className="h-4 w-4 text-slate-400 ml-1" />
                                  )}
                                  <span className="truncate max-w-[100px] font-semibold text-slate-700 dark:text-slate-300">
                                    {evi.nome_arquivo}
                                  </span>
                                  {evi.url && (
                                    <a
                                      href={evi.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800 p-0.5"
                                      title="Abrir anexo"
                                    >
                                      <Download className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">
                  Nenhuma observação registrada para esta carreta.
                </p>
              )}
            </div>

            {/* Modal preview de imagem */}
            {previewUrl && (
              <Modal onClose={() => setPreviewUrl(null)} maxWidth="max-w-2xl">
                <ModalHeader onClose={() => setPreviewUrl(null)}>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-600" />
                    <span className="truncate text-xs font-bold">{previewUrl.nome}</span>
                  </div>
                </ModalHeader>
                <ModalBody>
                  <div className="flex justify-center p-2">
                    <img src={previewUrl.url} alt={previewUrl.nome} className="max-h-[65vh] rounded-lg object-contain" />
                  </div>
                </ModalBody>
                <ModalFooter>
                  <a
                    href={previewUrl.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={previewUrl.nome}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Baixar</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setPreviewUrl(null)}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    Fechar
                  </button>
                </ModalFooter>
              </Modal>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
