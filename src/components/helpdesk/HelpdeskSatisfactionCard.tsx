/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Star, CheckCircle2, AlertTriangle, MessageSquare, ThumbsUp, ThumbsDown, RotateCcw, Sparkles } from 'lucide-react';
import { Request } from '../../types';
import { localDb } from '../../db/localDb';
import { useToast } from '../ui/Toast';

interface HelpdeskSatisfactionCardProps {
  request: Request;
  onEvaluated?: () => void;
  onReopen?: () => void;
  readOnly?: boolean;
}

const RATING_LABELS: Record<number, { label: string; desc: string; color: string; bg: string }> = {
  1: { label: 'Muito Insatisfeito', desc: 'Atendimento não atendeu às expectativas', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' },
  2: { label: 'Insatisfeito', desc: 'Problemas durante o atendimento', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  3: { label: 'Regular / Neutro', desc: 'Atendimento básico dentro do esperado', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  4: { label: 'Satisfeito', desc: 'Bom atendimento e problema resolvido', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  5: { label: 'Excelente!', desc: 'Atendimento ágil, atencioso e impecável', color: 'text-emerald-800', bg: 'bg-emerald-100/70 border-emerald-300' }
};

const POSITIVE_TAGS = [
  '⚡ Rapidez no atendimento',
  '🛠️ Problema 100% resolvido',
  '🤝 Atendente atencioso e cordial',
  '💡 Orientações claras e precisas',
  '🧼 Local organizado e limpo (Facilities)',
  '🎯 Alta competência técnica'
];

const NEGATIVE_TAGS = [
  '⏳ Demora para iniciar o suporte',
  '🔄 Problema voltou a ocorrer / não resolvido',
  '🔇 Falta de comunicação / retorno',
  '⚠️ Solução parcial ou temporária',
  '⏱️ Demora na chegada de peças / materiais'
];

export default function HelpdeskSatisfactionCard({
  request,
  onEvaluated,
  onReopen,
  readOnly = false
}: HelpdeskSatisfactionCardProps) {
  const toast = useToast();
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [isReopening, setIsReopening] = useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>('');

  const isAlreadyRated = Boolean(request.rating && request.rating > 0);
  const activeRating = hoverRating || rating;

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleRatingChange = (score: number) => {
    setRating(score);
    // Limpa tags que não fazem sentido com a nova nota
    if (score >= 4) {
      setSelectedTags(prev => prev.filter(t => POSITIVE_TAGS.includes(t)));
    } else {
      setSelectedTags(prev => prev.filter(t => NEGATIVE_TAGS.includes(t)));
    }
  };

  const handleSubmitEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error('Por favor, selecione uma nota de 1 a 5 estrelas.');
      return;
    }

    setSubmitting(true);
    try {
      // Monta o comentário com as tags estruturadas
      let formattedComment = comment.trim();
      if (selectedTags.length > 0) {
        const tagText = `[Aspectos: ${selectedTags.join(', ')}]`;
        formattedComment = formattedComment ? `${tagText} ${formattedComment}` : tagText;
      }

      await localDb.evaluateTicket(request.id, rating, formattedComment || undefined);
      toast.success('Avaliação de satisfação registrada com sucesso. Obrigado!');
      if (onEvaluated) onEvaluated();
    } catch (err) {
      toast.error('Erro ao enviar avaliação.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopenTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) return;

    setSubmitting(true);
    const user = localDb.getCurrentUser();
    const ok = await localDb.updateRequestStatus(
      request.id,
      'reaberto',
      user?.id,
      `Chamado reaberto pelo solicitante. Motivo: ${reopenReason.trim()}`
    );

    if (ok) {
      toast.success('Chamado reaberto. A equipe foi notificada.');
      setIsReopening(false);
      if (onReopen) onReopen();
      if (onEvaluated) onEvaluated();
    } else {
      toast.error('Falha ao reabrir o chamado.');
    }
    setSubmitting(false);
  };

  // Se já foi avaliado ou está no modo somente leitura
  if (isAlreadyRated || readOnly) {
    const rConfig = RATING_LABELS[request.rating || 5] || RATING_LABELS[5];
    return (
      <div className={`rounded-2xl border p-5 space-y-3 shadow-sm ${rConfig.bg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Avaliação do Atendimento (CSAT)
            </h4>
          </div>
          <div className="flex items-center space-x-1 text-amber-500">
            {[1, 2, 3, 4, 5].map(s => (
              <Star
                key={s}
                className={`h-4 w-4 ${s <= (request.rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
              />
            ))}
            <span className="text-xs font-bold text-slate-800 ml-1.5">{request.rating} / 5</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs pt-1">
          <span className={`font-bold ${rConfig.color}`}>{rConfig.label}</span>
          <span className="text-[11px] text-slate-400">{rConfig.desc}</span>
        </div>

        {request.rating_comment && (
          <p className="text-xs text-slate-700 bg-white/80 p-3 rounded-xl border border-slate-200/60 leading-relaxed italic">
            "{request.rating_comment}"
          </p>
        )}
      </div>
    );
  }

  // Formulário interativo de avaliação no fechamento do chamado
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 space-y-4 shadow-sm">
      
      <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
        <div className="space-y-0.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center">
            <Sparkles className="h-4 w-4 text-emerald-700 mr-1.5" />
            Avaliação de Satisfação do Atendimento
          </h4>
          <p className="text-[11px] text-slate-500">
            Seu chamado foi marcado como concluído. Como foi a sua experiência com a equipe?
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsReopening(!isReopening)}
          className="text-xs font-semibold text-rose-700 hover:text-rose-900 flex items-center space-x-1 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-rose-200 hover:bg-rose-50 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Problema persiste? Reabrir</span>
        </button>
      </div>

      {/* Bloco de Reabertura */}
      {isReopening ? (
        <form onSubmit={handleReopenTicket} className="bg-white p-4 rounded-xl border border-rose-200 space-y-3">
          <div className="flex items-center space-x-2 text-rose-800">
            <AlertTriangle className="h-4 w-4" />
            <h5 className="text-xs font-bold">Reabertura de Chamado</h5>
          </div>
          <p className="text-[11px] text-slate-500">
            Informe por que o incidente ainda necessita de atendimento técnico:
          </p>
          <textarea
            required
            rows={2}
            placeholder="Ex: O equipamento voltou a apresentar o mesmo defeito após 10 minutos de uso..."
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            className="w-full rounded-lg border border-slate-200 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsReopening(false)}
              className="px-3 py-1.5 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs"
            >
              Confirmar Reabertura
            </button>
          </div>
        </form>
      ) : (
        /* Formulário de CSAT */
        <form onSubmit={handleSubmitEvaluation} className="space-y-4">
          
          {/* Estrelas Interativas */}
          <div className="flex flex-col items-center justify-center space-y-2 py-1">
            <div className="flex items-center space-x-2">
              {[1, 2, 3, 4, 5].map(score => (
                <button
                  key={score}
                  type="button"
                  onClick={() => handleRatingChange(score)}
                  onMouseEnter={() => setHoverRating(score)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-125 cursor-pointer focus:outline-none"
                  title={`${score} estrelas`}
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      score <= activeRating
                        ? 'fill-amber-400 text-amber-400 drop-shadow-sm'
                        : 'text-slate-300'
                    }`}
                  />
                </button>
              ))}
            </div>

            {activeRating > 0 && (
              <div className="text-center space-y-0.5 animate-fadeIn">
                <span className={`text-xs font-bold ${RATING_LABELS[activeRating].color}`}>
                  {RATING_LABELS[activeRating].label}
                </span>
                <p className="text-[10px] text-slate-400">
                  {RATING_LABELS[activeRating].desc}
                </p>
              </div>
            )}
          </div>

          {/* Tags de Aspectos Específicos */}
          {rating > 0 && (
            <div className="space-y-2 pt-2 border-t border-emerald-100">
              <label className="text-[11px] font-bold text-slate-600 uppercase block">
                {rating >= 4 ? 'O que mais se destacou no atendimento?' : 'O que podemos melhorar neste atendimento?'}
              </label>

              <div className="flex flex-wrap gap-1.5">
                {(rating >= 4 ? POSITIVE_TAGS : NEGATIVE_TAGS).map(tag => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Campo de Comentário Opcional */}
          {rating > 0 && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase block">
                Comentário ou Elogio (Opcional):
              </label>
              <textarea
                rows={2}
                placeholder="Deixe um recado para a equipe de suporte ou sugestão para futuros chamados..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          )}

          {/* Botão de Envio */}
          {rating > 0 && (
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center space-x-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs py-2 px-5 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{submitting ? 'Gravando...' : 'Enviar Avaliação e Fechar Chamado'}</span>
              </button>
            </div>
          )}

        </form>
      )}

    </div>
  );
}
