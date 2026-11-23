/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Retorno ao solicitante ao finalizar um Cadastro SAP ou uma solicitação de
 * Serviço: abre o Outlook endereçado ao e-mail de quem abriu, com o aviso de
 * conclusão e o conteúdo da solicitação. Tudo editável antes de enviar.
 */

import React, { useId, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Loader2, Send } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { localDb } from '../../db/localDb';
import type { Profile, Request } from '../../types';
import { montarEmailConclusao } from '../../lib/solicitacaoEmail';
import { montarMailtoComConfig } from '../../lib/emailConfigApi';
import { cabeNoMailto } from '../../lib/expedicaoEmail';

/** Início do comentário público gravado quando o serviço é finalizado por aqui. */
export const MARCA_SERVICO_FINALIZADO = 'Atendimento do serviço finalizado';

interface Props {
  request: Request;
  user: Profile;
  /** Nota de resolução já escrita (Cadastro SAP); vira o "O que foi feito". */
  conclusaoInicial?: string;
  codigoSap?: string | null;
  /**
   * Grava a conclusão como comentário público antes de abrir o e-mail. Usado no
   * Serviço, que não tem passo de fechamento próprio (o status segue o SAP).
   * No Cadastro SAP o fechamento já gravou o comentário.
   */
  registrarConclusao?: boolean;
  onClose: () => void;
  onConcluido?: () => void;
}

const campo: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
};

/** E-mail real do solicitante; contas sem e-mail (login @sisten.local) não servem. */
function emailDoSolicitante(r: Request): string {
  const perfil = localDb.getProfiles().find(p => p.id === r.solicitante_id);
  if (!perfil || perfil.login_sem_email) return '';
  const email = (perfil.email || '').trim();
  return email && !email.toLowerCase().endsWith('@sisten.local') ? email : '';
}

export default function AvisarConclusaoModal({
  request, user, conclusaoInicial = '', codigoSap, registrarConclusao = false, onClose, onConcluido,
}: Props) {
  const toast = useToast();
  const idPara = useId();
  const idCopia = useId();
  const idAssunto = useId();
  const idConclusao = useId();
  const idCorpo = useId();

  const itens = useMemo(() => localDb.getRequestItems(request.id), [request.id]);
  const emailSolicitante = useMemo(() => emailDoSolicitante(request), [request]);

  const [para, setPara] = useState(emailSolicitante);
  const [copia, setCopia] = useState('');
  const [conclusao, setConclusao] = useState(conclusaoInicial);
  // O corpo acompanha o "O que foi feito" até o usuário mexer nele direto.
  const [corpoEditado, setCorpoEditado] = useState<string | null>(null);
  const [assuntoEditado, setAssuntoEditado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const gerado = useMemo(() => montarEmailConclusao({
    request,
    itens,
    conclusao,
    codigoSap,
    atendente: user.name,
    origem: window.location.origin,
  }), [request, itens, conclusao, codigoSap, user.name]);

  const assunto = assuntoEditado ?? gerado.assunto;
  const corpo = corpoEditado ?? gerado.corpo;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(corpo);
      toast.success('Texto copiado.');
    } catch {
      toast.error('Não foi possível copiar o texto automaticamente.');
    }
  };

  const abrirOutlook = async () => {
    if (!para.trim()) {
      toast.error('Informe o e-mail do solicitante.');
      return;
    }
    if (registrarConclusao && !conclusao.trim()) {
      toast.error('Descreva o que foi feito para finalizar.');
      return;
    }

    if (registrarConclusao) {
      setSalvando(true);
      try {
        await localDb.addComment(request.id, user.id, `${MARCA_SERVICO_FINALIZADO}: ${conclusao.trim()}`, 'public');
      } catch (err) {
        console.error('Falha ao registrar a conclusão do serviço.', err);
        toast.error('Não foi possível registrar a conclusão. Tente novamente.');
        setSalvando(false);
        return;
      }
      setSalvando(false);
    }

    const mailto = montarMailtoComConfig({ destinatarios: para, copia, assunto: assunto.trim(), corpo });
    if (cabeNoMailto(mailto)) {
      window.location.href = mailto;
      toast.success('Abrindo o e-mail para o solicitante no Outlook...');
    } else {
      // Mensagem longa não cabe no mailto: abre só o cabeçalho e deixa o texto copiado.
      await navigator.clipboard.writeText(corpo).catch(() => null);
      window.location.href = montarMailtoComConfig({ destinatarios: para, copia, assunto: assunto.trim(), corpo: '' });
      toast.warning('Mensagem longa: o texto foi copiado. Cole no Outlook com Ctrl+V.');
    }
    onConcluido?.();
    onClose();
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl" ariaLabel={`Avisar o solicitante da #${request.number}`} zIndexClassName="z-[110]">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              Avisar o solicitante — #{request.number}
            </h3>
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              Abre o Outlook para {request.solicitante_name || 'o solicitante'} informando que a solicitação foi finalizada.
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-3">
          {!emailSolicitante && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              O solicitante não tem e-mail cadastrado no SISTEN. Digite o endereço para quem enviar o aviso.
            </p>
          )}
          <div>
            <label htmlFor={idPara} className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Para *</label>
            <input
              id={idPara}
              value={para}
              onChange={e => setPara(e.target.value)}
              placeholder="nome@ten.ind.br"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1"
              style={campo}
            />
          </div>
          <div>
            <label htmlFor={idCopia} className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Cópia (opcional)</label>
            <input
              id={idCopia}
              value={copia}
              onChange={e => setCopia(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1"
              style={campo}
            />
          </div>
          <div>
            <label htmlFor={idConclusao} className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>
              O que foi feito {registrarConclusao && '*'}
            </label>
            <textarea
              id={idConclusao}
              value={conclusao}
              onChange={e => { setConclusao(e.target.value); setCorpoEditado(null); }}
              rows={3}
              placeholder="Ex.: Serviço contratado com o prestador X, pedido 4500012345. Início em 01/12."
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1"
              style={campo}
            />
            {registrarConclusao && (
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                Fica registrado na conversa da solicitação, visível ao solicitante.
              </p>
            )}
          </div>
          <div>
            <label htmlFor={idAssunto} className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Assunto</label>
            <input
              id={idAssunto}
              value={assunto}
              onChange={e => setAssuntoEditado(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1"
              style={campo}
            />
          </div>
          <div>
            <label htmlFor={idCorpo} className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Mensagem</label>
            <textarea
              id={idCorpo}
              value={corpo}
              onChange={e => setCorpoEditado(e.target.value)}
              rows={12}
              className="w-full rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed focus:outline-2 focus:outline-offset-1"
              style={campo}
            />
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={copiar}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        >
          <Copy className="h-3.5 w-3.5" /> Copiar texto
        </button>
        <button
          type="button"
          onClick={abrirOutlook}
          disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white cursor-pointer hover:bg-emerald-800 disabled:opacity-60"
        >
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {registrarConclusao ? 'Finalizar e abrir no Outlook' : 'Abrir no Outlook'}
        </button>
      </ModalFooter>
    </Modal>
  );
}
