/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cartão compacto do Cadastro de Itens: foto quadrada, código, descrição,
 * posição e a última contagem do inventário. Um por linha no celular, com
 * foto baixa para caberem dois por tela.
 *
 * Tocar no cartão abre o detalhe (com Editar); o rodapé tem os atalhos que
 * a rotina do mutirão de cadastro pede sem abrir nada: editar e contar.
 * O texto técnico fica só no detalhe.
 */

import { memo } from 'react';
import { Camera, ClipboardList, Loader2, MapPin, Pencil, ShieldCheck } from 'lucide-react';
import { formatarSaldo, type ItemConsumivelZl0024 } from '../../lib/almoxCatalogoApi';
import { resumoUltimaContagem, type UltimaContagem } from '../../lib/inventarioUltimaContagem';

const COR_CONTAGEM: Record<UltimaContagem['status'], string> = {
  conferido: 'var(--status-good)',
  divergente: 'var(--status-critical)',
  aguardando_decisao: 'var(--status-serious)',
  pendente: 'var(--ink-secondary)',
};

interface Props {
  item: ItemConsumivelZl0024;
  posicao: string;
  ultima: UltimaContagem | null | undefined;
  hoje: string;
  marcado: boolean;
  podeContar: boolean;
  preparandoContagem: boolean;
  onAbrir: (item: ItemConsumivelZl0024) => void;
  onEditar: (item: ItemConsumivelZl0024) => void;
  onContar: (item: ItemConsumivelZl0024) => void;
  onMarcar: (codigo: string) => void;
}

function CatalogoItemTile({
  item, posicao, ultima, hoje, marcado, podeContar, preparandoContagem, onAbrir, onEditar, onContar, onMarcar,
}: Props) {
  const bookEpi = item.tem_foto && item.origem_foto === 'book_epi';

  return (
    <article
      className="relative flex flex-col overflow-hidden rounded-xl border"
      style={{
        borderColor: marcado ? 'var(--brand)' : 'var(--hairline)',
        background: 'var(--surface-card)',
      }}
    >
      <button
        type="button"
        onClick={() => onAbrir(item)}
        className="flex flex-1 flex-col text-left cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]"
        aria-label={`Ver detalhes de ${item.codigo_sap} ${item.descricao}`}
      >
        <div className="relative h-32 sm:h-auto sm:aspect-square w-full border-b" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
          {item.url_foto ? (
            <img
              src={item.url_foto}
              alt=""
              className="h-full w-full object-contain p-1.5"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1" style={{ color: 'var(--ink-muted)' }}>
              <Camera className="h-6 w-6 stroke-[1.5]" />
              <span className="text-[10px] font-bold">Sem foto</span>
            </span>
          )}
          <span
            className="absolute bottom-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
            style={{ background: 'rgb(15 23 42 / 0.78)' }}
          >
            {formatarSaldo(item.saldo_total)} {item.umb}
          </span>
          {bookEpi && (
            <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-md bg-blue-600 px-1 py-0.5 text-[9px] font-bold text-white">
              <ShieldCheck className="h-2.5 w-2.5" /> EPI
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 px-3 py-2 sm:p-2">
          <span className="font-mono text-xs sm:text-[11px] font-bold" style={{ color: 'var(--ink-secondary)' }}>{item.codigo_sap}</span>
          <h4 className="line-clamp-2 text-sm sm:text-xs font-bold leading-snug" style={{ color: 'var(--ink-primary)' }}>
            {item.descricao || '—'}
          </h4>
          <div className="mt-auto space-y-0.5 pt-0.5">
            {posicao && (
              <p className="flex items-center gap-1 truncate font-mono text-[10px]" style={{ color: 'var(--ink-muted)' }} title={posicao}>
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{posicao}</span>
              </p>
            )}
            {ultima !== undefined && (
              <p className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: ultima ? COR_CONTAGEM[ultima.status] : 'var(--ink-muted)' }}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'currentColor', opacity: ultima ? 1 : 0.5 }} />
                <span className="truncate">{ultima ? resumoUltimaContagem(ultima, hoje) : 'Nunca contado'}</span>
              </p>
            )}
          </div>
        </div>
      </button>

      {/* Fora do botão do cartão: controle dentro de controle não é válido. */}
      <label
        className="absolute left-0 top-0 flex h-10 w-10 cursor-pointer items-start justify-start p-1.5"
        title="Marcar para imprimir etiqueta"
      >
        <input
          type="checkbox"
          checked={marcado}
          onChange={() => onMarcar(item.codigo_sap)}
          aria-label={`Marcar ${item.codigo_sap} para imprimir etiqueta`}
          className="h-4 w-4 cursor-pointer accent-amber-600"
        />
      </label>

      <div className={`grid border-t ${podeContar ? 'grid-cols-2' : 'grid-cols-1'}`} style={{ borderColor: 'var(--hairline)' }}>
        <button
          type="button"
          onClick={() => onEditar(item)}
          className="inline-flex min-h-10 items-center justify-center gap-1 text-[11px] font-bold cursor-pointer hover:bg-[var(--surface-sunken)]"
          style={{ color: item.tem_foto ? 'var(--ink-primary)' : 'var(--brand)' }}
        >
          {item.tem_foto ? <Pencil className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
          {item.tem_foto ? 'Editar' : 'Foto'}
        </button>
        {podeContar && (
          <button
            type="button"
            onClick={() => onContar(item)}
            disabled={preparandoContagem}
            className="inline-flex min-h-10 items-center justify-center gap-1 border-l text-[11px] font-bold cursor-pointer hover:bg-[var(--surface-sunken)] disabled:opacity-60"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
            title="Contar este item no Inventário Cíclico"
          >
            {preparandoContagem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
            Contar
          </button>
        )}
      </div>
    </article>
  );
}

export default memo(CatalogoItemTile);
