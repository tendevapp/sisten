/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lançamento de ocorrências de um fornecimento (OCF-DDMMYY-NN).
 *
 * Um lançamento = fornecedor + PO (opcional) com N ocorrências dentro — ex.:
 * entrega parcial sem alinhar + NF em desacordo. Tudo por clique: categoria,
 * tipo, gravidade e onde foi detectado; texto só quando ajuda. Ao escolher o
 * fornecedor, o histórico dele aparece no topo — é o aviso para quem vai
 * emitir o próximo PO.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ClipboardList, History, Loader2, MessageSquareQuote, Plus, Trash2,
} from 'lucide-react';
import type { Profile } from '../../../types';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import {
  ACOES, CATEGORIAS, CATEGORIA_POR_ID, DETECCOES, GRAVIDADES, IMPACTOS, ROTULO_ESTRELAS,
  novoItemOcorrencia, ocorrenciasDasPendencias, rotuloRefPendencia, rotuloTipo, subtrairMeses,
  tiposDaCategoria, validarLancamento, TIPO_POR_ID,
  type CategoriaOcorrencia, type ItemOcorrencia,
} from '../../../lib/avaliacaoFornecedores';
import {
  atualizarRegistro, criarRegistro, listarPedidos, listarRegistros,
  type FornecedorOpcao, type PedidoFornecedor, type RegistroOcorrencia, type SugestaoRegistro,
} from '../../../lib/avaliacaoFornecedoresApi';
import { formatarDataBR, hojeISO } from '../../../lib/fichaEpi';
import { BuscaFornecedor, Chip, Estrelas, Etiqueta, inputCls, rotuloCls } from './ui';

interface Props {
  user: Profile;
  onClose: () => void;
  onSalvo: (r: RegistroOcorrencia | null) => void;
  /** Edição de um registro existente. */
  registro?: RegistroOcorrencia | null;
  /** Lançamento a partir das pendências de um PO. */
  sugestao?: SugestaoRegistro | null;
  /** Fornecedor já escolhido (ex.: vindo do painel). */
  fornecedorInicial?: FornecedorOpcao | null;
}

const alternar = (lista: string[], v: string) => (lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v]);

export default function OcorrenciaFormModal({ user, onClose, onSalvo, registro, sugestao, fornecedorInicial }: Props) {
  const toast = useToast();
  const editando = !!registro;

  const [fornecedor, setFornecedor] = useState<FornecedorOpcao | null>(() => {
    if (registro) return { fornecedor_codigo: registro.fornecedor_codigo, fornecedor_nome: registro.fornecedor_nome, cnpj: registro.fornecedor_cnpj };
    if (sugestao?.fornecedor_nome) return { fornecedor_codigo: sugestao.fornecedor_codigo, fornecedor_nome: sugestao.fornecedor_nome, cnpj: null };
    return fornecedorInicial ?? null;
  });
  const [dataRegistro, setDataRegistro] = useState(registro?.data_registro || hojeISO());
  const [po, setPo] = useState(registro?.nro_pedido || sugestao?.nro_pedido || '');
  const [nf, setNf] = useState(registro?.nota_fiscal || sugestao?.refs.find(r => r.nota_fiscal)?.nota_fiscal || '');
  const [materialResumo, setMaterialResumo] = useState(registro?.material_resumo || '');
  const [estrelas, setEstrelas] = useState<number | null>(registro?.estrelas ?? null);
  const [itens, setItens] = useState<ItemOcorrencia[]>(() => {
    if (registro) return (registro.ocorrencias || []).map(o => ({ ...novoItemOcorrencia(o.tipo), ...o, descricao: o.descricao || '' }));
    if (sugestao) return ocorrenciasDasPendencias(sugestao.refs);
    return [novoItemOcorrencia()];
  });
  const [impactos, setImpactos] = useState<string[]>(registro?.impactos || []);
  const [acoes, setAcoes] = useState<string[]>(registro?.acoes || []);
  const [acaoDescricao, setAcaoDescricao] = useState(registro?.acao_descricao || '');
  const [recomendacao, setRecomendacao] = useState(registro?.recomendacao || '');
  const [salvando, setSalvando] = useState(false);

  // Pedidos do fornecedor (datalist) e histórico dele
  const [pedidos, setPedidos] = useState<PedidoFornecedor[]>([]);
  const [historico, setHistorico] = useState<RegistroOcorrencia[] | null>(null);

  useEffect(() => {
    let vivo = true;
    setHistorico(null);
    if (!fornecedor) { setPedidos([]); return; }
    if (fornecedor.fornecedor_codigo) {
      listarPedidos({ fornecedorCodigo: fornecedor.fornecedor_codigo }).then(p => vivo && setPedidos(p)).catch(() => {});
    }
    listarRegistros({
      desde: subtrairMeses(hojeISO(), 12),
      fornecedorCodigo: fornecedor.fornecedor_codigo,
      fornecedorNome: fornecedor.fornecedor_codigo ? null : fornecedor.fornecedor_nome,
    })
      .then(r => vivo && setHistorico(r.filter(x => x.id !== registro?.id)))
      .catch(() => vivo && setHistorico([]));
    return () => { vivo = false; };
  }, [fornecedor, registro?.id]);

  // PO digitado sem fornecedor: descobre o fornecedor pela ZL0132
  useEffect(() => {
    const alvo = po.trim();
    if (fornecedor || !/^4\d{9}$/.test(alvo)) return;
    let vivo = true;
    listarPedidos({ po: alvo }).then(lista => {
      const p = lista.find(x => x.nro_pedido === alvo);
      if (vivo && p?.fornecedor_nome) {
        setFornecedor({ fornecedor_codigo: p.fornecedor_codigo, fornecedor_nome: p.fornecedor_nome, cnpj: p.cnpj });
        if (!materialResumo && p.resumo) setMaterialResumo(p.resumo.slice(0, 200));
      }
    }).catch(() => {});
    return () => { vivo = false; };
  }, [po, fornecedor, materialResumo]);

  const pedidoSel = useMemo(() => pedidos.find(p => p.nro_pedido === po.trim()) || null, [pedidos, po]);

  const atualizarItem = (id: string, parcial: Partial<ItemOcorrencia>) =>
    setItens(lista => lista.map(i => (i.id === id ? { ...i, ...parcial } : i)));

  const salvar = async () => {
    const erro = validarLancamento({ fornecedor_nome: fornecedor?.fornecedor_nome || '', estrelas, ocorrencias: itens });
    if (erro) { toast.error(erro); return; }
    setSalvando(true);
    try {
      const refs = [
        ...new Set([
          ...(registro?.origem_refs || []),
          ...(sugestao?.refs.map(r => r.ref) || []),
        ]),
      ];
      const dados = {
        data_registro: dataRegistro,
        fornecedor_codigo: fornecedor!.fornecedor_codigo,
        fornecedor_nome: fornecedor!.fornecedor_nome,
        fornecedor_cnpj: fornecedor!.cnpj,
        nro_pedido: po.trim() || null,
        nota_fiscal: nf.trim() || null,
        material_resumo: (materialResumo.trim() || pedidoSel?.resumo || '').slice(0, 300) || null,
        estrelas,
        ocorrencias: itens,
        impactos,
        acoes,
        acao_descricao: acaoDescricao.trim() || null,
        recomendacao: recomendacao.trim() || null,
        origem: (registro?.origem || (sugestao ? 'PENDENCIAS' : 'MANUAL')) as RegistroOcorrencia['origem'],
        origem_refs: refs,
      };
      if (registro) {
        await atualizarRegistro(registro.id, dados);
        toast.success(`${registro.codigo || 'Registro'} atualizado.`);
        onSalvo(null);
      } else {
        const r = await criarRegistro(dados);
        toast.success(r.codigo ? `Ocorrência ${r.codigo} registrada.` : 'Ocorrência registrada — o código sai ao sincronizar.');
        onSalvo(r);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const recados = (historico || []).filter(h => h.recomendacao?.trim());

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Registrar ocorrência de fornecedor" disableOutsideClose>
      <ModalHeader onClose={onClose}>
        <h3 className="text-lg font-extrabold flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
          <ClipboardList className="h-5 w-5" style={{ color: 'var(--brand)' }} />
          {editando ? `Editar ${registro?.codigo || 'registro'}` : 'Registrar ocorrência'}
        </h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          Um lançamento por fornecimento — inclua quantas ocorrências precisar.
        </p>
      </ModalHeader>

      <ModalBody className="space-y-6">
        {/* Origem: pendências do PO */}
        {sugestao && (
          <div className="rounded-xl border px-3.5 py-3 text-xs space-y-1.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
            <div className="font-bold" style={{ color: 'var(--ink-secondary)' }}>Pendências deste PO que entram no registro</div>
            <div className="flex flex-wrap gap-1.5">
              {sugestao.refs.map(r => (
                <Etiqueta key={r.ref} cor={r.origem === 'PEND_NF' ? CATEGORIA_POR_ID.NOTA_FISCAL.cor : CATEGORIA_POR_ID.QUALIDADE.cor}>
                  {r.codigo ? `${r.codigo} · ` : ''}{rotuloRefPendencia(r)}
                </Etiqueta>
              ))}
            </div>
          </div>
        )}

        {/* 1. Fornecimento */}
        <section className="space-y-3">
          <TituloSecao n={1} titulo="Fornecimento" />
          <div>
            <span className={rotuloCls}>Fornecedor *</span>
            <BuscaFornecedor valor={fornecedor} onChange={setFornecedor} autoFocus={!fornecedor && !editando} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label>
              <span className={rotuloCls}>PO</span>
              <input value={po} onChange={e => setPo(e.target.value.replace(/\s/g, ''))} list="ava-forn-pos" inputMode="numeric" placeholder="4100…" className={`${inputCls} font-mono`} />
              <datalist id="ava-forn-pos">
                {pedidos.map(p => (
                  <option key={p.nro_pedido} value={p.nro_pedido}>{`${formatarDataBR(p.data_pedido)} · ${p.itens} item(ns) · ${(p.resumo || '').slice(0, 60)}`}</option>
                ))}
              </datalist>
            </label>
            <label>
              <span className={rotuloCls}>Nota fiscal</span>
              <input value={nf} onChange={e => setNf(e.target.value)} placeholder="Nº da NF" className={inputCls} />
            </label>
            <label>
              <span className={rotuloCls}>Data</span>
              <input type="date" value={dataRegistro} onChange={e => setDataRegistro(e.target.value)} className={inputCls} />
            </label>
          </div>
          {pedidoSel && (
            <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              PO de {formatarDataBR(pedidoSel.data_pedido)} · {pedidoSel.itens} item(ns) · {(pedidoSel.resumo || '').slice(0, 140)}
            </p>
          )}

          {/* Histórico do fornecedor: o aviso para o próximo comprador */}
          {fornecedor && historico && historico.length > 0 && (
            <div className="rounded-xl border px-3.5 py-3 space-y-2" style={{ borderColor: 'color-mix(in srgb, #d97706 45%, transparent)', background: 'color-mix(in srgb, #d97706 7%, transparent)' }}>
              <div className="flex items-center gap-2 text-xs font-bold" style={{ color: '#b45309' }}>
                <History className="h-4 w-4" />
                {historico.length} registro(s) deste fornecedor nos últimos 12 meses ·{' '}
                {historico.reduce((s, h) => s + (h.ocorrencias?.length || 0), 0)} ocorrência(s)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(contarTipos(historico)).slice(0, 6).map(([tipo, n]) => (
                  <Etiqueta key={tipo} cor={CATEGORIA_POR_ID[TIPO_POR_ID[tipo]?.categoria || 'OUTROS'].cor}>{rotuloTipo(tipo)} · {n}</Etiqueta>
                ))}
              </div>
              {recados.slice(0, 2).map(h => (
                <p key={h.id} className="text-xs flex gap-1.5" style={{ color: 'var(--ink-secondary)' }}>
                  <MessageSquareQuote className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: '#b45309' }} />
                  <span><b>{h.criado_por_nome?.split(' ')[0] || 'Comprador'}</b> ({formatarDataBR(h.data_registro)}): {h.recomendacao}</span>
                </p>
              ))}
            </div>
          )}
        </section>

        {/* 2. Ocorrências */}
        <section className="space-y-3">
          <TituloSecao n={2} titulo="O que aconteceu" extra={`${itens.length} ocorrência(s)`} />
          {itens.map((item, idx) => (
            <CartaoOcorrencia
              key={item.id}
              item={item}
              indice={idx}
              podeRemover={itens.length > 1}
              onChange={p => atualizarItem(item.id, p)}
              onRemover={() => setItens(l => l.filter(i => i.id !== item.id))}
            />
          ))}
          <button
            type="button"
            onClick={() => setItens(l => [...l, novoItemOcorrencia()])}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-sm font-bold transition-colors hover:bg-[var(--surface-raised)]"
            style={{ borderColor: 'var(--hairline)', color: 'var(--brand)' }}
          >
            <Plus className="h-4 w-4" /> Adicionar outra ocorrência
          </button>
        </section>

        {/* 3. Nota e tratativa */}
        <section className="space-y-4">
          <TituloSecao n={3} titulo="Avaliação e tratativa" />
          <div className="rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>Como foi este fornecimento? *</div>
              <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>1 = {ROTULO_ESTRELAS[1]} · 5 = {ROTULO_ESTRELAS[5]}</div>
            </div>
            <Estrelas valor={estrelas} onChange={setEstrelas} tamanho="lg" mostrarRotulo />
          </div>

          <div>
            <span className={rotuloCls}>Impacto</span>
            <div className="flex flex-wrap gap-1.5">
              {IMPACTOS.map(i => (
                <Chip key={i.valor} ativo={impactos.includes(i.valor)} onClick={() => setImpactos(l => alternar(l, i.valor))}
                  cor={i.valor === 'SEM_IMPACTO' ? '#16a34a' : '#dc2626'}>{i.rotulo}</Chip>
              ))}
            </div>
          </div>

          <div>
            <span className={rotuloCls}>Tratativa com o fornecedor</span>
            <div className="flex flex-wrap gap-1.5">
              {ACOES.map(a => (
                <Chip key={a.valor} ativo={acoes.includes(a.valor)} onClick={() => setAcoes(l => alternar(l, a.valor))}>{a.rotulo}</Chip>
              ))}
            </div>
            <input value={acaoDescricao} onChange={e => setAcaoDescricao(e.target.value)} placeholder="Detalhe da tratativa (opcional) — ex.: reposição prometida para 10/11" className={`${inputCls} mt-2`} />
          </div>

          <div>
            <span className={rotuloCls}>Recado para o próximo comprador</span>
            <textarea
              value={recomendacao}
              onChange={e => setRecomendacao(e.target.value)}
              rows={2}
              placeholder="Ex.: confirmar prazo por e-mail antes de emitir o PO; exigir certificado junto com a NF."
              className={inputCls}
            />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>Aparece para quem for lançar ou consultar este fornecedor.</p>
          </div>
        </section>
      </ModalBody>

      <ModalFooter>
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: 'var(--brand)' }}
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? 'Salvar alterações' : 'Registrar'}
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}

function contarTipos(regs: RegistroOcorrencia[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of regs) for (const o of r.ocorrencias || []) out[o.tipo] = (out[o.tipo] || 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

function TituloSecao({ n, titulo, extra }: { n: number; titulo: string; extra?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-white" style={{ background: 'var(--brand)' }}>{n}</span>
        {titulo}
      </h4>
      {extra && <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>{extra}</span>}
    </div>
  );
}

function CartaoOcorrencia({
  item, indice, podeRemover, onChange, onRemover,
}: {
  item: ItemOcorrencia; indice: number; podeRemover: boolean;
  onChange: (p: Partial<ItemOcorrencia>) => void; onRemover: () => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaOcorrencia | null>(item.tipo ? item.categoria : null);
  const cat = categoria ? CATEGORIA_POR_ID[categoria] : null;
  const tipos = categoria ? tiposDaCategoria(categoria) : [];
  const cor = cat?.cor || 'var(--hairline)';

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', borderLeft: `4px solid ${cor}` }}>
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <span className="text-xs font-extrabold" style={{ color: 'var(--ink-secondary)' }}>
          Ocorrência {indice + 1}
          {item.tipo && <span className="font-semibold" style={{ color: cor }}> · {rotuloTipo(item.tipo)}</span>}
        </span>
        {podeRemover && (
          <button type="button" onClick={onRemover} className="rounded-md p-1.5 hover:bg-[var(--surface-raised)]" aria-label={`Remover ocorrência ${indice + 1}`} style={{ color: 'var(--ink-muted)' }}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-3 px-3.5 pb-3.5 pt-2">
        {/* Categoria */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIAS.map(c => (
            <Chip key={c.id} compacto ativo={categoria === c.id} cor={c.cor}
              onClick={() => {
                setCategoria(c.id);
                if (item.categoria !== c.id) onChange({ categoria: c.id, tipo: tiposDaCategoria(c.id).length === 1 ? tiposDaCategoria(c.id)[0].id : '' });
              }}>
              {c.rotulo}
            </Chip>
          ))}
        </div>

        {/* Tipo */}
        {categoria && (
          <div className="flex flex-wrap gap-1.5 rounded-lg p-2" style={{ background: `color-mix(in srgb, ${cor} 6%, transparent)` }}>
            {tipos.map(t => (
              <Chip key={t.id} ativo={item.tipo === t.id} cor={cor} onClick={() => onChange({ tipo: t.id, categoria: t.categoria })}>{t.rotulo}</Chip>
            ))}
          </div>
        )}
        {!categoria && (
          <p className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            <AlertTriangle className="h-3.5 w-3.5" /> Escolha a categoria para ver os tipos.
          </p>
        )}

        {item.tipo && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <span className={rotuloCls}>Gravidade</span>
              <div className="grid grid-cols-3 gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                {GRAVIDADES.map(g => (
                  <button
                    key={g.valor}
                    type="button"
                    title={g.dica}
                    onClick={() => onChange({ gravidade: g.valor })}
                    className="rounded-md px-2 py-1.5 text-xs font-bold transition-all"
                    style={item.gravidade === g.valor
                      ? { background: g.cor, color: '#fff', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.12)' }
                      : { color: 'var(--ink-secondary)' }}
                  >
                    {g.rotulo}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={rotuloCls}>Onde foi detectado</span>
              <div className="flex flex-wrap gap-1">
                {DETECCOES.map(d => (
                  <Chip key={d.valor} compacto ativo={item.deteccao === d.valor} onClick={() => onChange({ deteccao: item.deteccao === d.valor ? null : d.valor })}>
                    {d.rotulo}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {item.tipo && (
          <textarea
            value={item.descricao}
            onChange={e => onChange({ descricao: e.target.value })}
            rows={item.descricao.split('\n').length > 1 ? 3 : 2}
            placeholder={TIPO_POR_ID[item.tipo]?.exigeDescricao ? 'Descreva a ocorrência *' : 'Detalhe (opcional) — item, quantidade, o que o fornecedor alegou…'}
            className={`${inputCls} text-xs`}
          />
        )}
      </div>
    </div>
  );
}
