/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Suprimentos › Ava. Fornecedor.
 *
 * Duas formas de avaliar, que se alimentam:
 *  - Ocorrências (rotina): o comprador registra o que deu errado num
 *    fornecimento — várias ocorrências num lançamento só. Os POs com
 *    pendência de recebimento / de NF aparecem prontos para registrar.
 *  - FRM.SUP-0005 (anual): questionário oficial, com respostas sugeridas
 *    pelas ocorrências do período.
 * O painel cruza X itens comprados (ZL0132) × Y ocorrências por fornecedor e
 * gera o relatório para enviar ao fornecedor. Regras em
 * `lib/avaliacaoFornecedores.ts`; banco em `lib/avaliacaoFornecedoresApi.ts`.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Award, BarChart3, CalendarClock, ClipboardCheck, ClipboardList, Inbox, RefreshCw, Users,
} from 'lucide-react';
import type { Profile } from '../types';
import { useToast } from '../components/ui/Toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../components/ui/Modal';
import PdfPreviewModal from '../components/ui/PdfPreviewModal';
import { Chip, Indicador, inputCls } from '../components/suprimentos/avaliacao/ui';
import OcorrenciaFormModal from '../components/suprimentos/avaliacao/OcorrenciaFormModal';
import FrmFormModal from '../components/suprimentos/avaliacao/FrmFormModal';
import FornecedorHistoricoModal from '../components/suprimentos/avaliacao/FornecedorHistoricoModal';
import TabOcorrencias, { sugestaoEhMinha } from '../components/suprimentos/avaliacao/TabOcorrencias';
import TabFrm from '../components/suprimentos/avaliacao/TabFrm';
import TabPainel from '../components/suprimentos/avaliacao/TabPainel';
import { frmVencida, subtrairMeses, type LinhaPainel } from '../lib/avaliacaoFornecedores';
import {
  carregarPainel, dispensarSugestao, excluirAvaliacaoFrm, excluirRegistro, listarAvaliacoesFrm, listarRegistros, listarSugestoes,
  type AvaliacaoFrm, type FornecedorOpcao, type RegistroOcorrencia, type SugestaoRegistro,
} from '../lib/avaliacaoFornecedoresApi';
import { gerarPdfAvaliacaoFrm } from '../lib/pdfExport/exportAvaliacaoFornecedorPdf';
import { hojeISO } from '../lib/fichaEpi';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Aba = 'ocorrencias' | 'frm' | 'painel';

const ABAS: { id: Aba; rotulo: string; icon: typeof Award }[] = [
  { id: 'ocorrencias', rotulo: 'Ocorrências', icon: ClipboardList },
  { id: 'frm', rotulo: 'Avaliação FRM.SUP-0005', icon: ClipboardCheck },
  { id: 'painel', rotulo: 'Painel de fornecedores', icon: BarChart3 },
];

const MOTIVOS_DISPENSA = [
  'Falha interna, não do fornecedor',
  'Já registrado em outro lançamento',
  'Alinhado com o fornecedor antes',
  'Não procede',
];

type ModalAberto =
  | { tipo: 'ocorrencia'; registro?: RegistroOcorrencia; sugestao?: SugestaoRegistro; fornecedor?: FornecedorOpcao }
  | { tipo: 'frm'; avaliacao?: AvaliacaoFrm; fornecedor?: FornecedorOpcao }
  | { tipo: 'excluirRegistro'; registro: RegistroOcorrencia }
  | { tipo: 'excluirFrm'; avaliacao: AvaliacaoFrm }
  | { tipo: 'pdfFrm'; avaliacao: AvaliacaoFrm }
  | { tipo: 'dispensar'; sugestao: SugestaoRegistro }
  | null;

export default function AvaliacaoFornecedores({ user }: Props) {
  const toast = useToast();
  const [aba, setAba] = useState<Aba>('ocorrencias');
  const [registros, setRegistros] = useState<RegistroOcorrencia[]>([]);
  const [sugestoes, setSugestoes] = useState<SugestaoRegistro[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoFrm[]>([]);
  const [painel12, setPainel12] = useState<LinhaPainel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const [modal, setModal] = useState<ModalAberto>(null);
  const [historico, setHistorico] = useState<FornecedorOpcao | null>(null);
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const fim = hojeISO();
    const resultados = await Promise.allSettled([
      listarRegistros(),
      listarSugestoes(120),
      listarAvaliacoesFrm(),
      carregarPainel(subtrairMeses(fim, 12), fim),
    ]);
    const [regs, sugs, avs, painel] = resultados;
    if (regs.status === 'fulfilled') setRegistros(regs.value);
    if (sugs.status === 'fulfilled') setSugestoes(sugs.value);
    if (avs.status === 'fulfilled') setAvaliacoes(avs.value);
    if (painel.status === 'fulfilled') setPainel12(painel.value);
    const falha = resultados.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (falha) toast.error(falha.reason?.message || 'Falha ao carregar parte dos dados.');
    setCarregando(false);
  }, [toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  const aposSalvar = async () => {
    setModal(null);
    setVersao(v => v + 1);
    await carregar();
  };

  // Indicadores
  const hoje = hojeISO();
  const minhas = useMemo(() => sugestoes.filter(s => sugestaoEhMinha(s, user)).length, [sugestoes, user]);
  const ultimos30 = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    const desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return registros.filter(r => r.data_registro >= desde).reduce((s, r) => s + (r.ocorrencias?.length || 0), 0);
  }, [registros]);
  const fornComOcorrencia = useMemo(() => painel12.filter(l => l.ocorrencias > 0).length, [painel12]);
  const frmPendentes = useMemo(() => painel12.filter(l => l.pedidos > 0 && frmVencida(l.frm_data, hoje)).length, [painel12, hoje]);

  const confirmarExclusao = async () => {
    if (!modal || (modal.tipo !== 'excluirRegistro' && modal.tipo !== 'excluirFrm')) return;
    setProcessando(true);
    try {
      if (modal.tipo === 'excluirRegistro') await excluirRegistro(modal.registro.id, user.id);
      else await excluirAvaliacaoFrm(modal.avaliacao.id, user.id);
      toast.success('Excluído.');
      await aposSalvar();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao excluir.');
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="space-y-5 text-left w-full pb-28">
      <div className="reveal flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
            <Award className="h-7 w-7" style={{ color: 'var(--ink-muted)' }} />
            Avaliação de Fornecedores
          </h2>
          <p className="mt-1 text-base" style={{ color: 'var(--ink-secondary)' }}>
            Registre as ocorrências de cada fornecimento e faça a avaliação anual (FRM.SUP-0005). O histórico fica visível para quem for comprar de novo.
          </p>
        </div>
        <button type="button" onClick={() => void carregar()} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicador icon={Inbox} rotulo={`POs com pendência para registrar${minhas ? ` (${minhas} seus)` : ''}`} valor={sugestoes.length} tom="#d97706" onClick={() => setAba('ocorrencias')} />
        <Indicador icon={AlertTriangle} rotulo="Ocorrências nos últimos 30 dias" valor={ultimos30} tom="var(--status-critical)" onClick={() => setAba('ocorrencias')} />
        <Indicador icon={Users} rotulo="Fornecedores com ocorrência (12 meses)" valor={fornComOcorrencia} tom="var(--brand)" onClick={() => setAba('painel')} />
        <Indicador icon={CalendarClock} rotulo="Avaliação anual pendente" valor={frmPendentes} tom="#7c3aed" onClick={() => setAba('frm')} />
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border p-1 w-fit max-w-full overflow-x-auto" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
        {ABAS.map(a => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold whitespace-nowrap"
            style={aba === a.id
              ? { background: 'var(--surface-card)', color: 'var(--brand)', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.06)' }
              : { color: 'var(--ink-muted)' }}
          >
            <a.icon className="h-4 w-4" /> {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'ocorrencias' && (
        <TabOcorrencias
          user={user}
          registros={registros}
          sugestoes={sugestoes}
          carregando={carregando}
          onNovo={() => setModal({ tipo: 'ocorrencia' })}
          onRegistrarSugestao={s => setModal({ tipo: 'ocorrencia', sugestao: s })}
          onDispensar={s => setModal({ tipo: 'dispensar', sugestao: s })}
          onEditar={r => setModal({ tipo: 'ocorrencia', registro: r })}
          onExcluir={r => setModal({ tipo: 'excluirRegistro', registro: r })}
          onFornecedor={r => setHistorico({ fornecedor_codigo: r.fornecedor_codigo, fornecedor_nome: r.fornecedor_nome, cnpj: r.fornecedor_cnpj })}
        />
      )}
      {aba === 'frm' && (
        <TabFrm
          user={user}
          avaliacoes={avaliacoes}
          painel12={painel12}
          carregando={carregando}
          onNova={f => setModal({ tipo: 'frm', fornecedor: f })}
          onEditar={a => setModal({ tipo: 'frm', avaliacao: a })}
          onExcluir={a => setModal({ tipo: 'excluirFrm', avaliacao: a })}
          onPdf={a => setModal({ tipo: 'pdfFrm', avaliacao: a })}
          onFornecedor={setHistorico}
        />
      )}
      {aba === 'painel' && <TabPainel painel12={painel12} onFornecedor={setHistorico} versao={versao} />}

      {historico && !modal && (
        <FornecedorHistoricoModal
          user={user}
          fornecedor={historico}
          avaliacoes={avaliacoes}
          versao={versao}
          onClose={() => setHistorico(null)}
          onRegistrar={f => setModal({ tipo: 'ocorrencia', fornecedor: f })}
          onAvaliar={f => setModal({ tipo: 'frm', fornecedor: f })}
          onEditarRegistro={r => setModal({ tipo: 'ocorrencia', registro: r })}
        />
      )}

      {modal?.tipo === 'ocorrencia' && (
        <OcorrenciaFormModal
          user={user}
          registro={modal.registro}
          sugestao={modal.sugestao}
          fornecedorInicial={modal.fornecedor}
          onClose={() => setModal(null)}
          onSalvo={() => void aposSalvar()}
        />
      )}
      {modal?.tipo === 'frm' && (
        <FrmFormModal
          user={user}
          avaliacao={modal.avaliacao}
          fornecedorInicial={modal.fornecedor}
          onClose={() => setModal(null)}
          onSalvo={() => void aposSalvar()}
        />
      )}
      {modal?.tipo === 'pdfFrm' && (
        <PdfPreviewModal gerar={() => gerarPdfAvaliacaoFrm(modal.avaliacao)} onClose={() => setModal(null)} />
      )}
      {(modal?.tipo === 'excluirRegistro' || modal?.tipo === 'excluirFrm') && (
        <ConfirmDialog
          titulo={modal.tipo === 'excluirRegistro' ? `Excluir ${modal.registro.codigo || 'registro'}?` : `Excluir ${modal.avaliacao.codigo || 'avaliação'}?`}
          mensagem={modal.tipo === 'excluirRegistro'
            ? 'O registro sai do histórico do fornecedor e as pendências dele voltam para a lista de sugestões.'
            : 'A avaliação sai do histórico do fornecedor.'}
          confirmarLabel="Excluir"
          variante="perigo"
          confirmando={processando}
          onConfirmar={() => void confirmarExclusao()}
          onCancelar={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'dispensar' && (
        <DispensarModal
          sugestao={modal.sugestao}
          onClose={() => setModal(null)}
          onConfirmar={async motivo => {
            try {
              await dispensarSugestao(modal.sugestao, motivo, user);
              toast.success(`PO ${modal.sugestao.nro_pedido} dispensado.`);
              await aposSalvar();
            } catch (e: any) {
              toast.error(e?.message || 'Falha ao dispensar.');
            }
          }}
        />
      )}
    </div>
  );
}

function DispensarModal({
  sugestao, onClose, onConfirmar,
}: { sugestao: SugestaoRegistro; onClose: () => void; onConfirmar: (motivo: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState(MOTIVOS_DISPENSA[0]);
  const [detalhe, setDetalhe] = useState('');
  const [enviando, setEnviando] = useState(false);
  return (
    <Modal onClose={onClose} layout="dialog" maxWidth="max-w-md" ariaLabel="Dispensar pendência">
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Dispensar PO {sugestao.nro_pedido}?</h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Some da lista sem virar ocorrência do fornecedor.</p>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {MOTIVOS_DISPENSA.map(m => <Chip key={m} ativo={motivo === m} onClick={() => setMotivo(m)}>{m}</Chip>)}
        </div>
        <input value={detalhe} onChange={e => setDetalhe(e.target.value)} placeholder="Detalhe (opcional)" className={inputCls} />
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>Cancelar</button>
          <button
            type="button"
            disabled={enviando}
            onClick={async () => { setEnviando(true); await onConfirmar([motivo, detalhe.trim()].filter(Boolean).join(' — ')); setEnviando(false); }}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: 'var(--brand)' }}
          >
            Dispensar
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
