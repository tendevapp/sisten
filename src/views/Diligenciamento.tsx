/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Diligenciamento de Pedidos de Compra (Suprimentos).
 *
 * Acompanha, por PO, o que já foi comprado (ZL0132) e ainda não chegou:
 * fornecedor, valor, remessa, a previsão de chegada calculada a partir da UF
 * do fornecedor e da transportadora, e o estado de chegada já confirmado no
 * Rastreio Compras. Transportadora e faturamento são digitados aqui — não
 * existem em nenhuma planilha SAP.
 *
 * Esta view só desenha; a agregação e os cálculos vivem em
 * `lib/diligenciamento.ts`, e a leitura/escrita das tabelas novas em
 * `lib/diligenciamentoApi.ts`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronRight, Download, Loader2, Search,
  Settings2, Truck, X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { CidadeForn, DiligenciamentoItem, EnrichedSAPRecord, PrazoTransporte, Profile } from '../types';
import { useToast } from '../components/ui/Toast';
import { formatBRL, formatDateBR } from '../lib/format';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../components/ui/Modal';
import { TableBody, TableEmpty, TableHeadRow, TableShell, Td, Th, Tr } from '../components/ui/DataTable';
import {
  EstadoChegada, FiltrosDiligenciamento, ItemDiligenciamento, PedidoDiligenciamento,
  agruparPorPo, dataValida, filtrarPedidos, indexarCidadesPorCodigo, montarItens,
  normalizarChaveTransportadora, ordenarPedidos, pedidoVencido, resolverPrazoDias,
  somarDiasCorridos, transportadorasConhecidas, ufsDisponiveis,
} from '../lib/diligenciamento';
import {
  excluirPrazoTransporte, gravarPrevisaoNoRastreio, listarDiligenciamentoItens,
  listarPrazosTransporte, regiaoUfBrutaPorRi, salvarDiligenciamentoItens,
  salvarPrazoTransporte, trocarTransportadora,
} from '../lib/diligenciamentoApi';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const ESTADO_META: Record<EstadoChegada, { rotulo: string; cor: string; fundo: string }> = {
  pendente: { rotulo: 'Pendente', cor: 'var(--ink-muted)', fundo: 'var(--surface-sunken)' },
  parcial: { rotulo: 'Parcial', cor: 'var(--status-warning)', fundo: 'color-mix(in srgb, var(--status-warning) 15%, transparent)' },
  chegou: { rotulo: 'Chegou', cor: 'var(--status-good)', fundo: 'color-mix(in srgb, var(--status-good) 15%, transparent)' },
};

/** Valor comum a todos os itens de um campo, ou '' quando eles divergem — para os controles do cabeçalho do PO não mostrarem um valor que não é de todo mundo. */
function valorComumOuVazio<T>(itens: ItemDiligenciamento[], ler: (i: ItemDiligenciamento) => T | undefined): T | '' {
  if (itens.length === 0) return '';
  const primeiro = ler(itens[0]);
  const todosIguais = itens.every(it => ler(it) === primeiro);
  return todosIguais && primeiro !== undefined ? primeiro : '';
}

export default function Diligenciamento({ user }: Props) {
  const toast = useToast();

  const [registros, setRegistros] = useState<EnrichedSAPRecord[]>([]);
  const [cidades, setCidades] = useState<CidadeForn[]>([]);
  const [chegadasMap, setChegadasMap] = useState(() => localDb.getAlmoxarifadoChegadasMap());
  const [regiaoUfMap, setRegiaoUfMap] = useState(() => regiaoUfBrutaPorRi());

  const [diligItensRaw, setDiligItensRaw] = useState<DiligenciamentoItem[]>([]);
  const [prazos, setPrazos] = useState<PrazoTransporte[]>([]);
  const [carregandoNovo, setCarregandoNovo] = useState(true);

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [prazosAberto, setPrazosAberto] = useState(false);
  const [salvandoRi, setSalvandoRi] = useState<string | null>(null);

  const [filtros, setFiltros] = useState<FiltrosDiligenciamento>({
    busca: '', status: 'todos', transportadora: '', uf: '',
  });

  const carregarBaseSAP = () => {
    setRegistros(localDb.getEnrichedSAPRequisicoes());
    setCidades(localDb.getCidadeForn());
    setChegadasMap(localDb.getAlmoxarifadoChegadasMap());
    setRegiaoUfMap(regiaoUfBrutaPorRi());
  };

  const carregarDiligenciamento = async () => {
    try {
      const [itens, listaPrazos] = await Promise.all([listarDiligenciamentoItens(), listarPrazosTransporte()]);
      setDiligItensRaw(itens);
      setPrazos(listaPrazos);
    } catch (e) {
      console.error('Falha ao carregar diligenciamento:', e);
      toast.error('Não foi possível carregar transportadoras e prazos. Tente recarregar a página.');
    } finally {
      setCarregandoNovo(false);
    }
  };

  useEffect(() => {
    carregarBaseSAP();
    carregarDiligenciamento();
    return localDb.subscribe(carregarBaseSAP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Agregação --------------------------------------------------------------- */

  const cidadesPorCodigo = useMemo(() => indexarCidadesPorCodigo(cidades), [cidades]);
  const diligPorRi = useMemo(
    () => new Map(diligItensRaw.map(i => [i.ri, i])),
    [diligItensRaw],
  );

  const itens = useMemo(
    () => montarItens(registros, diligPorRi, chegadasMap, cidadesPorCodigo, regiaoUfMap, prazos),
    [registros, diligPorRi, chegadasMap, cidadesPorCodigo, regiaoUfMap, prazos],
  );

  const pedidosTodos = useMemo(() => agruparPorPo(itens), [itens]);
  const ufs = useMemo(() => ufsDisponiveis(pedidosTodos), [pedidosTodos]);
  const transportadoras = useMemo(() => transportadorasConhecidas(diligItensRaw), [diligItensRaw]);

  const pedidos = useMemo(
    () => ordenarPedidos(filtrarPedidos(pedidosTodos, filtros)),
    [pedidosTodos, filtros],
  );

  const hojeISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const contagemVencidos = useMemo(() => pedidosTodos.filter(p => pedidoVencido(p, hojeISO)).length, [pedidosTodos, hojeISO]);

  /* Ações --------------------------------------------------------------------- */

  const alternarExpandido = (doc: string) => {
    setExpandidos(prev => {
      const proximo = new Set(prev);
      if (proximo.has(doc)) proximo.delete(doc); else proximo.add(doc);
      return proximo;
    });
  };

  const docCompraPorRiDe = (itensAlvo: ItemDiligenciamento[]) =>
    new Map(itensAlvo.map(it => [it.ri, it.docCompra]));

  /**
   * Depois de qualquer mudança que afete a previsão (transportadora ou
   * previsão manual), recalcula com os prazos e a UF já carregados e, se der
   * uma data válida, leva para o Rastreio Compras — é a "substituição" que o
   * comprador pediu, automática, sem precisar de um botão de confirmar.
   */
  const propagarPrevisaoParaRastreio = async (
    ri: string, uf: string, transportadora: string, dataRemessa: string | undefined, previsaoManual: string | undefined,
  ) => {
    let efetiva: string | null = previsaoManual || null;
    if (!efetiva && dataRemessa) {
      const dias = resolverPrazoDias(uf, transportadora, prazos);
      if (dias !== null) efetiva = somarDiasCorridos(dataRemessa, dias);
    }
    if (!efetiva || !dataValida(efetiva)) return;

    const { falhas } = await gravarPrevisaoNoRastreio([ri], efetiva);
    if (falhas.length > 0) {
      toast.error('A previsão foi salva aqui, mas não foi possível atualizar o Rastreio Compras.');
    }
  };

  const salvarTransportadora = async (itensAlvo: ItemDiligenciamento[], novoNome: string) => {
    if (itensAlvo.length === 0) return;
    const ris = itensAlvo.map(it => it.ri);
    setSalvandoRi(ris[0]);
    try {
      await trocarTransportadora(ris, docCompraPorRiDe(itensAlvo), novoNome, { id: user.id, nome: user.name });
      await Promise.all(itensAlvo.map(it =>
        propagarPrevisaoParaRastreio(it.ri, it.docCompra ? '' : '', novoNome, it.dataRemessa, undefined)
      ));
      await carregarDiligenciamento();
      toast.success('Transportadora atualizada.');
    } catch (e) {
      console.error('Falha ao salvar transportadora:', e);
      toast.error('Não foi possível salvar a transportadora.');
    } finally {
      setSalvandoRi(null);
    }
  };

  const salvarFaturamento = async (itensAlvo: ItemDiligenciamento[], data: string) => {
    if (itensAlvo.length === 0) return;
    const ris = itensAlvo.map(it => it.ri);
    setSalvandoRi(ris[0]);
    try {
      await salvarDiligenciamentoItens(
        ris, docCompraPorRiDe(itensAlvo), { data_faturamento_transportadora: data || null },
        { id: user.id, nome: user.name },
      );
      await carregarDiligenciamento();
    } catch (e) {
      console.error('Falha ao salvar faturamento:', e);
      toast.error('Não foi possível salvar a data de faturamento.');
    } finally {
      setSalvandoRi(null);
    }
  };

  const salvarPrevisaoManual = async (item: ItemDiligenciamento, data: string) => {
    setSalvandoRi(item.ri);
    try {
      await salvarDiligenciamentoItens(
        [item.ri], docCompraPorRiDe([item]), { previsao_manual: data || null },
        { id: user.id, nome: user.name },
      );

      const uf = pedidosTodos.find(p => p.itens.some(i => i.ri === item.ri))?.uf || '';
      await propagarPrevisaoParaRastreio(item.ri, uf, item.transportadora, item.dataRemessa, data || undefined);
      await carregarDiligenciamento();
      toast.success('Previsão atualizada — já refletida no Rastreio Compras.');
    } catch (e) {
      console.error('Falha ao salvar previsão manual:', e);
      toast.error('Não foi possível salvar a previsão.');
    } finally {
      setSalvandoRi(null);
    }
  };

  const exportarExcel = () => {
    const linhas = pedidos.flatMap(p => p.itens.map(it => ({
      'PO': p.docCompra,
      'Fornecedor': p.fornecedorNome,
      'UF': p.uf,
      'Material': it.material,
      'Descrição': it.descricao,
      'Quantidade': it.quantidade ?? '',
      'Unidade': it.unidade,
      'Valor (R$)': it.valor ?? 0,
      'Data do pedido': p.dataPedido ? formatDateBR(p.dataPedido) : '',
      'Data de remessa': it.dataRemessa ? formatDateBR(it.dataRemessa) : '',
      'Previsão de chegada': it.previsaoEfetiva ? formatDateBR(it.previsaoEfetiva) : '',
      'Transportadora': it.transportadora,
      'Faturamento transportadora': it.faturamentoTransportadora ? formatDateBR(it.faturamentoTransportadora) : '',
      'Chegada confirmada': it.chegou ? formatDateBR(it.dataChegada) : '',
    })));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Diligenciamento');
    XLSX.writeFile(wb, `diligenciamento_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  /* Desenho --------------------------------------------------------------------- */

  return (
    <div className="space-y-5 py-4 text-left">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight" style={{ color: 'var(--ink-primary)' }}>
            <Truck className="h-6 w-6" style={{ color: 'var(--brand)' }} /> Diligenciamento
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
            Pedidos de compra já emitidos, ainda sem chegada confirmada.
            {contagemVencidos > 0 && (
              <span className="ml-2 font-bold" style={{ color: 'var(--status-critical)' }}>
                {contagemVencidos} com previsão vencida
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPrazosAberto(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
          >
            <Settings2 className="h-4 w-4" /> Prazos de trânsito
          </button>
          <button
            type="button"
            onClick={exportarExcel}
            disabled={pedidos.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
          >
            <Download className="h-4 w-4" /> Exportar Excel
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
          <input
            type="text"
            value={filtros.busca}
            onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))}
            placeholder="Buscar PO, fornecedor ou material…"
            className="w-full rounded-lg border py-2 pl-9 pr-4 text-sm focus:outline-2 focus:outline-offset-1"
            style={campo}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm" style={{ borderColor: 'var(--hairline)' }}>
          <select
            value={filtros.status}
            onChange={e => setFiltros(f => ({ ...f, status: e.target.value as any }))}
            className="cursor-pointer rounded border p-1.5" style={campo}
          >
            <option value="todos">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="parcial">Parcial</option>
            <option value="chegou">Chegou</option>
          </select>

          <select
            value={filtros.uf}
            onChange={e => setFiltros(f => ({ ...f, uf: e.target.value }))}
            className="cursor-pointer rounded border p-1.5" style={campo}
          >
            <option value="">Todas as UF</option>
            {ufs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>

          <select
            value={filtros.transportadora}
            onChange={e => setFiltros(f => ({ ...f, transportadora: e.target.value }))}
            className="cursor-pointer rounded border p-1.5" style={campo}
          >
            <option value="">Todas as transportadoras</option>
            {transportadoras.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <label className="flex items-center gap-1.5" style={{ color: 'var(--ink-secondary)' }}>
            Remessa de
            <input
              type="date" value={filtros.remessaDe || ''}
              onChange={e => setFiltros(f => ({ ...f, remessaDe: e.target.value || undefined }))}
              className="rounded border p-1.5" style={campo}
            />
          </label>
          <label className="flex items-center gap-1.5" style={{ color: 'var(--ink-secondary)' }}>
            até
            <input
              type="date" value={filtros.remessaAte || ''}
              onChange={e => setFiltros(f => ({ ...f, remessaAte: e.target.value || undefined }))}
              className="rounded border p-1.5" style={campo}
            />
          </label>
        </div>
      </div>

      {/* Tabela */}
      {carregandoNovo ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border p-10 text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : pedidos.length === 0 ? (
        <TableEmpty
          icon={Truck}
          title="Nenhum pedido neste recorte"
          hint="Ajuste os filtros para ampliar a busca."
        />
      ) : (
        <TableShell maxHeight="72vh">
          <table className="w-full text-left text-sm border-collapse">
            <TableHeadRow>
              <Th width="w-8" />
              <Th label="PO" />
              <Th label="Fornecedor" />
              <Th label="Pedido" />
              <Th label="Valor" align="right" />
              <Th label="Remessa" />
              <Th label="Transportadora" />
              <Th label="Faturamento" />
              <Th label="Previsão" />
              <Th label="Chegada" />
            </TableHeadRow>
            <TableBody>
              {pedidos.map(p => {
                const expandido = expandidos.has(p.docCompra);
                const vencido = pedidoVencido(p, hojeISO);
                const meta = ESTADO_META[p.estadoChegada];
                const itensAbertos = p.itens.filter(it => !it.chegou);
                const transportadoraComum = valorComumOuVazio(p.itens, it => it.transportadora || undefined) || '';
                const faturamentoComum = valorComumOuVazio(p.itens, it => it.faturamentoTransportadora) || '';

                return (
                  <React.Fragment key={p.docCompra}>
                    <Tr onClick={() => alternarExpandido(p.docCompra)}>
                      <Td>
                        {expandido ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Td>
                      <Td strong mono>{p.docCompra}</Td>
                      <Td truncate title={`${p.fornecedorNome} · ${p.uf || 'UF não identificada'}`}>
                        {p.fornecedorNome}
                        {p.uf && <span className="ml-1.5 text-xs" style={{ color: 'var(--ink-muted)' }}>({p.uf})</span>}
                      </Td>
                      <Td numeric>{p.dataPedido ? formatDateBR(p.dataPedido) : '—'}</Td>
                      <Td numeric strong>{formatBRL(p.valorTotal)}</Td>
                      <Td numeric>{p.dataRemessa ? formatDateBR(p.dataRemessa) : '—'}</Td>
                      <Td>
                        {/* Toda a linha do PO abre/fecha ao clicar — a edição
                            aqui dentro não pode propagar esse clique. */}
                        <div onClick={e => e.stopPropagation()}>
                          <CampoTransportadora
                            valor={transportadoraComum}
                            opcoes={transportadoras}
                            desabilitado={itensAbertos.length === 0 || salvandoRi !== null}
                            onSalvar={nome => salvarTransportadora(itensAbertos, nome)}
                          />
                        </div>
                      </Td>
                      <Td>
                        <div onClick={e => e.stopPropagation()}>
                          <input
                            type="date"
                            defaultValue={faturamentoComum}
                            disabled={itensAbertos.length === 0}
                            onBlur={e => salvarFaturamento(itensAbertos, e.target.value)}
                            className="w-full rounded border px-2 py-1 text-xs"
                            style={campo}
                          />
                        </div>
                      </Td>
                      <Td>
                        <PrevisaoBadge pedido={p} vencido={vencido} />
                      </Td>
                      <Td>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-bold"
                          style={{ background: meta.fundo, color: meta.cor }}
                        >
                          {meta.rotulo}
                        </span>
                      </Td>
                    </Tr>

                    {expandido && p.itens.map(item => (
                      <Tr key={item.ri}>
                        <Td>{null}</Td>
                        <Td colSpan={2} truncate title={item.descricao}>
                          <span className="font-mono text-xs" style={{ color: 'var(--ink-muted)' }}>{item.material}</span>
                          {' — '}{item.descricao}
                          {item.quantidade !== undefined && (
                            <span className="ml-1.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
                              {item.quantidade} {item.unidade}
                            </span>
                          )}
                        </Td>
                        <Td>{null}</Td>
                        <Td numeric>{formatBRL(item.valor)}</Td>
                        <Td numeric>{item.dataRemessa ? formatDateBR(item.dataRemessa) : '—'}</Td>
                        <Td>
                          <CampoTransportadora
                            valor={item.transportadora}
                            opcoes={transportadoras}
                            desabilitado={item.chegou || salvandoRi !== null}
                            onSalvar={nome => salvarTransportadora([item], nome)}
                          />
                        </Td>
                        <Td>
                          <input
                            type="date"
                            defaultValue={item.faturamentoTransportadora || ''}
                            disabled={item.chegou}
                            onBlur={e => salvarFaturamento([item], e.target.value)}
                            className="w-full rounded border px-2 py-1 text-xs"
                            style={campo}
                          />
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              defaultValue={item.previsaoEfetiva || ''}
                              disabled={item.chegou}
                              onBlur={e => salvarPrevisaoManual(item, e.target.value)}
                              title={item.previsaoManual ? 'Previsão editada manualmente' : 'Previsão calculada (remessa + prazo)'}
                              className="rounded border px-2 py-1 text-xs"
                              style={{
                                ...campo,
                                borderColor: item.previsaoManual ? 'var(--brand)' : campo.borderColor,
                              }}
                            />
                            {!item.previsaoEfetiva && item.motivoSemPrevisao && (
                              <span title={item.motivoSemPrevisao === 'sem_remessa' ? 'Sem data de remessa no SAP' : 'Sem prazo cadastrado para esta UF/transportadora'}>
                                <AlertTriangle className="h-3.5 w-3.5" style={{ color: 'var(--status-warning)' }} />
                              </span>
                            )}
                          </div>
                        </Td>
                        <Td>
                          {item.chegou ? (
                            <span className="text-xs font-bold" style={{ color: 'var(--status-good)' }}>
                              {formatDateBR(item.dataChegada)}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>Pendente</span>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </table>
        </TableShell>
      )}

      {prazosAberto && (
        <PrazosModal
          prazos={prazos}
          onClose={() => setPrazosAberto(false)}
          onSalvar={async (uf, transp, dias) => {
            await salvarPrazoTransporte(uf, transp, dias);
            await carregarDiligenciamento();
          }}
          onExcluir={async id => {
            await excluirPrazoTransporte(id);
            await carregarDiligenciamento();
          }}
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

function PrevisaoBadge({ pedido, vencido }: { pedido: PedidoDiligenciamento; vencido: boolean }) {
  if (!pedido.previsaoMaisProxima) {
    return <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>—</span>;
  }
  return (
    <span
      className="text-xs font-bold"
      style={{ color: vencido ? 'var(--status-critical)' : 'var(--ink-primary)' }}
      title={vencido ? 'Previsão vencida e ainda sem chegada confirmada' : undefined}
    >
      {formatDateBR(pedido.previsaoMaisProxima)}
      {vencido && <AlertTriangle className="ml-1 inline h-3 w-3" />}
    </span>
  );
}

/**
 * Campo de transportadora: texto livre com sugestão das já digitadas
 * (`<datalist>` nativo — sem tela de cadastro própria) e salvamento ao sair
 * do campo, só quando o valor de fato mudou.
 */
function CampoTransportadora({
  valor, opcoes, desabilitado, onSalvar,
}: { valor: string; opcoes: string[]; desabilitado: boolean; onSalvar: (nome: string) => void }) {
  const [rascunho, setRascunho] = useState(valor);
  const listId = useMemo(() => `transportadoras-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => setRascunho(valor), [valor]);

  return (
    <>
      <input
        type="text"
        list={listId}
        value={rascunho}
        disabled={desabilitado}
        placeholder="Digite ou escolha…"
        onChange={e => setRascunho(e.target.value)}
        onBlur={() => {
          if (normalizarChaveTransportadora(rascunho) !== normalizarChaveTransportadora(valor)) onSalvar(rascunho.trim());
        }}
        className="w-full rounded border px-2 py-1 text-xs"
        style={campo}
      />
      <datalist id={listId}>
        {opcoes.map(o => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}

/* Modal de manutenção de prazos --------------------------------------------- */

function PrazosModal({
  prazos, onClose, onSalvar, onExcluir,
}: {
  prazos: PrazoTransporte[];
  onClose: () => void;
  onSalvar: (uf: string, transportadora: string, dias: number) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}) {
  const toast = useToast();
  const [uf, setUf] = useState('');
  const [transportadora, setTransportadora] = useState('');
  const [dias, setDias] = useState('');
  const [salvando, setSalvando] = useState(false);

  const linhas = [...prazos].sort((a, b) => (a.uf + a.transportadora).localeCompare(b.uf + b.transportadora));

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const diasNum = Number(dias);
    if (uf && !/^[A-Za-z]{2}$/.test(uf)) {
      toast.error('UF deve ter 2 letras, ou fique em branco para o padrão global.');
      return;
    }
    if (!Number.isFinite(diasNum) || diasNum < 0) {
      toast.error('Informe um número de dias válido.');
      return;
    }
    setSalvando(true);
    try {
      await onSalvar(uf.trim(), transportadora.trim(), diasNum);
      setUf(''); setTransportadora(''); setDias('');
      toast.success('Prazo salvo.');
    } catch (err) {
      console.error('Falha ao salvar prazo de trânsito:', err);
      toast.error('Não foi possível salvar. Verifique se essa combinação de UF/transportadora já existe.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel="Prazos de trânsito">
      <ModalHeader onClose={onClose}>
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>Prazos de trânsito</h3>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
          Dias corridos somados à remessa, por UF de origem e transportadora.
        </p>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <form onSubmit={salvar} className="grid grid-cols-3 gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>UF</label>
            <input
              value={uf} onChange={e => setUf(e.target.value.toUpperCase())} maxLength={2}
              placeholder="Global" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" style={campo}
            />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>Transportadora</label>
            <input
              value={transportadora} onChange={e => setTransportadora(e.target.value)}
              placeholder="Padrão da UF" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" style={campo}
            />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>Dias corridos</label>
            <input
              type="number" min={0} value={dias} onChange={e => setDias(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm" style={campo}
            />
          </div>
          <button
            type="submit" disabled={salvando}
            className="col-span-3 mt-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--brand)' }}
          >
            {salvando ? 'Salvando…' : 'Adicionar / atualizar'}
          </button>
        </form>

        <ul className="space-y-1.5">
          {linhas.length === 0 && (
            <p className="text-xs italic" style={{ color: 'var(--ink-muted)' }}>Nenhum prazo cadastrado ainda.</p>
          )}
          {linhas.map(p => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--hairline)' }}
            >
              <span>
                <strong>{p.uf || 'Qualquer UF'}</strong>
                {' · '}
                {p.transportadora || 'padrão da UF'}
                {' — '}
                <strong>{p.dias_corridos}</strong> dia(s)
              </span>
              <button
                type="button"
                onClick={() => onExcluir(p.id)}
                aria-label="Excluir prazo"
                className="cursor-pointer rounded p-1 hover:opacity-70"
                style={{ color: 'var(--status-critical)' }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </ModalBody>
      <ModalFooter>
        <button
          type="button" onClick={onClose}
          className="rounded-lg px-3.5 py-2 text-xs font-bold cursor-pointer"
          style={{ color: 'var(--ink-muted)' }}
        >
          Fechar
        </button>
      </ModalFooter>
    </Modal>
  );
}
