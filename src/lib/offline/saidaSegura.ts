/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Logoff sem deixar registro para trás.
 *
 * A fila offline é por usuário: o que ficou no aparelho só sobe com o token
 * de quem gravou. Antes, o logoff da meia-noite (sessaoDiaria) e o "Sair"
 * encerravam a sessão com a fila cheia, e os registros ficavam presos no
 * aparelho até a mesma pessoa entrar de novo nele — no plantão da noite, às
 * vezes nunca.
 *
 * Agora:
 *  - meia-noite: o logoff espera a fila (formulários, checklists da Qualidade
 *    e outbox da Produção) esvaziar; tenta de novo a cada minuto;
 *  - "Sair": tenta enviar e, se ainda sobrar, pede confirmação dizendo o que
 *    fica para trás.
 */

export type MotivoSaida = 'manual' | 'virada-do-dia';
export type DecisaoSaida = 'sair' | 'adiar' | 'confirmar';

export function decidirSaida(pendentes: number, motivo: MotivoSaida): DecisaoSaida {
  if (pendentes <= 0) return 'sair';
  return motivo === 'virada-do-dia' ? 'adiar' : 'confirmar';
}

export function mensagemSaidaComPendencias(pendentes: number): string {
  const qtd = pendentes === 1 ? '1 registro feito por você ainda está' : `${pendentes} registros feitos por você ainda estão`;
  return `${qtd} só neste aparelho — a conexão não deu para enviar. `
    + 'Se sair agora, eles continuam guardados aqui e só sobem quando você entrar de novo neste aparelho. '
    + 'O melhor é esperar o selo de sincronização (canto da tela) zerar antes de sair.';
}

/** Prazo para tentar esvaziar a fila antes de decidir (rede de pátio não pode prender o logoff). */
const PRAZO_ENVIO_MS = 20_000;

/**
 * Tenta enviar a fila dos formulários e devolve quanto ainda falta nas três
 * filas do aparelho para este usuário. Import dinâmico: IndexedDB e rede
 * ficam fora dos testes desta regra.
 */
export async function pendentesAposTentarEnviar(usuarioId: string): Promise<number> {
  const [{ sincronizarFilaOffline }, { coletarSnapshot }, { comPrazo }] = await Promise.all([
    import('./filaSupabase'), import('./reporterSincronizacao'), import('../rede'),
  ]);
  try {
    const antes = await coletarSnapshot(usuarioId);
    if (antes.pendentes === 0) return 0;
    await comPrazo(sincronizarFilaOffline(), PRAZO_ENVIO_MS);
    return (await coletarSnapshot(usuarioId)).pendentes;
  } catch {
    // IndexedDB ilegível (janela anônima, armazenamento bloqueado): a fila
    // também não conseguiria ter guardado nada. Não prende o logoff.
    return 0;
  }
}
