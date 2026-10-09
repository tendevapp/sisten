import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, Mail, Send } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { localDb } from '../../db/localDb';
import type { Request, Sector } from '../../types';
import { montarEmailSolicitacao } from '../../lib/solicitacaoEmail';
import { montarMailtoComConfig, obterConfigEmail } from '../../lib/emailConfigApi';
import { cabeNoMailto } from '../../lib/expedicaoEmail';

interface Props {
  request: Request;
  sectors: Sector[];
  onClose: () => void;
}

const campo: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
};

/** Gatilho de e-mail já cadastrado para o destino natural da solicitação, quando existe. */
function chaveEmailPadrao(r: Request): string | null {
  if (r.type === 'compra' && r.tipo_compra === 'Serviço') return 'compra_servico';
  if (r.type === 'cadastro_sap') return r.registration_type === 'Fornecedor' ? 'cadastro_sap_fornecedor' : 'cadastro_sap';
  return null;
}

/**
 * Reenvia a solicitação por e-mail: monta o texto com o conteúdo dela e abre o
 * Outlook. O texto fica editável antes de enviar, e os destinatários são
 * livres, porque o motivo de reenviar costuma ser alcançar alguém novo.
 */
export default function ReenviarEmailModal({ request, sectors, onClose }: Props) {
  const toast = useToast();

  const email = useMemo(() => montarEmailSolicitacao({
    request,
    itens: localDb.getRequestItems(request.id),
    nomeSetor: (id) => (id ? sectors.find(s => s.id === id)?.name || id : '—'),
    totalAnexos: localDb.getAttachments(request.id).length,
    origem: window.location.origin,
  }), [request, sectors]);

  const [para, setPara] = useState('');
  const [copia, setCopia] = useState('');
  const [assunto, setAssunto] = useState(email.assunto);
  const [corpo, setCorpo] = useState(email.corpo);
  const [carregandoPadrao, setCarregandoPadrao] = useState(false);

  // Sugere os destinatários do gatilho cadastrado (Cadastros > E-mails), sem
  // travar: o usuário pode apagar e digitar quem quiser.
  useEffect(() => {
    const chave = chaveEmailPadrao(request);
    if (!chave) return;
    let ativo = true;
    setCarregandoPadrao(true);
    obterConfigEmail(chave)
      .then(cfg => {
        if (!ativo || !cfg) return;
        setPara(atual => atual || cfg.destinatarios || '');
        setCopia(atual => atual || cfg.copia || '');
      })
      .catch(() => { /* sem sugestão: o campo fica livre */ })
      .finally(() => { if (ativo) setCarregandoPadrao(false); });
    return () => { ativo = false; };
  }, [request]);

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
      toast.error('Informe ao menos um destinatário.');
      return;
    }
    const mailto = montarMailtoComConfig({ destinatarios: para, copia, assunto: assunto.trim(), corpo });
    if (cabeNoMailto(mailto)) {
      window.location.href = mailto;
      toast.success('Abrindo o e-mail no Outlook...');
      return;
    }
    // Mensagem longa não cabe no mailto: abre só o cabeçalho e deixa o texto copiado.
    await navigator.clipboard.writeText(corpo).catch(() => null);
    window.location.href = montarMailtoComConfig({ destinatarios: para, copia, assunto: assunto.trim(), corpo: '' });
    toast.warning('Mensagem longa: o texto foi copiado. Cole no Outlook com Ctrl+V.');
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl" ariaLabel={`Reenviar a solicitação ${request.number} por e-mail`} zIndexClassName="z-[110]">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5" style={{ color: 'var(--brand)' }} />
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>Reenviar por e-mail — #{request.number}</h3>
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              O texto abre no Outlook. Anexos não vão no e-mail: o link do SISTEN está no fim da mensagem.
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-3">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>
              Para * {carregandoPadrao && <Loader2 className="h-3 w-3 animate-spin" />}
            </label>
            <input
              value={para}
              onChange={e => setPara(e.target.value)}
              placeholder="nome@ten.ind.br; outro@ten.ind.br"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1"
              style={campo}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Cópia (opcional)</label>
            <input
              value={copia}
              onChange={e => setCopia(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1"
              style={campo}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Assunto</label>
            <input
              value={assunto}
              onChange={e => setAssunto(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1"
              style={campo}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Mensagem</label>
            <textarea
              value={corpo}
              onChange={e => setCorpo(e.target.value)}
              rows={14}
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
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold text-white cursor-pointer"
          style={{ background: 'var(--brand)' }}
        >
          <Send className="h-3.5 w-3.5" /> Abrir no Outlook
        </button>
      </ModalFooter>
    </Modal>
  );
}
