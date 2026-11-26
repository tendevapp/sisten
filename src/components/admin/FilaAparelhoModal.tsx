/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Central de Sincronização → conteúdo da fila de um aparelho, pelo backup que
 * ele manda (`ops_fila_backup` + bucket `ops-fila-backup`; ver
 * lib/offline/backupFila.ts). O admin vê cada registro que não subiu — de
 * quem é, o que tem, por que foi recusado — abre as fotos e baixa tudo num
 * arquivo para recuperar à mão se o aparelho não voltar.
 */

import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useLightbox } from '../ui/Lightbox';
import { supabase } from '../../db/supabaseClient';

interface ArquivoBackup { n: number; caminho: string; tipo: string; tamanho: number }

interface LinhaBackup {
  chave: string;
  device_id: string;
  fila: 'formularios' | 'qualidade' | 'producao';
  item_id: string;
  dono_id: string | null;
  dono_nome: string | null;
  reportado_por_nome: string | null;
  plataforma: string | null;
  rotulo: string | null;
  resumo: string | null;
  estado: string | null;
  erro: string | null;
  criado_no_aparelho: string | null;
  conteudo: unknown;
  arquivos: ArquivoBackup[];
  primeiro_backup_em: string;
  atualizado_em: string;
  saiu_da_fila_em: string | null;
}

const ROTULO_FILA = { formularios: 'Formulários', qualidade: 'Qualidade', producao: 'Produção' } as const;
const BUCKET = 'ops-fila-backup';
const UMA_HORA_S = 3600;
const SETE_DIAS_S = 7 * 24 * 3600;

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

async function linksAssinados(caminhos: string[], validade: number): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!caminhos.length) return mapa;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(caminhos, validade);
  (data ?? []).forEach(d => { if (d.path && d.signedUrl) mapa.set(d.path, d.signedUrl); });
  return mapa;
}

export default function FilaAparelhoModal({ deviceId, titulo, onClose }: { deviceId: string; titulo: string; onClose: () => void }) {
  const [linhas, setLinhas] = useState<LinhaBackup[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [links, setLinks] = useState<Map<string, string>>(new Map());
  const [verSaidos, setVerSaidos] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const lightbox = useLightbox();

  const carregar = useCallback(async () => {
    const { data, error } = await (supabase.from as any)('ops_fila_backup')
      .select('*')
      .eq('device_id', deviceId)
      .order('criado_no_aparelho', { ascending: true })
      .limit(1000);
    if (error) { setErro(error.message); return; }
    const lista = (data ?? []) as LinhaBackup[];
    setLinhas(lista);
    setLinks(await linksAssinados(lista.flatMap(l => (l.arquivos ?? []).map(a => a.caminho)), UMA_HORA_S));
  }, [deviceId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const naFila = (linhas ?? []).filter(l => !l.saiu_da_fila_em);
  const saidos = (linhas ?? []).filter(l => l.saiu_da_fila_em);
  const visiveis = verSaidos ? [...naFila, ...saidos] : naFila;

  const baixar = async () => {
    if (!linhas?.length) return;
    setBaixando(true);
    try {
      // Links de 7 dias: o arquivo baixado continua abrindo as fotos depois.
      const longos = await linksAssinados(linhas.flatMap(l => (l.arquivos ?? []).map(a => a.caminho)), SETE_DIAS_S);
      const pacote = {
        aparelho: deviceId,
        gerado_em: new Date().toISOString(),
        aviso: 'Backup da fila offline. Os links das fotos valem 7 dias a partir de gerado_em.',
        itens: linhas.map(l => ({ ...l, arquivos: (l.arquivos ?? []).map(a => ({ ...a, link: longos.get(a.caminho) ?? null })) })),
      };
      const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-fila-${deviceId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } finally {
      setBaixando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Fila do aparelho">
      <ModalHeader onClose={onClose}>
        <p className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>Fila do aparelho</p>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{titulo} · <span className="font-mono">{deviceId.slice(0, 8)}</span></p>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
          Cópia que o aparelho manda quando tem rede: registros parados há mais de 2 minutos, recusados pelo servidor ou de
          outro usuário do aparelho (de todos os usuários). Um aparelho sem sinal mostra a última cópia que conseguiu mandar.
        </p>
        {erro ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">Não foi possível carregar o backup: {erro}</p>
        ) : !linhas ? (
          <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: 'var(--ink-secondary)' }}>
              <span><strong>{naFila.length}</strong> na fila · {saidos.length} já saíram (guardados 30 dias)</span>
              {saidos.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 font-semibold">
                  <input type="checkbox" checked={verSaidos} onChange={e => setVerSaidos(e.target.checked)} className="h-4 w-4 rounded" />
                  Mostrar os que já saíram
                </label>
              )}
            </div>
            {visiveis.length === 0 ? (
              <p className="rounded-xl border px-3 py-3 text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                Nenhum registro no backup deste aparelho{saidos.length ? ' ainda na fila' : ''}.
              </p>
            ) : (
              <ul className="space-y-2">
                {visiveis.map(l => {
                  const imagens = (l.arquivos ?? []).filter(a => a.tipo.startsWith('image/') && links.get(a.caminho));
                  const outros = (l.arquivos ?? []).filter(a => !a.tipo.startsWith('image/'));
                  return (
                    <li key={l.chave} className={`rounded-xl border p-3 ${l.estado === 'erro' && !l.saiu_da_fila_em ? 'border-rose-200 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/20' : ''}`} style={l.estado === 'erro' && !l.saiu_da_fila_em ? undefined : { borderColor: 'var(--hairline)' }}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{l.rotulo || '—'}</p>
                          {l.resumo && <p className="truncate text-[11px]" style={{ color: 'var(--ink-muted)' }}>{l.resumo}</p>}
                          <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                            {ROTULO_FILA[l.fila]} · de {l.dono_nome || 'usuário não identificado'} · feito {dataHora(l.criado_no_aparelho)}
                          </p>
                        </div>
                        <span className="text-[11px] font-bold" style={{ color: l.saiu_da_fila_em ? 'var(--status-good)' : l.estado === 'erro' ? 'var(--status-critical)' : 'var(--status-warning)' }}>
                          {l.saiu_da_fila_em ? `Saiu da fila ${dataHora(l.saiu_da_fila_em)}` : l.estado === 'erro' ? 'Recusado' : 'Na fila'}
                        </span>
                      </div>
                      {l.erro && <p className="mt-1 break-words text-[11px] font-semibold text-rose-700 dark:text-rose-300">{l.erro}</p>}
                      {imagens.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {imagens.map((a, i) => (
                            <button
                              key={a.caminho}
                              type="button"
                              aria-label={`Ampliar foto ${i + 1} de ${l.rotulo || 'registro'}`}
                              onClick={() => lightbox.abrir(imagens.map(x => links.get(x.caminho)!), i)}
                              className="h-16 w-16 overflow-hidden rounded-lg border"
                              style={{ borderColor: 'var(--hairline)' }}
                            >
                              <img src={links.get(a.caminho)} alt="" className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                      {outros.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {outros.map(a => (
                            <li key={a.caminho}>
                              <a href={links.get(a.caminho)} download className="inline-flex items-center gap-1 text-[11px] font-semibold underline" style={{ color: 'var(--brand)' }}>
                                <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Arquivo {a.n + 1} ({Math.round(a.tamanho / 1024)} KB)
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: 'var(--ink-secondary)' }}>Ver conteúdo</summary>
                        <pre className="mt-1 max-h-64 overflow-auto rounded-lg p-2 text-[11px] leading-snug" style={{ background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}>
                          {JSON.stringify(l.conteudo, null, 2)}
                        </pre>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>Fechar</button>
          <button
            type="button"
            onClick={() => void baixar()}
            disabled={baixando || !linhas?.length}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
            style={{ background: 'var(--brand)' }}
          >
            {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar backup
          </button>
        </div>
      </ModalFooter>
      {lightbox.elemento}
    </Modal>
  );
}
