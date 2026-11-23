import { useMemo, useState, type FormEvent } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import CampoAssinatura from '../portaria/CampoAssinatura';
import AvisoRascunho from '../ui/AvisoRascunho';
import { blocoSsma, botaoSsma, campoBaseSsma, campoSsma, rotuloSsma } from './estilosFormulario';
import { BarraEnvio, botaoPrincipal, Contador, Secao } from './seguranca/PecasSeguranca';
import { categoriasRonda, totalRonda, type DadosRonda, type ParticipanteRonda } from '../../lib/ssmaRondaApi';
import { dataHojeLocal } from '../../lib/dataLocal';
import { useRascunhoFormulario } from '../../hooks/useRascunhoFormulario';
import { algumTextoPreenchido, apagarRascunho, chaveRascunho } from '../../lib/rascunhoFormulario';

type Resultado = { offline: boolean };
type Props = {
  usuarioId: string; ocupado: boolean;
  /** Grava; devolve `null` se falhou (a tela já mostrou o erro). */
  salvar: (id: string, dados: DadosRonda) => Promise<Resultado | null>;
  /** Depois de gravar e limpar o rascunho do aparelho. */
  onConcluido: (r: Resultado) => void;
};

const vazio = () => ({
  data: dataHojeLocal(), hora: new Date().toTimeString().slice(0,5), gerente: '', assinatura_gerente: null as string | null,
  frentes: '', boas_praticas: '', observacoes: '', epi: '0', queda: '0', organizacao: '0', protecao_coletiva: '0',
});
type Campos = ReturnType<typeof vazio>;
type Pessoa = ParticipanteRonda & { chave: string };
type Rascunho = { id: string; dados: Campos; pessoas: Pessoa[] };

export default function SsmaRondaForm({ usuarioId, ocupado, salvar, onConcluido }: Props) {
  const [id, setId] = useState<string>(() => crypto.randomUUID());
  const [dados, setDados] = useState(vazio);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const quantidades = { epi: Number(dados.epi), queda: Number(dados.queda), organizacao: Number(dados.organizacao), protecao_coletiva: Number(dados.protecao_coletiva) };

  // O id vai no rascunho: um reenvio depois de a aba cair repete o mesmo registro.
  const chave = chaveRascunho(usuarioId, 'ssma-ronda');
  const dadosRascunho = useMemo<Rascunho>(() => ({ id, dados, pessoas }), [id, dados, pessoas]);
  const rascunho = useRascunhoFormulario<Rascunho>({
    chave, aberto: true, dados: dadosRascunho,
    temConteudo: d => algumTextoPreenchido(d.dados, ['data', 'hora', 'epi', 'queda', 'organizacao', 'protecao_coletiva'])
      || ['epi', 'queda', 'organizacao', 'protecao_coletiva'].some(k => Number(d.dados[k as keyof Campos]) > 0) || d.pessoas.length > 0,
    aplicar: d => { setId(d.id); setDados(atual => ({ ...atual, ...d.dados })); setPessoas(d.pessoas ?? []); },
  });

  function alterar(nome: keyof Campos, valor: string | null) {
    setDados(d => ({ ...d, [nome]: valor, ...(nome === 'gerente' ? { assinatura_gerente: null } : {}) }));
  }
  function alterarPessoa(chavePessoa: string, mudanca: Partial<ParticipanteRonda>) {
    setPessoas(todas => todas.map(p => p.chave === chavePessoa ? { ...p, ...mudanca } : p));
  }
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (ocupado) return;
    const r = await salvar(id, { ...dados, ...quantidades, participantes: pessoas.map(({nome, assinatura}) => ({nome, assinatura})) });
    if (!r) return;
    rascunho.concluir();
    if (chave) await apagarRascunho(chave);
    onConcluido(r);
  }
  const assinaturas = (dados.assinatura_gerente ? 1 : 0) + pessoas.filter(p => p.assinatura).length;

  return <form onSubmit={enviar} className="space-y-4">
    <AvisoRascunho salvoEm={rascunho.recuperadoEm} onDescartar={() => { rascunho.descartar(); setId(crypto.randomUUID()); setDados(vazio()); setPessoas([]); }} />
    <fieldset disabled={ocupado} className="min-w-0 space-y-4">
      <Secao marca="1" cor="blue" titulo="Identificação da ronda" descricao="Quando, onde e quem conduziu.">
        <div className="grid grid-cols-2 gap-3">
          <label className={rotuloSsma}>Data<input required className={campoSsma} type="date" value={dados.data} onChange={e => alterar('data', e.target.value)} /></label>
          <label className={rotuloSsma}>Hora<input required className={campoSsma} type="time" value={dados.hora} onChange={e => alterar('hora', e.target.value)} /></label>
        </div>
        <label className={rotuloSsma}>Frentes de trabalho visitadas<textarea required rows={2} maxLength={4000} className={campoSsma}
          placeholder="Ex.: Nave 1 — soldagem; pátio de pintura" value={dados.frentes} onChange={e => alterar('frentes', e.target.value)} /></label>
        <div className={blocoSsma}>
          <label className={rotuloSsma}>Gerente da unidade<input required pattern=".*\S.*" maxLength={150} className={campoSsma}
            autoComplete="name" value={dados.gerente} onChange={e => alterar('gerente', e.target.value)} /></label>
          <CampoAssinatura rotulo="Assinatura do gerente" nomeAssinante={dados.gerente} disabled={!dados.gerente.trim() || ocupado}
            valor={dados.assinatura_gerente} onChange={v => alterar('assinatura_gerente', v)} />
        </div>
      </Secao>
      <Secao marca="2" cor="violet" titulo="Participantes" descricao="Quem acompanhou a ronda. Cada um assina no aparelho."
        extra={<Contador>{pessoas.length}</Contador>}>
        {pessoas.map((p, i) => <div key={p.chave} className={blocoSsma}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-violet-800 dark:text-violet-300">Participante {i+1}</span>
            <button type="button" aria-label={'Remover participante ' + (i+1)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
              onClick={() => setPessoas(todas => todas.filter(v => v.chave !== p.chave))}><Trash2 size={18}/></button>
          </div>
          <label className={rotuloSsma}>Nome<input autoFocus required pattern=".*\S.*" maxLength={150} className={campoSsma} value={p.nome}
            onChange={e => alterarPessoa(p.chave, {nome: e.target.value, assinatura: null})} /></label>
          <CampoAssinatura rotulo={'Assinatura do participante ' + (i+1)} nomeAssinante={p.nome} disabled={!p.nome.trim() || ocupado}
            valor={p.assinatura} onChange={assinatura => alterarPessoa(p.chave, { assinatura })} />
        </div>)}
        <button className={botaoSsma + ' w-full border-dashed sm:w-auto'} type="button" onClick={() => setPessoas(todas => [...todas, {chave: crypto.randomUUID(), nome: '', assinatura: null}])}>
          <Plus size={16}/>Adicionar participante</button>
      </Secao>
      <Secao marca="3" cor="amber" titulo="Irregularidades identificadas" descricao="Quantas de cada tipo foram vistas na ronda."
        extra={<Contador tom={totalRonda(quantidades) > 0 ? 'alerta' : 'ok'}>{totalRonda(quantidades) || 0}</Contador>}>
        <div className="space-y-2">
          {categoriasRonda.map(({chave: c, nome}) => <div key={c}
            className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${quantidades[c] > 0
              ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/25'
              : 'border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40'}`}>
            <label htmlFor={'qtd-' + c} className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-200">{nome}</label>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" className={botaoSsma + ' min-h-12 min-w-12'} aria-label={'Diminuir — ' + nome} disabled={quantidades[c] <= 0}
                onClick={() => alterar(c, String(quantidades[c]-1))}><Minus size={18}/></button>
              <input required id={'qtd-'+c} className={campoBaseSsma + ' w-[4.5rem] text-center text-lg font-bold tabular-nums'} type="number" inputMode="numeric" min={0} max={9999} step={1}
                value={dados[c]} onChange={e => alterar(c, e.target.value)} />
              <button type="button" className={botaoSsma + ' min-h-12 min-w-12'} aria-label={'Aumentar — ' + nome} disabled={quantidades[c] >= 9999}
                onClick={() => alterar(c, String(quantidades[c]+1))}><Plus size={18}/></button>
            </div>
          </div>)}
        </div>
      </Secao>
      <Secao marca="4" cor="emerald" titulo="Relato da ronda">
        <label className={rotuloSsma}>Boas práticas observadas<textarea className={campoSsma} rows={3} maxLength={8000} value={dados.boas_praticas} onChange={e => alterar('boas_praticas', e.target.value)} /></label>
        <label className={rotuloSsma}>Observações e sugestões<textarea className={campoSsma} rows={3} maxLength={8000} value={dados.observacoes} onChange={e => alterar('observacoes', e.target.value)} /></label>
      </Secao>
      <BarraEnvio resumo={<><b className="block text-sm tabular-nums text-slate-900 dark:text-slate-100">{totalRonda(quantidades) || 0} irregularidade(s)</b>{assinaturas} assinatura(s)</>}>
        <button type="submit" className={botaoPrincipal}>{ocupado ? 'Salvando…' : 'Registrar ronda'}</button>
      </BarraEnvio>
    </fieldset>
  </form>;
}
