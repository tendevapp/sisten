/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lançamento da Solicitação Extraordinária de Materiais Estruturais
 * (FRM.ALM-0013) — os mesmos campos da folha: projeto, turno, tramo, hora e
 * data; a tabela de itens (código SAP, quantidade, descrição); e o motivo,
 * com o complemento que cada um pede (motivo e área no reparo de pintura,
 * µm na rugosidade, o "especificar" de Outros).
 *
 * Código e descrição buscam no Cadastro de Itens do almoxarifado (não na
 * ZL0024 — o material aqui ainda não tem saldo lá), pelo código ou por
 * qualquer palavra da descrição; escolher preenche os dois e a unidade.
 * Material fora do cadastro entra digitado à mão.
 *
 * Com `registro`, vira a edição: campos preenchidos, mesmo botão de salvar.
 *
 * `tipo` SEM_SALDO troca o cabeçalho da folha de Projeto (projeto, turno,
 * tramo, motivo) por quem retira (cadastro do RH ou digitado), setor
 * solicitante, data e hora — a retirada vai para a aprovação do gestor do
 * setor e para a baixa do almoxarifado.
 *
 * Fotos dos itens (os dois tipos) sobem comprimidas e carimbadas antes do
 * insert, na pasta do registro; a Sem Saldo coleta ainda a assinatura de
 * quem retira, desenhada na tela.
 *
 * `itemQr` é o item lido no "Ler QR" do cabeçalho: entra na primeira linha
 * vazia (ou numa nova) com descrição e unidade do cadastro, e a quantidade
 * fica para a pessoa preencher.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Search, Trash2 } from 'lucide-react';
import type { Profile, RhPessoa, Sector } from '../../types';
import { useToast } from '../ui/Toast';
import SeletorColaborador, { type ColaboradorEscolhido } from './SeletorColaborador';
import { localDb } from '../../db/localDb';
import { listarRhPessoas } from '../../lib/rhApi';
import type { PreparedAttachment } from '../../lib/imageCompression';
import { CampoAssinaturaRetirante, SeletorFotosSolExtra } from './FotosSolicitacaoExtra';
import { hojeISO } from '../../lib/fichaEpi';
import { horaAgora } from '../../lib/portariaApi';
import { buscarMateriais, type MaterialDisponivel } from '../../lib/requisicaoBalcao';
import { normalizeCode } from '../../lib/almoxarifado';
import {
  MOTIVOS_SOL_EXTRA, lerNumero, normalizarPorMotivo, turnoDaHora, validarSolExtra,
  type DadosSolExtra, type FotoSolExtra, type MotivoSolExtra, type TipoSolExtra, type TurnoSolExtra,
} from '../../lib/solicitacaoExtra';
import {
  atualizarSolicitacaoExtra, criarSolicitacaoExtra, listarCatalogoParaSolicitacao, subirFotoSolExtra, type SolExtra,
} from '../../lib/solicitacaoExtraApi';

interface Props {
  user: Profile;
  /** Padrão PROJETO; na edição vale o tipo do registro. */
  tipo?: TipoSolExtra;
  onSalvo: () => void;
  /** Registro em edição; sem ele, o formulário lança uma solicitação nova. */
  registro?: SolExtra;
  onCancelar?: () => void;
  /** Projetos já usados, para sugerir no campo. */
  projetosSugeridos?: string[];
  /** Item lido no QR do cabeçalho; `n` muda a cada leitura. */
  itemQr?: { codigo: string; n: number } | null;
  /** Avisa que o item lido já entrou na tabela (para não entrar de novo). */
  onItemQrAplicado?: () => void;
}

interface LinhaItem {
  chave: string;
  material: string;
  descricao: string;
  unidade: string;
  quantidade: string;
}

const CHAVE_PROJETO = 'sisten.solExtra.projeto';
const MAX_ITENS = 50;

const campo =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:py-2 sm:text-sm';
const rotulo = 'mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300';

const novaChave = () => Math.random().toString(36).slice(2, 10);
const linhaVazia = (): LinhaItem => ({ chave: novaChave(), material: '', descricao: '', unidade: '', quantidade: '' });

function projetoLembrado(): string {
  try {
    return localStorage.getItem(CHAVE_PROJETO) || '';
  } catch {
    return '';
  }
}

function lembrarProjeto(projeto: string) {
  try {
    localStorage.setItem(CHAVE_PROJETO, projeto);
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

const qtdTexto = (n: number) => String(n).replace('.', ',');

export default function SolicitacaoExtraForm({
  user, tipo: tipoProp = 'PROJETO', onSalvo, registro, onCancelar, projetosSugeridos = [], itemQr, onItemQrAplicado,
}: Props) {
  const toast = useToast();
  const editando = !!registro;
  const tipo: TipoSolExtra = registro?.tipo ?? tipoProp;
  const semSaldo = tipo === 'SEM_SALDO';
  const [data, setData] = useState(registro?.data || hojeISO());
  const [hora, setHora] = useState(registro?.hora?.slice(0, 5) || (editando ? '' : horaAgora()));
  const [turno, setTurno] = useState<TurnoSolExtra | null>(registro ? registro.turno : turnoDaHora(horaAgora()));
  const [projeto, setProjeto] = useState(registro ? registro.projeto || '' : projetoLembrado());
  const [tramo, setTramo] = useState(registro?.tramo || '');
  const [linhas, setLinhas] = useState<LinhaItem[]>(
    registro?.itens?.length
      ? registro.itens.map(i => ({ chave: novaChave(), material: i.material, descricao: i.descricao, unidade: i.unidade, quantidade: qtdTexto(i.quantidade) }))
      : [linhaVazia()],
  );
  const [motivo, setMotivo] = useState<MotivoSolExtra | null>(registro?.motivo ?? null);
  const [motivoDetalhe, setMotivoDetalhe] = useState(registro?.motivo_detalhe || '');
  const [area, setArea] = useState(registro?.area_reparada_m2 != null ? qtdTexto(registro.area_reparada_m2) : '');
  const [rugosidade, setRugosidade] = useState(registro?.rugosidade_um != null ? qtdTexto(registro.rugosidade_um) : '');
  const [observacao, setObservacao] = useState(registro?.observacao || '');
  const [retirante, setRetirante] = useState<ColaboradorEscolhido>({
    id: registro?.retirante_id ?? null,
    nome: registro?.retirante_nome || '',
    registro: registro?.retirante_matricula ?? null,
  });
  const [setorId, setSetorId] = useState(registro?.setor_solicitante_id || '');
  const [fotosGravadas, setFotosGravadas] = useState<FotoSolExtra[]>(registro?.fotos ?? []);
  const [fotosNovas, setFotosNovas] = useState<PreparedAttachment[]>([]);
  const [assinatura, setAssinatura] = useState<string | null>(registro?.assinatura_retirante ?? null);
  const [pessoas, setPessoas] = useState<RhPessoa[]>([]);
  const setores = useMemo<Sector[]>(
    () => (semSaldo ? [...localDb.getSectors()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) : []),
    [semSaldo],
  );
  const [salvando, setSalvando] = useState(false);
  const [catalogo, setCatalogo] = useState<MaterialDisponivel[]>([]);
  // Carregado ou falhou: o item do QR só entra depois, para vir com descrição.
  const [catalogoPronto, setCatalogoPronto] = useState(false);

  useEffect(() => {
    let ativo = true;
    listarCatalogoParaSolicitacao()
      .then(lista => { if (ativo) setCatalogo(lista); })
      .catch(err => {
        console.warn('Cadastro de Itens indisponível na Solicitação Extraordinária:', err);
        if (ativo) toast.warning('Não foi possível carregar o Cadastro de Itens — digite código e descrição à mão.');
      })
      .finally(() => { if (ativo) setCatalogoPronto(true); });
    return () => { ativo = false; };
  }, [toast]);

  useEffect(() => {
    if (!semSaldo) return;
    let ativo = true;
    listarRhPessoas()
      .then(lista => { if (ativo) setPessoas(lista.filter(p => p.ativo)); })
      .catch(err => console.warn('Cadastro do RH indisponível na retirada sem saldo:', err));
    return () => { ativo = false; };
  }, [semSaldo]);

  useEffect(() => {
    if (!itemQr || !catalogoPronto) return;
    const alvo = normalizeCode(itemQr.codigo);
    onItemQrAplicado?.();
    if (linhas.some(l => normalizeCode(l.material) === alvo)) {
      toast.info(`Item ${itemQr.codigo} já está na solicitação.`);
      return;
    }
    const vazia = linhas.find(l => !l.material.trim() && !l.descricao.trim() && !l.quantidade.trim());
    if (!vazia && linhas.length >= MAX_ITENS) {
      toast.warning(`A solicitação já tem ${MAX_ITENS} itens.`);
      return;
    }
    const doCadastro = catalogo.find(m => normalizeCode(m.material) === alvo);
    const preenchida: LinhaItem = {
      chave: vazia?.chave ?? novaChave(),
      material: doCadastro?.material ?? itemQr.codigo.trim().toUpperCase(),
      descricao: doCadastro?.descricao ?? '',
      unidade: doCadastro?.unidade || 'UN',
      quantidade: '',
    };
    setLinhas(lista => (vazia ? lista.map(l => (l.chave === vazia.chave ? preenchida : l)) : [...lista, preenchida]));
    if (doCadastro) toast.success(`Item ${preenchida.material} incluído — informe a quantidade.`);
    else toast.warning(`Item ${preenchida.material} não está no Cadastro de Itens — preencha a descrição.`);
    // Roda por leitura (itemQr.n), com o cadastro já carregado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemQr, catalogoPronto]);

  const alterarLinha = (chave: string, patch: Partial<LinhaItem>) =>
    setLinhas(lista => lista.map(l => (l.chave === chave ? { ...l, ...patch } : l)));

  const limpar = () => {
    setLinhas([linhaVazia()]);
    setMotivo(null); setMotivoDetalhe(''); setArea(''); setRugosidade(''); setObservacao(''); setTramo('');
    setRetirante({ id: null, nome: '', registro: null });
    fotosNovas.forEach(f => URL.revokeObjectURL(f.previewUrl));
    setFotosNovas([]); setFotosGravadas([]); setAssinatura(null);
    const h = horaAgora();
    setData(hojeISO()); setHora(h); setTurno(turnoDaHora(h));
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const itens = linhas
      .filter(l => l.material.trim() || l.descricao.trim() || l.quantidade.trim())
      .map(l => ({
        material: l.material.trim().toUpperCase(),
        descricao: l.descricao.trim().toUpperCase(),
        unidade: l.unidade.trim().toUpperCase() || 'UN',
        quantidade: lerNumero(l.quantidade) ?? 0,
      }));
    const dados = normalizarPorMotivo({
      tipo,
      data,
      hora: hora || null,
      turno,
      projeto: projeto.trim().toUpperCase() || null,
      tramo: tramo.trim().toUpperCase() || null,
      itens,
      motivo,
      motivo_detalhe: motivoDetalhe,
      area_reparada_m2: lerNumero(area),
      rugosidade_um: lerNumero(rugosidade),
      observacao: observacao.trim() || null,
      retirante_id: retirante.id,
      retirante_nome: retirante.nome.trim().toUpperCase() || null,
      retirante_matricula: retirante.registro,
      setor_solicitante_id: setorId || null,
      setor_solicitante_nome: setores.find(st => st.id === setorId)?.name ?? registro?.setor_solicitante_nome ?? null,
      fotos: fotosGravadas,
      assinatura_retirante: assinatura,
      assinatura_retirante_em: assinatura === (registro?.assinatura_retirante ?? null)
        ? registro?.assinatura_retirante_em ?? null
        : assinatura ? new Date().toISOString() : null,
    });
    const erros = validarSolExtra(dados);
    if (erros.length) {
      toast.warning(erros.join(' '));
      return;
    }

    setSalvando(true);
    try {
      // Fotos novas sobem antes, na pasta do registro (o id nasce aqui na criação).
      const id = registro?.id ?? crypto.randomUUID();
      const subidas: FotoSolExtra[] = [];
      for (const f of fotosNovas) subidas.push(await subirFotoSolExtra(id, f));
      dados.fotos = [...fotosGravadas, ...subidas];

      if (registro) {
        await atualizarSolicitacaoExtra(registro.id, dados);
        toast.success(registro.codigo ? `Solicitação ${registro.codigo} atualizada.` : 'Solicitação atualizada.');
        onSalvo();
        return;
      }
      const criada = await criarSolicitacaoExtra(dados, user.name, id);
      if (dados.projeto) lembrarProjeto(dados.projeto);
      if (criada.codigo && semSaldo) toast.success(`Retirada ${criada.codigo} registrada: foi para a aprovação do gestor e gerou a Requisição no Balcão pendente (confirma quando o item tiver saldo na ZL0024).`);
      else if (criada.codigo) toast.success(`Solicitação ${criada.codigo} registrada. A baixa fica pendente de regularização no SAP.`);
      else toast.info('Solicitação salva no aparelho. O código sai quando a conexão voltar e sincronizar.');
      limpar();
      onSalvo();
    } catch (err) {
      toast.error(`Não foi possível salvar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={salvar} className="space-y-4">
      {semSaldo ? (
        <section className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-4 sm:p-5">
          <div className="col-span-2">
            <span className={rotulo}>
              Quem está retirando <span className="text-red-500">*</span>
            </span>
            <SeletorColaborador pessoas={pessoas} valor={retirante} onChange={setRetirante} />
          </div>
          <div className="col-span-2">
            <label className={rotulo}>
              Setor solicitante <span className="text-red-500">*</span>
            </label>
            <select value={setorId} onChange={e => setSetorId(e.target.value)} className={campo}>
              <option value="">Escolha o setor…</option>
              {setores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </div>
          <div>
            <label className={rotulo}>
              Data <span className="text-red-500">*</span>
            </label>
            <input type="date" value={data} required max={hojeISO()} onChange={e => setData(e.target.value)} className={campo} />
          </div>
          <div>
            <label className={rotulo}>
              Hora <span className="text-red-500">*</span>
            </label>
            <input type="time" value={hora} onChange={e => setHora(e.target.value)} className={campo} />
          </div>
          <p className="col-span-2 self-end text-[11px] text-slate-400">
            Vai para a aprovação do gestor do setor solicitante e fica pendente de baixa no almoxarifado até o item ter saldo na ZL0024.
          </p>
        </section>
      ) : (
      <section className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-4 sm:p-5">
        <div className="col-span-2">
          <label className={rotulo}>Projeto</label>
          <input value={projeto} list="sol-extra-projetos" onChange={e => setProjeto(e.target.value)} className={`${campo} uppercase`} />
          <datalist id="sol-extra-projetos">
            {projetosSugeridos.map(p => <option key={p} value={p} />)}
          </datalist>
        </div>
        <div className="col-span-2">
          <span className={rotulo}>Turno</span>
          <div className="flex gap-2">
            {(['1', '2', '3'] as TurnoSolExtra[]).map(t => (
              <button
                key={t}
                type="button"
                aria-pressed={turno === t}
                onClick={() => setTurno(turno === t ? null : t)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold transition ${
                  turno === t
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {t}º
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <label className={rotulo}>Nº tramo</label>
          <input value={tramo} onChange={e => setTramo(e.target.value)} className={`${campo} uppercase`} />
        </div>
        <div>
          <label className={rotulo}>Hora</label>
          <input type="time" value={hora} onChange={e => setHora(e.target.value)} className={campo} />
        </div>
        <div>
          <label className={rotulo}>
            Data <span className="text-red-500">*</span>
          </label>
          <input type="date" value={data} required max={hojeISO()} onChange={e => setData(e.target.value)} className={campo} />
        </div>
      </section>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
            Materiais <span className="text-red-500">*</span>
          </h3>
          <span className="text-[11px] text-slate-400">
            {semSaldo ? 'Material sem saldo na ZL0024 — a baixa sai no balcão quando a NF for lançada' : 'Material sem saldo na ZL0024 — a baixa é regularizada no SAP depois'}
          </span>
        </div>
        <div className="space-y-3">
          {linhas.map((l, i) => (
            <LinhaMaterial
              key={l.chave}
              numero={i + 1}
              linha={l}
              catalogo={catalogo}
              disabled={salvando}
              podeRemover={linhas.length > 1}
              onAlterar={patch => alterarLinha(l.chave, patch)}
              onRemover={() => setLinhas(lista => lista.filter(x => x.chave !== l.chave))}
            />
          ))}
        </div>
        {linhas.length < MAX_ITENS && (
          <button
            type="button"
            onClick={() => setLinhas(lista => [...lista, linhaVazia()])}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 hover:border-blue-400 hover:text-blue-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar item
          </button>
        )}
        <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className={rotulo}>Fotos dos itens</p>
          <SeletorFotosSolExtra
            existentes={fotosGravadas}
            onRemoverExistente={path => setFotosGravadas(l => l.filter(f => f.path !== path))}
            novas={fotosNovas}
            setNovas={setFotosNovas}
            disabled={salvando}
          />
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        {!semSaldo && (
        <>
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
          Motivo <span className="text-red-500">*</span>
        </h3>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {MOTIVOS_SOL_EXTRA.map(m => {
            const ativo = motivo === m.valor;
            return (
              <div key={m.valor} className="py-1.5">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input
                    type="radio"
                    name="motivo-sol-extra"
                    checked={ativo}
                    onChange={() => setMotivo(m.valor)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                  />
                  <span className="text-sm text-slate-800 dark:text-slate-100">
                    {m.rotulo}
                    {m.complemento && <span className="text-slate-500 dark:text-slate-400"> ({m.complemento})</span>}
                  </span>
                </label>
                {ativo && m.valor === 'REPARO_PINTURA' && (
                  <div className="ml-8 mt-1 grid gap-2 sm:grid-cols-[1fr_10rem]">
                    <input value={motivoDetalhe} onChange={e => setMotivoDetalhe(e.target.value)} placeholder="Motivo do reparo *" className={campo} />
                    <input value={area} onChange={e => setArea(e.target.value)} inputMode="decimal" placeholder="Área reparada (m²)" className={campo} />
                  </div>
                )}
                {ativo && m.valor === 'PERDA_RUGOSIDADE' && (
                  <div className="ml-8 mt-1 flex max-w-[12rem] items-center gap-2">
                    <input value={rugosidade} onChange={e => setRugosidade(e.target.value)} inputMode="decimal" placeholder="Perfil" className={campo} />
                    <span className="text-sm font-bold text-slate-500">µm</span>
                  </div>
                )}
                {ativo && m.valor === 'OUTROS' && (
                  <div className="ml-8 mt-1">
                    <input value={motivoDetalhe} onChange={e => setMotivoDetalhe(e.target.value)} placeholder="Especifique o motivo *" className={campo} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>
        )}
        <div>
          <label className={rotulo}>{semSaldo ? 'Observação (para que é o material)' : 'Observação'}</label>
          <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} className={campo} />
        </div>
      </section>

      {semSaldo && (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Assinatura de quem retira</h3>
          <CampoAssinaturaRetirante valor={assinatura} nome={retirante.nome} onChange={setAssinatura} disabled={salvando} />
          <p className="text-[11px] text-slate-400">Sai no PDF da retirada, na linha "Quem retirou". Sem ela, a linha fica em branco para assinar no papel.</p>
        </section>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            disabled={salvando}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={salvando}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {salvando ? 'Enviando...' : editando ? 'Salvar alterações' : semSaldo ? 'Registrar retirada' : 'Registrar solicitação'}
        </button>
      </div>
      {!editando && <p className="text-center text-[11px] text-slate-400 sm:text-right">Registrado por {user.name}</p>}
    </form>
  );
}

type CampoBusca = 'material' | 'descricao';

/**
 * Uma linha da tabela de itens. Código e descrição buscam no Cadastro de
 * Itens enquanto digita (local, sem ida ao servidor); ↑/↓ e Enter escolhem,
 * e escolher preenche código, descrição e unidade.
 */
function LinhaMaterial({
  numero, linha, catalogo, disabled, podeRemover, onAlterar, onRemover,
}: {
  numero: number;
  linha: LinhaItem;
  catalogo: MaterialDisponivel[];
  disabled: boolean;
  podeRemover: boolean;
  onAlterar: (patch: Partial<LinhaItem>) => void;
  onRemover: () => void;
}) {
  const [busca, setBusca] = useState<{ campo: CampoBusca; termo: string } | null>(null);
  const [ativo, setAtivo] = useState(0);

  const resultados = useMemo(
    () => (busca && busca.termo.trim().length >= 2 ? buscarMateriais(catalogo, busca.termo, 12) : []),
    [catalogo, busca],
  );

  const escolher = (m: MaterialDisponivel) => {
    onAlterar({ material: m.material, descricao: m.descricao, unidade: m.unidade || 'UN' });
    setBusca(null);
  };

  const digitar = (campo: CampoBusca, valor: string) => {
    onAlterar({ [campo]: valor });
    setBusca({ campo, termo: valor });
    setAtivo(0);
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (!busca || resultados.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo(a => Math.min(a + 1, resultados.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(a => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); escolher(resultados[ativo]); }
    if (e.key === 'Escape') setBusca(null);
  };

  const fechar = () => setTimeout(() => setBusca(null), 150);

  const sugestoes = (campo: CampoBusca) =>
    busca?.campo === campo && resultados.length > 0 && (
      <ul className="absolute left-0 z-20 mt-1 max-h-72 w-[min(32rem,85vw)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {resultados.map((m, i) => (
          <li key={m.material}>
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => escolher(m)}
              className={`block w-full px-3 py-2 text-left text-xs hover:bg-blue-50 dark:hover:bg-slate-800 ${i === ativo ? 'bg-blue-50 dark:bg-slate-800' : ''}`}
            >
              <span className="font-mono font-bold text-slate-900 dark:text-slate-50">{m.material}</span>
              <span className="text-slate-600 dark:text-slate-300"> · {m.descricao}</span>
              <span className="block text-[10px] text-slate-400">{m.unidade}</span>
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="grid grid-cols-[1.75rem_1fr_2.25rem] items-start gap-2 rounded-xl border border-slate-100 p-2 dark:border-slate-800 sm:grid-cols-[1.75rem_11rem_6.5rem_4rem_1fr_2.25rem] sm:border-0 sm:p-0">
      <span className="pt-2.5 text-center text-xs font-bold text-slate-400">{numero}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={linha.material}
          disabled={disabled}
          onChange={e => digitar('material', e.target.value)}
          onKeyDown={teclas}
          onBlur={fechar}
          placeholder="Código SAP"
          aria-label={`Código SAP do item ${numero}`}
          className={`${campo} pl-8 font-mono`}
          autoComplete="off"
        />
        {sugestoes('material')}
      </div>
      <button
        type="button"
        onClick={onRemover}
        disabled={disabled || !podeRemover}
        aria-label={`Remover item ${numero}`}
        className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:invisible sm:order-last dark:hover:bg-rose-950/40"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {/* No celular quantidade + unidade dividem uma linha; no desktop viram colunas próprias. */}
      <div className="col-span-2 col-start-2 flex gap-1.5 sm:contents">
        <input
          value={linha.quantidade}
          disabled={disabled}
          onChange={e => onAlterar({ quantidade: e.target.value })}
          inputMode="decimal"
          placeholder="Quant."
          aria-label={`Quantidade do item ${numero}`}
          className={`${campo} min-w-0 flex-1 text-right tabular-nums sm:flex-none`}
        />
        <input
          value={linha.unidade}
          disabled={disabled}
          onChange={e => onAlterar({ unidade: e.target.value })}
          placeholder="UN"
          aria-label={`Unidade do item ${numero}`}
          className={`${campo} !w-20 shrink-0 px-2 text-center uppercase sm:!w-full`}
        />
      </div>
      <div className="relative col-span-2 col-start-2 sm:col-span-1 sm:col-start-auto">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={linha.descricao}
          disabled={disabled}
          onChange={e => digitar('descricao', e.target.value)}
          onKeyDown={teclas}
          onBlur={fechar}
          placeholder="Descrição (busca no Cadastro de Itens)"
          aria-label={`Descrição do item ${numero}`}
          className={`${campo} pl-8 uppercase`}
          autoComplete="off"
        />
        {sugestoes('descricao')}
      </div>
    </div>
  );
}
