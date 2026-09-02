/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Painel de detalhe de uma solicitação — o mesmo para todo mundo.
 *
 * Antes existiam três painéis quase iguais: o de Minhas Solicitações (stepper,
 * histórico, avaliação), o da fila coletiva (itens, anexos, resposta com nota
 * interna) e o de Aprovações (decisão, sinais do catálogo, PDF). Cada um
 * mostrava um pedaço, e a mesma solicitação parecia coisas diferentes conforme
 * a porta de entrada.
 *
 * Aqui o painel é único e o que muda é o que a pessoa pode fazer: quem aprova
 * ganha o painel de decisão, quem abriu ganha edição e avaliação, quem opera
 * ganha a nota interna. Todo o resto — andamento, itens, anexos, histórico e
 * conversa — todo mundo vê igual.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Calendar, Check, CheckCircle, Copy, ExternalLink, FileText,
  Info, Loader2, Paperclip, Pencil, RefreshCw, Send, Star, Upload, XCircle,
} from 'lucide-react';
import { localDb } from '../../db/localDb';
import { Profile, Request, RequestComment, RequestItem, Sector } from '../../types';
import { AttachmentGallery, AttachmentPicker } from '../ui/Attachments';
import { PreparedAttachment } from '../../lib/imageCompression';
import { SinalChips } from '../ui/SinalChips';
import { buscarMateriais, resumoSinais, type SinalChip } from '../../lib/materiais';
import { exportCompraPdf } from '../../lib/pdfExport/exportCompraPdf';
import { useToast } from '../ui/Toast';
import { formatDateBR, formatDateTimeBR } from '../../lib/format';
import {
  avisoEdicao, podeEditar, rotuloCriticidade, rotuloStatus, rotuloTipo,
} from '../../lib/solicitacoes';
import {
  Pendencia, ehOperador, podeAprovar, podeVerNotaInterna,
} from '../../lib/solicitacoesCentral';
import HelpdeskSatisfactionCard from '../helpdesk/HelpdeskSatisfactionCard';

interface Props {
  request: Request;
  user: Profile;
  sectors: Sector[];
  pendencia: Pendencia | null;
  onNavigate: (path: string) => void;
  /** Chamado depois de qualquer escrita, para a lista relê o que mudou. */
  onChanged: () => void;
}

/* Etapas do andamento ----------------------------------------------------- */

const ETAPAS: Record<Request['type'], { key: string; label: string }[]> = {
  compra: [
    { key: 'pendente', label: 'Aprovação do gestor' },
    { key: 'aprovada', label: 'Fila de suprimentos' },
    { key: 'em_cotacao', label: 'Em cotação' },
    { key: 'pedido_emitido', label: 'Pedido emitido' },
    { key: 'concluida', label: 'Entregue' },
  ],
  cadastro_sap: [
    { key: 'pendente', label: 'Triagem' },
    { key: 'em_revisao', label: 'Em análise' },
    { key: 'aprovada', label: 'Cadastrado no SAP' },
  ],
  chamado: [
    { key: 'aberto', label: 'Aberto' },
    { key: 'em_atendimento', label: 'Em atendimento' },
    { key: 'aguardando_solicitante', label: 'Com o solicitante' },
    { key: 'resolvido', label: 'Resolvido' },
  ],
};

/** Status que saem do trilho: a solicitação parou antes do fim. */
const INTERROMPIDOS = ['rejeitada', 'cancelada'];

function etapaAtual(r: Request): number {
  const idx = ETAPAS[r.type].findIndex(e => e.key === r.status);
  if (idx !== -1) return idx;
  if (INTERROMPIDOS.includes(r.status)) return -1;
  return 0;
}

/** Onde este tipo de solicitação é operado — o link para as ações do módulo. */
function moduloOperacional(r: Request, user: Profile, sectors?: Sector[]): { rotulo: string; path: string } | null {
  if (!ehOperador(r, user)) return null;

  if (r.type === 'cadastro_sap') {
    return { rotulo: 'Abrir em Cadastros SAP', path: `/suprimentos/cadastros-sap?id=${r.id}` };
  }
  if (r.type === 'chamado') {
    const sec = sectors?.find(s => s.id === r.target_sector_id);
    const secName = (sec?.name || '').toLowerCase();
    const catName = (r.category_id || '').toLowerCase();

    // Chamados de Suprimentos (Pendências de Processamento de Notas) vão para a tela de Pendências
    if (secName.includes('suprimento') || catName.includes('pendência') || catName.includes('processamento')) {
      return { rotulo: 'Abrir em Pendências de Processamento', path: `/suprimentos/pendencias-processamento` };
    }
    // Chamados de Jurídico / Contratos
    if (secName.includes('jurídico') || secName.includes('juridico') || catName.includes('contrato')) {
      return { rotulo: 'Abrir em Contratos > Demandas', path: `/suprimentos/contratos` };
    }
    return { rotulo: 'Abrir no Helpdesk', path: `/helpdesk?id=${r.id}` };
  }
  if (r.type === 'compra' && r.status !== 'pendente') {
    return { rotulo: 'Abrir na Central de Compras', path: `/suprimentos/compras?id=${r.id}` };
  }
  return null;
}

/* Painel ------------------------------------------------------------------ */

type Aba = 'detalhes' | 'conversa' | 'historico';

export default function RequestDetailPanel({
  request, user, sectors, pendencia, onNavigate, onChanged,
}: Props) {
  const toast = useToast();

  const [mensagem, setMensagem] = useState('');
  const [notaInterna, setNotaInterna] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [parecer, setParecer] = useState('');
  const [erroDecisao, setErroDecisao] = useState('');
  const [decidindo, setDecidindo] = useState(false);

  const [nota, setNota] = useState(0);
  const [notaHover, setNotaHover] = useState(0);
  const [notaComentario, setNotaComentario] = useState('');

  const [anexosPendentes, setAnexosPendentes] = useState<PreparedAttachment[]>([]);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [versaoAnexos, setVersaoAnexos] = useState(0);

  const [aba, setAba] = useState<Aba>('detalhes');
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [itensCopiados, setItensCopiados] = useState(false);
  const [sinais, setSinais] = useState<Record<string, SinalChip[]>>({});
  const [carregandoSinais, setCarregandoSinais] = useState(false);

  // Toda troca de solicitação zera os rascunhos da tela: uma resposta digitada
  // para a #300 não pode reaparecer no formulário da #301.
  useEffect(() => {
    setMensagem('');
    setNotaInterna(false);
    setParecer('');
    setErroDecisao('');
    setNota(0);
    setNotaHover(0);
    setNotaComentario('');
    setAnexosPendentes([]);
    setSinais({});

    // Quem abre uma solicitação que está esperando uma resposta dele cai
    // direto na conversa: era o clique a mais que todo mundo dava.
    setAba(pendencia?.rotulo.startsWith('Responder') ? 'conversa' : 'detalhes');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  const itens = localDb.getRequestItems(request.id);
  const historico = [...localDb.getRequestHistory(request.id)]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const podeLerInterna = podeVerNotaInterna(user);
  const comentarios = localDb.getRequestComments(request.id)
    .filter(c => podeLerInterna || !c.is_internal)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  const souSolicitante = request.solicitante_id === user.id;
  const aprovando = podeAprovar(request, user) && request.status === 'pendente' && request.type === 'compra';
  const modulo = moduloOperacional(request, user, sectors);
  const nomeSetor = (id?: string) => (id ? sectors.find(s => s.id === id)?.name || id : '—');

  const podeAvaliar =
    souSolicitante && request.type === 'chamado' &&
    (request.status === 'resolvido' || request.status === 'fechado');

  const valorEstimado = itens.reduce((acc, i) => acc + i.estimated_value * i.quantity, 0);

  // Sinais do catálogo (saldo em estoque, RM aberta, pedido a caminho) só
  // interessam a quem vai decidir a compra — e cada um custa uma consulta.
  const chaveItens = itens.map(i => `${i.id}:${i.sap_code || ''}`).join('|');
  useEffect(() => {
    if (!aprovando) return;

    const comCodigo = itens.filter(i => i.sap_code && i.sap_code.trim().length >= 4);
    if (comCodigo.length === 0) return;

    const setor = sectors.find(s => s.id === request.solicitante_sector_id);
    let cancelado = false;
    setCarregandoSinais(true);

    Promise.all(comCodigo.map(async (i) => {
      const codigo = i.sap_code!.trim();
      try {
        const [achado] = await buscarMateriais(codigo, { areaUsuario: setor?.sap_area_code ?? null, limite: 1 });
        if (!achado || achado.materialCode !== codigo) return [i.id, []] as const;
        return [i.id, resumoSinais(achado)] as const;
      } catch (err) {
        console.error('Falha ao buscar sinais do catálogo SAP para o item', i.id, err);
        return [i.id, []] as const;
      }
    })).then(pares => {
      if (!cancelado) setSinais(Object.fromEntries(pares));
    }).finally(() => {
      if (!cancelado) setCarregandoSinais(false);
    });

    return () => { cancelado = true; };
  }, [aprovando, chaveItens, request.id]);

  /* Ações ---------------------------------------------------------------- */

  const responder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mensagem.trim()) return;

    setEnviando(true);
    await localDb.addComment(request.id, user.id, mensagem.trim(), notaInterna ? 'internal' : 'public');
    setMensagem('');
    setEnviando(false);
    onChanged();
  };

  const decidir = async (acao: 'aprovar' | 'rejeitar' | 'revisar') => {
    setErroDecisao('');
    if (acao !== 'aprovar' && !parecer.trim()) {
      setErroDecisao('A justificativa é obrigatória para devolver ou rejeitar.');
      return;
    }

    const proximo = acao === 'aprovar' ? 'aprovada' : acao === 'rejeitar' ? 'rejeitada' : 'em_revisao';
    setDecidindo(true);
    const ok = await localDb.updateRequestStatus(request.id, proximo, user.id, parecer.trim());
    setDecidindo(false);

    if (!ok) {
      setErroDecisao('Não foi possível atualizar o status. Verifique suas permissões.');
      return;
    }
    setParecer('');
    toast.success(`Solicitação #${request.number} atualizada.`);
    onChanged();
  };

  const enviarAvaliacao = () => {
    if (nota === 0) return;
    localDb.evaluateTicket(request.id, nota, notaComentario.trim() || undefined);
    setNota(0);
    setNotaComentario('');
    toast.success('Obrigado pela avaliação.');
    onChanged();
  };

  const enviarAnexos = async () => {
    if (anexosPendentes.length === 0) return;
    setEnviandoAnexo(true);
    const { failed } = await localDb.uploadAttachments(
      request.id,
      anexosPendentes.map(prepared => ({ prepared })),
    );
    setEnviandoAnexo(false);
    setAnexosPendentes([]);
    setVersaoAnexos(v => v + 1);

    if (failed.length > 0) toast.error(`Não foi possível enviar: ${failed.join(', ')}.`);
    else toast.success('Anexo enviado.');
    onChanged();
  };

  const exportarPdf = async () => {
    setExportandoPdf(true);
    try {
      const { failedAttachments } = await exportCompraPdf(request, nomeSetor(request.solicitante_sector_id), itens);
      if (failedAttachments.length > 0) {
        toast.error(`PDF gerado, mas os anexos "${failedAttachments.join('", "')}" ficaram de fora.`);
      } else {
        toast.success('PDF exportado.');
      }
    } catch (e) {
      console.error('Falha ao exportar PDF da solicitação de compra:', e);
      toast.error('Não foi possível gerar o PDF.');
    } finally {
      setExportandoPdf(false);
    }
  };

  const copiarItens = async () => {
    const texto = itens
      .map(it => `${it.sap_code || 'Sem código'} — ${it.description} — ${it.quantity} ${it.unit}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      setItensCopiados(true);
      setTimeout(() => setItensCopiados(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar itens:', err);
    }
  };

  /* Desenho -------------------------------------------------------------- */

  const ABAS: { id: Aba; rotulo: string; contagem?: number }[] = [
    { id: 'detalhes', rotulo: 'Detalhes' },
    { id: 'conversa', rotulo: 'Conversa', contagem: comentarios.length },
    { id: 'historico', rotulo: 'Histórico', contagem: historico.length },
  ];

  return (
    <div className="space-y-3">
      {/*
        Cabeçalho fixo no topo do painel: número, situação, a pendência e as
        ações continuam à vista enquanto se rola uma lista longa de itens ou
        uma conversa comprida — antes, rolar três telas fazia perder de vista
        de qual solicitação se estava falando.
      */}
      <header
        className="sticky top-0 z-10 space-y-3 rounded-2xl border p-4 shadow-sm"
        style={cartao}
      >
        {/* Número e tipo ficam no cabeçalho da janela, logo acima — repetir
            aqui só gastaria a primeira linha do painel. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Selo texto={rotuloStatus(request)} tom="neutro" />
          <Selo texto={rotuloCriticidade(request.criticality)} tom={request.criticality >= 4 ? 'alerta' : 'neutro'} />
          <span className="truncate text-[13px]" style={{ color: 'var(--ink-secondary)' }}>
            {request.solicitante_name} · {nomeSetor(request.solicitante_sector_id)}
          </span>
        </div>

        {pendencia && (
          <p
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold"
            style={{ background: 'var(--brand-wash)', color: 'var(--brand-strong)' }}
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Aguardando você: {pendencia.rotulo}
          </p>
        )}

        {/* Andamento */}
        {etapaAtual(request) === -1 ? (
          <p className="rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}>
            Interrompida em <strong>{rotuloStatus(request)}</strong> — não segue o fluxo.
          </p>
        ) : (
          <ol className="flex items-start gap-1">
            {ETAPAS[request.type].map((etapa, i) => {
              const atual = etapaAtual(request);
              const concluida = i < atual;
              const ativa = i === atual;
              return (
                <li key={etapa.key} className="flex flex-1 flex-col items-center gap-1 text-center">
                  {/* Trilho: a barra diz o progresso mesmo quando o rótulo não cabe. */}
                  <span
                    aria-hidden
                    className="h-1 w-full rounded-full"
                    style={{
                      background: concluida || ativa ? 'var(--brand)' : 'var(--hairline)',
                      opacity: concluida ? 0.5 : 1,
                    }}
                  />
                  <span
                    className="text-xs font-bold leading-tight"
                    style={{ color: ativa ? 'var(--brand-strong)' : 'var(--ink-muted)' }}
                  >
                    {etapa.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {podeEditar(request, user) && (
            <BotaoSecundario
              onClick={() => onNavigate(`/solicitacoes/nova?editar=${request.id}`)}
              title={avisoEdicao(request.type)}
            >
              <Pencil className="h-4 w-4" /> Editar
            </BotaoSecundario>
          )}

          {request.type === 'compra' && (
            <BotaoSecundario onClick={exportarPdf} disabled={exportandoPdf}>
              <FileText className="h-4 w-4" /> {exportandoPdf ? 'Gerando…' : 'PDF'}
            </BotaoSecundario>
          )}

          {modulo && (
            <BotaoSecundario onClick={() => onNavigate(modulo.path)}>
              <ExternalLink className="h-4 w-4" /> {modulo.rotulo}
            </BotaoSecundario>
          )}
        </div>
      </header>

      {/*
        Decisão e avaliação ficam fora das abas, logo abaixo do cabeçalho: são
        a ação que trouxe a pessoa até aqui, e escondê-las atrás de uma aba
        seria pedir um clique para encontrar o motivo da visita.
      */}
      {aprovando && (
        <section className="space-y-3 rounded-2xl border p-4" style={cartao}>
          <div className="flex items-baseline justify-between gap-2">
            <Titulo>Painel de decisão</Titulo>
            <span className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              Estimado: R$ {valorEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {erroDecisao && (
            <p className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
               style={{ background: 'rgba(208,59,59,0.1)', color: 'var(--status-critical)' }}>
              <AlertTriangle className="h-4 w-4 shrink-0" /> {erroDecisao}
            </p>
          )}

          <textarea
            rows={3}
            value={parecer}
            onChange={e => setParecer(e.target.value)}
            placeholder="Parecer da aprovação, ou o motivo da devolução/rejeição (obrigatório nesses dois casos)."
            className="w-full rounded-lg border p-2.5 text-sm focus:outline-2 focus:outline-offset-1"
            style={campo}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button" onClick={() => decidir('aprovar')} disabled={decidindo}
              className="inline-flex flex-1 min-w-[130px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-white cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--brand)' }}
            >
              <CheckCircle className="h-4 w-4" /> Aprovar
            </button>
            <button
              type="button" onClick={() => decidir('revisar')} disabled={decidindo}
              className="inline-flex flex-1 min-w-[130px] items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold cursor-pointer disabled:opacity-50"
              style={{ borderColor: 'var(--status-warning)', color: 'var(--status-warning)' }}
            >
              <RefreshCw className="h-4 w-4" /> Devolver
            </button>
            <button
              type="button" onClick={() => decidir('rejeitar')} disabled={decidindo}
              className="inline-flex flex-1 min-w-[130px] items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold cursor-pointer disabled:opacity-50"
              style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}
            >
              <XCircle className="h-4 w-4" /> Rejeitar
            </button>
          </div>
        </section>
      )}

      {podeAvaliar && (
        <section className="space-y-3 rounded-2xl border p-4" style={cartao}>
          <Titulo><Star className="mr-1 inline h-4 w-4" /> Avaliação do atendimento</Titulo>

          {request.rating ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <Star
                    key={n}
                    className="h-5 w-5"
                    style={{ color: n <= request.rating! ? 'var(--status-warning)' : 'var(--hairline-strong)' }}
                    fill={n <= request.rating! ? 'currentColor' : 'none'}
                  />
                ))}
                <span className="ml-1.5 text-sm font-bold" style={{ color: 'var(--ink-secondary)' }}>
                  {request.rating} de 5
                </span>
              </div>
              {request.rating_comment && (
                <p className="text-sm italic" style={{ color: 'var(--ink-muted)' }}>
                  &ldquo;{request.rating_comment}&rdquo;
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-sm" style={{ color: 'var(--ink-secondary)' }}>
                Como foi o atendimento que você recebeu?
              </p>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} de 5`}
                    onClick={() => setNota(n)}
                    onMouseEnter={() => setNotaHover(n)}
                    onMouseLeave={() => setNotaHover(0)}
                    className="cursor-pointer transition-transform hover:scale-110"
                  >
                    <Star
                      className="h-7 w-7"
                      style={{ color: n <= (notaHover || nota) ? 'var(--status-warning)' : 'var(--hairline-strong)' }}
                      fill={n <= (notaHover || nota) ? 'currentColor' : 'none'}
                    />
                  </button>
                ))}
              </div>

              {nota > 0 && (
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={notaComentario}
                    onChange={e => setNotaComentario(e.target.value)}
                    placeholder="Um elogio ou uma sugestão (opcional)."
                    className="w-full rounded-lg border p-2.5 text-sm focus:outline-2 focus:outline-offset-1"
                    style={campo}
                  />
                  <button
                    type="button"
                    onClick={enviarAvaliacao}
                    className="rounded-lg px-3.5 py-2 text-sm font-bold text-white cursor-pointer"
                    style={{ background: 'var(--brand)' }}
                  >
                    Enviar avaliação
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Abas: três leituras diferentes da mesma solicitação, uma de cada vez. */}
      <nav
        className="flex gap-1 rounded-xl border p-1"
        style={cartao}
        aria-label="Seções da solicitação"
      >
        {ABAS.map(item => {
          const ativa = item.id === aba;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setAba(item.id)}
              aria-current={ativa ? 'true' : undefined}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-bold cursor-pointer transition-colors"
              style={ativa
                ? { background: 'var(--brand)', color: '#fff' }
                : { color: 'var(--ink-secondary)' }}
            >
              {item.rotulo}
              {item.contagem !== undefined && item.contagem > 0 && (
                <span
                  className="rounded-full px-1.5 text-xs tabular-nums"
                  style={ativa
                    ? { background: 'rgba(255,255,255,0.25)' }
                    : { background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}
                >
                  {item.contagem}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {aba === 'detalhes' && (
        <>
          <section className="space-y-2.5 rounded-2xl border p-4" style={cartao}>
            <Titulo>Justificativa e especificações</Titulo>
            <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              {request.justificativa || 'Sem justificativa registrada.'}
            </p>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1 text-[13px]">
              {request.data_necessidade && (
                <Campo rotulo={<><Calendar className="mr-1 inline h-3.5 w-3.5" /> Necessidade</>} valor={formatDateBR(request.data_necessidade)} />
              )}
              {request.tipo_compra && <Campo rotulo="Tipo de compra" valor={request.tipo_compra} />}
              {request.linked_rm_number && <Campo rotulo="RM vinculada" valor={request.linked_rm_number} />}
              {request.atendente_name && <Campo rotulo="Atendente" valor={request.atendente_name} />}
              {request.target_sector_id && <Campo rotulo="Setor de destino" valor={nomeSetor(request.target_sector_id)} />}
              {request.local && <Campo rotulo="Local" valor={request.local} />}
              {request.registration_type && <Campo rotulo="Tipo de cadastro" valor={request.registration_type} />}
              {request.brand && <Campo rotulo="Fabricante / CNPJ" valor={request.brand} />}
            </dl>
          </section>

          {itens.length > 0 && (
            <section className="space-y-3 rounded-2xl border p-4" style={cartao}>
              <div className="flex items-center justify-between gap-2">
                <Titulo>Itens ({itens.length})</Titulo>
                <button
                  type="button"
                  onClick={copiarItens}
                  className="flex items-center gap-1 text-xs font-bold cursor-pointer"
                  style={{ color: itensCopiados ? 'var(--brand)' : 'var(--ink-muted)' }}
                >
                  {itensCopiados ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {itensCopiados ? 'Copiado' : 'Copiar itens'}
                </button>
              </div>

              <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {itens.map((it, i) => (
                  <ItemLinha
                    key={it.id}
                    indice={i}
                    item={it}
                    requestId={request.id}
                    versaoAnexos={versaoAnexos}
                    sinais={sinais[it.id]}
                    carregandoSinais={aprovando && carregandoSinais}
                  />
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-3 rounded-2xl border p-4" style={cartao}>
            <Titulo><Paperclip className="mr-1 inline h-4 w-4" /> Anexos da solicitação</Titulo>
            <AttachmentGallery
              requestId={request.id}
              refreshKey={versaoAnexos}
              emptyLabel="Nenhum anexo enviado."
            />

            {request.status !== 'resolvido' && request.status !== 'fechado' && (
              <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
                <AttachmentPicker value={anexosPendentes} onChange={setAnexosPendentes} disabled={enviandoAnexo} />
                {anexosPendentes.length > 0 && (
                  <button
                    type="button"
                    onClick={enviarAnexos}
                    disabled={enviandoAnexo}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold text-white cursor-pointer disabled:opacity-60"
                    style={{ background: 'var(--brand)' }}
                  >
                    {enviandoAnexo
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                      : <><Upload className="h-4 w-4" /> Enviar {anexosPendentes.length === 1 ? 'anexo' : `${anexosPendentes.length} anexos`}</>}
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {aba === 'conversa' && (
        <section className="space-y-3 rounded-2xl border p-4" style={cartao}>
          {comentarios.length === 0 ? (
            <p className="py-4 text-center text-sm italic" style={{ color: 'var(--ink-muted)' }}>
              Nenhuma mensagem ainda. Escreva a primeira abaixo.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {comentarios.map(c => <Bolha key={c.id} comentario={c} meuId={user.id} />)}
            </ul>
          )}

          <form onSubmit={responder} className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
            <textarea
              rows={3}
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              placeholder={souSolicitante ? 'Escreva para quem está atendendo…' : 'Escreva para o solicitante…'}
              className="w-full rounded-lg border p-2.5 text-sm focus:outline-2 focus:outline-offset-1"
              style={campo}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              {podeLerInterna ? (
                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--ink-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={notaInterna}
                    onChange={e => setNotaInterna(e.target.checked)}
                    style={{ accentColor: 'var(--brand)' }}
                  />
                  Nota interna — o solicitante não vê
                </label>
              ) : <span />}

              <button
                type="submit"
                disabled={!mensagem.trim() || enviando}
                className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-white cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--brand)' }}
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar
              </button>
            </div>
          </form>
        </section>
      )}

      {aba === 'historico' && (
        <section className="space-y-3 rounded-2xl border p-4" style={cartao}>
          {historico.length === 0 ? (
            <p className="py-4 text-center text-sm italic" style={{ color: 'var(--ink-muted)' }}>
              Nenhuma movimentação registrada.
            </p>
          ) : (
            <ol className="space-y-3">
              {historico.map(h => (
                <li key={h.id} className="border-l-2 pl-3 text-sm" style={{ borderColor: 'var(--hairline-strong)' }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>
                      {rotuloStatus({ ...request, status: h.to_status })}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                      {formatDateTimeBR(h.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5" style={{ color: 'var(--ink-muted)' }}>por {h.user_name || 'Sistema'}</p>
                  {h.comment && (
                    <p className="mt-1 rounded-lg p-2 italic" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}>
                      &ldquo;{h.comment}&rdquo;
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}

/* Peças ------------------------------------------------------------------- */

const cartao: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
};

const campo: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
  outlineColor: 'var(--brand)',
};

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
      {children}
    </h4>
  );
}

function Campo({ rotulo, valor }: { rotulo: React.ReactNode; valor: string }) {
  return (
    <div>
      <dt className="font-semibold" style={{ color: 'var(--ink-muted)' }}>{rotulo}</dt>
      <dd style={{ color: 'var(--ink-secondary)' }}>{valor}</dd>
    </div>
  );
}

function Selo({ texto, tom }: { texto: string; tom: 'neutro' | 'alerta' }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-bold"
      style={
        tom === 'alerta'
          ? { background: 'rgba(208,59,59,0.12)', color: 'var(--status-critical)' }
          : { background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }
      }
    >
      {texto}
    </span>
  );
}

function BotaoSecundario({
  children, onClick, disabled, title,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
    >
      {children}
    </button>
  );
}

function ItemLinha({
  indice, item, requestId, versaoAnexos, sinais, carregandoSinais,
}: {
  indice: number;
  item: RequestItem;
  requestId: string;
  versaoAnexos: number;
  sinais?: SinalChip[];
  carregandoSinais: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
          {indice + 1}. {item.description}
          {item.is_generic && (
            <span className="ml-1.5 rounded px-1.5 py-0.5 text-xs font-bold"
                  style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}>
              genérico
            </span>
          )}
        </p>

        <p className="font-mono text-xs" style={{ color: 'var(--ink-muted)' }}>
          {item.sap_code
            ? `SAP ${item.sap_code}`
            : <><Info className="mr-0.5 inline h-3.5 w-3.5" /> sem código SAP</>}
          {item.brand && ` · ${item.brand}${item.is_similar_allowed ? ' ou similar' : ''}`}
        </p>

        {sinais && sinais.length > 0 && <SinalChips chips={sinais} />}
        {!sinais && carregandoSinais && item.sap_code && (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Consultando o catálogo SAP…</p>
        )}

        {item.observation && (
          <p className="text-xs italic" style={{ color: 'var(--ink-muted)' }}>Obs: {item.observation}</p>
        )}

        {item.reference_link && (
          <a
            href={item.reference_link.startsWith('http') ? item.reference_link : `https://${item.reference_link}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
            style={{ color: 'var(--brand)' }}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Link de referência
          </a>
        )}

        <AttachmentGallery requestId={requestId} itemId={item.id} refreshKey={versaoAnexos} emptyLabel="" />
      </div>

      <div className="shrink-0 text-left sm:text-right">
        <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
          {item.quantity} {item.unit}
        </p>
        {item.estimated_value > 0 && (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            R$ {item.estimated_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        )}
      </div>
    </li>
  );
}

function Bolha({ comentario, meuId }: { comentario: RequestComment; meuId: string }) {
  const meu = comentario.user_id === meuId;

  return (
    <li className={`flex flex-col ${meu ? 'items-end' : 'items-start'}`}>
      <span className="mb-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
        {comentario.user_name || 'Usuário'} · {formatDateTimeBR(comentario.created_at)}
        {comentario.is_internal && ' · nota interna'}
      </span>
      <div
        className="max-w-[85%] rounded-xl border px-3 py-2 text-sm"
        style={
          comentario.is_internal
            ? { background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }
            : meu
              ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' }
              : { background: 'var(--surface-raised)', borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }
        }
      >
        <p className="whitespace-pre-wrap">{comentario.content}</p>
      </div>
    </li>
  );
}
