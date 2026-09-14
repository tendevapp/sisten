/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Conferência antes de exportar a planilha de importação SAP. DDP (condição
 * de pagamento) e Imposto vêm das tabelas reais `sup_ddp` e `sup_impostos`
 * — não são um palpite deste app, e por isso não vêm pré-selecionados:
 * "certeza" aqui é o comprador escolhendo na busca, não uma heurística por
 * UF decidindo por ele. O que continua sem fonte automática (Prz.
 * Apresentação, Data Remessa) tem atalho para preencher uma vez e aplicar a
 * todas as linhas — normalmente é a mesma data para o processo inteiro.
 *
 * Uma tabela por fornecedor, física e recolhível — cada uma é um pedido
 * individual (vira uma aba própria no Excel também, ver `exportarSapXlsx`).
 * Recolhida por padrão: com vários fornecedores, mostrar todas as tabelas
 * inteiras de uma vez era o que deixava a tela "de tamanho fixo" — abrir uma
 * de cada vez dá espaço de verdade para editar sem rolar duas direções ao
 * mesmo tempo. `table-layout: fixed` + `colgroup` porque largura em classe
 * Tailwind no `<th>` sozinha não força largura de coluna em tabela de layout
 * automático — é por isso que os campos pareciam pequenos mesmo depois de
 * aumentar as classes a primeira vez.
 *
 * Campo vazio ganha borda vermelha; exportar com algum vazio pede
 * confirmação antes de gerar o arquivo — nada bloqueia, mas nada passa
 * batido sem o comprador ver.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { FileSpreadsheet, Info, Loader2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import { listarDdp, listarImpostosSap, criarDdp } from '../../lib/cotacoesApi';
import { nomeFornecedorCurto } from '../../lib/cotacoes';
import SeletorBuscaCodigo from './SeletorBuscaCodigo';
import { exportarSapXlsx } from '../../lib/exportSapCotacao';
import type { LinhaSapExport } from '../../lib/exportSapCotacao';

const FRETES = [
  { valor: 'CIF', rotulo: 'CIF-Custo, Seguro & frete' },
  { valor: 'FOB', rotulo: 'FOB-Franco a bordo' },
] as const;

const CAMPOS_NUMERICOS = new Set<keyof LinhaSapExport>(['item', 'precoLiq', 'precoCot', 'aliqIcms', 'aliqPis', 'aliqIpi', 'baseReduzida']);

/** Colunas fixas (sempre visíveis) à esquerda, antes da área com scroll lateral — pedido do comprador para conseguir ler o item sem perder a referência ao rolar. */
const COLUNAS_FIXAS = new Set<keyof LinhaSapExport>(['item', 'material', 'item2']);

interface Coluna {
  campo: keyof LinhaSapExport;
  rotulo: string;
  largura: number;
}

const COLUNAS: Coluna[] = [
  { campo: 'item', rotulo: 'Item', largura: 80 },
  { campo: 'material', rotulo: 'Material', largura: 140 },
  { campo: 'item2', rotulo: 'Item2 (descrição)', largura: 320 },
  { campo: 'tipoSolicitacao', rotulo: 'Tipo Solicitação', largura: 130 },
  { campo: 'tipoSolicitacao2', rotulo: 'Tipo Solicitação2', largura: 160 },
  { campo: 'przApresentacaoCotacao', rotulo: 'Prz Apresentação', largura: 180 },
  { campo: 'org', rotulo: 'Org', largura: 80 },
  { campo: 'comprador', rotulo: 'Comprador', largura: 110 },
  { campo: 'rm', rotulo: 'RM', largura: 150 },
  { campo: 'ddp', rotulo: 'DDP', largura: 90 },
  { campo: 'ddpDescr', rotulo: 'DDP Descr (buscar)', largura: 320 },
  { campo: 'frete', rotulo: 'Frete', largura: 220 },
  { campo: 'incoterms', rotulo: 'Incoterms', largura: 220 },
  { campo: 'imposto', rotulo: 'Imposto', largura: 90 },
  { campo: 'impDescricao', rotulo: 'Imp. Descrição (buscar)', largura: 320 },
  { campo: 'dataRemessa', rotulo: 'Data Remessa', largura: 170 },
  { campo: 'cnpj', rotulo: 'CNPJ', largura: 170 },
  { campo: 'precoLiq', rotulo: 'Preço Líq.', largura: 120 },
  { campo: 'tipoDocumento', rotulo: 'Tipo Doc.', largura: 100 },
  { campo: 'texto', rotulo: 'Texto', largura: 380 },
  { campo: 'ncm', rotulo: 'NCM', largura: 130 },
  { campo: 'precoCot', rotulo: 'Preço Cot.', largura: 120 },
  { campo: 'aliqIcms', rotulo: 'Alíq. ICMS', largura: 110 },
  { campo: 'aliqPis', rotulo: 'Alíq. PIS/COF', largura: 110 },
  { campo: 'aliqIpi', rotulo: 'Alíq. IPI', largura: 110 },
  { campo: 'baseReduzida', rotulo: 'Base Reduzida', largura: 130 },
];

/** left (px) de cada coluna fixa, somando a largura das anteriores — para o `sticky left-*` de cada uma não empilhar por cima da outra. */
const LEFT_FIXO: Partial<Record<keyof LinhaSapExport, number>> = (() => {
  let acumulado = 0;
  const mapa: Partial<Record<keyof LinhaSapExport, number>> = {};
  for (const c of COLUNAS) {
    if (!COLUNAS_FIXAS.has(c.campo)) continue;
    mapa[c.campo] = acumulado;
    acumulado += c.largura;
  }
  return mapa;
})();

/** `false` para número (0 é valor legítimo) — só string vazia ou nulo conta como "faltando". */
function campoVazio(valor: unknown): boolean {
  if (valor == null) return true;
  if (typeof valor === 'string') return valor.trim() === '';
  return false;
}

interface ExportarSapModalProps {
  linhasIniciais: LinhaSapExport[];
  numeroProcesso: string;
  onClose: () => void;
}

export default function ExportarSapModal({ linhasIniciais, numeroProcesso, onClose }: ExportarSapModalProps) {
  const [linhas, setLinhas] = useState<LinhaSapExport[]>(linhasIniciais);
  const [ddpTabela, setDdpTabela] = useState<{ ddp: string; descricao: string }[]>([]);
  const [impostosTabela, setImpostosTabela] = useState<{ incoterms: string; descricao: string }[]>([]);
  const [carregandoTabelas, setCarregandoTabelas] = useState(true);
  const [novoDdp, setNovoDdp] = useState<{ linhaKey: string; codigo: string; descricao: string } | null>(null);
  const [salvandoDdp, setSalvandoDdp] = useState(false);
  const [prazoBulk, setPrazoBulk] = useState('');
  const [remessaBulk, setRemessaBulk] = useState('');
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set());
  const [confirmarExportarAberto, setConfirmarExportarAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [ddp, impostos] = await Promise.all([listarDdp(), listarImpostosSap()]);
        if (!cancelado) { setDdpTabela(ddp); setImpostosTabela(impostos); }
      } catch (err) {
        console.error('Falha ao carregar tabelas de referência do export SAP:', err);
      } finally {
        if (!cancelado) setCarregandoTabelas(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  const opcoesDdp = useMemo(() => ddpTabela.map(d => ({ codigo: d.ddp, descricao: d.descricao })), [ddpTabela]);
  const opcoesImposto = useMemo(() => impostosTabela.map(i => ({ codigo: i.incoterms, descricao: i.descricao })), [impostosTabela]);

  const atualizarCampo = (key: string, campo: keyof LinhaSapExport, valor: string) => {
    setLinhas(prev => prev.map(l => (l.key === key
      ? { ...l, [campo]: CAMPOS_NUMERICOS.has(campo) ? (valor === '' ? null : Number(valor)) : valor }
      : l)));
  };

  const aplicarDdp = (key: string, codigo: string, descricao: string) => {
    setLinhas(prev => prev.map(l => (l.key === key ? { ...l, ddp: codigo, ddpDescr: descricao } : l)));
  };

  const aplicarImposto = (key: string, codigo: string, descricao: string) => {
    setLinhas(prev => prev.map(l => (l.key === key ? { ...l, imposto: codigo, impDescricao: descricao } : l)));
  };

  const aplicarFrete = (key: string, codigo: string) => {
    const opcao = FRETES.find(f => f.valor === codigo);
    setLinhas(prev => prev.map(l => (l.key === key ? { ...l, frete: codigo, incoterms: opcao?.rotulo ?? '' } : l)));
  };

  const aplicarATodas = (campo: 'przApresentacaoCotacao' | 'dataRemessa', valor: string) => {
    if (!valor) return;
    setLinhas(prev => prev.map(l => ({ ...l, [campo]: valor })));
  };

  const handleSalvarNovoDdp = async () => {
    if (!novoDdp || !novoDdp.codigo.trim() || !novoDdp.descricao.trim()) return;
    setSalvandoDdp(true);
    try {
      const codigo = novoDdp.codigo.trim();
      const descricao = novoDdp.descricao.trim();
      await criarDdp({ ddp: codigo, descricao });
      setDdpTabela(prev => [...prev, { ddp: codigo, descricao }].sort((a, b) => a.ddp.localeCompare(b.ddp)));
      aplicarDdp(novoDdp.linhaKey, codigo, descricao);
      setNovoDdp(null);
    } catch (err) {
      console.error('Falha ao cadastrar novo DDP:', err);
    } finally {
      setSalvandoDdp(false);
    }
  };

  const grupos = useMemo(() => {
    const porFornecedor = new Map<string, { nome: string; linhas: LinhaSapExport[] }>();
    for (const l of linhas) {
      const grupo = porFornecedor.get(l.propostaKey) ?? { nome: l.fornecedorNome, linhas: [] };
      grupo.linhas.push(l);
      porFornecedor.set(l.propostaKey, grupo);
    }
    return [...porFornecedor.values()];
  }, [linhas]);

  const totalFaltantes = useMemo(
    () => linhas.reduce((soma, l) => soma + COLUNAS.filter(c => campoVazio(l[c.campo])).length, 0),
    [linhas],
  );

  const toggleGrupo = (propostaKey: string) => {
    setGruposAbertos(prev => {
      const next = new Set(prev);
      if (next.has(propostaKey)) next.delete(propostaKey); else next.add(propostaKey);
      return next;
    });
  };

  const executarExportacao = () => {
    exportarSapXlsx(linhas, numeroProcesso);
    setConfirmarExportarAberto(false);
    onClose();
  };

  const handleClicarExportar = () => {
    if (totalFaltantes > 0) setConfirmarExportarAberto(true);
    else executarExportacao();
  };

  const renderCelula = (linha: LinhaSapExport, c: Coluna) => {
    const valor = linha[c.campo];
    const vazio = campoVazio(valor);

    if (c.campo === 'frete') {
      return (
        <select
          value={String(valor ?? '')}
          onChange={e => aplicarFrete(linha.key, e.target.value)}
          className={`w-full rounded border bg-white px-1.5 py-1.5 text-xs dark:bg-slate-900 ${vazio ? 'border-rose-400 bg-rose-50/60 dark:border-rose-700 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'}`}
        >
          <option value="">—</option>
          {FRETES.map(f => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
        </select>
      );
    }

    if (c.campo === 'ddpDescr') {
      return (
        <SeletorBuscaCodigo
          opcoes={opcoesDdp}
          valor={linha.ddp}
          onSelecionar={(codigo, descricao) => aplicarDdp(linha.key, codigo, descricao)}
          placeholder="Buscar DDP..."
          vazio={vazio}
          acaoExtra={{ rotulo: '+ Cadastrar novo DDP...', onClick: () => setNovoDdp({ linhaKey: linha.key, codigo: '', descricao: '' }) }}
        />
      );
    }

    if (c.campo === 'impDescricao') {
      return (
        <SeletorBuscaCodigo
          opcoes={opcoesImposto}
          valor={linha.imposto}
          onSelecionar={(codigo, descricao) => aplicarImposto(linha.key, codigo, descricao)}
          placeholder="Buscar imposto..."
          vazio={vazio}
        />
      );
    }

    // DDP, Imposto e Incoterms são preenchidos pelos seletores acima — aqui só mostram o resultado.
    if (c.campo === 'ddp' || c.campo === 'imposto' || c.campo === 'incoterms') {
      return <span className="px-1 text-slate-500 dark:text-slate-400">{String(valor ?? '') || '—'}</span>;
    }

    const tipo = c.campo === 'przApresentacaoCotacao' || c.campo === 'dataRemessa' ? 'date'
      : CAMPOS_NUMERICOS.has(c.campo) ? 'number' : 'text';

    return (
      <input
        type={tipo}
        step={tipo === 'number' ? 'any' : undefined}
        value={valor == null ? '' : String(valor)}
        onChange={e => atualizarCampo(linha.key, c.campo, e.target.value)}
        className={`w-full min-w-0 rounded border bg-white px-1.5 py-1.5 text-xs tabular-nums outline-none focus:border-indigo-400 dark:bg-slate-900 dark:text-slate-200 ${
          vazio ? 'border-rose-400 bg-rose-50/60 dark:border-rose-700 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
        }`}
      />
    );
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-[97vw]" ariaLabel="Exportar para SAP" zIndexClassName="z-[130]">
      <ModalHeader onClose={onClose}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50">
          <FileSpreadsheet className="h-4 w-4 text-indigo-500" />
          Exportar para SAP — conferência
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {linhas.length} {linhas.length === 1 ? 'item marcado para compra' : 'itens marcados para compra'} · {grupos.length} {grupos.length === 1 ? 'fornecedor (1 aba)' : 'fornecedores (1 aba cada)'}. Clique num fornecedor para abrir e conferir.
        </p>
      </ModalHeader>
      <ModalBody className="p-0">
        <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50/60 px-4 py-2.5 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            DDP e Imposto vêm das tabelas do SAP (<code>sup_ddp</code> / <code>sup_impostos</code>) e não têm sugestão automática — busque e escolha o que tiver certeza. Prz. Apresentação e Data Remessa não têm fonte automática — preencha uma vez abaixo e aplique a todas, ou edite item a item. Campo em vermelho está vazio.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/30">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Prz. Apresentação (todas):</label>
            <input type="date" value={prazoBulk} onChange={e => setPrazoBulk(e.target.value)} className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
            <button
              type="button"
              onClick={() => aplicarATodas('przApresentacaoCotacao', prazoBulk)}
              disabled={!prazoBulk}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              Aplicar a todas
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Data Remessa (todas):</label>
            <input type="date" value={remessaBulk} onChange={e => setRemessaBulk(e.target.value)} className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
            <button
              type="button"
              onClick={() => aplicarATodas('dataRemessa', remessaBulk)}
              disabled={!remessaBulk}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              Aplicar a todas
            </button>
          </div>
          {carregandoTabelas && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando tabelas DDP e Imposto...
            </span>
          )}
          {totalFaltantes > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {totalFaltantes} {totalFaltantes === 1 ? 'campo vazio' : 'campos vazios'}
            </span>
          )}
        </div>

        <div className="space-y-3 p-4">
          {grupos.map(grupo => {
            const propostaKey = grupo.linhas[0].propostaKey;
            const aberto = gruposAbertos.has(propostaKey);
            const faltantesGrupo = grupo.linhas.reduce((s, l) => s + COLUNAS.filter(c => campoVazio(l[c.campo])).length, 0);
            return (
              <div key={propostaKey} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => toggleGrupo(propostaKey)}
                  className="flex w-full items-center justify-between gap-2 bg-indigo-50/60 px-3 py-2.5 text-left text-xs font-bold text-indigo-800 hover:bg-indigo-100/60 dark:bg-indigo-950/20 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                >
                  <span className="flex items-center gap-1.5">
                    {aberto ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                    {nomeFornecedorCurto(grupo.nome)}
                    <span className="font-normal text-indigo-500 dark:text-indigo-400">— {grupo.linhas.length} {grupo.linhas.length === 1 ? 'item' : 'itens'} (1 aba no Excel)</span>
                  </span>
                  {faltantesGrupo > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                      <AlertTriangle className="h-3 w-3" />
                      {faltantesGrupo}
                    </span>
                  )}
                </button>

                {aberto && (
                  <div className="border-t border-slate-200 dark:border-slate-800">
                    <div className="overflow-x-auto">
                      <table className="border-collapse text-xs" style={{ tableLayout: 'fixed', width: 'max-content' }}>
                        <colgroup>
                          {COLUNAS.map(c => <col key={c.campo} style={{ width: c.largura }} />)}
                        </colgroup>
                        <thead>
                          <tr>
                            {COLUNAS.map(c => (
                              <th
                                key={c.campo}
                                className={`border-b border-slate-200 bg-slate-50 px-2 py-2.5 text-left font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 ${
                                  COLUNAS_FIXAS.has(c.campo) ? 'sticky z-20' : ''
                                }`}
                                style={COLUNAS_FIXAS.has(c.campo) ? { left: LEFT_FIXO[c.campo] } : undefined}
                              >
                                {c.rotulo}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.linhas.map(linha => (
                            <tr key={linha.key} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
                              {COLUNAS.map(c => (
                                <td
                                  key={c.campo}
                                  className={`p-1.5 align-top ${COLUNAS_FIXAS.has(c.campo) ? 'sticky z-10 bg-white dark:bg-slate-900' : ''}`}
                                  style={COLUNAS_FIXAS.has(c.campo) ? { left: LEFT_FIXO[c.campo] } : undefined}
                                >
                                  {renderCelula(linha, c)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Um item só deixa a tabela larga e curta — respiro embaixo em vez do painel parecer cortado. */}
                    {grupo.linhas.length === 1 && <div className="h-16" />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleClicarExportar}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Baixar planilha SAP
        </button>
      </ModalFooter>

      {confirmarExportarAberto && (
        <ConfirmDialog
          titulo="Exportar com campos vazios?"
          mensagem={`${totalFaltantes} ${totalFaltantes === 1 ? 'campo está vazio' : 'campos estão vazios'} na planilha. Pode exportar assim mesmo e completar depois, ou voltar e revisar antes.`}
          confirmarLabel="Exportar mesmo assim"
          cancelarLabel="Revisar antes"
          onConfirmar={executarExportacao}
          onCancelar={() => setConfirmarExportarAberto(false)}
        />
      )}

      {novoDdp && (
        <Modal onClose={() => setNovoDdp(null)} maxWidth="max-w-sm" ariaLabel="Cadastrar novo DDP" zIndexClassName="z-[140]">
          <ModalHeader onClose={() => setNovoDdp(null)}>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Cadastrar novo DDP</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Fica disponível para todo mundo daqui em diante.</p>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Código</span>
                <input
                  type="text"
                  value={novoDdp.codigo}
                  onChange={e => setNovoDdp({ ...novoDdp, codigo: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Z062"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Descrição</span>
                <input
                  type="text"
                  value={novoDdp.descricao}
                  onChange={e => setNovoDdp({ ...novoDdp, descricao: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Pagamento em 30/60"
                />
              </label>
            </div>
          </ModalBody>
          <ModalFooter>
            <button type="button" onClick={() => setNovoDdp(null)} className="rounded-xl px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400">Cancelar</button>
            <button
              type="button"
              onClick={handleSalvarNovoDdp}
              disabled={salvandoDdp || !novoDdp.codigo.trim() || !novoDdp.descricao.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {salvandoDdp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Cadastrar'}
            </button>
          </ModalFooter>
        </Modal>
      )}
    </Modal>
  );
}
