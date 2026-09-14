import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Loader2,
  Save,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CONFIG_CATEGORIAS,
  avaliarCriticidadeEspera,
  type CategoriaEtapa,
  type TorreEntregaAgrupada,
  type TramoEntrega,
} from '../../lib/producaoEntrega';
import { atualizarTramoEntrega } from '../../lib/producaoApi';

interface ModalDetalheTramoEntregaProps {
  tramo: TramoEntrega | null;
  torre: TorreEntregaAgrupada | null;
  aoFechar: () => void;
  aoSalvar: (tramoAtualizado: TramoEntrega) => void;
}

const SUGESTOES_AGUARDANDO = [
  'Expedido para o parque',
  'Liberado no pátio, aguardando carreta',
  'Aguardando transporte ao pátio',
  'Aguardando inspeção final de qualidade',
  'Aguardando cabine de pintura',
  'Aguardando cura e secagem da tinta',
  'Aguardando liberação de jato',
  'Aguardando cabine de jato abrasivo',
  'Aguardando montagem de internos mecânicos',
  'Aguardando soldagem de suportes internos',
  'Aguardando liberação de UT nas virolas',
  'Aguardando ajuste e solda do marco de porta',
  'Solda SAW em execução no posto 2',
];

const ETAPAS_POR_CATEGORIA: Record<CategoriaEtapa, string[]> = {
  expedido: ['EXPEDIDO'],
  patio: ['PÁTIO', 'EXPEDIDO', 'MONTAGEM', 'PINTURA'],
  white: [
    'MONTAGEM',
    'MONTAGEM (PÁTIO)',
    'PINTURA',
    'PINTURA (PÁTIO)',
    'LIB.JATO',
    'LIB.JATO (PÁTIO)',
    'CAB.JATO',
  ],
  internos: ['INTERNOS', 'INTERNOS (PÁTIO)'],
  saw02: ['MARCO PORTA', 'SAW02'],
  saw03: ['SAW03'],
  nav01: ['NAV01'],
};

export default function ModalDetalheTramoEntrega({
  tramo,
  torre,
  aoFechar,
  aoSalvar,
}: ModalDetalheTramoEntregaProps) {
  if (!tramo) return null;

  const [categoria, setCategoria] = useState<CategoriaEtapa>(tramo.etapa_categoria);
  const [etapaNome, setEtapaNome] = useState(tramo.etapa_nome);
  const [statusAguardando, setStatusAguardando] = useState(tramo.status_aguardando || '');
  const [diasEspera, setDiasEspera] = useState(tramo.dias_espera);
  const [observacao, setObservacao] = useState(tramo.observacao || '');
  const [salvando, setSalvando] = useState(false);

  const criticidade = avaliarCriticidadeEspera(diasEspera);
  const configCat = CONFIG_CATEGORIAS[categoria] || CONFIG_CATEGORIAS.white;

  const handleTrocaCategoria = (novaCat: CategoriaEtapa) => {
    setCategoria(novaCat);
    const etapasPossiveis = ETAPAS_POR_CATEGORIA[novaCat];
    if (etapasPossiveis && !etapasPossiveis.includes(etapaNome)) {
      setEtapaNome(etapasPossiveis[0]);
    }
    if (novaCat === 'expedido') {
      setStatusAguardando('Expedido para o parque');
      setDiasEspera(0);
    } else if (novaCat === 'patio' && !statusAguardando) {
      setStatusAguardando('Liberado no pátio, aguardando carreta');
    }
  };

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const atualizado: TramoEntrega = {
        ...tramo,
        etapa_categoria: categoria,
        etapa_nome: etapaNome,
        status_aguardando: statusAguardando.trim() || null,
        dias_espera: Number(diasEspera) || 0,
        observacao: observacao.trim() || null,
        updated_at: new Date().toISOString(),
      };

      await atualizarTramoEntrega(tramo.id, {
        etapa_categoria: atualizado.etapa_categoria,
        etapa_nome: atualizado.etapa_nome,
        status_aguardando: atualizado.status_aguardando,
        dias_espera: atualizado.dias_espera,
        observacao: atualizado.observacao,
      });

      toast.success(`Tramo ${tramo.tramo} (Série ${tramo.serie}) atualizado com sucesso.`);
      aoSalvar(atualizado);
      aoFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar tramo.');
    } finally {
      setSalvando(false);
    }
  };

  // Avaliação de impacto na torre
  const tramosFaltantes = torre
    ? Object.entries(torre.tramos).filter(
        ([tId, tObj]) => tId !== tramo.tramo && (!tObj || (tObj.etapa_categoria !== 'expedido' && tObj.etapa_categoria !== 'patio')),
      )
    : [];

  const liberaTorreInteira =
    torre &&
    tramosFaltantes.length === 0 &&
    (categoria === 'expedido' || categoria === 'patio');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Cabeçalho do Modal */}
        <div className="flex items-start justify-between border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black shadow-inner"
              style={{ background: configCat.gradienteCilindro, color: configCat.textoClasse.includes('text-white') ? '#fff' : '#000' }}
            >
              {tramo.tramo}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  Torre {tramo.torre_numero} · Tramo {tramo.tramo}
                </h3>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Série {tramo.serie}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Modelo: <strong className="text-slate-700 dark:text-slate-300">GW55120M-001</strong> · Subprojeto: {tramo.subprojeto_id || 'SP01'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo do Modal com Scroll */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
          {/* Card de Impacto para Tomada de Decisão */}
          {liberaTorreInteira ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50/80 p-3.5 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="text-xs leading-relaxed">
                <strong className="block text-sm font-bold">Desbloqueio Crítico Alcançado!</strong>
                Com este tramo no Pátio/Expedido, a <strong>Torre {tramo.torre_numero}</strong> alcança <strong>100% de prontidão de entrega (5/5)</strong> para embarque imediato!
              </div>
            </div>
          ) : tramosFaltantes.length === 1 ? (
            <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-xs leading-relaxed">
                <strong className="block text-sm font-bold">Prioridade de Conjunto da Torre</strong>
                Restará apenas o tramo <strong>{tramosFaltantes[0][0]}</strong> para a Torre {tramo.torre_numero} ser liberada 100%. Priorize o fluxo deste conjunto!
              </div>
            </div>
          ) : null}

          {/* Seleção de Categoria (Paleta de cores oficial da fábrica) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Processo / Categoria de Acabamento
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['expedido', 'patio', 'white', 'internos', 'saw02', 'saw03', 'nav01'] as CategoriaEtapa[]).map(catKey => {
                const conf = CONFIG_CATEGORIAS[catKey];
                const selecionado = categoria === catKey;
                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => handleTrocaCategoria(catKey)}
                    className={`flex items-center justify-between rounded-xl border p-2.5 text-left text-xs transition-all ${
                      selecionado
                        ? 'border-blue-600 ring-2 ring-blue-500/20 dark:border-blue-400'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/10 shadow-sm"
                        style={{ backgroundColor: conf.hexPrimario }}
                      />
                      <span className="font-bold text-slate-800 dark:text-slate-200">{conf.rotulo}</span>
                    </div>
                    {selecionado && <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Etapa Específica e Rótulo */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Estágio da Peça
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(ETAPAS_POR_CATEGORIA[categoria] || [etapaNome]).map(etp => (
                  <button
                    key={etp}
                    type="button"
                    onClick={() => setEtapaNome(etp)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                      etapaNome === etp
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {etp}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={etapaNome}
                onChange={e => setEtapaNome(e.target.value.toUpperCase())}
                placeholder="Nome da etapa..."
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {/* Tempo de Espera (Aging em dias) */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Tempo de Espera no Estágio
                </label>
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${criticidade.badgeClasse}`}
                >
                  <Clock className="h-3 w-3" />
                  {criticidade.texto}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={diasEspera}
                  onChange={e => setDiasEspera(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-base font-bold text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  dias contínuos na etapa atual
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {diasEspera >= 5
                  ? '⚠️ Atenção: Tramo em fila prolongada (> 4 dias). Representa gargalo na linha.'
                  : diasEspera >= 3
                  ? 'Tempo moderado de permanência. Acompanhar para evitar represamento.'
                  : 'Fluxo regular de produção.'}
              </p>
            </div>
          </div>

          {/* O que está aguardando (Status de espera para tomada de decisão) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              O que está aguardando? (Pendência Operacional)
            </label>
            <input
              type="text"
              value={statusAguardando}
              onChange={e => setStatusAguardando(e.target.value)}
              placeholder="Ex: Aguardando cabine de jato, Aguardando liberação de UT..."
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {/* Chips de atalho */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGESTOES_AGUARDANDO.map(sug => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setStatusAguardando(sug)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Observações Adicionais
            </label>
            <textarea
              rows={2}
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Rastreabilidade, notas de inspeção ou motivo de espera..."
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={aoFechar}
            disabled={salvando}
            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Status
          </button>
        </div>
      </div>
    </div>
  );
}
