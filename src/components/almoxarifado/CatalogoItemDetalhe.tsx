/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Detalhe de um item do Cadastro de Itens: tudo o que saiu do cartão
 * compacto (texto técnico, classificação, grupo, lotes, histórico de
 * alteração) e as ações — Editar, Contar no inventário e Etiqueta.
 *
 * No celular é a folha que sobe da base (Modal do SISTEN); no desktop, caixa
 * centralizada.
 */

import { useEffect, useState } from 'react';
import { Camera, ClipboardList, Loader2, Pencil, Printer, ShieldCheck } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import {
  formatarSaldo, listarFotosAdicionais, type FotoAdicionalCatalogo, type ItemConsumivelZl0024,
} from '../../lib/almoxCatalogoApi';
import { lotesDoCatalogo } from '../../lib/almoxCatalogoLotes';
import { formatarAlteracao } from '../../lib/filtroDataAlteracao';
import { formatDateBR } from '../../lib/format';
import type { UltimaContagem } from '../../lib/inventarioUltimaContagem';
import UltimaContagemInventario from './UltimaContagemInventario';

interface Props {
  item: ItemConsumivelZl0024;
  posicao: string;
  ultima: UltimaContagem | null | undefined;
  /** Sobe depois de uma contagem feita pela tela, para reler a última. */
  versaoContagem: number;
  podeContar: boolean;
  preparandoContagem: boolean;
  onEditar: () => void;
  onContar: () => void;
  onEtiqueta: () => void;
  onZoom: (url: string) => void;
  onClose: () => void;
}

function Linha({ rotulo, children, mono }: { rotulo: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[11px]" style={{ color: 'var(--ink-muted)' }}>{rotulo}</dt>
      <dd className={`min-w-0 text-right text-xs font-semibold ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--ink-primary)' }}>
        {children}
      </dd>
    </div>
  );
}

export default function CatalogoItemDetalhe({
  item, posicao, ultima, versaoContagem, podeContar, preparandoContagem, onEditar, onContar, onEtiqueta, onZoom, onClose,
}: Props) {
  const cat = item.item_catalogo;
  const [adicionais, setAdicionais] = useState<FotoAdicionalCatalogo[]>([]);

  useEffect(() => {
    if (!cat?.id) return;
    let ativo = true;
    listarFotosAdicionais(cat.id)
      .then((fotos) => { if (ativo) setAdicionais(fotos); })
      .catch(() => { /* o detalhe segue sem as adicionais */ });
    return () => { ativo = false; };
  }, [cat?.id]);

  const lotes = lotesDoCatalogo(cat).filter((l) => l.lote || l.validade);
  const minimo = cat?.estoque_minimo;

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel={`Detalhes do item ${item.codigo_sap}`}>
      <ModalHeader onClose={onClose}>
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
          <span className="font-mono" style={{ color: 'var(--ink-secondary)' }}>{item.codigo_sap}</span>
          {item.origem_foto === 'book_epi' && item.tem_foto && (
            <span className="inline-flex items-center gap-0.5 text-blue-700 dark:text-blue-300">
              <ShieldCheck className="h-3 w-3" /> Book EPI{item.ca_epi ? ` · CA ${item.ca_epi}` : ''}
            </span>
          )}
        </p>
        <h2 className="text-sm font-extrabold leading-snug sm:text-base" style={{ color: 'var(--ink-primary)' }}>
          {item.descricao || '—'}
        </h2>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {item.url_foto ? (
          <button
            type="button"
            onClick={() => onZoom(item.url_foto!)}
            className="block aspect-[4/3] w-full overflow-hidden rounded-xl border cursor-zoom-in"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
            aria-label="Ampliar foto"
          >
            <img src={item.url_foto} alt={item.descricao} className="h-full w-full object-contain p-2" decoding="async" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onEditar}
            className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed cursor-pointer"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}
          >
            <Camera className="h-8 w-8 stroke-1" />
            <span className="text-xs font-bold" style={{ color: 'var(--brand)' }}>Tirar foto do item</span>
          </button>
        )}

        {adicionais.some((f) => f.url) && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {adicionais.filter((f) => f.url).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onZoom(f.url!)}
                className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border cursor-zoom-in"
                style={{ borderColor: 'var(--hairline)' }}
                aria-label="Ampliar foto adicional"
              >
                <img src={f.url!} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end justify-between gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
          <div>
            <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Saldo ZL0024</p>
            <p className="text-xl font-black tabular-nums" style={{ color: 'var(--ink-primary)' }}>
              {formatarSaldo(item.saldo_total)} <span className="text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>{item.umb}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Posição</p>
            <p className="font-mono text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{posicao || '—'}</p>
          </div>
        </div>

        <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--hairline)' }}>
          <UltimaContagemInventario material={item.codigo_sap} ultima={ultima} versao={versaoContagem} />
        </div>

        {item.texto_tecnico && (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>{item.texto_tecnico}</p>
        )}

        <dl className="divide-y divide-[var(--hairline)]">
          <Linha rotulo="Depósitos" mono>{item.depositos.join(', ') || '—'}</Linha>
          {minimo !== null && minimo !== undefined && (
            <Linha rotulo="Estoque mínimo" mono>{Number(minimo).toLocaleString('pt-BR')} {item.umb}</Linha>
          )}
          <Linha rotulo="Classificação">
            {item.classificacao_nivel1}{item.classificacao_nivel2 ? ` · ${item.classificacao_nivel2}` : ''}
          </Linha>
          <Linha rotulo="Grupo SAP">
            {item.grp_mercad ? `${item.grp_mercad} - ${item.grupo_mercadorias}` : item.grupo_mercadorias || '—'}
          </Linha>
          {cat?.etiqueta_aplicacao && <Linha rotulo="Aplicação">{cat.etiqueta_aplicacao}</Linha>}
          {lotes.map((l, i) => (
            <Linha key={`${l.lote}-${l.validade}-${i}`} rotulo={lotes.length > 1 ? `Lote ${i + 1}` : 'Lote'}>
              {l.lote || 'sem lote'}{l.validade ? ` · validade ${formatDateBR(l.validade)}` : ''}
            </Linha>
          ))}
          {cat?.codigo_registro && <Linha rotulo="Registro" mono>{cat.codigo_registro}</Linha>}
          {cat?.updated_at && (
            <Linha rotulo="Alterado em">
              {formatarAlteracao(cat.updated_at)}{cat.atualizado_por_nome ? ` · ${cat.atualizado_por_nome}` : ''}
            </Linha>
          )}
          <Linha rotulo="Etiqueta">
            {cat?.etiqueta_impressa_em ? `impressa em ${formatDateBR(cat.etiqueta_impressa_em)}` : 'não impressa'}
          </Linha>
        </dl>

        {cat?.observacao && (
          <p className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            {cat.observacao}
          </p>
        )}
      </ModalBody>

      <ModalFooter>
        <div className="flex w-full items-center gap-2">
          <button
            type="button"
            onClick={onEtiqueta}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold cursor-pointer"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
            title="Gerar a etiqueta de prateleira deste item"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Etiqueta</span>
          </button>
          {podeContar && (
            <button
              type="button"
              onClick={onContar}
              disabled={preparandoContagem}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold cursor-pointer disabled:opacity-60"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
            >
              {preparandoContagem ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              Contar
            </button>
          )}
          <button
            type="button"
            onClick={onEditar}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-bold text-white cursor-pointer hover:bg-amber-700"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
