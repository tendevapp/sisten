import { ROTULO_SITUACAO_DOC, type LinhaDivergenciaDoc, type LinhaAuditoriaRqb } from './requisicaoBalcaoAuditoria';
import type { EstoqueItem } from '../types';
import type { LinhaBaixasSimulacao } from './requisicaoBalcaoPlanilha';

export type ItemSimulacao = Pick<LinhaAuditoriaRqb, 'item_id' | 'deposito' | 'deposito_destino' | 'tipo_movimento' | 'unidade' | 'quantidade'>;
export interface MovimentoSimulacao {
  doc_material: string; material: string; deposito: string; tipo_movimento: string;
  qtd_um_registro: number; um_registro: string | null;
}
export interface CasoSimulacao {
  par: LinhaDivergenciaDoc;
  parcelas: { origem: string; destino: string; quantidade: number }[];
  revisar: string;
  linhasBaixas?: number[];
}
export interface PosicaoSimulada {
  material: string; descricao: string; deposito: string; unidade: string;
  saidas: number; entradas: number; saldo: number | null; esperado: number | null;
  casos: CasoSimulacao[];
}

const arred = (q: number) => Math.round(q * 1e6) / 1e6;
const un = (s?: string | null) => s?.trim().toUpperCase() || '';
const chavePar = (doc: string, material: string) => doc + '|' + material;

/** O saldo do documento é compartilhado por todas as linhas BAIXAS do material. */
export function simularArquivoBaixas(linhas: LinhaBaixasSimulacao[], movimentos: MovimentoSimulacao[],
  cadastro: Pick<LinhaAuditoriaRqb, 'codigo'|'material'|'unidade'|'data_criacao'|'data_exportacao'|'requisicao_id'>[],
  estoque: Pick<EstoqueItem,'material'|'umb'>[], referencias: LinhaDivergenciaDoc[]) {
  const docsEncontrados = new Set(movimentos.map(m => m.doc_material));
  const porCodigo = new Map(cadastro.map(i => [i.codigo, i]));
  const ref = new Map(referencias.map(p => [chavePar(p.doc,p.material), p]));
  const unidades = new Map<string, Set<string>>();
  for (const [material, unidade] of [...cadastro.map(i => [i.material, i.unidade]), ...estoque.map(e => [e.material, e.umb])]) {
    if (!material || !unidade) continue;
    if (!unidades.has(material)) unidades.set(material, new Set());
    unidades.get(material)!.add(un(unidade));
  }
  const saidas = new Map<string, number>();
  for (const m of movimentos) {
    const q = Number(m.qtd_um_registro);
    if ((q < 0 && ['201','221','241','311'].includes(m.tipo_movimento)) || (q > 0 && ['202','222','242','312'].includes(m.tipo_movimento))) {
      const k = chavePar(m.doc_material, m.material);
      saidas.set(k, (saidas.get(k) ?? 0) - q);
    }
  }
  const grupos = new Map<string, LinhaBaixasSimulacao[]>();
  for (const l of linhas) {
    const k = chavePar(l.doc,l.material);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(l);
  }
  const pares: LinhaDivergenciaDoc[] = [], itens: ItemSimulacao[] = [];
  const docsAusentes = new Set<string>();
  for (const [k, ls] of grupos) {
    const l = ls[0], registro = ref.get(k);
    if (!docsEncontrados.has(l.doc)) { docsAusentes.add(l.doc); continue; }
    const total = arred(ls.reduce((s,r) => s + r.quantidade, 0)), sap = arred(saidas.get(k) ?? 0);
    if (sap >= total) continue;
    const ums = unidades.get(l.material);
    const unidade = ums?.size === 1 ? [...ums][0] : null;
    const rqbs = ls.map(r => {
      const id = 'BAIXAS-' + r.linha, req = porCodigo.get(r.codigo);
      itens.push({ item_id: id, deposito: r.origem, deposito_destino: r.destino, tipo_movimento: r.tipo, quantidade: r.quantidade, unidade });
      return { item_id: id, requisicao_id: req?.requisicao_id || '', codigo: r.codigo, quantidade: r.quantidade,
        data_criacao: req?.data_criacao || '', data_exportacao: req?.data_exportacao || null };
    });
    pares.push({ doc: l.doc, material: l.material, descricao: l.descricao, unidade, tipo_movimento: l.tipo, deposito: l.origem,
      qtd_rqbs: total, qtd_doc: sap, falta: arred(total-sap), situacao: sap <= 0 ? 'fora_do_doc' : 'parcial',
      preco_medio: registro?.preco_medio ?? null, valor_falta: registro?.preco_medio == null ? 0 : arred((total-sap)*registro.preco_medio),
      lancado_como: registro?.lancado_como ?? null, avulsos: registro?.avulsos ?? null, rqbs, doc_data: null, data_exportacao: null, mb51_ate: null });
  }
  const casos = prepararCasos(pares,itens,movimentos);
  for (const c of casos) c.linhasBaixas = grupos.get(chavePar(c.par.doc,c.par.material))!.map(l => l.linha);
  return { casos, docsAusentes: [...docsAusentes] };
}

/** Distribui apenas o residual. Um mesmo documento pode reunir consumo e 311 do mesmo material. */
export function prepararCasos(pares: LinhaDivergenciaDoc[], itens: ItemSimulacao[], movimentos: MovimentoSimulacao[]): CasoSimulacao[] {
  const porId = new Map(itens.map(i => [i.item_id, i]));
  const porPar = new Map<string, MovimentoSimulacao[]>();
  for (const m of movimentos) {
    const chave = chavePar(m.doc_material, m.material);
    if (!porPar.has(chave)) porPar.set(chave, []);
    porPar.get(chave)!.push(m);
  }
  return pares.filter(p => p.situacao === 'fora_do_doc' || p.situacao === 'parcial').map(par => {
    const revisar = (motivo: string): CasoSimulacao => ({ par, parcelas: [], revisar: motivo });
    const rotas = new Map<string, { origem: string; destino: string; quantidade: number; coberto: number }>();
    for (const ref of par.rqbs) {
      const i = porId.get(ref.item_id);
      if (!i?.deposito || !un(par.unidade) || un(i.unidade) !== un(par.unidade) || i.quantidade !== ref.quantidade)
        return revisar('Revisar quantidade, unidade e depósito dos itens da RQB.');
      const transf = i.tipo_movimento === 'transferencia';
      const destino = transf ? i.deposito_destino : '';
      if ((transf && (!destino || destino === i.deposito)) || (!transf && i.tipo_movimento !== 'saida'))
        return revisar('Confirmar o movimento e os dois depósitos no comprovante.');
      const k = i.deposito + '|' + destino;
      const rota = rotas.get(k) ?? { origem: i.deposito, destino: destino || '', quantidade: 0, coberto: 0 };
      rota.quantidade += i.quantidade;
      rotas.set(k, rota);
    }
    const lista = [...rotas.values()];
    const entradas311 = new Map<string, number>();
    for (const m of porPar.get(chavePar(par.doc, par.material)) ?? []) {
      const q = Number(m.qtd_um_registro);
      const tm = m.tipo_movimento;
      const transf = tm === '311' || tm === '312';
      if (!q) continue;
      if (un(m.um_registro) !== un(par.unidade)) return revisar('Conferir a unidade de registro da MB51.');
      if (transf && ((tm === '311' && q > 0) || (tm === '312' && q < 0))) {
        entradas311.set(m.deposito, (entradas311.get(m.deposito) ?? 0) + q);
        continue;
      }
      const saida = ['201', '221', '241', '311'].includes(tm) && q < 0;
      const estorno = ['202', '222', '242', '312'].includes(tm) && q > 0;
      if (!saida && !estorno) return revisar('Conferir movimento ou sinal atípico no documento SAP.');
      const candidatas = lista.filter(r => r.origem === m.deposito && Boolean(r.destino) === transf);
      if (candidatas.length !== 1) return revisar('Conferir tipo e depósitos do lançamento antes de atribuir a diferença.');
      candidatas[0].coberto -= q;
    }
    for (const r of lista) {
      if (r.destino) entradas311.set(r.destino, (entradas311.get(r.destino) ?? 0) - r.coberto);
      if (r.coberto < 0 || arred(r.quantidade - r.coberto) < 0)
        return revisar('Conciliar excesso ou estorno por depósito e tipo de movimento.');
    }
    if ([...entradas311.values()].some(q => arred(q) !== 0))
      return revisar('Conferir a contrapartida da transferência no destino.');
    const parcelas = lista.map(r => ({ origem: r.origem, destino: r.destino, quantidade: arred(r.quantidade - r.coberto) })).filter(r => r.quantidade > 0);
    if (arred(parcelas.reduce((s, r) => s + r.quantidade, 0) - par.falta) !== 0)
      return revisar('Atualizar as bases e reconciliar o total do documento.');
    return { par, parcelas, revisar: '' };
  });
}

export function calcularPosicoes(casos: CasoSimulacao[], estoque: Pick<EstoqueItem,'material'|'deposito'|'umb'|'quantidade'>[]): PosicaoSimulada[] {
  const saldos = new Map<string, { unidade: string; saldo: number; valido: boolean }>();
  for (const e of estoque) {
    const k = String(e.material || '').trim().replace(/^0+/, '') + '|' + e.deposito;
    const s = saldos.get(k) ?? { unidade: un(e.umb), saldo: 0, valido: true };
    s.valido &&= s.unidade === un(e.umb) && e.quantidade != null && Number.isFinite(Number(e.quantidade));
    s.saldo += Number(e.quantidade);
    saldos.set(k, s);
  }
  const posicoes = new Map<string, PosicaoSimulada>();
  for (const caso of casos) {
    const p = caso.par;
    for (const r of caso.parcelas) {
      for (const deposito of [r.origem, r.destino].filter(Boolean)) {
        const k = p.material + '|' + deposito;
        const s = saldos.get(k);
        const unidade = un(p.unidade);
        const saldo = s?.valido && s.unidade === unidade ? arred(s.saldo) : null;
        const chave = k + '|' + unidade;
        const pos = posicoes.get(chave) ?? { material: p.material, descricao: p.descricao || '', deposito, unidade, saidas: 0, entradas: 0, saldo, esperado: null, casos: [] };
        if (deposito === r.origem) pos.saidas = arred(pos.saidas + r.quantidade);
        else pos.entradas = arred(pos.entradas + r.quantidade);
        pos.esperado = pos.saldo == null ? null : arred(pos.saldo - pos.saidas + pos.entradas);
        if (!pos.casos.includes(caso)) pos.casos.push(caso);
        posicoes.set(chave, pos);
      }
    }
  }
  return [...posicoes.values()].sort((a,b) => a.deposito.localeCompare(b.deposito) || a.material.localeCompare(b.material));
}

export function acaoCaso({ par, revisar }: CasoSimulacao): string {
  if (revisar) return revisar;
  const base = par.situacao === 'parcial' ? 'Conferir a entrega do residual.' : 'Confirmar a entrega e o documento da RQB.';
  return base + (par.avulsos ? ' Rastrear o documento avulso antes de propor baixa.' : ' Verificar outros documentos e estornos.') + ' Conciliar com a contagem.';
}

export function detalheCaso(c: CasoSimulacao) {
  const p = c.par;
  return { Documento: p.doc, Material: p.material, Descrição: p.descricao, Situação: ROTULO_SITUACAO_DOC[p.situacao],
    UM: p.unidade, Requisitado: p.qtd_rqbs, 'MB51 líquida': p.qtd_doc, Residual: p.falta,
    'Valor estimado (R$)': p.preco_medio == null ? null : p.valor_falta, 'Origem → destino (quantidade)': c.parcelas.map(r => r.origem + ' → ' + (r.destino || 'consumo') + ' (' + r.quantidade + ')').join(', '),
    RQBs: p.rqbs.map(r => r.codigo).join(', '), 'Lançado como': p.lancado_como, 'Documentos avulsos próximos': p.avulsos, 'Providência': acaoCaso(c), 'Linhas BAIXAS': c.linhasBaixas?.join(', ') };
}
