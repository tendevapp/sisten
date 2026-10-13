/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Antes de abrir o PDF das etiquetas: lista o que está faltando (localização,
 * aplicação, foto) e oferece preencher ali mesmo. Localização e aplicação
 * gravam no cadastro do item; foto não dá para tirar aqui — fica o aviso para
 * usar "Editar" no cartão.
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, FileText, ImageOff, RefreshCw, X } from 'lucide-react';

export interface LinhaFaltante {
  codigo_sap: string;
  descricao: string;
  localizacao: string;
  aplicacao: string;
  temFoto: boolean;
}

export interface ValoresPreenchidos {
  localizacao: string;
  aplicacao: string;
}

interface Props {
  linhas: LinhaFaltante[];
  total: number;
  onCancelar: () => void;
  onAbrirSemPreencher: () => void;
  /** Só as linhas em que algo mudou. */
  onSalvarEAbrir: (valores: Map<string, ValoresPreenchidos>) => Promise<void>;
}

const inputCls = 'w-full rounded-lg border px-2 py-1.5 text-xs font-mono uppercase focus:outline-2 focus:outline-offset-1';
const inputStyle = { borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' };

export default function CompletarEtiquetasModal({ linhas, total, onCancelar, onAbrirSemPreencher, onSalvarEAbrir }: Props) {
  const [valores, setValores] = useState<Record<string, ValoresPreenchidos>>(() =>
    Object.fromEntries(linhas.map(l => [l.codigo_sap, { localizacao: l.localizacao, aplicacao: l.aplicacao }])),
  );
  const [aplicacaoGeral, setAplicacaoGeral] = useState('');
  const [salvando, setSalvando] = useState(false);

  const semLocalizacao = linhas.filter(l => !l.localizacao).length;
  const semAplicacao = linhas.filter(l => !l.aplicacao).length;
  const semFoto = linhas.filter(l => !l.temFoto).length;
  const editaveis = linhas.filter(l => !l.localizacao || !l.aplicacao);

  const alterar = (codigo: string, campo: keyof ValoresPreenchidos, valor: string) =>
    setValores(v => ({ ...v, [codigo]: { ...v[codigo], [campo]: valor.toUpperCase() } }));

  const aplicarATodos = () => {
    const apl = aplicacaoGeral.trim().toUpperCase();
    if (!apl) return;
    setValores(v => {
      const novo = { ...v };
      for (const l of linhas) if (!novo[l.codigo_sap].aplicacao.trim()) novo[l.codigo_sap] = { ...novo[l.codigo_sap], aplicacao: apl };
      return novo;
    });
  };

  const alterados = useMemo(() => {
    const mapa = new Map<string, ValoresPreenchidos>();
    for (const l of linhas) {
      const v = valores[l.codigo_sap];
      const loc = v.localizacao.trim();
      const apl = v.aplicacao.trim();
      if (loc !== l.localizacao || apl !== l.aplicacao) mapa.set(l.codigo_sap, { localizacao: loc, aplicacao: apl });
    }
    return mapa;
  }, [linhas, valores]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await onSalvarEAbrir(alterados);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="titulo-completar-etiquetas">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--hairline)' }}>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h2 id="titulo-completar-etiquetas" className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                {linhas.length} de {total} etiqueta(s) com informação faltando
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
                {[
                  semLocalizacao > 0 && `${semLocalizacao} sem localização`,
                  semAplicacao > 0 && `${semAplicacao} sem aplicação`,
                  semFoto > 0 && `${semFoto} sem foto`,
                ].filter(Boolean).join(' · ')}. Quer preencher antes de abrir o PDF?
              </p>
            </div>
          </div>
          <button type="button" onClick={onCancelar} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {semAplicacao > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--ink-secondary)' }}>
              <span className="font-bold">Aplicação para todas as vazias:</span>
              <input
                type="text"
                value={aplicacaoGeral}
                onChange={e => setAplicacaoGeral(e.target.value.toUpperCase())}
                placeholder="Ex: PRODUÇÃO"
                className={`${inputCls} w-40`}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={aplicarATodos}
                disabled={!aplicacaoGeral.trim()}
                className="rounded-lg border px-2.5 py-1.5 font-bold transition hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
              >
                Aplicar
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--hairline)' }}>
            <table className="w-full text-left text-xs">
              <thead style={{ background: 'var(--surface-raised)' }}>
                <tr>
                  <th className="px-3 py-2 font-bold" style={{ color: 'var(--ink-muted)' }}>Item</th>
                  <th className="px-3 py-2 font-bold" style={{ color: 'var(--ink-muted)' }}>Localização</th>
                  <th className="px-3 py-2 font-bold" style={{ color: 'var(--ink-muted)' }}>Aplicação</th>
                  <th className="px-3 py-2 font-bold" style={{ color: 'var(--ink-muted)' }}>Foto</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {linhas.map(l => (
                  <tr key={l.codigo_sap}>
                    <td className="px-3 py-2">
                      <div className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{l.codigo_sap}</div>
                      <div className="max-w-[220px] truncate text-[11px]" style={{ color: 'var(--ink-muted)' }} title={l.descricao}>{l.descricao}</div>
                    </td>
                    <td className="px-3 py-2 min-w-[120px]">
                      <input
                        type="text"
                        value={valores[l.codigo_sap].localizacao}
                        onChange={e => alterar(l.codigo_sap, 'localizacao', e.target.value)}
                        placeholder="Ex: 101.A10"
                        className={inputCls}
                        style={{ ...inputStyle, borderColor: l.localizacao ? inputStyle.borderColor : 'rgb(245 158 11)' }}
                      />
                    </td>
                    <td className="px-3 py-2 min-w-[120px]">
                      <input
                        type="text"
                        value={valores[l.codigo_sap].aplicacao}
                        onChange={e => alterar(l.codigo_sap, 'aplicacao', e.target.value)}
                        placeholder="Ex: PRODUÇÃO"
                        className={inputCls}
                        style={{ ...inputStyle, borderColor: l.aplicacao ? inputStyle.borderColor : 'rgb(245 158 11)' }}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {l.temFoto ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-600"><Check className="h-3.5 w-3.5" /> Tem</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600" title="Feche e use Editar no cartão do item para tirar a foto">
                          <ImageOff className="h-3.5 w-3.5" /> Falta
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {semFoto > 0 && (
            <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              Foto se tira pelo botão Editar do item. Sem foto, a etiqueta sai com o quadro da imagem em branco.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--hairline)' }}>
          <button
            type="button"
            onClick={onAbrirSemPreencher}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <FileText className="h-3.5 w-3.5" />
            Abrir PDF assim mesmo
          </button>
          {editaveis.length > 0 && (
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || alterados.size === 0}
              title={alterados.size === 0 ? 'Preencha ao menos um campo' : 'Grava no cadastro de cada item e abre o PDF'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-amber-700 disabled:opacity-50"
            >
              {salvando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Salvar {alterados.size > 0 ? `(${alterados.size}) ` : ''}e abrir PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
