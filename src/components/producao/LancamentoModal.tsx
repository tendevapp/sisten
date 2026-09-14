/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário genérico de lançamento — um componente só para Corte, Chanfro,
 * Calandra e Solda SAW (Blocos 1-2). "Etapas viram dado": o que muda de
 * etapa para etapa são só os campos extras (`camposDaEtapa`) e o tipo de
 * recurso (`TIPO_RECURSO_POR_ETAPA`), não o componente.
 *
 * Mobile-first (achado B1 da análise do NAV1): botões de situação grandes,
 * `<input type="date/time">` nativos, seletor de pessoa por lista em vez de
 * digitação livre. Offline-first: `registrarLancamento` guarda no outbox
 * sozinho se a rede falhar — este componente só mostra o resultado.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, PenTool, Ban } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import GaleriaFotosProducao from './GaleriaFotosProducao';
import SeletorPessoaField, { type ValorPessoa } from './SeletorPessoaField';
import SignaturePadModal from '../portaria/SignaturePadModal';
import type { Profile, RhPessoa } from '../../types';
import { canAccessPage } from '../../lib/pages';
import type { PreparedAttachment } from '../../lib/imageCompression';
import {
  camposDaEtapa,
  TIPO_RECURSO_POR_ETAPA,
  TURNOS,
  EXECUCOES_CHANFRO,
  validarCamposLancamento,
  normalizarTurno,
  normalizarDecimal,
  type StatusLancamento,
} from '../../lib/producao';
import {
  registrarLancamento,
  listarRecursos,
  listarDefeitos,
  type EtapaProducao,
  type FilaItemProducao,
  type RecursoProducao,
} from '../../lib/producaoApi';

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  user: Profile;
  etapa: EtapaProducao;
  item: FilaItemProducao;
  pessoas: RhPessoa[];
  onClose: () => void;
  onSalvo: () => void;
}

export default function LancamentoModal({ user, etapa, item, pessoas, onClose, onSalvo }: Props) {
  const toast = useToast();
  const campos = camposDaEtapa(etapa.id);

  const [dataLiberacao, setDataLiberacao] = useState(hojeISO());
  const [hora, setHora] = useState('');
  const [turno, setTurno] = useState('');
  const [status, setStatus] = useState<StatusLancamento | ''>('');
  const [rastreabilidade, setRastreabilidade] = useState('');
  const [recursoId, setRecursoId] = useState('');
  const [execucaoEmpresa, setExecucaoEmpresa] = useState('');
  const [executante, setExecutante] = useState<ValorPessoa>({ pessoaId: null, nome: '' });
  const [inspetor, setInspetor] = useState<ValorPessoa>({ pessoaId: null, nome: '' });
  const [observacao, setObservacao] = useState('');
  const [medicoesEvs, setMedicoesEvs] = useState<Record<string, string>>({});
  const [raizesFlange, setRaizesFlange] = useState<Record<string, string>>({});
  const [defeitos, setDefeitos] = useState<{ id: string; nome: string }[]>([]);
  const [defeitoId, setDefeitoId] = useState('');
  const [motivoRefugo, setMotivoRefugo] = useState('');
  const [utReparos, setUtReparos] = useState({ largura: '', comprimento: '', profundidade: '', procedimento: '' });
  const [assinaturaInspetor, setAssinaturaInspetor] = useState<string | null>(null);
  const [assinaturaAberta, setAssinaturaAberta] = useState(false);
  const [fotos, setFotos] = useState<PreparedAttachment[]>([]);
  const [recursos, setRecursos] = useState<RecursoProducao[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!campos.exigeRecurso) return;
    const tipo = TIPO_RECURSO_POR_ETAPA[etapa.id];
    if (!tipo) return;
    listarRecursos(tipo).then(setRecursos).catch(() => toast.error('Não foi possível carregar as máquinas.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa.id]);

  useEffect(() => {
    if (etapa.id !== 'ut') return;
    listarDefeitos().then(setDefeitos).catch(() => toast.error('Não foi possível carregar a taxonomia de defeitos.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa.id]);

  const rastreabilidadeHerdada = !campos.exigeRastreabilidade ? item.rastreabilidade_herdada : null;

  const salvar = async (situacao: StatusLancamento) => {
    if (situacao === 'refugado' && !motivoRefugo.trim()) {
      toast.error('Informe o motivo do refugo.');
      return;
    }
    setStatus(situacao);
    const erros = validarCamposLancamento({
      etapaId: etapa.id,
      status: situacao,
      dataLiberacao,
      recursoId: recursoId || null,
      execucaoEmpresa: execucaoEmpresa || null,
      rastreabilidade: campos.exigeRastreabilidade ? rastreabilidade : rastreabilidadeHerdada,
    });
    if (erros.length) {
      toast.error(erros[0]);
      return;
    }

    setSalvando(true);
    try {
      const resultado = await registrarLancamento(
        {
          etapaId: etapa.id,
          virolaId: item.virola_id,
          status: situacao,
          dataLiberacao,
          hora: hora || null,
          turno: normalizarTurno(turno),
          recursoId: recursoId || null,
          execucaoEmpresa: execucaoEmpresa || null,
          rastreabilidade: campos.exigeRastreabilidade ? rastreabilidade.trim() : rastreabilidadeHerdada,
          executantePessoaId: executante.pessoaId,
          executanteNome: executante.nome.trim() || null,
          inspetorPessoaId: inspetor.pessoaId,
          inspetorNome: inspetor.nome.trim() || null,
          observacao: observacao.trim() || null,
          criadoPorNome: user.name,
          criadoPorId: user.id,
          detalhes: etapa.id === 'evs'
            ? { evs: Object.fromEntries(Object.entries(medicoesEvs).map(([campo, valor]) => [campo, normalizarDecimal(valor)])) }
            : etapa.id === 'flange'
              ? { flange: {
                raiz_1: normalizarDecimal(raizesFlange.raiz_1), raiz_2: normalizarDecimal(raizesFlange.raiz_2),
                raiz_3: normalizarDecimal(raizesFlange.raiz_3), raiz_4: normalizarDecimal(raizesFlange.raiz_4),
              } }
              : etapa.id === 'ut'
                ? {
                  defeitoId: defeitoId || null,
                  motivoRefugo: motivoRefugo.trim() || null,
                  assinaturaInspetor,
                  utReparos: (utReparos.largura || utReparos.comprimento || utReparos.profundidade || utReparos.procedimento)
                    ? [{ defeitoId: defeitoId || null, largura: normalizarDecimal(utReparos.largura), comprimento: normalizarDecimal(utReparos.comprimento), profundidade: normalizarDecimal(utReparos.profundidade), procedimento: utReparos.procedimento.trim() || null }]
                    : [],
                }
              : undefined,
        },
        fotos,
      );

      if (resultado.enfileirado) {
        toast.info('Sem conexão agora — o lançamento foi guardado e será enviado assim que a rede voltar.');
      } else {
        toast.success(
          situacao === 'aprovado'
            ? `${etapa.nome} aprovado. Código ${resultado.codigo}.`
            : `${etapa.nome} reprovado. Registro enviado ao Controle de Liberações.`,
        );
      }
      onSalvo();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o lançamento.');
    } finally {
      setSalvando(false);
    }
  };

  const tipoRecursoLabel = useMemo(() => {
    const mapa: Record<string, string> = { corte: 'Mesa de Corte', calandra: 'Calandra', solda: 'SAW' };
    return mapa[etapa.id] ?? 'Máquina';
  }, [etapa.id]);

  return (
    <Modal onClose={onClose} ariaLabel={`Liberação de ${etapa.nome}`} maxWidth="max-w-xl">
      <ModalHeader onClose={onClose}>
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Liberação de {etapa.nome}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Torre {item.torre_numero} • {item.tramo} • {item.virola}
          </p>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-4 p-5">
        {item.corrigir && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Corrigindo peça após reprovação anterior.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Data da Liberação *</label>
            <input
              type="date"
              value={dataLiberacao}
              onChange={e => setDataLiberacao(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:py-2 sm:text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Hora</label>
            <input
              type="time"
              value={hora}
              onChange={e => setHora(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:py-2 sm:text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Turno</label>
          <div className="flex flex-wrap gap-1.5">
            {TURNOS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTurno(turno === t ? '' : t)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  turno === t
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {campos.exigeRastreabilidade ? (
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
              Rastreabilidade da Chapa *
            </label>
            <input
              type="text"
              value={rastreabilidade}
              onChange={e => setRastreabilidade(e.target.value)}
              placeholder="Código da chapa"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:py-2 sm:text-sm"
            />
          </div>
        ) : rastreabilidadeHerdada ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Rastreabilidade herdada do corte: <span className="font-semibold">{rastreabilidadeHerdada}</span>
          </p>
        ) : null}

        {campos.exigeRecurso && (
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{tipoRecursoLabel} *</label>
            <select
              value={recursoId}
              onChange={e => setRecursoId(e.target.value)}
              className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:py-2 sm:text-sm"
            >
              <option value="">Selecione...</option>
              {recursos.map(r => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        {campos.exigeExecucao && (
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Execução do Chanfro *</label>
            <div className="flex gap-2">
              {EXECUCOES_CHANFRO.map(ex => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setExecucaoEmpresa(ex)}
                  className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition-colors ${
                    execucaoEmpresa === ex
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {etapa.id === 'evs' && (
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Medições EVS (mm)</label>
            <p className="mb-2 text-[11px] text-slate-500">Use vírgula ou ponto para registrar as dimensões medidas.</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['altura_interna', 'Altura interna'], ['altura_externa', 'Altura externa'], ['comprimento', 'Comprimento'],
                ['offset', 'Offset'], ['perimetro', 'Perímetro'], ['curvatura', 'Curvatura'],
              ].map(([campo, rotulo]) => <input key={campo} inputMode="decimal" type="text" value={medicoesEvs[campo] ?? ''}
                onChange={e => setMedicoesEvs(atual => ({ ...atual, [campo]: e.target.value }))} placeholder={rotulo}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-950 sm:text-sm" />)}
            </div>
          </div>
        )}

        {etapa.id === 'flange' && (
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Medições das raízes (mm)</label>
            <div className="grid grid-cols-2 gap-2">
              {['raiz_1', 'raiz_2', 'raiz_3', 'raiz_4'].map((campo, indice) => <input key={campo} inputMode="decimal" type="text" value={raizesFlange[campo] ?? ''}
                onChange={e => setRaizesFlange(atual => ({ ...atual, [campo]: e.target.value }))} placeholder={`Raiz ${indice + 1}`}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-950 sm:text-sm" />)}
            </div>
          </div>
        )}

        {etapa.id === 'ut' && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-950/40">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Defeito / resultado UT</label>
              <select value={defeitoId} onChange={e => setDefeitoId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <option value="">Nenhum defeito selecionado</option>
                {defeitos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Reparo (opcional)</label>
              <div className="grid grid-cols-3 gap-2">
                {(['largura', 'comprimento', 'profundidade'] as const).map(c => <input key={c} inputMode="decimal" type="text" value={utReparos[c]} onChange={e => setUtReparos(v => ({ ...v, [c]: e.target.value }))} placeholder={c[0].toUpperCase() + c.slice(1)} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />)}
              </div>
              <input type="text" value={utReparos.procedimento} onChange={e => setUtReparos(v => ({ ...v, procedimento: e.target.value }))} placeholder="Procedimento do reparo" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500">Assinatura do inspetor: {assinaturaInspetor ? 'capturada' : 'pendente'}</span>
              <button type="button" onClick={() => setAssinaturaAberta(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"><PenTool className="h-3.5 w-3.5" /> Assinar</button>
            </div>
            <input type="text" value={motivoRefugo} onChange={e => setMotivoRefugo(e.target.value)} placeholder="Motivo do refugo (obrigatório ao refugar)" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
          </div>
        )}

        <SeletorPessoaField label="Executante" pessoas={pessoas} value={executante} onChange={setExecutante} />
        <SeletorPessoaField label="Inspetor" pessoas={pessoas} value={inspetor} onChange={setInspetor} />

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Observação</label>
          <textarea
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            rows={2}
            placeholder="Opcional"
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:py-2 sm:text-sm"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">Fotos</label>
          <GaleriaFotosProducao arquivos={fotos} setArquivos={setFotos} />
        </div>
      </ModalBody>

      <ModalFooter>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={salvando}
            onClick={() => salvar('reprovado')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
          >
            {salvando && status === 'reprovado' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reprovado
          </button>
          {etapa.id === 'ut' && canAccessPage(user, 'prod_refugar') && (
            <button type="button" disabled={salvando} onClick={() => salvar('refugado')} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-400 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"><Ban className="h-4 w-4" /> Refugar</button>
          )}
          <button
            type="button"
            disabled={salvando}
            onClick={() => salvar('aprovado')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {salvando && status === 'aprovado' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Aprovado
          </button>
        </div>
      </ModalFooter>
      <SignaturePadModal isOpen={assinaturaAberta} onClose={() => setAssinaturaAberta(false)} onSave={setAssinaturaInspetor} title="Assinatura do inspetor UT" subtitle="Assine para fechar a inspeção e compor o data book" />
    </Modal>
  );
}
