/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Validação Técnica de item — peças de tela compartilhadas entre a Central
 * de Compras (abrir o chamado, tag no item) e Solicitações › Aprovações
 * (detalhe do chamado). Regras em `lib/validacaoTecnica.ts`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Forward, ImagePlus, Link2, RefreshCw, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useLightbox } from '../ui/Lightbox';
import { useToast } from '../ui/Toast';
import { localDb } from '../../db/localDb';
import { canAccessPage } from '../../lib/pages';
import { formatDateTimeBR } from '../../lib/format';
import { ACCEPT_ANEXO, AnexoInvalidoError, prepareAttachment, type PreparedAttachment } from '../../lib/imageCompression';
import {
  interpretarLinks, MAX_ANEXOS_VALIDACAO, ROTULO_STATUS_VALIDACAO,
  type UsuarioMarcado, type ValidacaoTecnica,
} from '../../lib/validacaoTecnica';
import { abrirValidacaoTecnica, assinarAnexosValidacao, type NovaValidacao } from '../../lib/validacaoTecnicaApi';
import type { Profile } from '../../types';

const ESTILO_TAG: Record<ValidacaoTecnica['status'], string> = {
  PENDENTE: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
  APROVADA: 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500',
  REPROVADA: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
};

/** Tag do item na Central: Em validação / Aprovado / Reprovado. */
export function ValidacaoTag({ v, onClick }: { v: ValidacaoTecnica; onClick?: () => void }) {
  const decisao = v.decidido_por_nome
    ? ` — ${v.decidido_por_nome}${v.decidido_em ? ` em ${formatDateTimeBR(v.decidido_em)}` : ''}${v.parecer ? `: ${v.parecer}` : ''}`
    : ` — aguardando ${v.setor_nome || 'a área'}`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-black tracking-wide uppercase whitespace-nowrap cursor-pointer ${ESTILO_TAG[v.status]}`}
      title={`Validação técnica ${v.codigo ?? ''}${decisao}`}
    >
      <ShieldCheck className="h-2.5 w-2.5" />
      {ROTULO_STATUS_VALIDACAO[v.status]}
    </button>
  );
}

/** URLs assinadas dos anexos de um chamado. */
function useUrlsAnexos(v: ValidacaoTecnica | null): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const chave = (v?.anexos ?? []).map(a => a.path).join('|');
  useEffect(() => {
    let ativo = true;
    if (!chave) { setUrls({}); return; }
    assinarAnexosValidacao(chave.split('|')).then(m => { if (ativo) setUrls(m); }).catch(() => { if (ativo) setUrls({}); });
    return () => { ativo = false; };
  }, [chave]);
  return urls;
}

/** Conteúdo do chamado: item, o que validar, links, anexos, marcados e decisão. */
export function DetalheValidacao({ v }: { v: ValidacaoTecnica }) {
  const lightbox = useLightbox();
  const urls = useUrlsAnexos(v);
  const fotos = v.anexos.filter(a => a.tipo.startsWith('image/'));
  const pdfs = v.anexos.filter(a => !a.tipo.startsWith('image/'));
  const imagensLightbox = fotos.map(f => ({ url: urls[f.path], legenda: f.nome }));

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-3 space-y-1">
        <p className="font-mono text-xs font-bold text-slate-500">RM {v.rm || '—'} / Item {v.item_reqc || '—'} · Material {v.material_code || '—'}</p>
        <p className="font-bold text-slate-800 dark:text-slate-100">{v.texto_breve || '—'}</p>
        {v.qtd !== null && <p className="text-xs text-slate-500">{v.qtd} {v.unidade || ''}</p>}
      </div>

      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">O que validar</p>
        <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">{v.descricao}</p>
      </div>

      {v.links.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Links</p>
          {v.links.map(l => (
            <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-bold text-[#0056c6] dark:text-blue-400 hover:underline break-all">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" /> {l}
            </a>
          ))}
        </div>
      )}

      {v.anexos.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Anexos</p>
          {fotos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {fotos.map((f, i) => (
                <button key={f.path} type="button" onClick={() => lightbox.abrir(imagensLightbox, i)} className="cursor-zoom-in" title={f.nome}>
                  {urls[f.path]
                    ? <img src={urls[f.path]} alt={f.nome} className="h-20 w-20 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
                    : <span className="flex h-20 w-20 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700"><RefreshCw className="h-4 w-4 animate-spin text-slate-400" /></span>}
                </button>
              ))}
            </div>
          )}
          {pdfs.map(p => (
            <a
              key={p.path}
              href={urls[p.path]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold text-[#0056c6] dark:text-blue-400 hover:underline"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" /> {p.nome}
            </a>
          ))}
        </div>
      )}

      <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
        <p>Aberto por <b>{v.criado_por_nome || '—'}</b> em {formatDateTimeBR(v.created_at)} · Área: <b>{v.setor_nome || '—'}</b></p>
        {v.marcados.length > 0 && <p>Marcados: {v.marcados.map(m => m.nome).join(', ')}</p>}
        {(v.redirecionamentos ?? []).map((r, i) => (
          <p key={i} className="flex items-start gap-1 text-violet-700 dark:text-violet-300">
            <Forward className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Redirecionado por <b>{r.por_nome || '—'}</b> em {formatDateTimeBR(r.em)}: {r.de_setor_nome || '—'} → <b>{r.para_setor_nome || '—'}</b>
              {' '}({r.para.map(m => m.nome).join(', ')}){r.motivo ? ` — ${r.motivo}` : ''}
            </span>
          </p>
        ))}
        {v.decidido_em && (
          <p className={v.status === 'APROVADA' ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-rose-700 dark:text-rose-400 font-bold'}>
            {ROTULO_STATUS_VALIDACAO[v.status]} por {v.decidido_por_nome} em {formatDateTimeBR(v.decidido_em)}{v.parecer ? ` — ${v.parecer}` : ''}
          </p>
        )}
      </div>
      {lightbox.elemento}
    </div>
  );
}

interface AbrirProps {
  user: Profile;
  item: Omit<NovaValidacao, 'setor_id' | 'setor_nome' | 'descricao' | 'links' | 'marcados'>;
  /** Setor sugerido (o da solicitação do SISTEN que abriu a RM, quando há). */
  setorInicial?: string | null;
  /** Chamados anteriores do item, mais recente primeiro. */
  historico: ValidacaoTecnica[];
  onClose: () => void;
  onAberta: (v: ValidacaoTecnica) => Promise<void> | void;
}

const campo = 'w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-2 px-3 focus:border-[#0056c6] focus:outline-none';
const rotulo = 'block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1';

/** Setores, perfis ativos e quem dá para marcar (só quem abre Solicitações › Aprovações). */
function useAreasEUsuarios(userId: string) {
  const setores = useMemo(() => localDb.getSectors().slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), []);
  const perfis = useMemo(() => localDb.getProfiles().filter(p => p.status === 'ativo'), []);
  const marcaveis = useMemo(
    () => perfis.filter(p => p.id !== userId && canAccessPage(p, 'sol_aprovacoes')).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [perfis, userId],
  );
  return { setores, perfis, marcaveis };
}

/** Aviso de quem aprova pela área escolhida. */
function AprovadoresDaArea({ perfis, setorId }: { perfis: Profile[]; setorId: string }) {
  if (!setorId) return null;
  const nomes = perfis.filter(p => p.aprovador_setores?.includes(setorId)).map(p => p.name);
  return (
    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
      {nomes.length > 0
        ? <>Aprovadores da área: <b>{nomes.join(', ')}</b></>
        : 'A área não tem aprovador cadastrado — o chamado vai para os administradores.'}
    </p>
  );
}

/** Marcar usuários do SISTEN por nome (chips + sugestões). */
function MarcarUsuarios({
  marcaveis, marcados, onChange, titulo, ajuda,
}: {
  marcaveis: Profile[];
  marcados: UsuarioMarcado[];
  onChange: (l: UsuarioMarcado[]) => void;
  titulo: string;
  ajuda: string;
}) {
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const sugestoes = termo
    ? marcaveis.filter(p => !marcados.some(m => m.id === p.id) && p.name.toLowerCase().includes(termo)).slice(0, 6)
    : [];
  return (
    <div>
      <label className={rotulo}>{titulo}</label>
      {marcados.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {marcados.map(m => (
            <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
              @{m.nome}
              <button type="button" onClick={() => onChange(marcados.filter(x => x.id !== m.id))} aria-label={`Desmarcar ${m.nome}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={busca}
        onChange={e => setBusca(e.target.value)}
        placeholder="Digite o nome..."
        className={campo}
      />
      {sugestoes.length > 0 && (
        <ul className="mt-1 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
          {sugestoes.map(p => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => { onChange([...marcados, { id: p.id, nome: p.name }]); setBusca(''); }}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-violet-50 dark:hover:bg-violet-950/30"
              >
                {p.name} <span className="text-slate-400">{p.cargo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{ajuda}</p>
    </div>
  );
}

/**
 * Redirecionar (Aprovações): a área passa o chamado para outra, marcando quem
 * recebe. Continua pendente; quem redirecionou passa a só acompanhar.
 */
export function RedirecionarValidacao({
  user, v, onCancelar, onRedirecionar, enviando,
}: {
  user: Profile;
  v: ValidacaoTecnica;
  onCancelar: () => void;
  onRedirecionar: (setor: { id: string; nome: string | null }, marcados: UsuarioMarcado[], motivo: string) => void;
  enviando: boolean;
}) {
  const { setores, perfis, marcaveis } = useAreasEUsuarios(user.id);
  const [setorId, setSetorId] = useState('');
  const [marcados, setMarcados] = useState<UsuarioMarcado[]>([]);
  const [motivo, setMotivo] = useState('');
  const pode = !!setorId && marcados.length > 0 && !enviando;

  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900/50 dark:bg-violet-950/20">
      <p className="flex items-center gap-1.5 text-sm font-bold text-violet-800 dark:text-violet-300">
        <Forward className="h-4 w-4" /> Redirecionar {v.codigo} para outra área
      </p>
      <div>
        <label className={rotulo}>Nova área *</label>
        <select value={setorId} onChange={e => setSetorId(e.target.value)} className={campo}>
          <option value="">Selecione o setor...</option>
          {setores.map(s => <option key={s.id} value={s.id}>{s.name}{s.id === v.setor_id ? ' (atual)' : ''}</option>)}
        </select>
        <AprovadoresDaArea perfis={perfis} setorId={setorId} />
      </div>
      <MarcarUsuarios
        marcaveis={marcaveis}
        marcados={marcados}
        onChange={setMarcados}
        titulo="Para quem vai *"
        ajuda="Marque ao menos um usuário. Ele recebe o aviso e passa a poder aprovar; você continua vendo o chamado, sem decidir."
      />
      <div>
        <label className={rotulo}>Motivo (opcional)</label>
        <textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          rows={2}
          placeholder="Ex.: item elétrico, quem valida é a Manutenção."
          className={`${campo} resize-y`}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} disabled={enviando} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          Cancelar
        </button>
        <button
          type="button"
          disabled={!pode}
          onClick={() => onRedirecionar({ id: setorId, nome: setores.find(s => s.id === setorId)?.name ?? null }, marcados, motivo.trim())}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {enviando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Forward className="h-3.5 w-3.5" />} Redirecionar
        </button>
      </div>
    </div>
  );
}

/** Janela "Validação" da coluna Ações: abre o chamado para o gestor da área. */
export function AbrirValidacaoModal({ user, item, setorInicial, historico, onClose, onAberta }: AbrirProps) {
  const toast = useToast();
  const { setores, perfis, marcaveis } = useAreasEUsuarios(user.id);

  const [setorId, setSetorId] = useState(setorInicial && setores.some(s => s.id === setorInicial) ? setorInicial : '');
  const [descricao, setDescricao] = useState('');
  const [textoLinks, setTextoLinks] = useState('');
  const [arquivos, setArquivos] = useState<PreparedAttachment[]>([]);
  const [marcados, setMarcados] = useState<UsuarioMarcado[]>([]);
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState<ValidacaoTecnica | null>(null);

  useEffect(() => () => arquivos.forEach(a => URL.revokeObjectURL(a.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const pendente = historico.find(h => h.status === 'PENDENTE');
  const links = interpretarLinks(textoLinks);
  const podeEnviar = !!setorId && descricao.trim().length > 0 && !enviando && !preparando && !pendente;

  const anexar = async (lista: FileList | null) => {
    if (!lista?.length) return;
    const restante = MAX_ANEXOS_VALIDACAO - arquivos.length;
    if (restante <= 0) { toast.warning(`Máximo de ${MAX_ANEXOS_VALIDACAO} arquivos.`); return; }
    setPreparando(true);
    try {
      for (const file of Array.from(lista).slice(0, restante)) {
        try {
          const preparado = await prepareAttachment(file);
          setArquivos(a => [...a, preparado]);
        } catch (err) {
          toast.error(err instanceof AnexoInvalidoError ? `${file.name}: ${err.message}` : `Não foi possível anexar ${file.name}.`);
        }
      }
    } finally {
      setPreparando(false);
    }
  };

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    try {
      const v = await abrirValidacaoTecnica({
        ...item,
        setor_id: setorId,
        setor_nome: setores.find(s => s.id === setorId)?.name ?? null,
        descricao: descricao.trim(),
        links,
        marcados,
      }, arquivos, { id: user.id, nome: user.name });
      await onAberta(v);
      onClose();
    } catch (err) {
      toast.error(`Falha ao abrir o chamado: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl" ariaLabel="Validação técnica" disableOutsideClose={enviando}>
      <ModalHeader onClose={onClose}>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <ShieldCheck className="h-4.5 w-4.5 text-violet-600" /> Validação técnica
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            RM {item.rm} / Item {item.item_reqc} — {item.texto_breve || item.material_code}
          </p>
        </div>
      </ModalHeader>
      <form onSubmit={e => { e.preventDefault(); enviar(); }} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-4">
          {historico.length > 0 && (
            <div className="space-y-1.5">
              <p className={rotulo}>Chamados deste item</p>
              {historico.map(h => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setHistoricoAberto(historicoAberto?.id === h.id ? null : h)}
                  className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-left text-xs hover:border-violet-300"
                >
                  <span className="font-mono font-bold">{h.codigo}</span>
                  <span className="truncate text-slate-500">{formatDateTimeBR(h.created_at)} · {h.setor_nome}</span>
                  <ValidacaoTag v={h} />
                </button>
              ))}
              {historicoAberto && (
                <div className="rounded-xl border border-violet-200 dark:border-violet-900/50 p-3">
                  <DetalheValidacao v={historicoAberto} />
                </div>
              )}
            </div>
          )}

          {pendente ? (
            <p className="rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-900/50 dark:bg-violet-950/20 p-3 text-xs font-semibold text-violet-800 dark:text-violet-300">
              Já existe o chamado {pendente.codigo} aguardando decisão. Espere a resposta antes de abrir outro.
            </p>
          ) : (
            <>
              <div>
                <label className={rotulo}>Área que valida *</label>
                <select value={setorId} onChange={e => setSetorId(e.target.value)} className={campo}>
                  <option value="">Selecione o setor...</option>
                  {setores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <AprovadoresDaArea perfis={perfis} setorId={setorId} />
              </div>

              <div>
                <label className={rotulo}>O que precisa ser validado *</label>
                <textarea
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                  rows={3}
                  placeholder="Ex.: o fornecedor ofereceu o similar abaixo no lugar do modelo pedido. Atende?"
                  className={`${campo} resize-y`}
                />
              </div>

              <div>
                <label className={rotulo}><Link2 className="inline h-3 w-3" /> Links (um por linha)</label>
                <textarea
                  value={textoLinks}
                  onChange={e => setTextoLinks(e.target.value)}
                  rows={2}
                  placeholder="https://..."
                  className={`${campo} resize-y font-mono text-xs`}
                />
                {textoLinks.trim() && <p className="mt-1 text-[11px] text-slate-500">{links.length} link(s) reconhecido(s).</p>}
              </div>

              <div>
                <label className={rotulo}>Fotos e ficha técnica (imagem ou PDF, até {MAX_ANEXOS_VALIDACAO})</label>
                <div className="flex flex-wrap items-center gap-2">
                  {arquivos.map((a, i) => (
                    <div key={a.previewUrl} className="relative">
                      {a.mimeType.startsWith('image/')
                        ? <img src={a.previewUrl} alt={a.name} className="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
                        : <span className="flex h-16 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 px-1 text-[9px] text-slate-500 dark:border-slate-700"><FileText className="h-4 w-4" /><span className="truncate max-w-full">{a.name}</span></span>}
                      <button
                        type="button"
                        onClick={() => { URL.revokeObjectURL(a.previewUrl); setArquivos(l => l.filter((_, j) => j !== i)); }}
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-600 p-0.5 text-white"
                        aria-label={`Remover ${a.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {arquivos.length < MAX_ANEXOS_VALIDACAO && (
                    <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 text-[9px] font-bold text-slate-500 hover:border-violet-400 dark:border-slate-700">
                      {preparando ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      Anexar
                      <input type="file" accept={ACCEPT_ANEXO} multiple className="hidden" onChange={e => { anexar(e.target.files); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
              </div>

              <MarcarUsuarios
                marcaveis={marcaveis}
                marcados={marcados}
                onChange={setMarcados}
                titulo="Marcar usuários do SISTEN (opcional)"
                ajuda="Quem for marcado recebe o aviso e também pode aprovar. Só aparecem usuários com acesso a Aprovações."
              />
            </>
          )}
        </ModalBody>
        <ModalFooter className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer">
            {pendente ? 'Fechar' : 'Cancelar'}
          </button>
          {!pendente && (
            <button
              type="submit"
              disabled={!podeEnviar}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-violet-600 hover:bg-violet-700 text-white cursor-pointer disabled:opacity-50"
            >
              {enviando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar para validação
            </button>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}
