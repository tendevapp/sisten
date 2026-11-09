/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Central de Compras › M Livre — o que vem depois da compra, por item:
 * o código do fornecedor SAP da loja (colado na coluna Mercado Livre, põe o
 * item em "Aguardando PO") e a NF que a loja mandou (PDF ou imagem colada),
 * para o comprador ver ou baixar.
 */

import { useEffect, useId, useState } from 'react';
import { Check, Download, Eye, FilePlus2, FileText, Loader2, Pencil, Receipt, Trash2, X } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import PdfPaginasCanvas, { navegadorSemPdfEmbutido } from '../ui/PdfPaginasCanvas';
import { useLightbox } from '../ui/Lightbox';
import { confirmar } from '../../lib/confirmar';
import { normalizarCodigoFornecedorSap, type ItemMercadoLivre, type NotaFiscalMl } from '../../lib/compraMercadoLivre';
import {
  anexarNotaFiscalMl, removerNotaFiscalMl, TAMANHO_MAXIMO_NF_ML, urlNotaFiscalMl,
} from '../../lib/compraMercadoLivreApi';

interface Usuario { id: string; nome: string }

const dataHoraBR = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const tamanho = (bytes: number | null | undefined): string => {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
};

const ehPdf = (n: Pick<NotaFiscalMl, 'mime_type' | 'nome'>) => n.mime_type === 'application/pdf' || /\.pdf$/i.test(n.nome);

/* ------------------------------------------------------------------ */
/* Fornecedor cadastrado                                               */
/* ------------------------------------------------------------------ */

interface CampoFornecedorProps {
  item: ItemMercadoLivre;
  /** `codigo` null apaga. Resolve quando gravou (status incluído). */
  onSalvar: (codigo: string | null) => Promise<void>;
}

/**
 * Campo da coluna Mercado Livre: cola o código do fornecedor e grava com
 * Enter ou ✓. Gravado, vira um selo com o código, que pode ser trocado.
 */
export function CampoFornecedorMl({ item, onSalvar }: CampoFornecedorProps) {
  const id = useId();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const atual = item.fornecedor_codigo ?? null;
  const codigo = normalizarCodigoFornecedorSap(texto);
  const invalido = texto.trim() !== '' && !codigo;

  const gravar = async (valor: string | null) => {
    setSalvando(true);
    try {
      await onSalvar(valor);
      setEditando(false);
      setTexto('');
    } catch {
      // A tela já avisou o erro; o campo fica aberto com o que foi colado.
    } finally {
      setSalvando(false);
    }
  };

  if (atual && !editando) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <span
          className="inline-flex items-center gap-1 rounded border border-lime-300 bg-lime-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-lime-800 dark:border-lime-700 dark:bg-lime-900/30 dark:text-lime-300"
          title={`Fornecedor SAP${item.fornecedor_registrado_por_nome ? ` — gravado por ${item.fornecedor_registrado_por_nome}` : ''}${item.fornecedor_registrado_em ? ` em ${dataHoraBR(item.fornecedor_registrado_em)}` : ''}`}
        >
          Forn. {atual}
        </span>
        <button
          type="button"
          onClick={() => { setTexto(atual); setEditando(true); }}
          aria-label="Trocar o fornecedor"
          className="alvo-livre rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (codigo && !salvando) gravar(codigo); }}
      className="flex flex-col gap-0.5"
    >
      <label htmlFor={id} className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Nº do fornecedor
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={texto}
          disabled={salvando}
          autoFocus={editando}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape' && editando) { e.preventDefault(); setEditando(false); } }}
          placeholder="Colar código SAP"
          aria-invalid={invalido || undefined}
          className={`w-[120px] rounded-md border bg-white px-1.5 py-1 font-mono text-[11px] text-slate-800 focus:outline-none dark:bg-slate-900 dark:text-slate-200 ${invalido ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-[#0056c6] dark:border-slate-700'}`}
        />
        <button
          type="submit"
          disabled={!codigo || salvando}
          aria-label="Gravar o fornecedor"
          className="alvo-livre rounded-md border border-lime-400 bg-lime-100 p-1 text-lime-800 hover:bg-lime-200 disabled:opacity-40 dark:border-lime-700 dark:bg-lime-900/40 dark:text-lime-300 cursor-pointer"
        >
          {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </button>
        {editando && (
          <>
            <button
              type="button"
              disabled={salvando}
              onClick={async () => {
                const ok = await confirmar({
                  titulo: 'Apagar o fornecedor?',
                  mensagem: `O item deixa o "Aguardando PO" e volta a "Comprado".`,
                  confirmarLabel: 'Apagar',
                  variante: 'perigo',
                });
                if (ok) gravar(null);
              }}
              aria-label="Apagar o fornecedor"
              className="alvo-livre rounded-md p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:text-rose-400 dark:hover:bg-rose-950/30 cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={salvando}
              onClick={() => setEditando(false)}
              aria-label="Cancelar a troca do fornecedor"
              className="alvo-livre rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
      {invalido && <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">Código do fornecedor tem de 4 a 10 dígitos.</span>}
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Notas fiscais                                                       */
/* ------------------------------------------------------------------ */

/** Botão da coluna Mercado Livre que abre as NFs do item, com a contagem. */
export function BotaoNotasFiscaisMl({ item, onAbrir }: { item: ItemMercadoLivre; onAbrir: () => void }) {
  const n = item.notas_fiscais?.length ?? 0;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold cursor-pointer ${n > 0
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
        : 'border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'}`}
    >
      <Receipt className="h-3 w-3" />
      {n > 0 ? `NF (${n})` : 'Anexar NF'}
    </button>
  );
}

interface NotasModalProps {
  item: ItemMercadoLivre;
  /** "RM 1234 / Item 10 — CABO FLEXÍVEL". */
  titulo: string;
  usuario: Usuario;
  /** Lista mudou (anexou ou removeu) — a tela recarrega os itens do ML. */
  onAlterado: () => void;
  onClose: () => void;
}

export function NotasFiscaisMlModal({ item, titulo, usuario, onAlterado, onClose }: NotasModalProps) {
  const lb = useLightbox();
  const inputId = useId();
  const [notas, setNotas] = useState<NotaFiscalMl[]>(item.notas_fiscais ?? []);
  const [enviando, setEnviando] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pdfAberto, setPdfAberto] = useState<NotaFiscalMl | null>(null);

  const receber = async (arquivos: File[]) => {
    const validos = arquivos.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name) || f.type.startsWith('image/'));
    if (validos.length === 0) { setErro('Envie a NF em PDF ou como imagem.'); return; }
    const grandes = validos.filter(f => f.size > TAMANHO_MAXIMO_NF_ML);
    if (grandes.length) { setErro('A NF deve ter até 10 MB.'); return; }
    setErro(null);
    setEnviando(n => n + validos.length);
    let alterou = false;
    for (const f of validos) {
      try {
        setNotas(await anexarNotaFiscalMl(item.ri, f, usuario));
        alterou = true;
      } catch (e: any) {
        setErro(e?.message || 'Falha ao enviar a NF.');
      } finally {
        setEnviando(n => n - 1);
      }
    }
    if (alterou) onAlterado();
  };

  const ver = async (n: NotaFiscalMl) => {
    if (ehPdf(n)) { setPdfAberto(n); return; }
    setOcupado(n.path);
    try {
      lb.abrir([{ url: await urlNotaFiscalMl(n.path), legenda: n.nome }], 0);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível abrir a NF.');
    } finally {
      setOcupado(null);
    }
  };

  const baixar = async (n: NotaFiscalMl) => {
    setOcupado(n.path);
    try {
      const a = document.createElement('a');
      a.href = await urlNotaFiscalMl(n.path, n.nome);
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível baixar a NF.');
    } finally {
      setOcupado(null);
    }
  };

  const remover = async (n: NotaFiscalMl) => {
    const ok = await confirmar({
      titulo: 'Remover a NF?',
      mensagem: `"${n.nome}" sai do item e o arquivo é apagado.`,
      confirmarLabel: 'Remover',
      variante: 'perigo',
    });
    if (!ok) return;
    setOcupado(n.path);
    try {
      setNotas(await removerNotaFiscalMl(item.ri, n.path, usuario));
      onAlterado();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível remover a NF.');
    } finally {
      setOcupado(null);
    }
  };

  const fechar = enviando > 0 ? () => {} : onClose;

  return (
    <Modal onClose={fechar} maxWidth="max-w-lg" ariaLabel="Notas fiscais do item do Mercado Livre">
      <ModalHeader onClose={fechar}>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Notas fiscais do item</h3>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={titulo}>{titulo}</p>
        </div>
      </ModalHeader>
      <div
        className="flex min-h-0 flex-1 flex-col"
        onPaste={e => {
          const arquivos = Array.from(e.clipboardData.files);
          if (arquivos.length) { e.preventDefault(); receber(arquivos); }
        }}
      >
        <ModalBody className="space-y-3">
          <label
            htmlFor={inputId}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); receber(Array.from(e.dataTransfer.files)); }}
            className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-yellow-400 bg-yellow-50/60 px-4 py-5 text-center hover:bg-yellow-50 dark:bg-yellow-900/10 dark:hover:bg-yellow-900/20"
          >
            {enviando > 0 ? <Loader2 className="h-6 w-6 animate-spin text-slate-600" /> : <FilePlus2 className="h-6 w-6 text-slate-600 dark:text-slate-300" />}
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {enviando > 0 ? 'Enviando NF…' : 'Selecionar PDF ou imagem da NF'}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Ou cole a imagem com Ctrl+V. Até 10 MB por arquivo.</span>
            <input
              id={inputId}
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="sr-only"
              disabled={enviando > 0}
              onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) receber(fs); }}
            />
          </label>

          {erro && <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">{erro}</p>}

          {notas.length === 0 ? (
            <p className="py-2 text-center text-xs text-slate-500 dark:text-slate-400">Nenhuma NF anexada a este item.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {notas.map(n => (
                <li key={n.path} className="flex items-center gap-2 px-3 py-2">
                  <FileText className={`h-5 w-5 shrink-0 ${ehPdf(n) ? 'text-rose-600 dark:text-rose-400' : 'text-sky-600 dark:text-sky-400'}`} />
                  <button type="button" onClick={() => ver(n)} className="min-w-0 flex-1 text-left cursor-pointer">
                    <span className="block truncate text-xs font-bold text-slate-800 hover:underline dark:text-slate-100" title={n.nome}>{n.nome}</span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                      {[ehPdf(n) ? 'PDF' : 'Imagem', tamanho(n.tamanho_bytes), n.enviado_por_nome, dataHoraBR(n.enviado_em)].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  {ocupado === n.path ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  ) : (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button type="button" onClick={() => ver(n)} aria-label={`Ver ${n.nome}`} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => baixar(n)} aria-label={`Baixar ${n.nome}`} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer">
                        <Download className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => remover(n)} aria-label={`Remover ${n.nome}`} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 cursor-pointer">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            disabled={enviando > 0}
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
          >
            Fechar
          </button>
        </ModalFooter>
      </div>
      {pdfAberto && <VisualizadorNfPdf nota={pdfAberto} onBaixar={() => baixar(pdfAberto)} onClose={() => setPdfAberto(null)} />}
      {lb.elemento}
    </Modal>
  );
}

/** PDF da NF dentro do app: iframe no computador, páginas em canvas no celular. */
function VisualizadorNfPdf({ nota, onBaixar, onClose }: { nota: NotaFiscalMl; onBaixar: () => void; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const semEmbutido = navegadorSemPdfEmbutido();

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const assinada = await urlNotaFiscalMl(nota.path);
        if (semEmbutido) {
          const resp = await fetch(assinada);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const b = new Uint8Array(await resp.arrayBuffer());
          if (ativo) setBytes(b);
        } else if (ativo) {
          setUrl(assinada);
        }
      } catch (e: any) {
        if (ativo) setErro(e?.message || 'Não foi possível abrir a NF.');
      }
    })();
    return () => { ativo = false; };
  }, [nota.path, semEmbutido]);

  return (
    <Modal onClose={onClose} maxWidth="max-w-4xl" ariaLabel={`NF ${nota.nome}`}>
      <ModalHeader onClose={onClose}>
        <h3 className="truncate text-base font-bold text-slate-800 dark:text-slate-100" title={nota.nome}>{nota.nome}</h3>
      </ModalHeader>
      <ModalBody className="p-0 sm:p-0">
        <div className="h-[70vh] bg-slate-100 dark:bg-slate-900">
          {erro ? (
            <p role="alert" className="p-6 text-center text-sm font-semibold text-rose-600 dark:text-rose-400">{erro}</p>
          ) : url ? (
            <iframe src={url} title={`NF ${nota.nome}`} className="h-full w-full border-0 bg-white" />
          ) : bytes ? (
            <div className="h-full overflow-auto"><PdfPaginasCanvas bytes={bytes} /></div>
          ) : (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onBaixar} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056c6] px-4 py-2 text-xs font-bold text-white hover:bg-[#0047a5] cursor-pointer">
          <Download className="h-3.5 w-3.5" /> Baixar
        </button>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300 cursor-pointer">
          Fechar
        </button>
      </ModalFooter>
    </Modal>
  );
}
