/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Treinamentos › trilha (`?id=<trein_trilhas.id>`) — roda o HTML da trilha
 * num iframe sandbox e grava o progresso no usuário.
 *
 * O iframe recebe o HTML por `srcdoc` com sandbox SEM allow-same-origin: a
 * trilha não enxerga a sessão do SISTEN nem o
 * localStorage do app — fala só por postMessage (protocolo em
 * lib/treinamentos.ts). Ao avisar "pronta", recebe o melhor resultado já
 * gravado; a cada missão concluída, o SISTEN chama `trein_registrar_missao`
 * (que entra na fila offline sem rede).
 */

import React from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, CloudOff, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { buscarTrilha, carregarHtmlTrilha, listarMeuProgresso, registrarMissao } from '../../lib/treinamentosApi';
import {
  aplicarMissaoLocal, lerEventoTrilha, mensagemCarregarProgresso, resumirProgresso,
  type ProgressoMissao, type TrilhaTreinamento,
} from '../../lib/treinamentos';
import { ehRespostaOffline } from '../../lib/offline/configFormularios';
import { areaIdDoSetor, parametroDoHash } from '../../components/treinamentos/setoresVisual';
import type { Profile } from '../../types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type EstadoGravacao = 'ok' | 'salvando' | 'fila' | 'erro';

export default function TreinamentoTrilha({ user, onNavigate }: Props) {
  const toast = useToast();
  const id = parametroDoHash('id') ?? '';
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [trilha, setTrilha] = React.useState<TrilhaTreinamento | null>(null);
  const [html, setHtml] = React.useState<string | null>(null);
  const [progresso, setProgresso] = React.useState<ProgressoMissao[]>([]);
  const progressoRef = React.useRef<ProgressoMissao[]>([]);
  const [erro, setErro] = React.useState<string | null>(null);
  const [gravacao, setGravacao] = React.useState<EstadoGravacao>('ok');

  // Tela cheia: a API nativa ocupa o monitor inteiro (barra de cima junto,
  // para o progresso e o "Voltar" continuarem à mão). Onde ela não existe
  // (Safari do iPhone), o quadro cobre a janela por CSS.
  const quadroRef = React.useRef<HTMLDivElement>(null);
  const [telaCheia, setTelaCheia] = React.useState(false);
  const [telaCheiaCss, setTelaCheiaCss] = React.useState(false);

  React.useEffect(() => {
    const aoMudar = () => setTelaCheia(document.fullscreenElement === quadroRef.current);
    document.addEventListener('fullscreenchange', aoMudar);
    return () => {
      document.removeEventListener('fullscreenchange', aoMudar);
      if (document.fullscreenElement === quadroRef.current) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  React.useEffect(() => {
    if (!telaCheiaCss) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') setTelaCheiaCss(false); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [telaCheiaCss]);

  const emTelaCheia = telaCheia || telaCheiaCss;
  const alternarTelaCheia = () => {
    if (telaCheiaCss) { setTelaCheiaCss(false); return; }
    if (document.fullscreenElement) { void document.exitFullscreen().catch(() => {}); return; }
    const el = quadroRef.current;
    if (el && document.fullscreenEnabled && el.requestFullscreen) {
      el.requestFullscreen().catch(() => setTelaCheiaCss(true));
    } else {
      setTelaCheiaCss(true);
    }
  };

  React.useEffect(() => {
    let vivo = true;
    (async () => {
      const t = await buscarTrilha(id);
      if (!t || !t.ativo) throw new Error('Trilha não encontrada ou desativada.');
      const [conteudo, linhas] = await Promise.all([carregarHtmlTrilha(t), listarMeuProgresso(user.id, t.id)]);
      if (!vivo) return;
      progressoRef.current = linhas;
      setProgresso(linhas);
      setTrilha(t);
      setHtml(conteudo);
    })().catch(err => vivo && setErro(String(err?.message ?? err)));
    return () => { vivo = false; };
  }, [id, user.id]);

  React.useEffect(() => {
    if (!trilha) return;
    const aoReceber = (e: MessageEvent) => {
      const janela = iframeRef.current?.contentWindow;
      if (!janela || e.source !== janela) return;
      const ev = lerEventoTrilha(e.data);
      if (!ev) return;

      if (ev.evento === 'pronta') {
        const tema = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        janela.postMessage(mensagemCarregarProgresso(trilha.id, progressoRef.current, user.name, tema), '*');
        return;
      }

      if (ev.evento === 'missao-concluida') {
        if (ev.missao > trilha.total_missoes) return;
        const novo = aplicarMissaoLocal(progressoRef.current, trilha.id, ev, new Date().toISOString());
        progressoRef.current = novo;
        setProgresso(novo);
        setGravacao('salvando');
        registrarMissao(trilha.id, ev)
          .then(ret => {
            if (ehRespostaOffline(ret)) {
              setGravacao('fila');
              toast.info(`Sem rede: a missão ${ev.missao} foi guardada e sobe quando a conexão voltar.`);
            } else {
              setGravacao('ok');
            }
          })
          .catch(err => {
            setGravacao('erro');
            toast.error(`Não foi possível gravar a missão ${ev.missao}: ${err?.message ?? err}`);
          });
        return;
      }

      if (ev.evento === 'trilha-concluida') {
        toast.success(`Trilha ${trilha.codigo} concluída! O certificado fica disponível na própria trilha.`);
      }
    };
    window.addEventListener('message', aoReceber);
    return () => window.removeEventListener('message', aoReceber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trilha, user.name]);

  const resumo = trilha ? resumirProgresso(trilha, progresso) : null;
  const voltar = () => onNavigate(trilha ? `/treinamentos/setor?setor=${encodeURIComponent(areaIdDoSetor(trilha.setor_id))}` : '/treinamentos');

  return (
    <div
      ref={quadroRef}
      className={`flex flex-col bg-white dark:bg-slate-950 ${telaCheiaCss ? 'fixed inset-0 z-[200] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]' : 'h-full'}`}
    >
      <div className="flex items-center gap-2 sm:gap-3 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900 sm:px-4">
        <button
          type="button"
          onClick={() => {
            if (emTelaCheia) alternarTelaCheia();
            voltar();
          }}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          Voltar
        </button>
        {trilha && (
          <>
            <span className="hidden shrink-0 rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white dark:bg-slate-100 dark:text-slate-900 sm:inline">{trilha.codigo}</span>
            <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-100">{trilha.titulo}</h1>
          </>
        )}
        {resumo && (
          <div className="ml-auto flex shrink-0 items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="hidden sm:inline">{resumo.missoesConcluidas}/{resumo.total} missões · {resumo.xp} XP</span>
            <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 sm:block">
              <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-orange-500 transition-all" style={{ width: `${resumo.percentual}%` }} />
            </div>
            {gravacao === 'salvando' && <span className="inline-flex items-center gap-1 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="hidden sm:inline">Salvando</span></span>}
            {gravacao === 'ok' && <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Salvo no seu usuário</span></span>}
            {gravacao === 'fila' && <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><CloudOff className="h-3.5 w-3.5" /><span className="hidden sm:inline">Na fila (sem rede)</span></span>}
            {gravacao === 'erro' && <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400"><AlertTriangle className="h-3.5 w-3.5" /><span className="hidden sm:inline">Não salvo</span></span>}
          </div>
        )}
        <button
          type="button"
          onClick={alternarTelaCheia}
          title={emTelaCheia ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
          aria-label={emTelaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
          aria-pressed={emTelaCheia}
          className={`${resumo ? '' : 'ml-auto '}inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200`}
        >
          {emTelaCheia ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{emTelaCheia ? 'Sair da tela cheia' : 'Tela cheia'}</span>
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-white dark:bg-slate-950">
        {erro ? (
          <div className="mx-auto mt-16 max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6" />
            {erro}
          </div>
        ) : !html ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando trilha...
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            title={trilha ? `Trilha ${trilha.codigo} · ${trilha.titulo}` : 'Trilha de treinamento'}
            srcDoc={html}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads"
            allow="clipboard-write"
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
      </div>
    </div>
  );
}
