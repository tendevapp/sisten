/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lançamento do Aqui TEN Melhoria! — mesmos campos do Kaizen em papel
 * (FRM.ENG-0017): identificação, impactos e os quatro blocos (problema,
 * causa, melhoria, resultado), com fotos nos blocos que no papel são
 * "escreva ou desenhe". O rodapé do Responsável pelo Setor fica para a
 * validação, depois de implantado (ver KaizenDetalheModal).
 *
 * Com `kaizen`, vira a edição do registro: campos preenchidos, fotos atuais
 * com opção de remover e espaço para fotos novas.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Save, Search, User, X } from 'lucide-react';
import type { Profile } from '../../types';
import { useToast } from '../ui/Toast';
import { buscarColaboradoresRh, listarSetoresDb, type ColaboradorRhSugestao } from '../../lib/ssmaApi';
import { hojeISO } from '../../lib/fichaEpi';
import {
  KAIZEN_IMPACTOS, atualizarKaizen, criarKaizen,
  type FotoKaizenNova, type Kaizen, type KaizenFoto, type KaizenFotoTipo, type KaizenImpacto,
} from '../../lib/planKaizenApi';
import KaizenFotosCampo, { type FotoLocal } from './KaizenFotosCampo';

interface Props {
  user: Profile;
  onSalvo: () => void;
  /** Registro em edição; sem ele, o formulário lança um Kaizen novo. */
  kaizen?: Kaizen;
  onCancelar?: () => void;
}

const MAX_FOTOS_BLOCO = 4;

const campo =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:py-2 sm:text-sm';
const rotulo = 'mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300';

function Bloco({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <h3 className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-slate-50">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
          {numero}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

export default function KaizenForm({ user, onSalvo, kaizen, onCancelar }: Props) {
  const toast = useToast();
  const editando = !!kaizen;
  const [dataRegistro, setDataRegistro] = useState(kaizen?.data_registro || hojeISO());
  const [nome, setNome] = useState(kaizen?.nome_profissional || '');
  const [pessoaId, setPessoaId] = useState<string | null>(kaizen?.pessoa_id ?? null);
  const [matricula, setMatricula] = useState(kaizen?.matricula || '');
  const [setor, setSetor] = useState(kaizen?.setor || '');
  const [responsavel, setResponsavel] = useState(kaizen?.responsavel_setor || '');
  const [impactos, setImpactos] = useState<KaizenImpacto[]>(kaizen?.impactos || []);
  const [problema, setProblema] = useState(kaizen?.problema || '');
  const [causa, setCausa] = useState(kaizen?.causa || '');
  const [solucao, setSolucao] = useState(kaizen?.solucao || '');
  const [resultado, setResultado] = useState(kaizen?.resultado || '');
  const [ganho, setGanho] = useState(
    kaizen?.ganho_estimado != null ? Number(kaizen.ganho_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
  );
  const [fotosAtuais, setFotosAtuais] = useState<KaizenFoto[]>(kaizen?.fotos || []);
  const [fotos, setFotos] = useState<Record<KaizenFotoTipo, FotoLocal[]>>({ problema: [], solucao: [], resultado: [] });
  const [setores, setSetores] = useState<string[]>([]);
  const [sugestoes, setSugestoes] = useState<ColaboradorRhSugestao[]>([]);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const buscaSeq = useRef(0);

  useEffect(() => {
    listarSetoresDb().then(setSetores).catch(() => setSetores([]));
  }, []);

  // Busca no cadastro do RH enquanto digita; a resposta velha não sobrescreve a nova.
  useEffect(() => {
    if (pessoaId || nome.trim().length < 2) {
      setSugestoes([]);
      return;
    }
    const seq = ++buscaSeq.current;
    const t = setTimeout(() => {
      buscarColaboradoresRh(nome).then(lista => {
        if (seq === buscaSeq.current) setSugestoes(lista);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [nome, pessoaId]);

  const escolherColaborador = (c: ColaboradorRhSugestao) => {
    setNome(c.nome);
    setPessoaId(c.id);
    setMatricula(c.registro || '');
    setMostrarSugestoes(false);
  };

  const alternarImpacto = (valor: KaizenImpacto) =>
    setImpactos(atual => (atual.includes(valor) ? atual.filter(v => v !== valor) : [...atual, valor]));

  const limpar = () => {
    Object.values(fotos).flat().forEach(f => URL.revokeObjectURL(f.previewUrl));
    setNome(''); setPessoaId(null); setMatricula(''); setSetor(''); setResponsavel('');
    setImpactos([]); setProblema(''); setCausa(''); setSolucao(''); setResultado(''); setGanho('');
    setFotos({ problema: [], solucao: [], resultado: [] });
    setDataRegistro(hojeISO());
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (impactos.length === 0) {
      toast.warning('Marque pelo menos um impacto da melhoria.');
      return;
    }
    const ganhoNumero = ganho.trim() ? Number(ganho.replace(/\./g, '').replace(',', '.')) : null;
    if (ganhoNumero !== null && !Number.isFinite(ganhoNumero)) {
      toast.warning('Ganho estimado inválido. Use só números, ex.: 3266,00');
      return;
    }

    const novas: FotoKaizenNova[] = (Object.keys(fotos) as KaizenFotoTipo[]).flatMap(tipo =>
      fotos[tipo].map(f => ({ file: f.file, tipo })),
    );

    const dados = {
      data_registro: dataRegistro,
      pessoa_id: pessoaId,
      nome_profissional: nome.trim().toUpperCase(),
      matricula: matricula.trim() || null,
      setor: setor.trim().toUpperCase(),
      responsavel_setor: responsavel.trim().toUpperCase() || null,
      impactos,
      problema: problema.trim(),
      causa: causa.trim(),
      solucao: solucao.trim(),
      resultado: resultado.trim() || null,
      ganho_estimado: ganhoNumero,
    };

    setSalvando(true);
    try {
      if (kaizen) {
        const { falhasFoto } = await atualizarKaizen(kaizen, dados, fotosAtuais, novas);
        toast.success(kaizen.codigo ? `Kaizen ${kaizen.codigo} atualizado.` : 'Kaizen atualizado.');
        if (falhasFoto > 0) toast.warning(`${falhasFoto} foto(s) não subiram. Tente anexar de novo.`);
        onSalvo();
        return;
      }
      const { kaizen: criado, falhasFoto } = await criarKaizen(dados, novas);
      if (criado.codigo) toast.success(`Kaizen ${criado.codigo} registrado. Obrigado pela melhoria!`);
      else toast.info('Kaizen salvo no aparelho. O código sai quando a conexão voltar e sincronizar.');
      if (falhasFoto > 0) toast.warning(`${falhasFoto} foto(s) não subiram. Abra o registro e anexe de novo.`);
      limpar();
      onSalvo();
    } catch (err) {
      toast.error(`Não foi possível salvar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSalvando(false);
    }
  };

  /** Fotos já gravadas do bloco (só na edição, com remover) + as novas da câmera/galeria. */
  const campoFotos = (tipo: KaizenFotoTipo) => {
    const atuais = fotosAtuais.filter(f => f.tipo === tipo);
    return (
      <div className="space-y-2">
        {atuais.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {atuais.map(f => (
              <div key={f.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                {f.preview_url ? (
                  <img src={f.preview_url} alt={f.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-slate-400">{f.name}</span>
                )}
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => setFotosAtuais(lista => lista.filter(x => x.id !== f.id))}
                  aria-label="Remover foto"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <KaizenFotosCampo
          value={fotos[tipo]}
          onChange={v => setFotos(f => ({ ...f, [tipo]: v }))}
          max={Math.max(0, MAX_FOTOS_BLOCO - atuais.length)}
          disabled={salvando}
        />
      </div>
    );
  };

  return (
    <form onSubmit={salvar} className="space-y-4">
      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 sm:p-5">
        <div className="relative sm:col-span-2">
          <label className={rotulo}>
            Nome do profissional <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={nome}
              required
              onChange={e => {
                setNome(e.target.value);
                setPessoaId(null);
                setMostrarSugestoes(true);
              }}
              onFocus={() => setMostrarSugestoes(true)}
              onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
              placeholder="Digite o nome ou a matrícula"
              className={`${campo} pl-9`}
              autoComplete="off"
            />
          </div>
          {mostrarSugestoes && sugestoes.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {sugestoes.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => escolherColaborador(c)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-800"
                  >
                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="flex-1 truncate text-slate-800 dark:text-slate-100">{c.nome}</span>
                    <span className="font-mono text-xs text-slate-500">{c.registro}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label className={rotulo}>Matrícula</label>
          <input value={matricula} onChange={e => setMatricula(e.target.value)} className={campo} inputMode="numeric" />
        </div>
        <div>
          <label className={rotulo}>
            Data <span className="text-red-500">*</span>
          </label>
          <input type="date" value={dataRegistro} required max={hojeISO()} onChange={e => setDataRegistro(e.target.value)} className={campo} />
        </div>
        <div>
          <label className={rotulo}>
            Setor <span className="text-red-500">*</span>
          </label>
          <input value={setor} required list="kaizen-setores" onChange={e => setSetor(e.target.value)} className={`${campo} uppercase`} />
          <datalist id="kaizen-setores">
            {setores.map(s => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={rotulo}>Responsável pelo setor</label>
          <input value={responsavel} onChange={e => setResponsavel(e.target.value)} className={`${campo} uppercase`} />
        </div>

        <div className="sm:col-span-2">
          <span className={rotulo}>
            Classifique os impactos da melhoria <span className="text-red-500">*</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {KAIZEN_IMPACTOS.map(i => {
              const ativo = impactos.includes(i.valor);
              return (
                <button
                  key={i.valor}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => alternarImpacto(i.valor)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                    ativo
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {i.rotulo}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <Bloco numero={1} titulo="Escreva ou desenhe o desperdício / problema">
        <textarea value={problema} required rows={4} onChange={e => setProblema(e.target.value)} className={campo}
          placeholder="Ex.: equipe do jato aguardando liberação do tramo — tempo de espera, quantas pessoas, quantas peças..." />
        {campoFotos('problema')}
      </Bloco>

      <Bloco numero={2} titulo="Por que este desperdício ou problema está acontecendo?">
        <label className={rotulo}>
          Qual é a causa deste problema? <span className="text-red-500">*</span>
        </label>
        <textarea value={causa} required rows={4} onChange={e => setCausa(e.target.value)} className={campo} />
      </Bloco>

      <Bloco numero={3} titulo="Escreva ou desenhe a melhoria / solução">
        <textarea value={solucao} required rows={4} onChange={e => setSolucao(e.target.value)} className={campo} />
        {campoFotos('solucao')}
      </Bloco>

      <Bloco numero={4} titulo="Qual foi o resultado obtido?">
        <textarea value={resultado} rows={3} onChange={e => setResultado(e.target.value)} className={campo}
          placeholder="Ex.: 50 min de 4 funcionários por tramo; eficiência operacional, ganho de produtividade..." />
        <div className="max-w-xs">
          <label className={rotulo}>Ganho estimado (R$)</label>
          <input value={ganho} onChange={e => setGanho(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} />
        </div>
        {campoFotos('resultado')}
      </Bloco>

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
          {salvando ? 'Enviando...' : editando ? 'Salvar alterações' : 'Registrar Kaizen'}
        </button>
      </div>
      {!editando && <p className="text-center text-[11px] text-slate-400 sm:text-right">Registrado por {user.name}</p>}
    </form>
  );
}
