/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Liga um formulário ao rascunho do aparelho (`lib/rascunhoFormulario.ts`).
 *
 *  - Ao montar a tela, lê o rascunho e devolve pelo `aplicar`; se o
 *    formulário estava aberto quando a página caiu, chama `abrir`.
 *  - A cada mudança grava (com folga de 700 ms) e, sem folga, quando a tela
 *    sai de vista ou a página vai fechar.
 *  - `temConteudo` decide se há o que guardar; sem conteúdo, apaga.
 *  - `concluir()` depois de gravar no servidor: apaga e não regrava os mesmos
 *    dados que continuarem no estado da tela.
 *  - `descartar()` apaga e zera o aviso de "recuperado".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apagarRascunho, assinaturaRascunho, gravarRascunho, lerRascunho } from '../lib/rascunhoFormulario';

const FOLGA_MS = 700;

interface Opcoes<T> {
  /** `chaveRascunho(user.id, 'portaria-x')`; `null` desliga. */
  chave: string | null;
  /** O formulário (modal) está aberto. */
  aberto: boolean;
  dados: T;
  temConteudo: (dados: T, aberto: boolean) => boolean;
  aplicar: (dados: T) => void;
  /** Reabre o formulário quando a página caiu com ele aberto. */
  abrir?: (dados: T) => void;
}

export interface RascunhoFormulario {
  /** Hora (ISO) do rascunho recuperado ao abrir a tela; `null` se não houve. */
  recuperadoEm: string | null;
  concluir: () => void;
  descartar: () => void;
}

export function useRascunhoFormulario<T>({ chave, aberto, dados, temConteudo, aplicar, abrir }: Opcoes<T>): RascunhoFormulario {
  const [carregado, setCarregado] = useState(false);
  const [recuperadoEm, setRecuperadoEm] = useState<string | null>(null);

  const atual = useRef({ dados, aberto, temConteudo, aplicar, abrir });
  atual.current = { dados, aberto, temConteudo, aplicar, abrir };

  const assinaturaGravada = useRef<string | null>(null);
  const assinaturaConcluida = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const fila = useRef<Promise<unknown>>(Promise.resolve());

  const enfileirar = useCallback((op: () => Promise<unknown>) => {
    fila.current = fila.current.then(op, op);
  }, []);

  const gravarAgora = useCallback(() => {
    if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; }
    if (!chave) return;
    const { dados: d, aberto: a, temConteudo: tem } = atual.current;
    const assinatura = assinaturaRascunho(d);
    if (assinaturaConcluida.current != null) {
      if (assinatura === assinaturaConcluida.current) return;
      assinaturaConcluida.current = null;
    }
    if (tem(d, a)) enfileirar(() => gravarRascunho(chave, d, a));
    else {
      // Nada a guardar (formulário fechado/zerado): o aviso de recuperado sai junto.
      setRecuperadoEm(null);
      enfileirar(() => apagarRascunho(chave));
    }
  }, [chave, enfileirar]);

  // Leitura ao montar (ou ao trocar de usuário).
  useEffect(() => {
    setCarregado(false);
    setRecuperadoEm(null);
    assinaturaGravada.current = null;
    assinaturaConcluida.current = null;
    if (!chave) return;
    let vivo = true;
    void lerRascunho<T>(chave).then((r) => {
      if (!vivo) return;
      if (r) {
        assinaturaGravada.current = (r.aberto ? 'A' : 'F') + assinaturaRascunho(r.dados);
        atual.current.aplicar(r.dados);
        if (r.aberto) atual.current.abrir?.(r.dados);
        setRecuperadoEm(r.salvoEm);
      }
      setCarregado(true);
    });
    return () => { vivo = false; };
  }, [chave]);

  // Gravação a cada mudança, só depois da leitura (senão o estado vazio
  // inicial apagaria o rascunho antes de ele ser lido).
  useEffect(() => {
    if (!chave || !carregado) return;
    const assinatura = (aberto ? 'A' : 'F') + assinaturaRascunho(dados);
    if (assinatura === assinaturaGravada.current) return;
    assinaturaGravada.current = assinatura;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(gravarAgora, FOLGA_MS);
  });

  // Tela saindo de vista (câmera, outro app, tela bloqueada): grava já.
  useEffect(() => {
    if (!chave) return;
    const aoEsconder = () => { if (document.visibilityState === 'hidden' && timer.current != null) gravarAgora(); };
    const aoFechar = () => { if (timer.current != null) gravarAgora(); };
    document.addEventListener('visibilitychange', aoEsconder);
    window.addEventListener('pagehide', aoFechar);
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder);
      window.removeEventListener('pagehide', aoFechar);
      // Saiu da tela com alteração pendente: grava antes de desmontar.
      if (timer.current != null) gravarAgora();
    };
  }, [chave, gravarAgora]);

  const concluir = useCallback(() => {
    if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; }
    assinaturaConcluida.current = assinaturaRascunho(atual.current.dados);
    setRecuperadoEm(null);
    if (chave) enfileirar(() => apagarRascunho(chave));
  }, [chave, enfileirar]);

  const descartar = useCallback(() => {
    if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; }
    setRecuperadoEm(null);
    if (chave) enfileirar(() => apagarRascunho(chave));
  }, [chave, enfileirar]);

  return { recuperadoEm, concluir, descartar };
}
