/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Diligenciamento — conteúdo da aba "Sem MIGO" da Central de Compras.
 *
 * Existia como página própria (`/suprimentos/diligenciamento`); virou parte
 * da Central de Compras porque "Sem MIGO" já É o recorte de pedidos emitidos
 * e ainda sem chegada — não fazia sentido ter dois lugares para a mesma
 * pergunta ("o que já comprei e ainda não chegou?"). O botão "Sem MIGO" em
 * `Compras.tsx` agora renderiza esta tabela no lugar da grade de cartões/
 * fornecedores (que serve a um problema diferente: achar fornecedor para
 * item ainda SEM pedido).
 *
 * Uma linha por item (RI), não por PO agrupado: no recorte típico de "Sem
 * MIGO" um PO tem poucos itens, e a tabela plana bate com o que o comprador
 * já está acostumado a ver nas outras visões desta mesma tela.
 *
 * Duas apresentações do mesmo dado: tabela densa no desktop (`hidden md:*`) e
 * cartões no mobile (`md:hidden`) — a tabela tem colunas demais para caber
 * num telefone sem virar rolagem horizontal infinita.
 *
 * Seleção múltipla: o comprador marca vários itens e aplica transportadora,
 * data de faturamento e/ou previsão de uma vez (barra de ação em lote) — é o
 * caso comum de "um caminhão levou a carga de cinco pedidos".
 *
 * `registros` já chega filtrado pela busca e pelos demais filtros da Central
 * de Compras (RM, comprador, alerta, grupo de mercadoria, prioridade,
 * promessa) — esta tabela não duplica esses controles, só acrescenta
 * transportadora, faturamento, previsão e o estado de chegada do Rastreio.
 *
 * Regras e cálculos em `lib/diligenciamento.ts`; leitura/escrita das tabelas
 * novas em `lib/diligenciamentoApi.ts`.
 */

import React, { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Layers, Mail, PackageCheck, Settings2, Truck, X } from 'lucide-react';
import { localDb } from '../../db/localDb';
import { AlmoxarifadoChegada, DiligenciamentoItem, EnrichedSAPRecord, PrazoTransporte, Profile, Transportadora } from '../../types';
import { useToast } from '../ui/Toast';
import { formatBRL, formatDateBR } from '../../lib/format';
import { TableBody, TableEmpty, TableHeadRow, TableShell, TableSkeleton, Td, Th, Tr } from '../ui/DataTable';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import {
  ItemDiligenciamento, dataValida, indexarCidadesPorCodigo, montarItens,
  normalizarChaveTransportadora, resolverPrazoDias, somarDiasCorridos, transportadorasConhecidas,
} from '../../lib/diligenciamento';
import { montarMailtoComConfig, obterConfigEmail } from '../../lib/emailConfigApi';
// O teto prático do `mailto:` no Windows não é específico da expedição — é do
// handler do sistema. Uma lista de coleta com muitos itens estoura fácil, e aí
// o corpo vai para a área de transferência em vez de ser truncado em silêncio.
import { cabeNoMailto } from '../../lib/expedicaoEmail';
import {
  ASSUNTO_COLETA_PADRAO, CHAVE_CONFIG_COLETA, DESTINATARIO_COLETA_PADRAO, LinhaColeta,
  montarAssuntoColeta, montarCorpoColeta,
} from '../../lib/coletaEmail';
import {
  PatchDiligenciamentoItem,
  gravarPrevisaoNoRastreio, listarDiligenciamentoItens, listarPrazosTransporte,
  listarTransportadoras, regiaoUfBrutaPorRi, salvarDiligenciamentoItens, salvarPrazoTransporte,
  excluirPrazoTransporte, trocarTransportadora,
} from '../../lib/diligenciamentoApi';

interface Props {
  registros: EnrichedSAPRecord[];
  chegadasMap: Map<string, AlmoxarifadoChegada>;
  user: Profile;
}

/** Valor sentinela do filtro: itens que ainda não têm transportadora atribuída. */
const SEM_TRANSPORTADORA = '__sem__';

const campo: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
  outlineColor: 'var(--brand)',
};

export default function DiligenciamentoSemMigoTable({ registros, chegadasMap, user }: Props) {
  const toast = useToast();

  const [diligItensRaw, setDiligItensRaw] = useState<DiligenciamentoItem[]>([]);
  const [prazos, setPrazos] = useState<PrazoTransporte[]>([]);
  const [transportadorasCad, setTransportadorasCad] = useState<Transportadora[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [prazosAberto, setPrazosAberto] = useState(false);

  // Seleção múltipla (apenas itens ainda não chegados são selecionáveis).
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [loteTransp, setLoteTransp] = useState('');
  const [loteFat, setLoteFat] = useState('');
  const [lotePrev, setLotePrev] = useState('');
  const [aplicandoLote, setAplicandoLote] = useState(false);
  const [enviandoColeta, setEnviandoColeta] = useState(false);

  /**
   * Filtro por transportadora — a lista de coleta é montada por transportadora
   * ("um caminhão, uma viagem"), então o comprador primeiro recorta a fila de
   * quem vai buscar e só então marca os itens. `SEM_TRANSPORTADORA` é o recorte
   * do que ainda não foi atribuído a ninguém.
   */
  const [filtroTransp, setFiltroTransp] = useState('');

  const cidades = useMemo(() => localDb.getCidadeForn(), []);
  const cidadesPorCodigo = useMemo(() => indexarCidadesPorCodigo(cidades), [cidades]);
  const regiaoUfMap = useMemo(() => regiaoUfBrutaPorRi(), []);
  const diligPorRi = useMemo(() => new Map(diligItensRaw.map(i => [i.ri, i])), [diligItensRaw]);
  // Índice por RI para não varrer `registros` a cada linha (era O(n²) no render).
  const regPorRi = useMemo(() => new Map(registros.map(r => [r.ri, r])), [registros]);

  const carregarDiligenciamento = async () => {
    try {
      const [itens, listaPrazos, listaTransp] = await Promise.all([
        listarDiligenciamentoItens(), listarPrazosTransporte(), listarTransportadoras(),
      ]);
      setDiligItensRaw(itens);
      setPrazos(listaPrazos);
      setTransportadorasCad(listaTransp);
    } catch (e) {
      console.error('Falha ao carregar diligenciamento:', e);
      toast.error('Não foi possível carregar transportadoras e prazos. Tente recarregar a página.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregarDiligenciamento(); }, []);

  const itens = useMemo(
    () => montarItens(registros, diligPorRi, chegadasMap, cidadesPorCodigo, regiaoUfMap, prazos),
    [registros, diligPorRi, chegadasMap, cidadesPorCodigo, regiaoUfMap, prazos],
  );

  const itensOrdenados = useMemo(() => [...itens].sort((a, b) => {
    if (a.previsaoEfetiva && b.previsaoEfetiva) return a.previsaoEfetiva < b.previsaoEfetiva ? -1 : 1;
    if (a.previsaoEfetiva) return -1;
    if (b.previsaoEfetiva) return 1;
    return a.docCompra.localeCompare(b.docCompra);
  }), [itens]);

  /**
   * Recorte visível = fila ordenada filtrada por transportadora. Tudo abaixo
   * (resumo, seleção, tabela e cartões) trabalha em cima dele, para que
   * "selecionar todos" nunca marque um item que o comprador não está vendo.
   */
  const itensVisiveis = useMemo(() => {
    if (!filtroTransp) return itensOrdenados;
    if (filtroTransp === SEM_TRANSPORTADORA) return itensOrdenados.filter(i => !(i.transportadora || '').trim());
    const chave = normalizarChaveTransportadora(filtroTransp);
    return itensOrdenados.filter(i => normalizarChaveTransportadora(i.transportadora || '') === chave);
  }, [itensOrdenados, filtroTransp]);

  const itensPorRi = useMemo(() => new Map(itensVisiveis.map(i => [i.ri, i])), [itensVisiveis]);

  /**
   * Opções de transportadora: cadastro ativo (`sup_transportadoras`) primeiro,
   * mais o que já foi digitado à mão nos itens — dedup por chave normalizada.
   */
  const opcoesTransportadora = useMemo(() => {
    const porChave = new Map<string, string>();
    for (const t of transportadorasCad) {
      if (t.ativo) porChave.set(normalizarChaveTransportadora(t.nome), t.nome.trim());
    }
    for (const nome of transportadorasConhecidas(diligItensRaw)) {
      const chave = normalizarChaveTransportadora(nome);
      if (!porChave.has(chave)) porChave.set(chave, nome);
    }
    return Array.from(porChave.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [transportadorasCad, diligItensRaw]);

  const hojeISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const selecionaveis = useMemo(() => itensVisiveis.filter(i => !i.chegou), [itensVisiveis]);
  const todosSelecionados = selecionaveis.length > 0 && selecionaveis.every(i => selecionados.has(i.ri));

  // Solta da seleção itens que saíram do recorte (mudança de filtro) ou já chegaram.
  useEffect(() => {
    setSelecionados(prev => {
      const validos = new Set(selecionaveis.map(i => i.ri));
      let mudou = false;
      const proximo = new Set<string>();
      for (const ri of prev) { if (validos.has(ri)) proximo.add(ri); else mudou = true; }
      return mudou ? proximo : prev;
    });
  }, [selecionaveis]);

  /**
   * Resumo da fila — o comprador precisa saber, antes de rolar a tabela,
   * quantos itens estão vencidos, quantos não têm previsão nenhuma e quanto
   * valor ainda está em trânsito. Só conta o que ainda não chegou.
   */
  const resumo = useMemo(() => {
    let pendentes = 0, vencidos = 0, semPrevisao = 0, valorTransito = 0;
    for (const it of itensVisiveis) {
      if (it.chegou) continue;
      pendentes++;
      valorTransito += it.valor || 0;
      if (!it.previsaoEfetiva) semPrevisao++;
      else if (it.previsaoEfetiva < hojeISO) vencidos++;
    }
    return { pendentes, vencidos, semPrevisao, valorTransito };
  }, [itensVisiveis, hojeISO]);

  /* Seleção --------------------------------------------------------------- */

  const alternarSel = (ri: string) => setSelecionados(prev => {
    const proximo = new Set(prev);
    proximo.has(ri) ? proximo.delete(ri) : proximo.add(ri);
    return proximo;
  });

  const alternarSelTodos = () => setSelecionados(
    todosSelecionados ? new Set() : new Set(selecionaveis.map(i => i.ri)),
  );

  const limparSelecao = () => {
    setSelecionados(new Set());
    setLoteTransp(''); setLoteFat(''); setLotePrev('');
  };

  /* Ações ------------------------------------------------------------------- */

  const propagarPrevisaoParaRastreio = async (item: ItemDiligenciamento, novaTransportadora?: string, novaPrevisaoManual?: string) => {
    const transportadora = novaTransportadora ?? item.transportadora;
    let efetiva: string | null = novaPrevisaoManual !== undefined ? (novaPrevisaoManual || null) : (item.previsaoManual || null);

    if (!efetiva && item.dataRemessa) {
      const reg = regPorRi.get(item.ri);
      const uf = cidadesPorCodigo.get(reg?.fornecedor_code || '')?.estado_uf || regiaoUfMap.get(item.ri) || '';
      const dias = resolverPrazoDias(uf, transportadora, prazos);
      if (dias !== null) efetiva = somarDiasCorridos(item.dataRemessa, dias);
    }
    if (!efetiva || !dataValida(efetiva)) return;

    const { falhas } = await gravarPrevisaoNoRastreio([item.ri], efetiva);
    if (falhas.length > 0) toast.error('A previsão foi salva aqui, mas não foi possível atualizar o Rastreio Compras.');
  };

  const salvarTransportadora = async (item: ItemDiligenciamento, novoNome: string) => {
    try {
      await trocarTransportadora([item.ri], new Map([[item.ri, item.docCompra]]), novoNome, { id: user.id, nome: user.name });
      await propagarPrevisaoParaRastreio(item, novoNome, undefined);
      await carregarDiligenciamento();
    } catch (e) {
      console.error('Falha ao salvar transportadora:', e);
      toast.error('Não foi possível salvar a transportadora.');
    }
  };

  const salvarFaturamento = async (item: ItemDiligenciamento, data: string) => {
    try {
      await salvarDiligenciamentoItens(
        [item.ri], new Map([[item.ri, item.docCompra]]), { data_faturamento_transportadora: data || null },
        { id: user.id, nome: user.name },
      );
      await carregarDiligenciamento();
    } catch (e) {
      console.error('Falha ao salvar faturamento:', e);
      toast.error('Não foi possível salvar a data de faturamento.');
    }
  };

  const salvarPrevisaoManual = async (item: ItemDiligenciamento, data: string) => {
    try {
      await salvarDiligenciamentoItens(
        [item.ri], new Map([[item.ri, item.docCompra]]), { previsao_manual: data || null },
        { id: user.id, nome: user.name },
      );
      await propagarPrevisaoParaRastreio(item, undefined, data);
      await carregarDiligenciamento();
      toast.success('Previsão atualizada — já refletida no Rastreio Compras.');
    } catch (e) {
      console.error('Falha ao salvar previsão manual:', e);
      toast.error('Não foi possível salvar a previsão.');
    }
  };

  /**
   * Lista de coleta: o que a logística precisa para ir buscar o material no
   * fornecedor. Sai pelo Outlook (`mailto:`), com destinatário e assunto vindos
   * do painel Admin › E-mails (gatilho `coleta_jacobina`) — quem recebe muda
   * sem depender de deploy.
   */
  const enviarListaColeta = async () => {
    const selecionadosItens = selecionaveis.filter(i => selecionados.has(i.ri));
    if (selecionadosItens.length === 0) return;

    setEnviandoColeta(true);
    try {
      const linhas: LinhaColeta[] = selecionadosItens.map(item => {
        const reg = regPorRi.get(item.ri);
        const rm = reg?.requisicao_de_compra
          ? `${reg.requisicao_de_compra}${reg.item_reqc ? ` / ${reg.item_reqc}` : ''}`
          : '';
        return {
          dataColeta: item.previsaoEfetiva,
          fornecedor: reg?.fornecedor_name || '',
          rm,
          po: item.docCompra,
          codigoItem: item.material,
          material: item.descricao,
          quantidade: item.quantidade ?? null,
          unidade: item.unidade || null,
          valor: item.valor ?? null,
        };
      });

      // A transportadora só entra no assunto quando a lista inteira é de uma só
      // — misturar duas numa coleta é possível, e nesse caso o assunto omite.
      const chaves = new Set(selecionadosItens.map(i => normalizarChaveTransportadora(i.transportadora || '')));
      const transportadora = chaves.size === 1 ? (selecionadosItens[0].transportadora || '').trim() : '';

      const config = await obterConfigEmail(CHAVE_CONFIG_COLETA);
      const assunto = montarAssuntoColeta({
        assuntoBase: config?.assunto_padrao || ASSUNTO_COLETA_PADRAO,
        transportadora,
        quantidadeItens: linhas.length,
      });
      const corpo = montarCorpoColeta({ linhas, transportadora, solicitante: user.name });
      const destinatarios = config?.destinatarios || DESTINATARIO_COLETA_PADRAO;

      const mailto = montarMailtoComConfig({
        destinatarios, copia: config?.copia, copiaOculta: config?.copia_oculta, assunto, corpo,
      });

      if (cabeNoMailto(mailto)) {
        window.location.href = mailto;
      } else {
        await navigator.clipboard.writeText(corpo).catch(() => null);
        window.location.href = montarMailtoComConfig({
          destinatarios, copia: config?.copia, copiaOculta: config?.copia_oculta, assunto, corpo: '',
        });
        toast.warning('Lista longa demais para o preenchimento automático: o conteúdo foi copiado — cole no Outlook com Ctrl+V.');
      }
    } catch (e) {
      console.error('Falha ao montar a lista de coleta:', e);
      toast.error('Não foi possível montar o e-mail da lista de coleta.');
    } finally {
      setEnviandoColeta(false);
    }
  };

  /**
   * Aplica em lote os campos preenchidos na barra de ação a todos os itens
   * selecionados. Campos vazios não são tocados. Trocar a transportadora sem
   * informar previsão limpa a previsão manual (mesma regra da edição por
   * linha — ver `trocarTransportadora`), deixando o cálculo assumir.
   */
  const aplicarLote = async () => {
    const ris = selecionaveis.filter(i => selecionados.has(i.ri)).map(i => i.ri);
    if (ris.length === 0) return;

    const patch: PatchDiligenciamentoItem = {};
    if (loteTransp) patch.transportadora = loteTransp;
    if (loteFat) patch.data_faturamento_transportadora = loteFat;
    if (lotePrev) patch.previsao_manual = lotePrev;
    if (loteTransp && !lotePrev) patch.previsao_manual = null;

    if (Object.keys(patch).length === 0) {
      toast.error('Preencha transportadora, faturamento e/ou previsão para aplicar.');
      return;
    }

    setAplicandoLote(true);
    try {
      const docPorRi = new Map(ris.map(ri => [ri, itensPorRi.get(ri)?.docCompra || '']));
      await salvarDiligenciamentoItens(ris, docPorRi, patch, { id: user.id, nome: user.name });

      if (lotePrev) {
        const { falhas } = await gravarPrevisaoNoRastreio(ris, lotePrev);
        if (falhas.length > 0) {
          toast.error(`Previsão salva, mas ${falhas.length} item(ns) não atualizaram o Rastreio Compras.`);
        }
      }
      toast.success(`${ris.length} item(ns) atualizados.`);
      limparSelecao();
      await carregarDiligenciamento();
    } catch (e) {
      console.error('Falha ao aplicar edição em lote:', e);
      toast.error('Não foi possível aplicar a edição em lote.');
    } finally {
      setAplicandoLote(false);
    }
  };

  /* Desenho ------------------------------------------------------------------- */

  if (carregando) return <TableSkeleton columns={9} rows={6} />;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          Previsão = remessa do pedido + prazo de trânsito por UF/transportadora. Editar aqui atualiza o Rastreio Compras.
        </p>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
              Transportadora
            </span>
            <select
              value={filtroTransp}
              onChange={e => setFiltroTransp(e.target.value)}
              className="h-8 rounded-lg border px-2 text-xs font-semibold cursor-pointer"
              style={campo}
            >
              <option value="">Todas</option>
              <option value={SEM_TRANSPORTADORA}>Sem transportadora</option>
              {opcoesTransportadora.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setPrazosAberto(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
          >
            <Settings2 className="h-3.5 w-3.5" /> Prazos de trânsito
          </button>
        </div>
      </div>

      {resumo.pendentes > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ResumoStat rotulo="Pendentes" valor={String(resumo.pendentes)} />
          <ResumoStat
            rotulo="Vencidos"
            valor={String(resumo.vencidos)}
            cor={resumo.vencidos > 0 ? 'var(--status-critical)' : undefined}
          />
          <ResumoStat
            rotulo="Sem previsão"
            valor={String(resumo.semPrevisao)}
            cor={resumo.semPrevisao > 0 ? 'var(--status-warning)' : undefined}
          />
          <ResumoStat rotulo="Valor em trânsito" valor={formatBRL(resumo.valorTransito)} />
        </div>
      )}

      {selecionados.size > 0 && (
        <BarraLote
          quantidade={selecionados.size}
          opcoes={opcoesTransportadora}
          transp={loteTransp} setTransp={setLoteTransp}
          fat={loteFat} setFat={setLoteFat}
          prev={lotePrev} setPrev={setLotePrev}
          aplicando={aplicandoLote}
          onAplicar={aplicarLote}
          onLimpar={limparSelecao}
          enviandoColeta={enviandoColeta}
          onEnviarColeta={enviarListaColeta}
        />
      )}

      {itensVisiveis.length === 0 ? (
        <TableEmpty icon={Truck} title="Nenhum item sem MIGO neste recorte" hint="Ajuste a busca ou os filtros acima." />
      ) : (
        <>
          {/* Desktop: tabela densa ------------------------------------------ */}
          <div className="hidden md:block">
            <TableShell maxHeight="72vh">
              <table className="w-full text-left text-xs border-collapse">
                <TableHeadRow>
                  <Th stickyLeft>
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os itens pendentes"
                      checked={todosSelecionados}
                      ref={el => { if (el) el.indeterminate = !todosSelecionados && selecionados.size > 0; }}
                      onChange={alternarSelTodos}
                      className="h-3.5 w-3.5 cursor-pointer align-middle"
                      style={{ accentColor: 'var(--brand)' }}
                    />
                  </Th>
                  <Th label="PO" />
                  <Th label="Código" />
                  <Th label="Material" />
                  <Th label="Fornecedor" />
                  <Th label="Pedido / Valor" />
                  <Th label="Remessa & Previsão" />
                  <Th label="Fat. Transportadora" />
                  <Th label="Transportadora" />
                  <Th label="Chegada (Rastreio)" />
                </TableHeadRow>
                <TableBody>
                  {itensVisiveis.map(item => {
                    const vencido = !item.chegou && !!item.previsaoEfetiva && item.previsaoEfetiva < hojeISO;
                    const reg = regPorRi.get(item.ri);
                    const marcado = selecionados.has(item.ri);

                    return (
                      <Tr key={item.ri} accent={vencido ? 'var(--status-critical)' : (marcado ? 'var(--brand)' : undefined)}>
                        <Td stickyLeft>
                          <input
                            type="checkbox"
                            aria-label={`Selecionar PO ${item.docCompra}`}
                            checked={marcado}
                            disabled={item.chegou}
                            onChange={() => alternarSel(item.ri)}
                            className="h-3.5 w-3.5 cursor-pointer align-middle disabled:opacity-40"
                            style={{ accentColor: 'var(--brand)' }}
                          />
                        </Td>
                        <Td strong mono className="text-sm">
                          {item.docCompra}
                          <span className="mt-0.5 block text-[11px] font-normal" style={{ color: 'var(--ink-muted)' }}>
                            RM {reg?.requisicao_de_compra} · item {reg?.item_reqc}
                          </span>
                        </Td>
                        <Td mono>{item.material}</Td>
                        <Td truncate title={item.descricao}>{item.descricao}</Td>
                        <Td truncate title={reg?.fornecedor_name}>
                          {reg?.fornecedor_name || '—'}
                          {reg?.fornecedor_code && (
                            <span className="ml-1 text-[10px]" style={{ color: 'var(--ink-muted)' }}>({reg.fornecedor_code})</span>
                          )}
                        </Td>
                        <Td numeric>
                          {reg?.data_pedido ? formatDateBR(reg.data_pedido) : '—'}
                          <span className="mt-0.5 block font-bold" style={{ color: 'var(--ink-primary)' }}>{formatBRL(item.valor)}</span>
                        </Td>
                        <Td>
                          <PrevisaoCelula item={item} vencido={vencido} onAbrirPrazos={() => setPrazosAberto(true)} onSalvar={salvarPrevisaoManual} />
                        </Td>
                        <Td>
                          <input
                            type="date"
                            aria-label={`Faturamento da transportadora — PO ${item.docCompra}`}
                            defaultValue={item.faturamentoTransportadora || ''}
                            disabled={item.chegou}
                            onBlur={e => salvarFaturamento(item, e.target.value)}
                            className="w-full rounded border px-1.5 py-1 text-[11px]"
                            style={campo}
                          />
                        </Td>
                        <Td>
                          <CampoTransportadora
                            valor={item.transportadora}
                            opcoes={opcoesTransportadora}
                            desabilitado={item.chegou}
                            onSalvar={nome => salvarTransportadora(item, nome)}
                          />
                        </Td>
                        <Td>
                          <EstadoChegada item={item} />
                        </Td>
                      </Tr>
                    );
                  })}
                </TableBody>
              </table>
            </TableShell>
          </div>

          {/* Mobile: cartões --------------------------------------------------- */}
          <div className="space-y-2.5 md:hidden">
            {selecionaveis.length > 0 && (
              <button
                type="button"
                onClick={alternarSelTodos}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
              >
                <input
                  type="checkbox" readOnly checked={todosSelecionados}
                  className="h-3.5 w-3.5 align-middle" style={{ accentColor: 'var(--brand)' }}
                />
                {todosSelecionados ? 'Desmarcar todos' : `Selecionar todos (${selecionaveis.length})`}
              </button>
            )}
            {itensVisiveis.map(item => (
              <ItemCard
                key={item.ri}
                item={item}
                reg={regPorRi.get(item.ri)}
                marcado={selecionados.has(item.ri)}
                onAlternarSel={() => alternarSel(item.ri)}
                vencido={!item.chegou && !!item.previsaoEfetiva && item.previsaoEfetiva < hojeISO}
                opcoesTransportadora={opcoesTransportadora}
                onAbrirPrazos={() => setPrazosAberto(true)}
                onSalvarPrevisao={salvarPrevisaoManual}
                onSalvarFaturamento={salvarFaturamento}
                onSalvarTransportadora={salvarTransportadora}
              />
            ))}
          </div>
        </>
      )}

      {prazosAberto && (
        <PrazosModal
          prazos={prazos}
          onClose={() => setPrazosAberto(false)}
          onSalvar={async (uf, transp, dias) => { await salvarPrazoTransporte(uf, transp, dias); await carregarDiligenciamento(); }}
          onExcluir={async id => { await excluirPrazoTransporte(id); await carregarDiligenciamento(); }}
        />
      )}
    </div>
  );
}

/* Peças ------------------------------------------------------------------- */

/** Número/valor único da faixa de resumo acima da tabela. */
function ResumoStat({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
    >
      <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
        {rotulo}
      </span>
      <span className="mt-0.5 block text-lg font-black tabular" style={{ color: cor || 'var(--ink-primary)' }}>
        {valor}
      </span>
    </div>
  );
}

/** Barra de ação em lote — aparece quando há itens selecionados. */
function BarraLote({
  quantidade, opcoes, transp, setTransp, fat, setFat, prev, setPrev, aplicando, onAplicar, onLimpar,
  enviandoColeta, onEnviarColeta,
}: {
  quantidade: number;
  opcoes: string[];
  transp: string; setTransp: (v: string) => void;
  fat: string; setFat: (v: string) => void;
  prev: string; setPrev: (v: string) => void;
  aplicando: boolean;
  onAplicar: () => void;
  onLimpar: () => void;
  enviandoColeta: boolean;
  onEnviarColeta: () => void;
}) {
  const listId = useId();
  return (
    <div
      className="sticky top-0 z-10 rounded-xl border p-3 shadow-sm"
      style={{ borderColor: 'var(--brand)', background: 'var(--surface-raised)' }}
    >
      <div className="flex flex-wrap items-end gap-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
          <Layers className="h-3.5 w-3.5" style={{ color: 'var(--brand)' }} />
          {quantidade} selecionado{quantidade > 1 ? 's' : ''}
        </span>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Transportadora</span>
          <input
            list={listId}
            value={transp}
            onChange={e => setTransp(e.target.value)}
            placeholder="Não alterar"
            className="h-8 w-44 rounded border px-2 text-xs"
            style={campo}
          />
          <datalist id={listId}>{opcoes.map(o => <option key={o} value={o} />)}</datalist>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Fat. transp.</span>
          <input type="date" value={fat} onChange={e => setFat(e.target.value)} className="h-8 rounded border px-2 text-xs" style={campo} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Previsão</span>
          <input type="date" value={prev} onChange={e => setPrev(e.target.value)} className="h-8 rounded border px-2 text-xs" style={campo} />
        </label>

        <button
          type="button"
          onClick={onAplicar}
          disabled={aplicando}
          className="h-8 rounded-lg px-3.5 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--brand)' }}
        >
          {aplicando ? 'Aplicando…' : `Aplicar a ${quantidade}`}
        </button>
        <button
          type="button"
          onClick={onEnviarColeta}
          disabled={enviandoColeta}
          title="Abre o Outlook com a lista dos itens marcados para a logística coletar"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-bold cursor-pointer disabled:opacity-50"
          style={{ borderColor: 'var(--brand)', color: 'var(--brand)', background: 'var(--surface-card)' }}
        >
          <Mail className="h-3.5 w-3.5" />
          {enviandoColeta ? 'Montando…' : 'Lista de coleta'}
        </button>

        <button
          type="button"
          onClick={onLimpar}
          className="h-8 rounded-lg px-3 text-xs font-bold cursor-pointer"
          style={{ color: 'var(--ink-muted)' }}
        >
          Limpar
        </button>
      </div>
      {transp && !prev && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          Trocar só a transportadora limpa a previsão manual dos itens — o cálculo (remessa + prazo) volta a valer.
        </p>
      )}
    </div>
  );
}

/** Bloco "Remessa / Previsão" reutilizado pela tabela e pelo cartão. */
function PrevisaoCelula({
  item, vencido, onAbrirPrazos, onSalvar,
}: {
  item: ItemDiligenciamento;
  vencido: boolean;
  onAbrirPrazos: () => void;
  onSalvar: (item: ItemDiligenciamento, data: string) => void;
}) {
  return (
    <>
      <span className="block" style={{ color: 'var(--ink-muted)' }}>
        Remessa: {item.dataRemessa ? formatDateBR(item.dataRemessa) : '—'}
      </span>
      {item.previsaoEfetiva ? (
        <span
          className="mt-0.5 inline-flex items-center gap-1 font-bold"
          style={{ color: vencido ? 'var(--status-critical)' : 'var(--brand-strong)' }}
          title={item.previsaoManual ? 'Previsão editada manualmente' : 'Previsão calculada (remessa + prazo)'}
        >
          Prev.: {formatDateBR(item.previsaoEfetiva)}
          {vencido && <AlertTriangle className="h-3 w-3" />}
        </span>
      ) : item.motivoSemPrevisao === 'sem_remessa' ? (
        <span className="mt-0.5 flex items-center gap-1 font-semibold" style={{ color: 'var(--status-warning)' }}>
          <AlertTriangle className="h-3 w-3" /> Sem remessa
        </span>
      ) : (
        <button
          type="button"
          onClick={onAbrirPrazos}
          className="mt-0.5 flex items-center gap-1 font-semibold underline decoration-dotted underline-offset-2 cursor-pointer"
          style={{ color: 'var(--status-warning)' }}
          title="Nenhum prazo de trânsito cadastrado para esta UF — clique para cadastrar"
        >
          <AlertTriangle className="h-3 w-3" /> Sem prazo p/ UF
        </button>
      )}
      <input
        type="date"
        aria-label={`Previsão de chegada — PO ${item.docCompra}`}
        defaultValue={item.previsaoEfetiva || ''}
        disabled={item.chegou}
        onBlur={e => onSalvar(item, e.target.value)}
        className="mt-1 w-full rounded border px-1.5 py-1 text-[11px]"
        style={{ ...campo, borderColor: item.previsaoManual ? 'var(--brand)' : campo.borderColor }}
      />
    </>
  );
}

/** Selo de chegada (Rastreio) — tabela e cartão. */
function EstadoChegada({ item }: { item: ItemDiligenciamento }) {
  if (item.chegou) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
        style={{ background: 'color-mix(in srgb, var(--status-good) 15%, transparent)', color: 'var(--status-good)' }}
      >
        <PackageCheck className="h-3 w-3" /> {formatDateBR(item.dataChegada)}
      </span>
    );
  }
  return <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Pendente</span>;
}

/** Cartão de um item — versão mobile da linha da tabela. */
function ItemCard({
  item, reg, marcado, onAlternarSel, vencido, opcoesTransportadora,
  onAbrirPrazos, onSalvarPrevisao, onSalvarFaturamento, onSalvarTransportadora,
}: {
  item: ItemDiligenciamento;
  reg?: EnrichedSAPRecord;
  marcado: boolean;
  onAlternarSel: () => void;
  vencido: boolean;
  opcoesTransportadora: string[];
  onAbrirPrazos: () => void;
  onSalvarPrevisao: (item: ItemDiligenciamento, data: string) => void;
  onSalvarFaturamento: (item: ItemDiligenciamento, data: string) => void;
  onSalvarTransportadora: (item: ItemDiligenciamento, nome: string) => void;
}) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{
        borderColor: vencido ? 'var(--status-critical)' : (marcado ? 'var(--brand)' : 'var(--hairline)'),
        background: 'var(--surface-card)',
      }}
    >
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          aria-label={`Selecionar PO ${item.docCompra}`}
          checked={marcado}
          disabled={item.chegou}
          onChange={onAlternarSel}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer disabled:opacity-40"
          style={{ accentColor: 'var(--brand)' }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-base font-bold" style={{ color: 'var(--ink-primary)' }}>{item.docCompra}</span>
            <EstadoChegada item={item} />
          </div>
          <span className="block text-xs" style={{ color: 'var(--ink-muted)' }}>
            RM {reg?.requisicao_de_compra} · item {reg?.item_reqc}
          </span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div className="col-span-2">
          <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{item.material}</span>
          <span className="ml-1.5" style={{ color: 'var(--ink-secondary)' }}>{item.descricao}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Fornecedor</span>
          <span style={{ color: 'var(--ink-secondary)' }}>{reg?.fornecedor_name || '—'}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Pedido / Valor</span>
          <span style={{ color: 'var(--ink-secondary)' }}>
            {reg?.data_pedido ? formatDateBR(reg.data_pedido) : '—'} · <strong style={{ color: 'var(--ink-primary)' }}>{formatBRL(item.valor)}</strong>
          </span>
        </div>
      </div>

      <div className="mt-2.5 space-y-2 border-t pt-2.5" style={{ borderColor: 'var(--hairline)' }}>
        <div>
          <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Remessa &amp; Previsão</span>
          <PrevisaoCelula item={item} vencido={vencido} onAbrirPrazos={onAbrirPrazos} onSalvar={onSalvarPrevisao} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Fat. transportadora</span>
            <input
              type="date"
              defaultValue={item.faturamentoTransportadora || ''}
              disabled={item.chegou}
              onBlur={e => onSalvarFaturamento(item, e.target.value)}
              className="w-full rounded border px-1.5 py-1 text-[11px]"
              style={campo}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Transportadora</span>
            <CampoTransportadora
              valor={item.transportadora}
              opcoes={opcoesTransportadora}
              desabilitado={item.chegou}
              onSalvar={nome => onSalvarTransportadora(item, nome)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

/**
 * Campo de transportadora: texto livre com sugestão do cadastro mestre e das
 * já digitadas (`<datalist>` nativo) e salvamento ao sair do campo, só quando
 * o valor de fato mudou.
 */
function CampoTransportadora({
  valor, opcoes, desabilitado, onSalvar,
}: { valor: string; opcoes: string[]; desabilitado: boolean; onSalvar: (nome: string) => void }) {
  const [rascunho, setRascunho] = useState(valor);
  const listId = useId();

  useEffect(() => setRascunho(valor), [valor]);

  return (
    <>
      <input
        type="text"
        list={listId}
        aria-label="Transportadora"
        value={rascunho}
        disabled={desabilitado}
        placeholder="Digite ou escolha…"
        onChange={e => setRascunho(e.target.value)}
        onBlur={() => {
          if (normalizarChaveTransportadora(rascunho) !== normalizarChaveTransportadora(valor)) onSalvar(rascunho.trim());
        }}
        className="w-full rounded border px-1.5 py-1 text-[11px]"
        style={campo}
      />
      <datalist id={listId}>
        {opcoes.map(o => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}

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
