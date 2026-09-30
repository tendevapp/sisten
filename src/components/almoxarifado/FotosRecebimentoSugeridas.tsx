/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * No cadastro do item no catálogo: fotos que o próprio almoxarifado já tirou
 * desse material nas conferências de recebimento. Um toque traz a foto para o
 * formulário (o salvar comprime e sobe como qualquer outra) — não precisa
 * fotografar de novo. Some quando o material não tem foto no recebimento.
 */

import { useEffect, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import {
  fotoRecebimentoComoArquivo, listarFotosRecebimentoDoMaterial, type FotoRecebimentoMaterial,
} from '../../lib/fotosRecebimentoCatalogo';

interface Props {
  codigoSap: string;
  onEscolher: (arquivo: File) => void;
  desabilitado?: boolean;
}

export default function FotosRecebimentoSugeridas({ codigoSap, onEscolher, desabilitado }: Props) {
  const [fotos, setFotos] = useState<FotoRecebimentoMaterial[]>([]);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setFotos([]);
    listarFotosRecebimentoDoMaterial(codigoSap).then((f) => { if (ativo) setFotos(f); }).catch(() => { /* sugestão é opcional */ });
    return () => { ativo = false; };
  }, [codigoSap]);

  if (!fotos.length) return null;

  const escolher = async (foto: FotoRecebimentoMaterial) => {
    setBaixando(foto.path);
    setErro(null);
    try {
      onEscolher(await fotoRecebimentoComoArquivo(foto));
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível usar a foto.');
    } finally {
      setBaixando(null);
    }
  };

  return (
    <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--ink-secondary)' }}>
        <Camera className="h-3.5 w-3.5" /> Fotos deste material no recebimento — toque para usar
      </p>
      <div className="flex flex-wrap gap-2">
        {fotos.map((f) => (
          <button
            key={f.path}
            type="button"
            disabled={desabilitado || baixando !== null}
            onClick={() => void escolher(f)}
            title={`${f.conferencia} · ${f.data.split('-').reverse().join('/')}`}
            className="relative h-16 w-16 overflow-hidden rounded-lg border cursor-pointer hover:opacity-80 disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)' }}
          >
            <img src={f.url} alt={`Recebimento ${f.conferencia}`} className="h-full w-full object-cover" />
            {baixando === f.path && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Loader2 className="h-4 w-4 animate-spin" /></span>
            )}
          </button>
        ))}
      </div>
      {erro && <p className="mt-1 text-[11px] text-rose-600">{erro}</p>}
    </div>
  );
}
