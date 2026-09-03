/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Central de Solicitações — uma tela para acompanhar, responder e decidir.
 *
 * Substitui Minhas Solicitações, a fila coletiva e Aprovações. As três eram a
 * mesma tabela com recortes diferentes, e a pessoa tinha de adivinhar em qual
 * delas a sua solicitação tinha ido parar. Aqui o recorte virou aba e a lista
 * deixou de ser ordenada por status para ser ordenada por *o que precisa de
 * você agora* — a única pergunta que todo mundo abria a tela para responder.
 *
 * As regras vivem em `lib/solicitacoesCentral.ts`; esta view é interface.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Download, FileSpreadsheet, Filter, Loader2, PlusCircle, Search,
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, Request, Sector } from '../types';
import { formatDateBR } from '../lib/format';
import Modal, { ModalBody, ModalHeader } from '../components/ui/Modal';
import { TIPOS_EM_ORDEM, TIPO_VISUAL, type TipoVisual } from '../components/solicitacoes/tipoVisual';
import { TableEmpty } from '../components/ui/DataTable';
import RequestDetailPanel from '../components/solicitacoes/RequestDetailPanel';
import {
  baixarAnexos, contarAnexos, estaEmAberto, exportarSolicitacoes,
  rotuloCriticidade, rotuloStatus, rotuloTipo,
} from '../lib/solicitacoes';
import {
  Escopo, FAIXAS, Faixa, Novidade, Pendencia, escopoPadrao, escoposDisponiveis,
  faixaDe, filtrarPorEscopo, indexarEventos, indexarPendencias, lerEstadoLeitura,
  marcarLida, marcarTodasLidas, novidade, ordenarFila, ordenarPorRecencia,
  registrarVisita, universoVisivel,
} from '../lib/solicitacoesCentral';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
  escopoInicial?: Escopo;
}

interface Linha {
  request: Request;
  pendencia: Pendencia | null;
  novidade: Novidade | null;
  faixa: Faixa;
}

export default function SolicitacoesCentral({ user, onNavigate, escopoInicial }: Props) {
  const abas = useMemo(() => escoposDisponiveis(user), [user]);

  const cache = localDb.getPageCache('solicitacoes_central', {
    escopo: escopoInicial || escopoPadrao(user),
    busca: '',
    tipo: 'todos',
    criticidade: 'todas',
    setor: 'todos',
    mostrarConcluidas: false,
  });

  const [escopo, setEscopo] = useState<Escopo>(
    abas.some(a => a.id === (escopoInicial || cache.escopo))
      ? (escopoInicial || cache.escopo)
      : escopoPadrao(user),
  );
  const [busca, setBusca] = useState<string>(cache.busca);
  const [tipo, setTipo] = useState<string>(cache.tipo);
  const [criticidade, setCriticidade] = useState<string>(cache.criticidade);
  const [setor, setSetor] = useState<string>(cache.setor);
  const [mostrarConcluidas, setMostrarConcluidas] = useState<boolean>(cache.mostrarConcluidas);

  const [todas, setTodas] = useState<Request[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');

  // Estado de leitura: guardado fora do React (IndexedDB) e espelhado aqui,
  // para a lista redesenhar assim que uma solicitação deixa de ser novidade.
  const [leitura, setLeitura] = useState(() => lerEstadoLeitura(user.id));
  // Congelado na montagem: se recalculasse a cada render, a faixa "Novidades"
  // se esvaziaria embaixo do usuário no instante em que ele clicasse no item.
  const [leituraDaSessao] = useState(() => lerEstadoLeitura(user.id));

  useEffect(() => {
    localDb.setPageCache('solicitacoes_central', {
      escopo, busca, tipo, criticidade, setor, mostrarConcluidas,
    });
  }, [escopo, busca, tipo, criticidade, setor, mostrarConcluidas]);

  const carregar = () => {
    setTodas(localDb.getRequests());
    setSectors(localDb.getSectors());
  };

  /**
   * Lê `?id=` e `?escopo=` do endereço.
   *
   * Precisa rodar também no `hashchange`, não só na montagem: quem já está na
   * Central e clica numa notificação continua na mesma rota, então o React não
   * remonta a tela e o `?id=` novo passaria despercebido — a notificação
   * parecia não fazer nada.
   */
  const aplicarUrl = () => {
    const params = new URLSearchParams((window.location.hash.split('?')[1]) || '');

    const escopoUrl = params.get('escopo') as Escopo | null;
    if (escopoUrl && abas.some(a => a.id === escopoUrl)) setEscopo(escopoUrl);

    const id = params.get('id');
    if (id) abrir(id);
  };

  useEffect(() => {
    carregar();
    registrarVisita(user.id);
    aplicarUrl();

    window.addEventListener('hashchange', aplicarUrl);
    const cancelarSubscribe = localDb.subscribe(carregar);

    return () => {
      window.removeEventListener('hashchange', aplicarUrl);
      cancelarSubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  /* Índices ---------------------------------------------------------------- */

  const universo = useMemo(() => universoVisivel(todas, user), [todas, user]);

  const eventos = useMemo(
    () => indexarEventos(localDb.getAllRequestComments(), localDb.getAllRequestHistory()),
    [todas],
  );

  const pendencias = useMemo(
    () => indexarPendencias(universo, user, eventos.conversa),
    [universo, user, eventos],
  );

  const totalPendencias = pendencias.size;

  /* Lista ------------------------------------------------------------------ */

  /**
   * Tudo do escopo depois dos filtros, EXCETO o de tipo.
   *
   * Separado para que os chips de tipo possam mostrar a contagem real de cada
   * um: se contassem sobre a lista já filtrada por tipo, escolher "Compras"
   * zeraria os outros chips e a fileira deixaria de dizer o que existe na fila.
   */
  const antesDoTipo = useMemo(() => {
    let lista = filtrarPorEscopo(universo, user, escopo, pendencias);

    if (criticidade !== 'todas') lista = lista.filter(r => r.criticality === Number(criticidade));
    if (setor !== 'todos') lista = lista.filter(r => r.solicitante_sector_id === setor);

    const q = busca.trim().toLowerCase();
    if (q) {
      lista = lista.filter(r =>
        r.number.toLowerCase().includes(q) ||
        r.solicitante_name.toLowerCase().includes(q) ||
        (r.justificativa || '').toLowerCase().includes(q),
      );
    }
    return lista;
  }, [universo, user, escopo, pendencias, criticidade, setor, busca]);

  const contagemPorTipo = useMemo(() => {
    const contagem = { total: antesDoTipo.length, compra: 0, cadastro_sap: 0, chamado: 0 };
    for (const r of antesDoTipo) contagem[r.type]++;
    return contagem;
  }, [antesDoTipo]);

  const linhas: Linha[] = useMemo(() => {
    const lista = tipo === 'todos' ? antesDoTipo : antesDoTipo.filter(r => r.type === tipo);

    return lista.map(r => {
      const p = pendencias.get(r.id) || null;
      const n = novidade(r, user, leituraDaSessao, eventos, rotuloStatus);
      return { request: r, pendencia: p, novidade: n, faixa: faixaDe(r, !!p, !!n) };
    });
  }, [antesDoTipo, tipo, pendencias, user, eventos, leituraDaSessao]);

  const porFaixa = useMemo(() => {
    const mapa = new Map<Faixa, Linha[]>();
    for (const faixa of FAIXAS) {
      const desta = linhas.filter(l => l.faixa === faixa.id);
      mapa.set(
        faixa.id,
        faixa.id === 'concluidas'
          ? ordenarPorRecencia(desta.map(l => l.request)).map(r => desta.find(l => l.request.id === r.id)!)
          : ordenarFila(desta.map(l => l.request)).map(r => desta.find(l => l.request.id === r.id)!),
      );
    }
    return mapa;
  }, [linhas]);

  const faixasVisiveis = FAIXAS.filter(f =>
    f.id === 'concluidas' ? mostrarConcluidas : true,
  );

  const concluidasOcultas = mostrarConcluidas ? 0 : (porFaixa.get('concluidas')?.length ?? 0);

  const aberta = universo.find(r => r.id === abertaId) || todas.find(r => r.id === abertaId) || null;

  /* Ações ------------------------------------------------------------------ */

  function abrir(id: string) {
    setAbertaId(id);
    setLeitura(marcarLida(user.id, id));
    localDb.markRequestNotificationsAsRead(user.id, id);
  }

  const fechar = () => setAbertaId(null);

  const limparNovidades = () => {
    const ids = linhas.filter(l => l.novidade).map(l => l.request.id);
    setLeitura(marcarTodasLidas(user.id, ids));
    // `leituraDaSessao` continua congelado de propósito: as linhas somem da
    // faixa só no próximo carregamento da tela, e não sob o cursor.
    setAviso(`${ids.length} novidade(s) marcada(s) como vista(s).`);
  };

  const alternarSelecao = (id: string) => {
    const proximo = new Set(selecionadas);
    if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
    setSelecionadas(proximo);
  };

  const selecionadasReq = useMemo(
    () => linhas.filter(l => selecionadas.has(l.request.id)).map(l => l.request),
    [linhas, selecionadas],
  );

  const baixar = async () => {
    setOcupado(true);
    setAviso('');
    const { baixados, falhas } = await baixarAnexos(selecionadasReq);
    setOcupado(false);

    if (baixados === 0 && falhas.length === 0) setAviso('Nenhuma das selecionadas tem anexo.');
    else if (falhas.length > 0) setAviso(`${baixados} anexo(s) baixado(s). Falharam: ${falhas.join(', ')}.`);
    else setAviso(`${baixados} anexo(s) baixado(s).`);
  };

  const nomeSetor = (id: string) => sectors.find(s => s.id === id)?.name || id;
  const abaAtiva = abas.find(a => a.id === escopo) || abas[0];
  const modoFila = escopo === 'todas' || escopo === 'setor';

  /* Desenho ---------------------------------------------------------------- */

  return (
    <div className="space-y-5 py-4 text-left">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight" style={{ color: 'var(--ink-primary)' }}>
            <ClipboardList className="h-6 w-6" style={{ color: 'var(--brand)' }} /> Solicitações
          </h2>
          <p className="mt-1 text-base" style={{ color: 'var(--ink-secondary)' }}>
            {abaAtiva.descricao}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('/solicitacoes/nova')}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold text-white cursor-pointer"
          style={{ background: 'var(--brand)' }}
        >
          <PlusCircle className="h-4 w-4" /> Nova solicitação
        </button>
      </header>

      {/* Abas de escopo */}
      <nav
        className="flex flex-wrap gap-1 rounded-xl border p-1"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
        aria-label="Recorte das solicitações"
      >
        {abas.map(aba => {
          const ativa = aba.id === escopo;
          return (
            <button
              key={aba.id}
              type="button"
              onClick={() => setEscopo(aba.id)}
              aria-current={ativa ? 'page' : undefined}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold cursor-pointer transition-colors"
              style={ativa
                ? { background: 'var(--brand)', color: '#fff' }
                : { color: 'var(--ink-secondary)' }}
            >
              {aba.label}
              {aba.id === 'acao' && totalPendencias > 0 && (
                <span
                  className="rounded-full px-1.5 text-xs font-bold tabular-nums"
                  style={ativa
                    ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                    : { background: 'var(--status-critical)', color: '#fff' }}
                >
                  {totalPendencias}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Filtros */}
      <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar nº, solicitante ou justificativa…"
            className="w-full rounded-lg border py-2 pl-9 pr-4 text-sm focus:outline-2 focus:outline-offset-1"
            style={campo}
          />
        </div>

        {/*
          Tipo saiu do `select` e virou uma fileira de chips com ícone, cor e
          contagem. Num `select` fechado o recorte por tipo era invisível — e
          era justamente a separação que se perdia numa lista de dez cartões
          quase idênticos. Aqui a composição da fila se lê sem abrir nada.
        */}
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
          <ChipTipo
            ativo={tipo === 'todos'}
            onClick={() => setTipo('todos')}
            rotulo="Todos"
            contagem={contagemPorTipo.total}
          />
          {TIPOS_EM_ORDEM.map(t => (
            <ChipTipo
              key={t}
              ativo={tipo === t}
              onClick={() => setTipo(tipo === t ? 'todos' : t)}
              rotulo={TIPO_VISUAL[t].plural}
              contagem={contagemPorTipo[t]}
              visual={TIPO_VISUAL[t]}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm" style={{ borderColor: 'var(--hairline)' }}>
          <span className="flex items-center gap-1 font-semibold" style={{ color: 'var(--ink-secondary)' }}>
            <Filter className="h-4 w-4" /> Filtrar:
          </span>

          <select value={criticidade} onChange={e => setCriticidade(e.target.value)} className="cursor-pointer rounded border p-1" style={campo}>
            <option value="todas">Toda criticidade</option>
            {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{rotuloCriticidade(n)}</option>)}
          </select>

          {modoFila && (
            <select value={setor} onChange={e => setSetor(e.target.value)} className="cursor-pointer rounded border p-1" style={campo}>
              <option value="todos">Todos os setores</option>
              {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          <label className="flex cursor-pointer items-center gap-1.5 font-semibold" style={{ color: 'var(--ink-secondary)' }}>
            <input
              type="checkbox"
              checked={mostrarConcluidas}
              onChange={e => setMostrarConcluidas(e.target.checked)}
              style={{ accentColor: 'var(--brand)' }}
            />
            Mostrar concluídas{concluidasOcultas > 0 ? ` (${concluidasOcultas})` : ''}
          </label>
        </div>

        {/* Seleção em lote — só onde ela serve: operando a fila */}
        {modoFila && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--ink-secondary)' }}>
              {selecionadas.size} de {linhas.length} selecionada(s)
            </span>

            <BotaoBarra
              onClick={() => exportarSolicitacoes(selecionadasReq, sectors)}
              disabled={selecionadasReq.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
            </BotaoBarra>

            <BotaoBarra
              onClick={baixar}
              disabled={selecionadasReq.length === 0 || contarAnexos(selecionadasReq) === 0 || ocupado}
            >
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar anexos
            </BotaoBarra>

            {linhas.some(l => l.novidade) && (
              <BotaoBarra onClick={limparNovidades}>Marcar novidades como vistas</BotaoBarra>
            )}

            {aviso && (
              <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-secondary)' }}>{aviso}</span>
            )}
          </div>
        )}
      </div>

      {/*
        A lista ocupa a largura toda: o detalhe abre em janela suspensa, não
        mais numa coluna lateral. Numa coluna de 440px a conversa e a lista de
        itens ficavam espremidas, e a lista perdia metade da tela mesmo quando
        nada estava selecionado.
      */}
      <div className="min-w-0 space-y-6">
        {linhas.length === 0 ? (
          <TableEmpty
            icon={ClipboardList}
            title={escopo === 'acao' ? 'Nada esperando você' : 'Nenhuma solicitação neste recorte'}
            hint={escopo === 'acao'
              ? 'Quando alguma solicitação depender de uma ação sua, ela aparece aqui.'
              : 'Ajuste os filtros ou troque de aba para ampliar a busca.'}
          />
        ) : (
          faixasVisiveis.map(faixa => {
            const desta = porFaixa.get(faixa.id) || [];
            if (desta.length === 0) return null;

            return (
              <section key={faixa.id} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                    {faixa.titulo}
                    <span className="tabular-nums font-normal">({desta.length})</span>
                    {/* Composição da faixa por tipo: quantas compras, quantos
                        chamados. Numa faixa de dez itens, dizer "9 chamados e
                        1 compra" evita a varredura cartão a cartão. */}
                    <ResumoTipos linhas={desta} />
                  </h3>
                  {faixa.id === 'novidades' && !modoFila && (
                    <button
                      type="button"
                      onClick={limparNovidades}
                      className="text-[13px] font-bold cursor-pointer"
                      style={{ color: 'var(--brand)' }}
                    >
                      Marcar como vistas
                    </button>
                  )}
                </div>

                <ul className="space-y-2">
                  {desta.map(linha => (
                    <CartaoSolicitacao
                      key={linha.request.id}
                      linha={linha}
                      ativa={linha.request.id === abertaId}
                      selecionavel={modoFila}
                      selecionada={selecionadas.has(linha.request.id)}
                      onSelecionar={() => alternarSelecao(linha.request.id)}
                      onAbrir={() => abrir(linha.request.id)}
                      nomeSetor={nomeSetor}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>

      {/* Detalhe — sempre em janela suspensa */}
      {aberta && (
        <Modal onClose={fechar} maxWidth="max-w-4xl" ariaLabel={`Solicitação ${aberta.number}`}>
          <ModalHeader onClose={fechar}>
            <div className="flex items-center gap-2.5">
              <ChipTipoIcone tipo={aberta.type} />
              <div className="min-w-0">
                <h3 className="font-mono text-base font-bold" style={{ color: 'var(--ink-primary)' }}>
                  #{aberta.number}
                </h3>
                <p className="truncate text-[13px]" style={{ color: 'var(--ink-muted)' }}>
                  {TIPO_VISUAL[aberta.type].rotulo} · aberta em {formatDateBR(aberta.created_at)}
                </p>
              </div>
            </div>
          </ModalHeader>
          <ModalBody>
            <RequestDetailPanel
              request={aberta}
              user={user}
              sectors={sectors}
              pendencia={pendencias.get(aberta.id) || null}
              onNavigate={onNavigate}
              onChanged={carregar}
            />
          </ModalBody>
        </Modal>
      )}
    </div>
  );
}

/* Peças ------------------------------------------------------------------- */

const campo: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
  outlineColor: 'var(--brand)',
};

function BotaoBarra({
  children, onClick, disabled,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
    >
      {children}
    </button>
  );
}

/* Tipo — ícone, cor e contagem --------------------------------------------- */

/** Chip quadrado com o ícone do tipo. É o que se enxerga antes de ler o cartão. */
function ChipTipoIcone({ tipo, tamanho = 'md' }: { tipo: Request['type']; tamanho?: 'sm' | 'md' }) {
  const visual = TIPO_VISUAL[tipo];
  const Icone = visual.icone;
  const medida = tamanho === 'sm' ? 'h-6 w-6' : 'h-9 w-9';
  const icone = tamanho === 'sm' ? 'h-4 w-4' : 'h-4.5 w-4.5';

  return (
    <span
      className={`flex ${medida} shrink-0 items-center justify-center rounded-lg`}
      style={{ background: visual.fundo, color: visual.cor }}
      title={visual.rotulo}
    >
      <Icone className={icone} />
    </span>
  );
}

/** Chip de filtro por tipo, com a contagem do recorte atual. */
function ChipTipo({
  ativo, onClick, rotulo, contagem, visual,
}: {
  ativo: boolean;
  onClick: () => void;
  rotulo: string;
  contagem: number;
  visual?: TipoVisual;
}) {
  const Icone = visual?.icone;
  const cor = visual?.cor ?? 'var(--ink-secondary)';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      disabled={contagem === 0 && !ativo}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-bold cursor-pointer transition-colors disabled:cursor-default disabled:opacity-40"
      style={{
        borderColor: ativo ? cor : 'var(--hairline)',
        background: ativo ? (visual?.fundo ?? 'var(--surface-sunken)') : 'var(--surface-card)',
        color: ativo ? cor : 'var(--ink-secondary)',
      }}
    >
      {Icone && <Icone className="h-4 w-4" style={{ color: cor }} />}
      {rotulo}
      <span className="tabular-nums font-normal" style={{ color: ativo ? cor : 'var(--ink-muted)' }}>
        {contagem}
      </span>
    </button>
  );
}

/** Composição de uma faixa por tipo — "9 chamados · 1 compra". */
function ResumoTipos({ linhas }: { linhas: Linha[] }) {
  const contagem = TIPOS_EM_ORDEM
    .map(t => ({ tipo: t, n: linhas.filter(l => l.request.type === t).length }))
    .filter(c => c.n > 0);

  // Faixa de um tipo só não precisa de resumo: o ícone de cada cartão já diz.
  if (contagem.length < 2) return null;

  return (
    <span className="flex items-center gap-2 font-normal normal-case tracking-normal">
      {contagem.map(({ tipo, n }) => {
        const visual = TIPO_VISUAL[tipo];
        const Icone = visual.icone;
        return (
          <span key={tipo} className="flex items-center gap-1" style={{ color: visual.cor }}>
            <Icone className="h-3.5 w-3.5" />
            <span className="tabular-nums">{n}</span>
          </span>
        );
      })}
    </span>
  );
}

/* Cartão ------------------------------------------------------------------- */

/** Cor do selo de criticidade. Grau 1 e 2 não recebem selo — não é notícia. */
const CORES_CRITICIDADE: Record<number, string> = {
  3: 'var(--status-warning)',
  4: 'var(--status-serious)',
  5: 'var(--status-critical)',
};

function CartaoSolicitacao({
  linha, ativa, selecionavel, selecionada, onSelecionar, onAbrir, nomeSetor,
}: {
  linha: Linha;
  ativa: boolean;
  selecionavel: boolean;
  selecionada: boolean;
  onSelecionar: () => void;
  onAbrir: () => void;
  nomeSetor: (id: string) => string;
}) {
  const { request: r, pendencia, novidade: nova } = linha;
  const visual = TIPO_VISUAL[r.type];
  const corCriticidade = CORES_CRITICIDADE[r.criticality];

  return (
    <li
      className="flex min-w-0 items-stretch overflow-hidden rounded-xl border transition-colors"
      style={{
        borderColor: ativa ? visual.cor : 'var(--hairline)',
        background: 'var(--surface-card)',
      }}
    >
      {/* Faixa da cor do tipo: numa lista longa, dá para separar os blocos de
          compra e de chamado sem ler nada. */}
      <span aria-hidden className="w-1 shrink-0" style={{ background: visual.cor }} />

      {selecionavel && (
        <label className="flex items-center pl-3">
          <input
            type="checkbox"
            checked={selecionada}
            onChange={onSelecionar}
            aria-label={`Selecionar solicitação ${r.number}`}
            className="cursor-pointer"
            style={{ accentColor: 'var(--brand)' }}
          />
        </label>
      )}

      <button
        type="button"
        onClick={onAbrir}
        className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 p-4 text-left"
      >
        <ChipTipoIcone tipo={r.type} />

        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              #{r.number}
            </span>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: visual.cor }}>
              {visual.rotulo}
            </span>

            {corCriticidade && (
              <span
                className="rounded px-1.5 py-0.5 text-xs font-bold"
                style={{ background: `color-mix(in srgb, ${corCriticidade} 15%, transparent)`, color: corCriticidade }}
              >
                {rotuloCriticidade(r.criticality)}
              </span>
            )}

            {pendencia && (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-bold"
                style={{ background: 'var(--brand)', color: '#fff' }}
              >
                {pendencia.rotulo}
              </span>
            )}

            {!pendencia && nova && (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-bold"
                style={{ background: 'var(--brand-wash)', color: 'var(--brand-strong)' }}
              >
                {nova.texto}
              </span>
            )}
          </span>

          <span className="block truncate text-sm" style={{ color: 'var(--ink-secondary)' }}>
            {r.justificativa || 'Sem justificativa'}
          </span>

          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
            <span>{r.solicitante_name} · {nomeSetor(r.solicitante_sector_id)}</span>
            <span>{rotuloStatus(r)}</span>
            <span className="tabular-nums">
              {estaEmAberto(r) ? `aberta em ${formatDateBR(r.created_at)}` : `encerrada em ${formatDateBR(r.updated_at)}`}
            </span>
            {nova && <span>{nova.autor}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}
