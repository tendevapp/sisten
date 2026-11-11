/**
 * "Fará teste de bafômetro?" — nos formulários de entrada da Portaria. Ao
 * salvar, a pessoa entra no livro do Teste de Alcoolemia como pendente
 * (`montarTesteBafometroPortaria`). Depois de cadastrada, a caixa vira só
 * aviso: desmarcar não apaga o teste (quem tira do livro é a tela da
 * alcoolemia, com log).
 */
import React from 'react';
import { Gauge } from 'lucide-react';

export default function CampoFaraBafometro({
  marcado,
  onChange,
  jaCadastrado = false,
  nome,
  compacto = false,
}: {
  marcado: boolean;
  onChange: (marcado: boolean) => void;
  /** A pessoa já tem teste no livro (lançamento salvo antes). */
  jaCadastrado?: boolean;
  /** Nome da pessoa, para o leitor de tela distinguir as caixas da lista. */
  nome?: string;
  compacto?: boolean;
}) {
  const id = React.useId();
  if (jaCadastrado) {
    return (
      <p className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
        <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
        Já está no livro do teste de alcoolemia (pendente de aferição)
      </p>
    );
  }
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20 ${compacto ? 'px-2.5 py-1.5' : 'p-3'}`}>
      <input
        id={id}
        type="checkbox"
        checked={marcado}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-rose-300 text-rose-600 focus:ring-rose-500"
      />
      <label htmlFor={id} className="cursor-pointer text-xs">
        <span className="font-bold text-rose-900 dark:text-rose-200">
          Fará teste de bafômetro?
          {nome && <span className="sr-only"> — {nome}</span>}
        </span>
        <span className="block text-[11px] text-rose-800/80 dark:text-rose-300/80">
          {marcado
            ? 'Ao salvar, entra no livro do Teste de Alcoolemia como pendente.'
            : 'Marque para já cadastrar no Teste de Alcoolemia.'}
        </span>
      </label>
    </div>
  );
}
