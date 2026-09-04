/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal de cobranca de PO para fornecedores na Central de Compras (filtro Sem MIGO).
 * Permite revisar destinatarios (busca automatica ou preenchimento livre), assunto,
 * e texto cordial gerado com conteudo do PO e datas de entrega.
 * Oferece copia direta para area de transferencia e disparo para o Outlook via mailto.
 */

import React, { useMemo, useState } from 'react';
import { Mail, Copy, ExternalLink, Check, AlertCircle, Calendar, Package } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { formatDateBR } from '../../lib/format';
import { montarMailtoComConfig } from '../../lib/emailConfigApi';
import { cabeNoMailto } from '../../lib/expedicaoEmail';
import {
  montarAssuntoCobrancaPo,
  montarCorpoCobrancaPo,
  obterEmailsFornecedor,
  LinhaItemCobrancaPo,
} from '../../lib/cobrancaPoEmail';
import type { ContatoFornecedor, EnrichedSAPRecord, ItemDiligenciamento, Profile } from '../../types';

interface CobrancaPoModalProps {
  docCompra: string;
  fornecedorNome: string;
  fornecedorCode: string;
  itensPo: ItemDiligenciamento[];
  registrosPo: EnrichedSAPRecord[];
  contatos: ContatoFornecedor[];
  user: Profile;
  onClose: () => void;
}

const campoEstilo: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
  outlineColor: 'var(--brand)',
};

export default function CobrancaPoModal({
  docCompra,
  fornecedorNome,
  fornecedorCode,
  itensPo,
  registrosPo,
  contatos,
  user,
  onClose,
}: CobrancaPoModalProps) {
  const toast = useToast();
  const [copiado, setCopiado] = useState(false);

  // Busca e-mails do fornecedor; se nao encontrar, inicia vazio
  const emailsIniciais = useMemo(() => {
    return obterEmailsFornecedor(fornecedorCode, fornecedorNome, contatos);
  }, [fornecedorCode, fornecedorNome, contatos]);

  const [destinatarios, setDestinatarios] = useState(emailsIniciais);
  const [assunto, setAssunto] = useState(() => montarAssuntoCobrancaPo(docCompra));

  // Menor previsao efetiva/remessa para destaque geral
  const dataPrevisaoGeral = useMemo(() => {
    const datas = itensPo
      .map(i => i.previsaoEfetiva || i.dataRemessa)
      .filter((d): d is string => !!d)
      .sort();
    return datas[0] || undefined;
  }, [itensPo]);

  // Data do pedido (primeira encontrada no PO)
  const dataPedidoGeral = useMemo(() => {
    const regComData = registrosPo.find(r => !!r.data_pedido);
    return regComData?.data_pedido || undefined;
  }, [registrosPo]);

  // Monta lista estruturada de itens para o corpo
  const linhasItens: LinhaItemCobrancaPo[] = useMemo(() => {
    return itensPo.map(item => {
      const reg = registrosPo.find(r => r.ri === item.ri);
      const rm = reg?.requisicao_de_compra
        ? `${reg.requisicao_de_compra}${reg.item_reqc ? ` / ${reg.item_reqc}` : ''}`
        : undefined;

      return {
        material: item.material,
        descricao: item.descricao,
        quantidade: item.quantidade ?? null,
        unidade: item.unidade || null,
        previsao: item.previsaoEfetiva || item.dataRemessa || null,
        rm,
      };
    });
  }, [itensPo, registrosPo]);

  // Corpo inicial formatado com cortesia
  const [corpo, setCorpo] = useState(() => {
    return montarCorpoCobrancaPo({
      fornecedorNome,
      docCompra,
      dataPedido: dataPedidoGeral,
      previsaoGeral: dataPrevisaoGeral,
      itens: linhasItens,
      solicitanteNome: user.name,
    });
  });

  const handleCopiarConteudo = async () => {
    try {
      await navigator.clipboard.writeText(corpo);
      setCopiado(true);
      toast.success('Conteúdo do e-mail copiado com sucesso!');
      setTimeout(() => setCopiado(false), 2500);
    } catch (err) {
      console.error('Falha ao copiar conteudo:', err);
      toast.error('Não foi possível copiar o conteúdo automaticamente.');
    }
  };

  const handleEnviarOutlook = async () => {
    try {
      const mailto = montarMailtoComConfig({
        destinatarios: destinatarios.trim(),
        assunto: assunto.trim(),
        corpo,
      });

      if (cabeNoMailto(mailto)) {
        window.location.href = mailto;
        toast.success('Abrindo cliente de e-mail...');
      } else {
        // Se exceder o limite seguro do mailto no Windows, copia o corpo e abre com cabecalho
        await navigator.clipboard.writeText(corpo).catch(() => null);
        const mailtoResumido = montarMailtoComConfig({
          destinatarios: destinatarios.trim(),
          assunto: assunto.trim(),
          corpo: '',
        });
        window.location.href = mailtoResumido;
        toast.warning(
          'Mensagem longa para abertura direta: o texto foi copiado para a área de transferência. Cole no Outlook com Ctrl+V.',
        );
      }
    } catch (err) {
      console.error('Falha ao acionar envio Outlook:', err);
      toast.error('Erro ao gerar link de e-mail.');
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel={`Cobrança do PO ${docCompra}`}>
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: 'color-mix(in srgb, var(--brand) 15%, transparent)', color: 'var(--brand)' }}
          >
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              Cobrar Fornecedor — PO {docCompra}
            </h3>
            <p className="text-xs truncate max-w-xl" style={{ color: 'var(--ink-muted)' }}>
              {fornecedorNome} {fornecedorCode ? `(${fornecedorCode})` : ''}
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-3.5">
        {/* Chips de resumo do pedido */}
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-xs"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
        >
          <div className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--ink-secondary)' }}>
            <Package className="h-3.5 w-3.5" style={{ color: 'var(--brand)' }} />
            <span>{itensPo.length} {itensPo.length === 1 ? 'item' : 'itens'} no pedido</span>
          </div>

          <span style={{ color: 'var(--hairline)' }}>•</span>

          <div className="inline-flex items-center gap-1" style={{ color: 'var(--ink-secondary)' }}>
            <Calendar className="h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} />
            <span>Previsão: <strong>{dataPrevisaoGeral ? formatDateBR(dataPrevisaoGeral) : 'A confirmar'}</strong></span>
          </div>

          {dataPedidoGeral && (
            <>
              <span style={{ color: 'var(--hairline)' }}>•</span>
              <span style={{ color: 'var(--ink-muted)' }}>Pedido emitido em {formatDateBR(dataPedidoGeral)}</span>
            </>
          )}
        </div>

        {/* Destinatarios */}
        <div>
          <label className="flex items-center justify-between text-xs font-semibold mb-1" style={{ color: 'var(--ink-secondary)' }}>
            <span>Para (E-mails do fornecedor)</span>
            {!destinatarios.trim() && (
              <span className="inline-flex items-center gap-1 text-[11px] font-normal" style={{ color: 'var(--status-warning)' }}>
                <AlertCircle className="h-3 w-3" /> E-mail não localizado (preencha manualmente)
              </span>
            )}
          </label>
          <input
            type="text"
            value={destinatarios}
            onChange={e => setDestinatarios(e.target.value)}
            placeholder="Digite os e-mails separados por ponto e vírgula (;)"
            className="w-full rounded-lg border px-3 py-2 text-xs font-medium"
            style={campoEstilo}
          />
        </div>

        {/* Assunto */}
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--ink-secondary)' }}>
            Assunto / Título
          </label>
          <input
            type="text"
            value={assunto}
            onChange={e => setAssunto(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-xs font-semibold"
            style={campoEstilo}
          />
        </div>

        {/* Corpo do e-mail */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
              Mensagem (Corpo do e-mail)
            </label>
            <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              Você pode revisar ou ajustar o texto antes de copiar ou enviar
            </span>
          </div>
          <textarea
            rows={12}
            value={corpo}
            onChange={e => setCorpo(e.target.value)}
            className="w-full rounded-lg border p-3 font-sans text-xs leading-relaxed"
            style={{
              ...campoEstilo,
              resize: 'vertical',
            }}
          />
        </div>
      </ModalBody>

      <ModalFooter>
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-xs font-bold cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            style={{ color: 'var(--ink-muted)' }}
          >
            Fechar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopiarConteudo}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-bold cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)', background: 'var(--surface-card)' }}
            >
              {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copiado ? 'Copiado!' : 'Copiar conteúdo'}
            </button>

            <button
              type="button"
              onClick={handleEnviarOutlook}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white cursor-pointer transition-all hover:opacity-95 shadow-sm"
              style={{ background: 'var(--brand)' }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Enviar via Outlook
            </button>
          </div>
        </div>
      </ModalFooter>
    </Modal>
  );
}
