/**
 * `await confirmar({...})` — substituto de `window.confirm()` que usa o
 * ConfirmDialog do app.
 *
 * O diálogo nativo mostra a URL no PWA instalado, não segue o tema, não deixa
 * destacar o botão destrutivo nem nomear as ações ("Estornar", "Manter"), e
 * trava a thread. O ConfirmDialog resolvia isso, mas exigia um `useState` por
 * tela; por isso 16 telas continuavam no `window.confirm`. Aqui a chamada fica
 * do mesmo tamanho:
 *
 *   if (!(await confirmar({ titulo: 'Excluir lançamento?', mensagem, variante: 'perigo' }))) return;
 *
 * O diálogo é montado numa raiz React própria, fora da árvore da tela. Ele usa
 * o Modal, então herda a pilha de Esc, o foco e a trava de rolagem, e o tema
 * (a classe `.dark` está no <html>).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import ConfirmDialog from '../components/ui/ConfirmDialog';

export interface OpcoesConfirmar {
  titulo: string;
  mensagem: React.ReactNode;
  confirmarLabel?: string;
  cancelarLabel?: string;
  /** 'perigo' pinta o botão de confirmar de vermelho — para excluir/estornar. */
  variante?: 'padrao' | 'perigo';
}

export function confirmar(opcoes: OpcoesConfirmar): Promise<boolean> {
  return new Promise(resolve => {
    const host = document.createElement('div');
    host.setAttribute('data-confirmar', '');
    document.body.appendChild(host);
    const raiz = createRoot(host);
    let resolvido = false;
    const fim = (resposta: boolean) => {
      if (resolvido) return;
      resolvido = true;
      resolve(resposta);
      // Desmonta no próximo tique: o clique que fechou ainda está em curso.
      setTimeout(() => { raiz.unmount(); host.remove(); }, 0);
    };
    raiz.render(
      <ConfirmDialog
        titulo={opcoes.titulo}
        mensagem={opcoes.mensagem}
        confirmarLabel={opcoes.confirmarLabel}
        cancelarLabel={opcoes.cancelarLabel}
        variante={opcoes.variante}
        onConfirmar={() => fim(true)}
        onCancelar={() => fim(false)}
      />,
    );
  });
}
