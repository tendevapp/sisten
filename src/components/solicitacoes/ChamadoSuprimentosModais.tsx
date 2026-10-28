/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Editar e reabrir os chamados ao Suprimentos ("Pendência de Processamento" e
 * "Ajuste de Pedido") pela área que os abriu — Financeiro, Contabilidade,
 * Controladoria e Fiscal mexem nos chamados uns dos outros. Regras em
 * `lib/chamadosSuprimentosGrupo.ts`.
 *
 * Os dados do chamado vivem nas linhas de `sup_pend_processamento_nf`, não no
 * formulário da Nova Solicitação (que não consegue reconstruí-las) — por isso
 * a edição é aqui, linha a linha.
 */

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Pencil, RotateCcw } from 'lucide-react';
import type { Request, SupPendenciaProcessamentoNF } from '../../types';
import { localDb } from '../../db/localDb';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { formatDateTimeBR } from '../../lib/format';
import { rotuloCriticidade } from '../../lib/solicitacoes';
import {
  CLASSIF_CAUSA, CLASSIF_IMPACTO, CLASSIF_RECORRENCIA, CLASSIF_RESPONSAVEL,
  rotuloNumero, type MetaPendencia,
} from '../../lib/supPendenciasProcessamento';
import {
  listarPendenciasPorRequest, reabrirChamadoSuprimentos, salvarEdicaoChamadoSuprimentos,
} from '../../lib/supPendenciasApi';
import {
  CAMPOS_EDITAVEIS, camposParaGravar, descreverAlteracoesLinha, descreverAlteracoesMeta,
  justificativaAjustePedido, metaDasLinhas, valoresDaLinha, type ValoresLinha,
} from '../../lib/chamadosSuprimentosGrupo';

const campo: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
  outlineColor: 'var(--brand)',
};

const classeCampo = 'w-full rounded-lg border px-2.5 py-1.5 text-sm focus:outline-2 focus:outline-offset-1';

function useLinhas(requestId: string) {
  const [linhas, setLinhas] = useState<SupPendenciaProcessamentoNF[] | null>(null);
  useEffect(() => {
    let vivo = true;
    listarPendenciasPorRequest(requestId).then(l => { if (vivo) setLinhas(l); });
    return () => { vivo = false; };
  }, [requestId]);
  return linhas;
}

function Erro({ texto }: { texto: string }) {
  return (
    <p className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
       style={{ background: 'rgba(208,59,59,0.1)', color: 'var(--status-critical)' }}>
      <AlertTriangle className="h-4 w-4 shrink-0" /> {texto}
    </p>
  );
}

function Rodape({ salvando, desabilitado, onVoltar, rotulo, icone }: {
  salvando: boolean; desabilitado: boolean; onVoltar: () => void; rotulo: string; icone: React.ReactNode;
}) {
  return (
    <ModalFooter>
      <div className="flex w-full items-center justify-end gap-2">
        <button
          type="button" disabled={salvando} onClick={onVoltar}
          className="rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer disabled:opacity-50"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        >
          Voltar
        </button>
        <button
          type="submit" disabled={salvando || desabilitado}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--brand)' }}
        >
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icone}
          {rotulo}
        </button>
      </div>
    </ModalFooter>
  );
}

/* Editar ------------------------------------------------------------------ */

export function EditarChamadoSuprimentosModal({ request, onClose, onSalvo }: {
  request: Request;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const linhas = useLinhas(request.id);
  const [valores, setValores] = useState<Record<string, ValoresLinha>>({});
  const [meta, setMeta] = useState<MetaPendencia>(metaDasLinhas());
  const [criticidade, setCriticidade] = useState(request.criticality || 1);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!linhas) return;
    setValores(Object.fromEntries(linhas.map(l => [l.id, valoresDaLinha(l)])));
    setMeta(metaDasLinhas(linhas[0]));
  }, [linhas]);

  const pendentes = (linhas || []).filter(l => l.status !== 'concluido');
  const baixadas = (linhas || []).filter(l => l.status === 'concluido');
  const ehAjuste = linhas?.[0]?.modelo === 'ajuste_pedido';

  const alterar = (id: string, c: keyof ValoresLinha, v: string) =>
    setValores(prev => ({ ...prev, [id]: { ...prev[id], [c]: v } }));

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linhas) return;
    setErro('');

    const edicoes = pendentes.map(l => {
      const modelo = l.modelo || 'nfse';
      const depois = valores[l.id] || {};
      return {
        linha: l,
        depois,
        campos: camposParaGravar(modelo, depois),
        alteracoes: descreverAlteracoesLinha(modelo, valoresDaLinha(l), depois),
      };
    });
    if (edicoes.some(x => !(x.depois.numero_nfse || '').trim())) {
      setErro(`Informe o número (${rotuloNumero(linhas[0].modelo || 'nfse')}) em todas as linhas.`);
      return;
    }
    const alteracoesMeta = descreverAlteracoesMeta(metaDasLinhas(linhas[0]), meta);
    const mudouCriticidade = criticidade !== (request.criticality || 1);
    const comAlteracao = edicoes.filter(x => x.alteracoes.length > 0);
    if (comAlteracao.length === 0 && alteracoesMeta.length === 0 && !mudouCriticidade) {
      toast.info('Nada foi alterado.');
      return;
    }

    setSalvando(true);
    try {
      await salvarEdicaoChamadoSuprimentos(
        request.id,
        edicoes,
        alteracoesMeta.length > 0 ? { valores: meta, alteracoes: alteracoesMeta } : null,
      );

      const campos: Partial<Pick<Request, 'criticality' | 'justificativa'>> = {};
      if (mudouCriticidade) campos.criticality = criticidade;
      const ajuste = ehAjuste ? edicoes[0] : null;
      if (ajuste && ajuste.alteracoes.length > 0) {
        campos.justificativa = justificativaAjustePedido(
          ajuste.linha.protocolo,
          ajuste.depois.numero_nfse || '',
          ajuste.depois.documento_compras || '',
          ajuste.depois.nome_fornecedor || '',
        );
      }

      const partes = [
        ...comAlteracao.map(x => `${rotuloNumero(x.linha.modelo || 'nfse')} ${x.linha.numero_nfse} — ${x.alteracoes.join('; ')}`),
        ...alteracoesMeta,
        ...(mudouCriticidade
          ? [`Criticidade: ${rotuloCriticidade(request.criticality || 1)} → ${rotuloCriticidade(criticidade)}`]
          : []),
      ];
      const ok = await localDb.registrarEdicaoSolicitacao(request.id, campos, `Chamado editado. ${partes.join(' | ')}`);
      if (!ok) throw new Error('As linhas foram salvas, mas o cabeçalho do chamado não. Tente de novo.');

      toast.success('Chamado atualizado.');
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao salvar a edição.');
    } finally {
      setSalvando(false);
    }
  };

  const fechar = () => { if (!salvando) onClose(); };

  return (
    <Modal onClose={fechar} maxWidth="max-w-3xl" ariaLabel="Editar chamado" zIndexClassName="z-[110]" disableOutsideClose>
      <ModalHeader onClose={fechar}>
        <div className="flex items-center gap-2">
          <Pencil className="h-5 w-5" style={{ color: 'var(--brand)' }} />
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              Editar chamado — #{request.number}
            </h3>
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              {request.category_id} · aberto por {request.solicitante_name}
            </p>
          </div>
        </div>
      </ModalHeader>

      <form onSubmit={salvar}>
        <ModalBody>
          {!linhas ? (
            <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-muted)' }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando o chamado…
            </p>
          ) : (
            <div className="space-y-4">
              {erro && <Erro texto={erro} />}

              <label className="block max-w-xs">
                <span className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Criticidade</span>
                <select value={criticidade} onChange={e => setCriticidade(Number(e.target.value))} className={classeCampo} style={campo}>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{rotuloCriticidade(n)}</option>)}
                </select>
              </label>

              {pendentes.length === 0 && (
                <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}>
                  Todas as linhas já foram baixadas pelo Suprimentos. Para corrigir alguma, reabra o chamado.
                </p>
              )}

              {pendentes.map((l, i) => (
                <fieldset key={l.id} className="space-y-2 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
                  <legend className="px-1 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                    {ehAjuste ? 'Ajuste de pedido' : `${rotuloNumero(l.modelo || 'nfse')} ${i + 1}`}
                  </legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {CAMPOS_EDITAVEIS[l.modelo || 'nfse'].map(def => (
                      <label key={def.campo} className={def.longo ? 'sm:col-span-2' : ''}>
                        <span className="mb-0.5 block text-[11px] font-bold" style={{ color: 'var(--ink-secondary)' }}>{def.rotulo}</span>
                        {def.longo ? (
                          <textarea
                            rows={2}
                            value={valores[l.id]?.[def.campo] ?? ''}
                            onChange={e => alterar(l.id, def.campo, e.target.value)}
                            className={classeCampo} style={campo}
                          />
                        ) : (
                          <input
                            value={valores[l.id]?.[def.campo] ?? ''}
                            onChange={e => alterar(l.id, def.campo, e.target.value)}
                            className={classeCampo} style={campo}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}

              {baixadas.length > 0 && (
                <div className="rounded-xl border p-3 text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                  <p className="mb-1 font-bold">
                    {baixadas.length} linha(s) já baixada(s) pelo Suprimentos — para alterar, reabra o chamado:
                  </p>
                  <ul className="list-inside list-disc">
                    {baixadas.map(l => (
                      <li key={l.id}>{rotuloNumero(l.modelo || 'nfse')} {l.numero_nfse}{l.nome_fornecedor ? ` · ${l.nome_fornecedor}` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}

              <fieldset className="space-y-2 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
                <legend className="px-1 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                  Classificação da demanda
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {([
                    ['classif_causa', 'Causa provável', CLASSIF_CAUSA],
                    ['classif_responsavel', 'Área responsável', CLASSIF_RESPONSAVEL],
                    ['classif_impacto', 'Impacto', CLASSIF_IMPACTO],
                    ['classif_recorrencia', 'Recorrência', CLASSIF_RECORRENCIA],
                  ] as const).map(([chave, rotulo, opcoes]) => (
                    <label key={chave}>
                      <span className="mb-0.5 block text-[11px] font-bold" style={{ color: 'var(--ink-secondary)' }}>{rotulo}</span>
                      <select
                        value={meta[chave] || ''}
                        onChange={e => setMeta(m => ({ ...m, [chave]: e.target.value }))}
                        className={classeCampo} style={campo}
                      >
                        <option value="">—</option>
                        {opcoes.map(o => <option key={o} value={o}>{o}</option>)}
                        {meta[chave] && !(opcoes as readonly string[]).includes(meta[chave]!) && (
                          <option value={meta[chave]}>{meta[chave]}</option>
                        )}
                      </select>
                    </label>
                  ))}
                  <label className="sm:col-span-2">
                    <span className="mb-0.5 block text-[11px] font-bold" style={{ color: 'var(--ink-secondary)' }}>Observação do chamado</span>
                    <textarea
                      rows={2}
                      value={meta.observacao || ''}
                      onChange={e => setMeta(m => ({ ...m, observacao: e.target.value }))}
                      className={classeCampo} style={campo}
                    />
                  </label>
                </div>
              </fieldset>
            </div>
          )}
        </ModalBody>
        <Rodape
          salvando={salvando} desabilitado={!linhas} onVoltar={fechar}
          rotulo="Salvar alterações" icone={<Pencil className="h-3.5 w-3.5" />}
        />
      </form>
    </Modal>
  );
}

/* Reabrir ----------------------------------------------------------------- */

export function ReabrirChamadoSuprimentosModal({ request, onClose, onReaberto }: {
  request: Request;
  onClose: () => void;
  onReaberto: () => void;
}) {
  const toast = useToast();
  const linhas = useLinhas(request.id);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const baixadas = (linhas || []).filter(l => l.status === 'concluido');
  useEffect(() => {
    if (linhas) setMarcadas(new Set(linhas.filter(l => l.status === 'concluido').map(l => l.id)));
  }, [linhas]);

  const alternar = (id: string) => setMarcadas(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (!motivo.trim()) { setErro('Informe o motivo da reabertura.'); return; }
    const escolhidas = baixadas.filter(l => marcadas.has(l.id));
    if (escolhidas.length === 0) { setErro('Marque ao menos uma linha para reabrir.'); return; }

    setSalvando(true);
    try {
      const n = await reabrirChamadoSuprimentos(request.id, escolhidas, motivo);
      toast.success(`Chamado reaberto — ${n} linha(s) voltaram para o Suprimentos.`);
      onReaberto();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao reabrir o chamado.');
    } finally {
      setSalvando(false);
    }
  };

  const fechar = () => { if (!salvando) onClose(); };

  return (
    <Modal onClose={fechar} maxWidth="max-w-lg" ariaLabel="Reabrir chamado" zIndexClassName="z-[110]">
      <ModalHeader onClose={fechar}>
        <div className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5" style={{ color: 'var(--status-serious)' }} />
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              Reabrir chamado — #{request.number}
            </h3>
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              As linhas marcadas voltam para a fila do Suprimentos, e quem deu a baixa é avisado.
            </p>
          </div>
        </div>
      </ModalHeader>

      <form onSubmit={confirmar}>
        <ModalBody>
          {!linhas ? (
            <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-muted)' }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando o chamado…
            </p>
          ) : (
            <div className="space-y-3.5">
              {erro && <Erro texto={erro} />}

              {baixadas.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                  Nenhuma linha baixada neste chamado.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {baixadas.map(l => (
                    <li key={l.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs" style={{ borderColor: 'var(--hairline)' }}>
                        <input type="checkbox" checked={marcadas.has(l.id)} onChange={() => alternar(l.id)} className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>
                            {rotuloNumero(l.modelo || 'nfse')} {l.numero_nfse}
                          </span>
                          {l.nome_fornecedor && <span style={{ color: 'var(--ink-secondary)' }}> · {l.nome_fornecedor}</span>}
                          <span className="mt-0.5 flex items-center gap-1" style={{ color: 'var(--ink-muted)' }}>
                            <CheckCircle2 className="h-3 w-3" style={{ color: 'var(--status-good)' }} />
                            Baixada{l.resolvido_em ? ` em ${formatDateTimeBR(l.resolvido_em)}` : ''}
                            {l.resolucao ? ` — ${l.resolucao}` : ''}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>
                  Motivo da reabertura <span className="text-rose-500">*</span>
                </span>
                <textarea
                  rows={3}
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="O que ainda falta resolver?"
                  className="w-full rounded-lg border p-2.5 text-sm focus:outline-2 focus:outline-offset-1"
                  style={campo}
                />
              </label>
            </div>
          )}
        </ModalBody>
        <Rodape
          salvando={salvando} desabilitado={!linhas || baixadas.length === 0 || !motivo.trim()}
          onVoltar={fechar} rotulo="Reabrir" icone={<RotateCcw className="h-3.5 w-3.5" />}
        />
      </form>
    </Modal>
  );
}
