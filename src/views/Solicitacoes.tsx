/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fila coletiva de solicitações — acompanhar, responder, exportar e baixar
 * anexos.
 *
 * Complementa Minhas Solicitações (as próprias) e Aprovações (a decisão do
 * gestor): aqui está tudo o que está em aberto, para quem opera a fila.
 *
 * As regras de recorte, rótulo, exportação e download vivem em
 * `lib/solicitacoes.ts`; esta view é interface.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Search, Filter, Download, FileSpreadsheet, Send, Paperclip, Loader2 } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, Request, Sector } from '../types';
import { formatDateBR } from '../lib/format';
import { AttachmentGallery } from '../components/ui/Attachments';
import {
  TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableEmpty,
} from '../components/ui/DataTable';
import {
  solicitacoesVisiveis, estaEmAberto, rotuloStatus, rotuloTipo, rotuloCriticidade,
  exportarSolicitacoes, baixarAnexos, contarAnexos, podeComentarInternamente,
} from '../lib/solicitacoes';

interface SolicitacoesProps {
  user: Profile;
}

export default function Solicitacoes({ user }: SolicitacoesProps) {
  const [todas, setTodas] = useState<Request[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const cache = localDb.getPageCache('solicitacoes_todas', {
    tipo: 'todos', status: 'abertas', criticidade: 'todas', setor: 'todos', busca: '',
  });
  const [tipo, setTipo] = useState<string>(cache.tipo);
  const [status, setStatus] = useState<string>(cache.status);
  const [criticidade, setCriticidade] = useState<string>(cache.criticidade);
  const [setor, setSetor] = useState<string>(cache.setor);
  const [busca, setBusca] = useState<string>(cache.busca);

  const [resposta, setResposta] = useState('');
  const [respostaInterna, setRespostaInterna] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  // Força a galeria e a thread a relerem o cache depois de uma resposta.
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    localDb.setPageCache('solicitacoes_todas', { tipo, status, criticidade, setor, busca });
  }, [tipo, status, criticidade, setor, busca]);

  useEffect(() => {
    carregar();
    return localDb.subscribe(carregar);
  }, []);

  const carregar = () => {
    setTodas(localDb.getRequests());
    setSectors(localDb.getSectors());
  };

  const nomeSetor = (id: string) => sectors.find(s => s.id === id)?.name || id;

  const filtradas = useMemo(() => {
    let lista = solicitacoesVisiveis(todas, user);

    lista = status === 'abertas'
      ? lista.filter(estaEmAberto)
      : status === 'todos' ? lista : lista.filter(r => r.status === status);

    if (tipo !== 'todos') lista = lista.filter(r => r.type === tipo);
    if (criticidade !== 'todas') lista = lista.filter(r => r.criticality === Number(criticidade));
    if (setor !== 'todos') lista = lista.filter(r => r.solicitante_sector_id === setor);

    const q = busca.trim().toLowerCase();
    if (q) {
      lista = lista.filter(r =>
        r.number.toLowerCase().includes(q) ||
        r.solicitante_name.toLowerCase().includes(q) ||
        (r.justificativa || '').toLowerCase().includes(q)
      );
    }

    // Mais crítica primeiro; empatando, a mais antiga — quem espera há mais
    // tempo aparece antes.
    return [...lista].sort((a, b) =>
      b.criticality - a.criticality ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [todas, user, status, tipo, criticidade, setor, busca]);

  const selecionadasReq = useMemo(
    () => filtradas.filter(r => selecionadas.has(r.id)),
    [filtradas, selecionadas]
  );

  const aberta = todas.find(r => r.id === abertaId) || null;
  const comentarios = aberta ? localDb.getRequestComments(aberta.id) : [];
  const itens = aberta ? localDb.getRequestItems(aberta.id) : [];

  const alternar = (id: string) => {
    const proximo = new Set(selecionadas);
    if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
    setSelecionadas(proximo);
  };

  const todasMarcadas = filtradas.length > 0 && filtradas.every(r => selecionadas.has(r.id));

  const alternarTodas = () => {
    setSelecionadas(todasMarcadas ? new Set() : new Set(filtradas.map(r => r.id)));
  };

  const handleExportar = () => {
    exportarSolicitacoes(selecionadasReq, sectors);
  };

  const handleBaixarAnexos = async () => {
    setOcupado(true);
    setAviso('');
    const { baixados, falhas } = await baixarAnexos(selecionadasReq);
    setOcupado(false);

    if (baixados === 0 && falhas.length === 0) {
      setAviso('Nenhuma das solicitações selecionadas tem anexo.');
    } else if (falhas.length > 0) {
      setAviso(`${baixados} anexo(s) baixado(s). Falharam: ${falhas.join(', ')}.`);
    } else {
      setAviso(`${baixados} anexo(s) baixado(s).`);
    }
  };

  const handleResponder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aberta || !resposta.trim()) return;

    setOcupado(true);
    await localDb.addComment(aberta.id, user.id, resposta.trim(), respostaInterna ? 'internal' : 'public');
    setResposta('');
    setOcupado(false);
    setVersao(v => v + 1);
    carregar();
  };

  const anexosNaSelecao = contarAnexos(selecionadasReq);

  return (
    <div className="space-y-6 text-left py-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
          <ClipboardList className="h-6 w-6" style={{ color: 'var(--brand)' }} /> Solicitações
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
          Todas as solicitações em aberto, para acompanhamento e resposta.
          {user.roles.includes('gestor') && !user.roles.includes('admin') && ' Você vê as do seu setor.'}
        </p>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
          <input
            type="text"
            placeholder="Buscar nº, solicitante ou justificativa..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border text-xs focus:outline-2 focus:outline-offset-1"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)', outlineColor: 'var(--brand)' }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
          <span className="flex items-center gap-1 font-semibold" style={{ color: 'var(--ink-secondary)' }}>
            <Filter className="h-3.5 w-3.5" /> Filtrar:
          </span>

          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border p-1 cursor-pointer" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}>
            <option value="abertas">Em aberto</option>
            <option value="todos">Todos os status</option>
            <option value="pendente">Aguardando aprovação</option>
            <option value="aprovada">Aprovada</option>
            <option value="aberto">Aberta</option>
            <option value="em_atendimento">Em atendimento</option>
            <option value="aguardando_solicitante">Aguardando solicitante</option>
            <option value="resolvido">Resolvida</option>
          </select>

          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded border p-1 cursor-pointer" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}>
            <option value="todos">Todos os tipos</option>
            <option value="compra">Compra</option>
            <option value="cadastro_sap">Cadastro SAP</option>
            <option value="chamado">Chamado</option>
          </select>

          <select value={criticidade} onChange={(e) => setCriticidade(e.target.value)} className="rounded border p-1 cursor-pointer" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}>
            <option value="todas">Toda criticidade</option>
            {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{rotuloCriticidade(n)}</option>)}
          </select>

          <select value={setor} onChange={(e) => setSetor(e.target.value)} className="rounded border p-1 cursor-pointer" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}>
            <option value="todos">Todos os setores</option>
            {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Ações da seleção */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
            {selecionadas.size} de {filtradas.length} selecionada(s)
          </span>

          <button
            type="button"
            disabled={selecionadasReq.length === 0}
            onClick={handleExportar}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar Excel
          </button>

          <button
            type="button"
            disabled={selecionadasReq.length === 0 || anexosNaSelecao === 0 || ocupado}
            onClick={handleBaixarAnexos}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
          >
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Baixar imagens{anexosNaSelecao > 0 ? ` (${anexosNaSelecao})` : ''}
          </button>

          {aviso && <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-secondary)' }}>{aviso}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">
        {/* Lista */}
        <TableShell>
          <table className="w-full text-left text-xs border-collapse">
            <TableHeadRow>
              <Th width="w-8">
                <input
                  type="checkbox"
                  checked={todasMarcadas}
                  onChange={alternarTodas}
                  aria-label="Selecionar todas as solicitações filtradas"
                  className="cursor-pointer"
                  style={{ accentColor: 'var(--brand)' }}
                />
              </Th>
              <Th label="Número" />
              <Th label="Tipo" />
              <Th label="Solicitante" />
              <Th label="Criticidade" />
              <Th label="Status" />
              <Th label="Aberta em" />
            </TableHeadRow>

            <TableBody>
              {filtradas.length === 0 ? (
                <tr>
                  <Td colSpan={7}>
                    <TableEmpty
                      icon={ClipboardList}
                      title="Nenhuma solicitação encontrada"
                      hint="Ajuste os filtros para ampliar a busca."
                    />
                  </Td>
                </tr>
              ) : (
                filtradas.map(r => (
                  <Tr key={r.id} onClick={() => setAbertaId(r.id)}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={selecionadas.has(r.id)}
                        onChange={() => alternar(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Selecionar solicitação ${r.number}`}
                        className="cursor-pointer"
                        style={{ accentColor: 'var(--brand)' }}
                      />
                    </Td>
                    <Td strong mono>#{r.number}</Td>
                    <Td>{rotuloTipo(r.type)}</Td>
                    <Td truncate title={r.solicitante_name}>
                      {r.solicitante_name}
                      <span className="block text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                        {nomeSetor(r.solicitante_sector_id)}
                      </span>
                    </Td>
                    <Td>{rotuloCriticidade(r.criticality)}</Td>
                    <Td>{rotuloStatus(r)}</Td>
                    <Td numeric>{formatDateBR(r.created_at)}</Td>
                  </Tr>
                ))
              )}
            </TableBody>
          </table>
        </TableShell>

        {/* Detalhe e resposta */}
        <div>
          {aberta ? (
            <div className="rounded-xl border p-5 space-y-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
              <div className="flex items-start justify-between border-b pb-3" style={{ borderColor: 'var(--hairline)' }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                    Solicitação #{aberta.number}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    {rotuloTipo(aberta.type)} · {rotuloStatus(aberta)} · {rotuloCriticidade(aberta.criticality)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAbertaId(null)}
                  className="text-xs font-semibold cursor-pointer"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  Fechar
                </button>
              </div>

              <div className="text-xs space-y-1">
                <p style={{ color: 'var(--ink-secondary)' }}>
                  <strong style={{ color: 'var(--ink-primary)' }}>{aberta.solicitante_name}</strong>
                  {' · '}{nomeSetor(aberta.solicitante_sector_id)}
                </p>
                {aberta.justificativa && (
                  <p className="italic leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                    &ldquo;{aberta.justificativa}&rdquo;
                  </p>
                )}
              </div>

              {itens.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                    Itens ({itens.length})
                  </h4>
                  <ul className="space-y-1 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                    {itens.map(it => (
                      <li key={it.id}>
                        {it.description} — {it.quantity} {it.unit}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-1.5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--ink-muted)' }}>
                  <Paperclip className="h-3 w-3" /> Anexos
                </h4>
                <AttachmentGallery
                  requestId={aberta.id}
                  refreshKey={versao}
                  emptyLabel="Nenhum anexo."
                />
              </div>

              {/* Thread */}
              <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
                <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                  Conversa ({comentarios.length})
                </h4>

                {comentarios.length === 0 ? (
                  <p className="text-[11px] italic" style={{ color: 'var(--ink-muted)' }}>
                    Nenhuma mensagem ainda.
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-64 overflow-y-auto">
                    {comentarios.map(c => (
                      <li
                        key={c.id}
                        className="rounded-lg p-2 text-[11px]"
                        style={{ background: c.is_internal ? 'var(--surface-sunken)' : 'var(--brand-wash)' }}
                      >
                        <p className="font-bold" style={{ color: 'var(--ink-primary)' }}>
                          {c.user_name}
                          {c.is_internal && (
                            <span className="ml-1 font-normal" style={{ color: 'var(--ink-muted)' }}>(interno)</span>
                          )}
                        </p>
                        <p style={{ color: 'var(--ink-secondary)' }}>{c.content}</p>
                      </li>
                    ))}
                  </ul>
                )}

                <form onSubmit={handleResponder} className="space-y-2">
                  <textarea
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    rows={3}
                    placeholder="Escreva sua resposta ao solicitante..."
                    className="w-full rounded-lg border p-2 text-xs focus:outline-2 focus:outline-offset-1"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)', outlineColor: 'var(--brand)' }}
                  />

                  {podeComentarInternamente(user) && (
                    <label className="flex items-center gap-1.5 text-[10px] cursor-pointer" style={{ color: 'var(--ink-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={respostaInterna}
                        onChange={(e) => setRespostaInterna(e.target.checked)}
                        style={{ accentColor: 'var(--brand)' }}
                      />
                      Nota interna (não visível ao solicitante)
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={!resposta.trim() || ocupado}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: 'var(--brand)' }}
                  >
                    {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Responder
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center space-y-2" style={{ borderColor: 'var(--hairline)' }}>
              <ClipboardList className="h-8 w-8 mx-auto" style={{ color: 'var(--ink-muted)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
                Nenhuma solicitação aberta
              </p>
              <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                Clique em uma linha para ver os detalhes, os anexos e responder.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
