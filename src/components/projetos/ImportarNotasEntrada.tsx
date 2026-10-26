/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Recebimento — botão de importação em lote (F1 + F2 por planilha).
 *
 * Lê a planilha, roda a reconciliação pura de `projetosImportacao.ts` e
 * mostra a conferência ANTES de gravar qualquer coisa. A coluna Situação
 * decide o sentido de cada linha:
 *
 *  - `Entrada` → crédito no almoxarifado, um lançamento por Data+NF (F1).
 *  - `Saída` → ordem de separação para pré-montagem de verdade (F2): exige
 *    TRAMO de destino, e as linhas são consolidadas GLOBALMENTE por tramo —
 *    o mesmo tramo pode aparecer em NFs/datas diferentes na planilha, mas é
 *    UM kit separado uma única vez. Cada tramo distinto vira uma ordem que
 *    debita o almoxarifado, cria o kit em `em_premontagem` e avança o status
 *    do tramo — exatamente o que o formulário manual faz.
 *
 * Pendências (linha quebrada, sem catálogo, sem quantidade, TRAMO ausente ou
 * não cadastrado) ficam de fora e são listadas para o operador corrigir.
 *
 * Além disso:
 *  - a coluna Obs. (e o PO) vai para a observação do movimento de cada item;
 *  - CHECK vazio, 0 ou "-" = item não entregue: vai para
 *    `proj_entregas_pendentes` (acompanhamento no Recebimento), não é erro;
 *  - pendências de entrega abertas cujo item veio nesta planilha recebem
 *    baixa junto (marcadas por padrão, o operador pode desmarcar);
 *  - item fora da BOM: a tela oferece cadastrar no catálogo e incluir na
 *    importação antes de confirmar;
 *  - antes de confirmar, cada lançamento é comparado com as entradas já
 *    gravadas: mesma NF + data + itens = "já importada" (não lança); mesma
 *    NF + data com itens diferentes só lança se o operador marcar.
 */

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, ArrowDownToLine, Check, ClipboardList, FileSpreadsheet, Layers, Loader2, PackagePlus, PackageX, Wrench, Upload } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { formatDateBR, formatDateTimeBR, formatQtd } from '../../lib/format';
import { PREFIXO } from '../../lib/projetos';
import {
  agruparPorNota,
  chaveNaoEntregue,
  consolidarOrdensSaida,
  dividirGrupoRepetido,
  itensForaDoCatalogo,
  marcarDuplicidades,
  observacaoDoCredito,
  parseLinhasImportacao,
  pendenciasAtendidas,
  reconciliarGrupo,
  rotuloPendencia,
  type Duplicidade,
  type EntradaExistente,
  type GrupoNotaImportada,
  type ItemNaoEntregue,
  type ReconciliacaoGrupo,
} from '../../lib/projetosImportacao';
import {
  cadastrarItensForaDaBom, criarOrdemPremontagem, listarEntradasExistentes, listarEntregasPendentes, proximoCodigo, registrarEntradaNf,
  registrarEntregasPendentes, resolverEntregasPendentes, separarTudoEConfirmar, type ProjEntregaPendente,
} from '../../lib/projetosApi';
import type { Profile, ProjItem, ProjSubprojeto, ProjTramoUnidade } from '../../types';

interface Props {
  itens: ProjItem[];
  tramos: ProjTramoUnidade[];
  subprojetos: ProjSubprojeto[];
  subprojetoAtivoId?: string | null;
  user: Profile;
  onImportado: () => void;
  className?: string;
}

function lerPlanilha(file: File): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = (ev) => {
      try {
        if (ext === 'csv') {
          const text = ev.target?.result as string;
          resolve(text.split('\n').filter((l) => l.trim()).map((l) => l.split(';').map((c) => c.replace(/"/g, '').trim())));
        } else {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
          const ws = workbook.Sheets[workbook.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }));
        }
      } catch (err: any) {
        reject(new Error(err?.message || 'Falha ao processar a planilha.'));
      }
    };
    if (ext === 'csv') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

type Fase = 'idle' | 'lendo' | 'revisao' | 'gravando' | 'concluido';

/** Um grupo em revisão, com a decisão do operador sobre repetição. */
interface GrupoRevisao {
  chave: string;
  grupoOriginal: GrupoNotaImportada;
  /** true = tratar as N cópias como N lançamentos separados; false = somar em 1. */
  dividir: boolean;
  reconciliacoes: ReconciliacaoGrupo[]; // 1 item se não dividir, N se dividir
}

export default function ImportarNotasEntrada({ itens, tramos, subprojetoAtivoId, user, onImportado, className }: Props) {
  const toast = useToast();
  const [fase, setFase] = useState<Fase>('idle');
  const [erroFatal, setErroFatal] = useState<string | null>(null);
  const [gruposRevisao, setGruposRevisao] = useState<GrupoRevisao[]>([]);
  const [progresso, setProgresso] = useState({ feito: 0, total: 0 });
  const [resumoFinal, setResumoFinal] = useState<{
    lancamentos: number; pecas: number; falhas: string[]; naoEntregues: number; baixadas: number;
  } | null>(null);
  // Itens cadastrados nesta importação (fora da BOM) somam ao catálogo recebido.
  const [itensNovos, setItensNovos] = useState<ProjItem[]>([]);
  const [cadastrando, setCadastrando] = useState(false);
  // Pendências de entrega abertas: as que chegaram nesta planilha recebem baixa (o operador pode desmarcar).
  const [abertas, setAbertas] = useState<ProjEntregaPendente[]>([]);
  const [naoBaixar, setNaoBaixar] = useState<Set<string>>(new Set());
  // Entradas já gravadas das NFs da planilha (null = ainda buscando).
  const [existentes, setExistentes] = useState<EntradaExistente[] | null>(null);
  const [erroExistentes, setErroExistentes] = useState<string | null>(null);
  // Lançamentos com NF + data já gravadas (itens diferentes) que o operador decidiu lançar mesmo assim.
  const [lancarMesmoAssim, setLancarMesmoAssim] = useState<Set<string>>(new Set());

  const itemIdPorPn = useMemo(() => {
    const m = new Map<string, { id: string; part_number: string; descricao: string | null }>();
    [...itens, ...itensNovos].forEach((i) => m.set(i.part_number_norm, { id: i.id, part_number: i.part_number, descricao: i.descricao || i.description }));
    return m;
  }, [itens, itensNovos]);

  const tramosValidos = useMemo(() => new Set(tramos.map((t) => t.id.toUpperCase())), [tramos]);

  const fechar = () => {
    if (fase === 'gravando') return;
    setFase('idle');
    setErroFatal(null);
    setGruposRevisao([]);
    setResumoFinal(null);
    setItensNovos([]);
    setAbertas([]);
    setNaoBaixar(new Set());
    setExistentes(null);
    setErroExistentes(null);
    setLancarMesmoAssim(new Set());
  };

  const verificarExistentes = (nfs: string[]) => {
    setExistentes(null);
    setErroExistentes(null);
    listarEntradasExistentes(nfs)
      .then(setExistentes)
      .catch((err) => setErroExistentes(err?.message || 'falha ao consultar as entradas já gravadas'));
  };

  // Catálogo mudou (itens cadastrados agora): refaz a conferência mantendo a decisão de cada grupo.
  useEffect(() => {
    setGruposRevisao((atual) =>
      atual.map((gr) => {
        const partes = gr.dividir ? dividirGrupoRepetido(gr.grupoOriginal) : [gr.grupoOriginal];
        return { ...gr, reconciliacoes: partes.map((p) => reconciliarGrupo(p, itemIdPorPn, tramosValidos)) };
      }),
    );
  }, [itemIdPorPn, tramosValidos]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFase('lendo');
    setErroFatal(null);
    try {
      const rawRows = await lerPlanilha(file);
      const { linhas, erroFatal: fatal } = parseLinhasImportacao(rawRows);
      if (fatal) { setErroFatal(fatal); setFase('revisao'); return; }
      if (!linhas.length) { setErroFatal('Nenhuma linha de dado encontrada na planilha.'); setFase('revisao'); return; }

      const brutos = agruparPorNota(linhas);
      const revisao: GrupoRevisao[] = brutos.map((g) => ({
        chave: `${g.chave}#${Math.random().toString(36).slice(2, 7)}`,
        grupoOriginal: g,
        dividir: false, // padrão conservador: soma em 1 lançamento até o operador decidir separar
        reconciliacoes: [reconciliarGrupo(g, itemIdPorPn, tramosValidos)],
      }));
      setGruposRevisao(revisao);
      setFase('revisao');
      verificarExistentes(brutos.map((g) => g.nf));
      listarEntregasPendentes('PENDENTE')
        .then(setAbertas)
        .catch((err) => console.warn('Pendências de entrega indisponíveis na importação:', err));
    } catch (err: any) {
      setErroFatal(err?.message || 'Falha ao ler a planilha.');
      setFase('revisao');
    }
  };

  const alternarDivisao = (chave: string) => {
    setGruposRevisao((atual) =>
      atual.map((gr) => {
        if (gr.chave !== chave) return gr;
        const dividir = !gr.dividir;
        const partes = dividir ? dividirGrupoRepetido(gr.grupoOriginal) : [gr.grupoOriginal];
        return { ...gr, dividir, reconciliacoes: partes.map((p) => reconciliarGrupo(p, itemIdPorPn, tramosValidos)) };
      }),
    );
  };

  const todasReconciliacoes = useMemo(() => gruposRevisao.flatMap((g) => g.reconciliacoes), [gruposRevisao]);
  /** Chave estável de cada lançamento (grupo + parte), na mesma ordem de `todasReconciliacoes`. */
  const chavesLancamento = useMemo(() => gruposRevisao.flatMap((g) => g.reconciliacoes.map((_, i) => `${g.chave}#${i}`)), [gruposRevisao]);
  const duplicidadePorChave = useMemo(() => {
    const m = new Map<string, Duplicidade>();
    if (!existentes) return m;
    marcarDuplicidades(todasReconciliacoes, existentes).forEach((d, i) => m.set(chavesLancamento[i], d));
    return m;
  }, [todasReconciliacoes, chavesLancamento, existentes]);
  /** Não lança: idêntica a uma gravada, ou mesma NF + data sem a confirmação do operador. */
  const bloqueado = (chave: string) => {
    const d = duplicidadePorChave.get(chave);
    return !!d && (d.tipo === 'identica' || !lancarMesmoAssim.has(chave));
  };
  const entradasParaLancar = useMemo(
    () => todasReconciliacoes.filter((r, i) => r.creditosEntrada.length > 0 && !bloqueado(chavesLancamento[i])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todasReconciliacoes, chavesLancamento, duplicidadePorChave, lancarMesmoAssim],
  );
  const jaImportadas = [...duplicidadePorChave.values()].filter((d) => d.tipo === 'identica').length;

  /** Ordens de separação — consolidadas GLOBALMENTE por tramo, não por grupo. */
  const ordensSaida = useMemo(() => consolidarOrdensSaida(todasReconciliacoes), [todasReconciliacoes]);

  const naoEntregues = useMemo(() => {
    // Dividir um bloco repetido repete a linha não entregue: a chave junta.
    const porChave = new Map<string, ItemNaoEntregue>();
    todasReconciliacoes.forEach((r) => r.naoEntregues.forEach((n) => { if (!porChave.has(chaveNaoEntregue(n))) porChave.set(chaveNaoEntregue(n), n); }));
    return Array.from(porChave.values());
  }, [todasReconciliacoes]);
  const foraDoCatalogo = useMemo(() => itensForaDoCatalogo(todasReconciliacoes), [todasReconciliacoes]);
  const atendidas = useMemo(() => pendenciasAtendidas(abertas, todasReconciliacoes), [abertas, todasReconciliacoes]);
  const abertasAtendidas = useMemo(() => abertas.filter((a) => atendidas.has(a.id)), [abertas, atendidas]);

  const cadastrarForaDoCatalogo = async () => {
    setCadastrando(true);
    try {
      const novos = await cadastrarItensForaDaBom(foraDoCatalogo, user.name);
      setItensNovos((atual) => [...atual, ...novos.filter((n) => !atual.some((a) => a.id === n.id))]);
      toast.success(`${novos.length} item(ns) cadastrado(s) no catálogo do projeto — já entram nesta importação.`);
    } catch (err: any) {
      toast.error(`Não foi possível cadastrar: ${err?.message || 'erro desconhecido'}`);
    } finally {
      setCadastrando(false);
    }
  };

  const totais = useMemo(() => {
    const itensEntrada = entradasParaLancar.reduce((s, r) => s + r.creditosEntrada.length, 0);
    const pecasEntrada = entradasParaLancar.reduce((s, r) => s + r.creditosEntrada.reduce((x, c) => x + c.quantidade, 0), 0);
    return {
      lancamentos: entradasParaLancar.length + ordensSaida.length,
      itensEntrada,
      pecasEntrada,
      ordensSaida: ordensSaida.length,
      itensSaida: ordensSaida.reduce((s, o) => s + o.itens.length, 0),
      pecasSaida: ordensSaida.reduce((s, o) => s + o.totalPecas, 0),
      pendencias: todasReconciliacoes.reduce((s, r) => s + r.pendencias.length, 0),
      naoEntregues: naoEntregues.length,
    };
  }, [todasReconciliacoes, ordensSaida, naoEntregues, entradasParaLancar]);

  const confirmar = async () => {
    // Já gravadas ficam de fora (ver `bloqueado`).
    const entradasAcionaveis = entradasParaLancar;
    if (!entradasAcionaveis.length && !ordensSaida.length && !naoEntregues.length) {
      toast.error('Nenhum item para lançar — todas as linhas viraram pendência.');
      return;
    }

    setFase('gravando');
    setProgresso({ feito: 0, total: entradasAcionaveis.length + ordensSaida.length });
    const falhas: string[] = [];
    let lancamentosOk = 0;
    let pecasOk = 0;
    // NF → código da entrada criada, para a baixa das pendências que chegaram.
    const codigoPorNf = new Map<string, string>();

    for (const r of entradasAcionaveis) {
      const dataISO = r.grupo.dataISO;
      if (!dataISO) {
        falhas.push(`NF ${r.grupo.nf || '(sem NF)'}: data inválida na planilha, não lançada.`);
        setProgresso((p) => ({ ...p, feito: p.feito + 1 }));
        continue;
      }
      try {
        const codigo = await proximoCodigo(PREFIXO.entrada, dataISO);
        await registrarEntradaNf({
          codigo,
          data_entrada: dataISO,
          numero_nf: r.grupo.nf || 'S/N',
          fornecedor: r.grupo.fornecedor || 'Não informado',
          subprojeto_id: subprojetoAtivoId ?? null,
          observacao: [
            `Importado em lote${r.grupo.repeticaoDetectada > 1 ? ' — bloco marcado como repetição real na planilha' : ''}.`,
            (() => {
              const pos = [...new Set(r.creditosEntrada.flatMap((c) => c.pedidos))];
              return pos.length ? `PO ${pos.join(', ')}.` : '';
            })(),
          ].filter(Boolean).join(' '),
          criado_por_id: user.id,
          criado_por_nome: user.name,
          pais: r.creditosEntrada.map((c) => ({ part_number: c.partNumber, cod_sap: null, descricao: c.descricao, quantidade_recebida: c.quantidade, explodir: false })),
          movimentos: r.creditosEntrada.map((c) => ({ item_id: c.itemId, quantidade: c.quantidade, observacao: observacaoDoCredito(c) })),
        });
        if (!codigoPorNf.has(r.grupo.nf)) codigoPorNf.set(r.grupo.nf, codigo);
        lancamentosOk += 1;
        pecasOk += r.creditosEntrada.reduce((s, c) => s + c.quantidade, 0);
      } catch (err: any) {
        falhas.push(`Entrada NF ${r.grupo.nf} (${formatDateBR(dataISO)}): ${err?.message || 'falha desconhecida'}`);
      }
      setProgresso((p) => ({ ...p, feito: p.feito + 1 }));
    }

    // Cada tramo distinto vira uma ordem de separação (F2) — kit criado,
    // status do tramo avança para em_premontagem. É backfill de algo que já
    // aconteceu de verdade, então a separação é confirmada na hora (não fica
    // esperando check físico de um evento que já passou).
    for (const ordem of ordensSaida) {
      try {
        const codigo = await proximoCodigo(PREFIXO.ordem);
        const criada = await criarOrdemPremontagem({
          codigo,
          subprojeto_id: subprojetoAtivoId ?? null,
          tramo: ordem.tramo,
          quantidade_kits: 1,
          observacao: `Importado em lote — origem: ${ordem.origemNfs.join(', ') || 'sem NF'}.`,
          criado_por_id: user.id,
          criado_por_nome: user.name,
          itens: ordem.itens.map((i) => ({ item_id: i.itemId, subconjunto: null, qtd_por_kit: i.quantidade, qtd_total: i.quantidade, localizador: null })),
          alvos: [ordem.tramoUnidadeId],
        });
        await separarTudoEConfirmar(criada.id, { id: user.id, nome: user.name });
        lancamentosOk += 1;
        pecasOk += ordem.totalPecas;
      } catch (err: any) {
        falhas.push(`Ordem de separação ${ordem.tramoUnidadeId}: ${err?.message || 'falha desconhecida'}`);
      }
      setProgresso((p) => ({ ...p, feito: p.feito + 1 }));
    }

    // Itens não entregues: acompanhamento até chegarem (a mesma pendência não duplica).
    let naoEntreguesNovos = 0;
    if (naoEntregues.length) {
      try {
        naoEntreguesNovos = await registrarEntregasPendentes(
          naoEntregues.map((n) => ({
            chave: chaveNaoEntregue(n), item_id: n.itemId, part_number: n.partNumber, part_number_norm: n.partNumberNorm,
            cod_sap: n.codSap, descricao: n.descricao || null, quantidade_esperada: n.quantidadeEsperada, uom: n.uom,
            numero_nf: n.nf || 'S/N', data_nf: n.dataISO, pedido: n.pedido, numero_kit: n.numeroKit, aplicacao: n.aplicacao,
            fornecedor: n.fornecedor, observacao: n.obs, linha_planilha: n.linha,
          })),
          { id: user.id, name: user.name },
        );
      } catch (err: any) {
        falhas.push(`Itens não entregues: ${err?.message || 'falha ao gravar o acompanhamento'}`);
      }
    }

    // Pendências anteriores que chegaram nesta planilha (só se a entrada da NF foi gravada).
    let baixadas = 0;
    const porNf = new Map<string, string[]>();
    abertasAtendidas.forEach((a) => {
      if (naoBaixar.has(a.id)) return;
      const nf = atendidas.get(a.id)!;
      if (!codigoPorNf.has(nf)) return;
      porNf.set(nf, [...(porNf.get(nf) ?? []), a.id]);
    });
    for (const [nf, ids] of porNf) {
      try {
        await resolverEntregasPendentes(ids, 'ENTREGUE', { nf, notaCodigo: codigoPorNf.get(nf), obs: 'Baixa pela importação da planilha de recebimento.' }, { id: user.id, name: user.name });
        baixadas += ids.length;
      } catch (err: any) {
        falhas.push(`Baixa das pendências da NF ${nf}: ${err?.message || 'falha desconhecida'}`);
      }
    }

    setResumoFinal({ lancamentos: lancamentosOk, pecas: pecasOk, falhas, naoEntregues: naoEntreguesNovos, baixadas });
    setFase('concluido');
    onImportado();
    if (!falhas.length) toast.success(`${lancamentosOk} lançamento(s) registrado(s) — ${formatQtd(pecasOk)} peças movimentadas.`);
    else toast.warning(`${lancamentosOk} lançamento(s) registrado(s), ${falhas.length} falha(s) — confira o resumo.`);
  };

  return (
    <>
      <label
        className={
          className ||
          'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-sm border hover:opacity-90 active:scale-95'
        }
        style={className ? undefined : { borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
      >
        <Upload className="h-4 w-4" /> Importar planilha
        <input type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => void handleFile(e)} />
      </label>

      {fase !== 'idle' && (
        <Modal onClose={fechar} maxWidth="max-w-4xl" ariaLabel="Importação de entradas e ordens de separação" disableOutsideClose={fase === 'gravando'}>
          <ModalHeader onClose={fechar}>
            <h3 className="text-base font-extrabold flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
              <FileSpreadsheet className="h-5 w-5" /> Importação de entradas e ordens de separação
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              Entrada credita o almoxarifado; Saída abre uma ordem de separação (F2) para o tramo indicado. Nada é gravado antes da confirmação.
            </p>
          </ModalHeader>

          <ModalBody>
            {fase === 'lendo' && (
              <div className="flex items-center gap-3 py-10 justify-center text-sm" style={{ color: 'var(--ink-muted)' }}>
                <Loader2 className="h-5 w-5 animate-spin" /> Lendo planilha…
              </div>
            )}

            {erroFatal && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0" /> {erroFatal}
              </div>
            )}

            {fase === 'revisao' && !erroFatal && (
              <div className="space-y-4">
                {existentes === null && !erroExistentes && (
                  <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo o que já foi lançado destas NFs…
                  </p>
                )}
                {erroExistentes && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-3 text-xs text-rose-800 dark:text-rose-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1">Não foi possível conferir se estas NFs já foram lançadas ({erroExistentes}). Sem essa conferência a importação fica bloqueada para não duplicar.</span>
                    <button type="button" onClick={() => verificarExistentes(gruposRevisao.map((g) => g.grupoOriginal.nf))} className="font-bold underline cursor-pointer">Tentar de novo</button>
                  </div>
                )}
                {jaImportadas > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                    <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--abc-a)' }} />
                    <span>
                      <strong>{jaImportadas} lançamento(s) desta planilha já estão gravados</strong> (mesma NF, data e itens) e não serão lançados de novo.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 text-center">
                  <Resumo rotulo="Lançamentos" valor={totais.lancamentos} />
                  <Resumo rotulo="Itens entrada" valor={totais.itensEntrada} cor="var(--abc-a)" />
                  <Resumo rotulo="Peças entrada" valor={totais.pecasEntrada} cor="var(--abc-a)" />
                  <Resumo rotulo="Ordens (tramos)" valor={totais.ordensSaida} cor="var(--abc-c)" />
                  <Resumo rotulo="Peças saída" valor={totais.pecasSaida} cor="var(--abc-c)" />
                  <Resumo rotulo="Não entregues" valor={totais.naoEntregues} cor={totais.naoEntregues ? '#7c3aed' : undefined} />
                  <Resumo rotulo="Pendências" valor={totais.pendencias} cor={totais.pendencias ? 'var(--abc-b)' : undefined} />
                </div>

                {foraDoCatalogo.length > 0 && (
                  <div className="rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
                          <PackagePlus className="h-3.5 w-3.5" /> {foraDoCatalogo.length} item(ns) fora da BOM — não estão no catálogo do projeto
                        </p>
                        <p className="text-[11px] mt-0.5 text-amber-800 dark:text-amber-300">
                          Chegaram com quantidade, mas sem cadastro não entram no saldo. Cadastre para incluir nesta importação (ficam marcados como "fora da BOM").
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void cadastrarForaDoCatalogo()}
                        disabled={cadastrando}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer text-white disabled:opacity-50"
                        style={{ background: 'var(--brand)' }}
                      >
                        {cadastrando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
                        Cadastrar {foraDoCatalogo.length} e incluir na importação
                      </button>
                    </div>
                    <ul className="mt-2 max-h-32 overflow-y-auto space-y-0.5 text-[11px] text-amber-900 dark:text-amber-200">
                      {foraDoCatalogo.map((f) => (
                        <li key={f.partNumberNorm}>
                          <span className="font-mono font-bold">{f.partNumber}</span>
                          {f.codSap && <span className="font-mono"> · SAP {f.codSap}</span>} — {f.descricao || 'sem descrição'} · {formatQtd(f.quantidade)} {f.uom || ''} · NF {f.nfs.join(', ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {abertasAtendidas.length > 0 && (
                  <div className="rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
                    <p className="text-xs font-extrabold flex items-center gap-1.5" style={{ color: 'var(--ink-primary)' }}>
                      <ClipboardList className="h-3.5 w-3.5" /> {abertasAtendidas.length} item(ns) que estavam pendentes de entrega chegaram nesta planilha
                    </p>
                    <p className="text-[11px] mb-2" style={{ color: 'var(--ink-muted)' }}>
                      Marcados recebem baixa junto com a entrada (mesmo part number e, quando há, o mesmo PO). Desmarque o que não for a mesma entrega.
                    </p>
                    <ul className="max-h-32 overflow-y-auto space-y-1 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                      {abertasAtendidas.map((a) => (
                        <li key={a.id}>
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!naoBaixar.has(a.id)}
                              onChange={() => setNaoBaixar((atual) => { const n = new Set(atual); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}
                            />
                            <span className="font-mono font-bold">{a.part_number}</span> — esperado na NF {a.numero_nf}{a.pedido ? ` · PO ${a.pedido}` : ''}
                            {a.quantidade_esperada != null && ` · ${formatQtd(a.quantidade_esperada)} ${a.uom || ''}`} → chegou na NF {atendidas.get(a.id)}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ordensSaida.length > 0 && (
                  <div className="rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
                    <p className="text-xs font-extrabold flex items-center gap-1.5 mb-2" style={{ color: 'var(--ink-primary)' }}>
                      <Wrench className="h-3.5 w-3.5" /> Ordens de separação para pré-montagem ({ordensSaida.length})
                    </p>
                    <p className="text-[11px] mb-2" style={{ color: 'var(--ink-muted)' }}>
                      Cada tramo abaixo vira 1 ordem — mesmo que a planilha tenha registrado o mesmo tramo em NFs diferentes, as linhas foram somadas numa ordem só.
                    </p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {ordensSaida.map((o) => (
                        <div key={o.tramoUnidadeId} className="flex items-center justify-between text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                          <span className="font-bold">{o.tramoUnidadeId}</span>
                          <span>{o.itens.length} itens · {formatQtd(o.totalPecas)} peças · origem: {o.origemNfs.join(', ') || 'sem NF'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                  {gruposRevisao.map((gr) => (
                    <div key={gr.chave} className="rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                            {gr.grupoOriginal.nf ? `NF ${gr.grupoOriginal.nf}` : 'Sem NF'} — {formatDateBR(gr.grupoOriginal.dataISO)}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                            {gr.grupoOriginal.fornecedor || 'fornecedor não informado'} · {gr.grupoOriginal.linhas.length} linha(s) na planilha
                          </p>
                        </div>
                        {gr.grupoOriginal.repeticaoDetectada > 1 && (
                          <label className="inline-flex items-center gap-2 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 cursor-pointer">
                            <Layers className="h-3.5 w-3.5" />
                            Parecem {gr.grupoOriginal.repeticaoDetectada} cópias iguais —
                            <input type="checkbox" checked={gr.dividir} onChange={() => alternarDivisao(gr.chave)} className="cursor-pointer" />
                            {gr.dividir ? `lançar como ${gr.grupoOriginal.repeticaoDetectada} lançamentos` : 'somar em 1'}
                          </label>
                        )}
                      </div>

                      {gr.reconciliacoes.map((r, i) => {
                        const chave = `${gr.chave}#${i}`;
                        const d = duplicidadePorChave.get(chave);
                        if (!d) return null;
                        const parte = gr.reconciliacoes.length > 1 ? `#${i + 1} ` : '';
                        return d.tipo === 'identica' ? (
                          <p key={chave} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <Check className="h-3.5 w-3.5" /> {parte}Já importada em {formatDateTimeBR(d.criadoEm)} ({d.codigo}{d.criadoPor ? `, ${d.criadoPor}` : ''}) — não será lançada de novo
                          </p>
                        ) : (
                          <label key={chave} className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={lancarMesmoAssim.has(chave)}
                              onChange={() => setLancarMesmoAssim((atual) => { const n = new Set(atual); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; })}
                              className="mt-0.5"
                            />
                            <span>
                              {parte}Esta NF já tem entrada nesta data com itens diferentes ({d.codigos.join(', ')}). Só lança se for outra entrega —
                              <strong> marque para lançar mesmo assim</strong>.
                            </span>
                          </label>
                        );
                      })}

                      <div className="mt-2 flex flex-wrap gap-3 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                        {gr.reconciliacoes.map((r, i) => (
                          <React.Fragment key={i}>
                            {r.creditosEntrada.length > 0 && (
                              <span className={`inline-flex items-center gap-1 ${bloqueado(`${gr.chave}#${i}`) ? 'line-through opacity-60' : ''}`} style={{ color: 'var(--abc-a)' }}>
                                <ArrowDownToLine className="h-3 w-3" />
                                {gr.reconciliacoes.length > 1 && `#${i + 1} `}entrada: {r.creditosEntrada.length} itens · {formatQtd(r.creditosEntrada.reduce((s, c) => s + c.quantidade, 0))} peças
                              </span>
                            )}
                            {r.debitosSaida.length > 0 && (
                              <span className="inline-flex items-center gap-1" style={{ color: 'var(--abc-c)' }}>
                                <Wrench className="h-3 w-3" />
                                {gr.reconciliacoes.length > 1 && `#${i + 1} `}saída: {r.debitosSaida.length} itens para {new Set(r.debitosSaida.map((d) => d.tramoUnidadeId)).size} tramo(s)
                              </span>
                            )}
                            {r.naoEntregues.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-300">
                                <PackageX className="h-3 w-3" />
                                {gr.reconciliacoes.length > 1 && `#${i + 1} `}{r.naoEntregues.length} não entregue(s)
                              </span>
                            )}
                            {r.pendencias.length > 0 && (
                              <span className="text-amber-600 dark:text-amber-400">{r.pendencias.length} pendência(s)</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>

                      {gr.reconciliacoes.some((r) => r.naoEntregues.length > 0) && (
                        <ul className="mt-2 space-y-0.5 text-[11px] text-violet-800 dark:text-violet-300">
                          {gr.reconciliacoes.flatMap((r) => r.naoEntregues).slice(0, 6).map((n, i) => (
                            <li key={i}>
                              linha {n.linha}: <span className="font-mono">{n.partNumber}</span> — {n.descricao || 'sem descrição'}
                              {n.quantidadeEsperada != null && ` · esperado ${formatQtd(n.quantidadeEsperada)} ${n.uom || ''}`}
                              {n.pedido && ` · PO ${n.pedido}`}
                              {n.obs && ` · ${n.obs}`}
                              {' — não veio neste carregamento'}
                            </li>
                          ))}
                          {gr.reconciliacoes.flatMap((r) => r.naoEntregues).length > 6 && (
                            <li>… e mais {gr.reconciliacoes.flatMap((r) => r.naoEntregues).length - 6} (todos vão para o acompanhamento).</li>
                          )}
                        </ul>
                      )}

                      {gr.reconciliacoes.some((r) => r.pendencias.length > 0) && (
                        <ul className="mt-2 space-y-0.5 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                          {gr.reconciliacoes.flatMap((r) => r.pendencias).slice(0, 6).map((p, i) => (
                            <li key={i}>
                              linha {p.linha}: <span className="font-mono">{p.partNumberBruto || '(vazio)'}</span> — {rotuloPendencia(p.motivo)}
                            </li>
                          ))}
                          {gr.reconciliacoes.flatMap((r) => r.pendencias).length > 6 && (
                            <li>… e mais {gr.reconciliacoes.flatMap((r) => r.pendencias).length - 6}.</li>
                          )}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fase === 'gravando' && (
              <div className="py-10 text-center space-y-3">
                <Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: 'var(--brand)' }} />
                <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                  Gravando {progresso.feito} de {progresso.total} lançamento(s)…
                </p>
              </div>
            )}

            {fase === 'concluido' && resumoFinal && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: resumoFinal.falhas.length ? 'var(--abc-b)' : 'var(--abc-a)' }}>
                  <Check className="h-5 w-5" /> {resumoFinal.lancamentos} lançamento(s) registrado(s), {formatQtd(resumoFinal.pecas)} peças movimentadas.
                </div>
                {(resumoFinal.naoEntregues > 0 || resumoFinal.baixadas > 0) && (
                  <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                    {resumoFinal.naoEntregues > 0 && `${resumoFinal.naoEntregues} item(ns) não entregue(s) foram para o acompanhamento de pendências de entrega. `}
                    {resumoFinal.baixadas > 0 && `${resumoFinal.baixadas} pendência(s) de entrega anterior(es) receberam baixa.`}
                  </p>
                )}
                {resumoFinal.falhas.length > 0 && (
                  <ul className="text-xs space-y-1" style={{ color: 'var(--abc-c)' }}>
                    {resumoFinal.falhas.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
              </div>
            )}
          </ModalBody>

          <ModalFooter>
            {fase === 'revisao' && !erroFatal && (
              <>
                <button onClick={fechar} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                  Cancelar
                </button>
                <button
                  onClick={() => void confirmar()}
                  disabled={(!totais.itensEntrada && !totais.ordensSaida && !totais.naoEntregues) || cadastrando || existentes === null}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50"
                  style={{ background: 'var(--brand)' }}
                >
                  <Check className="h-4 w-4" /> Confirmar {totais.lancamentos} lançamento(s){totais.naoEntregues ? ` + ${totais.naoEntregues} não entregue(s)` : ''}
                </button>
              </>
            )}
            {(erroFatal || fase === 'concluido') && (
              <button onClick={fechar} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                Fechar
              </button>
            )}
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}

function Resumo({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-lg border p-2" style={{ borderColor: 'var(--hairline)' }}>
      <p className="text-lg font-extrabold tabular-nums" style={{ color: cor ?? 'var(--ink-primary)' }}>{valor}</p>
      <p className="text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>{rotulo}</p>
    </div>
  );
}
