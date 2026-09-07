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
  ClipboardList, Clock, Download, FileEdit, FileSpreadsheet, Filter, Loader2, PlusCircle, Search,
  HelpCircle, Bug, Lightbulb, Layers,
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, Request, RequestStatusHistory, Sector } from '../types';
import { formatDateBR } from '../lib/format';
import Modal, { ModalBody, ModalHeader } from '../components/ui/Modal';
import { TIPOS_EM_ORDEM, TIPO_VISUAL, type TipoVisual } from '../components/solicitacoes/tipoVisual';
import { TableEmpty } from '../components/ui/DataTable';
import RequestDetailPanel from '../components/solicitacoes/RequestDetailPanel';
import TourSpotlight from '../components/help/TourSpotlight';
import { usePageTour } from '../components/help/TourRegistryContext';
import type { TourStep } from '../components/help/types';
import {
  baixarAnexos, contarAnexos, estaEmAberto, exportarSolicitacoes,
  foiEditadaAposAprovacao, rotuloCriticidade, rotuloStatus, rotuloTipo,
} from '../lib/solicitacoes';
import {
  Escopo, FAIXAS, Faixa, Novidade, Pendencia, escopoPadrao, escoposDisponiveis,
  faixaDe, filtrarPorEscopo, indexarEventos, indexarPendencias, lerEstadoLeitura,
  marcarLida, marcarTodasLidas, novidade, ordenarFila, ordenarPorRecencia,
  registrarVisita, universoVisivel,
} from '../lib/solicitacoesCentral';

const CENTRAL_SOLICITACOES_TOUR_STEPS: TourStep[] = [
  {
    icon: ClipboardList,
    title: 'Bem-vindo à Central de Solicitações',
    description: 'Aqui você acompanha, responde e toma decisões sobre todos os pedidos de compra, cadastros no SAP e chamados de suporte em um só lugar.',
  },
  {
    target: 'solicitacoes-header',
    icon: PlusCircle,
    title: 'Visão geral e nova solicitação',
    description: 'Veja o escopo ativo e acione o botão "+ Nova solicitação" para abrir um novo pedido de compra, chamado ou cadastro SAP a qualquer momento.',
  },
  {
    target: 'solicitacoes-abas',
    icon: Layers,
    title: 'Abas de escopo dinâmico',
    description: 'Alterne entre "Precisa de mim" (suas pendências ativas de aprovação ou resposta), "Minhas solicitações" (pedidos criados por você), "Do meu setor" e "Todas".',
  },
  {
    target: 'solicitacoes-busca',
    icon: Search,
    title: 'Busca instantânea',
    description: 'Localize rapidamente qualquer solicitação digitando o número (ex: #123), o nome do solicitante ou palavras-chave da justificativa.',
  },
  {
    target: 'solicitacoes-tipos',
    icon: Filter,
    title: 'Composição por tipo em chips',
    description: 'Filtre instantaneamente apenas Compras, Cadastros SAP ou Chamados. A contagem em tempo real em cada chip mostra a distribuição da fila sem precisar abrir menus.',
  },
  {
    target: 'solicitacoes-filtros',
    icon: Filter,
    title: 'Filtros de criticidade e setor',
    description: 'Filtre por grau de criticidade (urgência) e setor responsável, ou marque para exibir solicitações já concluídas no histórico.',
  },
  {
    target: 'solicitacoes-lista',
    icon: ClipboardList,
    title: 'Lista inteligente por faixas',
    description: 'As solicitações são organizadas por urgência e recência. Clique em qualquer cartão para abrir a janela de detalhes completos, anexos e chat com o time.',
  },
  {
    target: 'help-button',
    icon: HelpCircle,
    title: 'Reabra o tour a qualquer momento',
    description: 'Ficou com alguma dúvida ou quer rever as dicas desta tela? Clique neste botão a qualquer momento no canto inferior e escolha "Tour guiado desta página".',
  },
  {
    target: 'help-button',
    icon: Bug,
    title: 'Encontrou um erro nesta tela?',
    description: 'No mesmo botão, escolha "Reportar um erro" para descrever o problema — o histórico técnico recente da sessão vai junto, direto para o time responsável.',
  },
  {
    target: 'help-button',
    icon: Lightbulb,
    title: 'Tem uma ideia de melhoria?',
    description: 'Escolha "Enviar sugestão" no mesmo botão para propor uma melhoria a qualquer momento, sem sair da tela.',
  },
];

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
  const tour = usePageTour('central-solicitacoes', CENTRAL_SOLICITACOES_TOUR_STEPS.length);
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

  const idsEditadasAposAprovacao = useMemo(() => {
    const todosHistoricos = localDb.getAllRequestHistory();
    const map = new Map<string, RequestStatusHistory[]>();
    for (const h of todosHistoricos) {
      let arr = map.get(h.request_id);
      if (!arr) {
        arr = [];
        map.set(h.request_id, arr);
      }
      arr.push(h);
    }

    const editadas = new Set<string>();
    for (const req of todas) {
      if (['pendente', 'em_revisao'].includes(req.status)) {
        const hist = map.get(req.id) || [];
        if (foiEditadaAposAprovacao(req, hist)) {
          editadas.add(req.id);
        }
      }
    }
    return editadas;
  }, [todas]);

  const idsComItemGenerico = useMemo(() => {
    const set = new Set<string>();
    for (const req of todas) {
      if (req.type === 'compra') {
        const itens = localDb.getRequestItems(req.id);
        if (itens.some(it => it.is_generic)) {
          set.add(req.id);
        }
      }
    }
    return set;
  }, [todas]);

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
      <header data-tour="solicitacoes-header" className="flex flex-wrap items-start justify-between gap-3">
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
        data-tour="solicitacoes-abas"
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
        <div data-tour="solicitacoes-busca" className="relative max-w-md">
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
        <div data-tour="solicitacoes-tipos" className="flex flex-wrap items-center gap-1.5 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
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

        <div data-tour="solicitacoes-filtros" className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm" style={{ borderColor: 'var(--hairline)' }}>
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
      <div data-tour="solicitacoes-lista" className="min-w-0 space-y-6">
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
                      ehEditadaAposAprovacao={idsEditadasAposAprovacao.has(linha.request.id)}
                      temItemGenerico={idsComItemGenerico.has(linha.request.id)}
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
            <div className="flex flex-1 items-center justify-between gap-3 mr-6">
              <div className="flex items-center gap-2.5">
                <ChipTipoIcone
                  tipo={aberta.type}
                  apagado={aberta.type === 'compra' && (aberta.status === 'pendente' || aberta.status === 'em_revisao')}
                />
                <div className="min-w-0">
                  <h3 className="font-mono text-base font-bold" style={{ color: 'var(--ink-primary)' }}>
                    #{aberta.number}
                  </h3>
                  <p className="truncate text-[13px]" style={{ color: 'var(--ink-muted)' }}>
                    {TIPO_VISUAL[aberta.type].rotulo} · aberta em {formatDateBR(aberta.created_at)}
                  </p>
                </div>
              </div>

              {aberta.type === 'compra' && aberta.status === 'pendente' && (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs sm:text-sm font-black uppercase tracking-wider shadow-xs bg-amber-100/90 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700/80">
                    <Clock className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                    Aguardando aprovação
                  </span>
                  {idsEditadasAposAprovacao.has(aberta.id) && (
                    <span
                      title="Esta solicitação já havia sido aprovada anteriormente e voltou para a fila após ser editada pelo solicitante"
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs sm:text-sm font-black uppercase tracking-wider shadow-xs bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700/80"
                    >
                      <FileEdit className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                      Editada
                    </span>
                  )}
                </div>
              )}

              {aberta.type === 'compra' && aberta.status === 'em_revisao' && (
                <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs sm:text-sm font-black uppercase tracking-wider shadow-xs bg-amber-100/90 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700/80">
                  <Clock className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                  Em revisão
                </span>
              )}
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

      {tour.isOpen && (
        <TourSpotlight
          steps={CENTRAL_SOLICITACOES_TOUR_STEPS}
          stepIndex={tour.stepIndex}
          onNext={tour.next}
          onBack={tour.back}
          onClose={tour.close}
        />
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
function ChipTipoIcone({
  tipo, tamanho = 'md', apagado = false,
}: {
  tipo: Request['type'];
  tamanho?: 'sm' | 'md';
  apagado?: boolean;
}) {
  const visual = TIPO_VISUAL[tipo];
  const Icone = visual.icone;
  const medida = tamanho === 'sm' ? 'h-6 w-6' : 'h-9 w-9';
  const icone = tamanho === 'sm' ? 'h-4 w-4' : 'h-4.5 w-4.5';

  return (
    <span
      className={`flex ${medida} shrink-0 items-center justify-center rounded-lg transition-colors`}
      style={{
        background: apagado ? 'color-mix(in srgb, var(--ink-muted) 12%, transparent)' : visual.fundo,
        color: apagado ? 'var(--ink-muted)' : visual.cor,
      }}
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
  linha, ativa, selecionavel, selecionada, onSelecionar, onAbrir, nomeSetor, ehEditadaAposAprovacao, temItemGenerico,
}: {
  linha: Linha;
  ativa: boolean;
  selecionavel: boolean;
  selecionada: boolean;
  onSelecionar: () => void;
  onAbrir: () => void;
  nomeSetor: (id: string) => string;
  ehEditadaAposAprovacao?: boolean;
  temItemGenerico?: boolean;
}) {
  const { request: r, pendencia, novidade: nova } = linha;
  const visual = TIPO_VISUAL[r.type];
  const corCriticidade = CORES_CRITICIDADE[r.criticality];

  const ehCompraAguardandoAprovacao = r.type === 'compra' && r.status === 'pendente';
  const ehCompraEmRevisao = r.type === 'compra' && r.status === 'em_revisao';
  const ehCompraNaoAprovada = ehCompraAguardandoAprovacao || ehCompraEmRevisao;

  return (
    <li
      className={`flex min-w-0 items-stretch overflow-hidden rounded-xl border transition-all duration-200 ${
        ehCompraNaoAprovada ? 'opacity-85 hover:opacity-100 border-dashed' : ''
      }`}
      style={{
        borderColor: ativa
          ? visual.cor
          : ehCompraNaoAprovada
            ? 'var(--hairline-strong)'
            : 'var(--hairline)',
        background: ehCompraNaoAprovada ? 'var(--surface-sunken)' : 'var(--surface-card)',
      }}
    >
      {/* Faixa da cor do tipo: numa lista longa, dá para separar os blocos de
          compra e de chamado sem ler nada. Suavizada quando a compra ainda não foi aprovada. */}
      <span
        aria-hidden
        className="w-1 shrink-0"
        style={{
          background: ehCompraNaoAprovada
            ? 'color-mix(in srgb, var(--series-1) 35%, var(--hairline-strong))'
            : visual.cor,
        }}
      />

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
        <ChipTipoIcone tipo={r.type} apagado={ehCompraNaoAprovada} />

        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="font-mono text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              #{r.number}
            </span>
            <span
              className="text-xs font-bold uppercase tracking-wide"
              style={{ color: ehCompraNaoAprovada ? 'var(--ink-muted)' : visual.cor }}
            >
              {visual.rotulo}
            </span>

            {/* Status grande em destaque para compras ainda não aprovadas */}
            {ehCompraAguardandoAprovacao && (
              <>
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-sm font-black uppercase tracking-wider shadow-xs bg-amber-100/90 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700/80"
                >
                  <Clock className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                  Aguardando aprovação
                </span>
                {ehEditadaAposAprovacao && (
                  <span
                    title="Esta solicitação já havia sido aprovada anteriormente e voltou para a fila após ser editada pelo solicitante"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs sm:text-sm font-black uppercase tracking-wider shadow-xs bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700/80"
                  >
                    <FileEdit className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                    Editada
                  </span>
                )}
              </>
            )}

            {temItemGenerico && (
              <span
                title="Esta solicitação possui item(ns) genérico(s)"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs sm:text-sm font-black uppercase tracking-wider shadow-xs bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-700/80"
              >
                Item Genérico
              </span>
            )}

            {ehCompraEmRevisao && (
              <span
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-sm font-black uppercase tracking-wider shadow-xs bg-amber-100/90 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700/80"
              >
                <Clock className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                Em revisão
              </span>
            )}

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
            {!ehCompraNaoAprovada && <span>{rotuloStatus(r)}</span>}
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
