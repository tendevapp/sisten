/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regras puras do envio da fila offline (`filaSupabase.ts`).
 *
 * Antes, a primeira gravação recusada pelo servidor parava a fila inteira:
 * uma ficha com problema segurava as contagens e os registros da portaria
 * que vinham atrás, e nada mais subia até alguém mexer. Agora só espera o que
 * depende da recusa — o filho do registro recusado, a saída dele, a linha que
 * aponta para a foto recusada — e qualquer exclusão (nada se apaga depois de
 * algo dar errado). O resto sobe.
 *
 * Também separa o erro que vale tentar de novo sozinho (servidor fora,
 * sobrecarregado, sem resposta) da recusa de verdade (validação, permissão,
 * conflito), que espera o usuário.
 */

export interface OperacaoPlano {
  id: string;
  usuarioId: string;
  usuarioNome?: string | null;
  tipo: 'insert' | 'upsert' | 'update' | 'delete' | 'rpc' | 'upload' | 'remover-arquivo';
  caminho: string;
  corpo: { tipo: 'texto'; texto: string } | { tipo: string } | null;
  idProvisorio?: string;
  estado: 'pendente' | 'enviando' | 'erro';
}

/**
 * Status HTTP de falha passageira: tempo esgotado, excesso de chamadas,
 * erro interno (inclui statement timeout do banco travado) e os 52x da
 * Cloudflare. A operação fica pendente e sobe na próxima rodada.
 */
export function erroTransitorio(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

/**
 * Depois de tantas tentativas com erro passageiro, a operação aparece como
 * recusada: um 500 que nunca passa não pode ficar "pendente" para sempre sem
 * ninguém ver. O usuário (ou a Central de Sincronização) vê o motivo e
 * manda de novo.
 */
export const LIMITE_TENTATIVAS_TRANSITORIAS = 12;

export function virouRecusa(status: number, tentativas: number): boolean {
  return !erroTransitorio(status) || tentativas >= LIMITE_TENTATIVAS_TRANSITORIAS;
}

/**
 * Gravação feita na hora que voltou com o servidor fora do ar (gateway sem
 * resposta dele: 502/503/504 e os 52x da Cloudflare): vai para a fila, como
 * sem rede. O reenvio não duplica (id gerado no aparelho / chave da RPC).
 * Erro que o próprio servidor respondeu (400, 409, 500...) volta para a tela.
 */
export function servidorForaDoAr(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || (status >= 520 && status <= 524);
}

function textoDoCorpo(op: OperacaoPlano): string {
  return op.corpo && op.corpo.tipo === 'texto' ? (op.corpo as { texto: string }).texto : '';
}

function idsDoFiltro(caminho: string): string[] {
  const query = caminho.split('?')[1];
  if (!query) return [];
  const valor = new URLSearchParams(query).get('id');
  if (!valor) return [];
  if (valor.startsWith('eq.')) return [valor.slice(3)];
  const lista = valor.match(/^in\.\((.*)\)$/);
  return lista ? lista[1].split(',').map(v => v.replace(/^"|"$/g, '').trim()).filter(Boolean) : [];
}

/** O que a operação cria ou altera: ids das linhas, id provisório da RPC ou caminho do arquivo. */
export function idsDaOperacao(op: OperacaoPlano): string[] {
  if (op.tipo === 'insert' || op.tipo === 'upsert') {
    try {
      const dados = JSON.parse(textoDoCorpo(op) || 'null');
      const linhas = Array.isArray(dados) ? dados : dados ? [dados] : [];
      return linhas.map((l: { id?: unknown }) => l?.id).filter((id): id is string => typeof id === 'string' && id !== '');
    } catch {
      return [];
    }
  }
  if (op.tipo === 'update' || op.tipo === 'delete') return idsDoFiltro(op.caminho);
  if (op.tipo === 'rpc') return op.idProvisorio ? [op.idProvisorio] : [];
  const arquivo = op.caminho.match(/\/storage\/v1\/object\/[^/]+\/(.+)$/);
  return arquivo ? [decodeURIComponent(arquivo[1].split('?')[0])] : [];
}

/**
 * Depois de recusas nesta rodada (`recusados` = ids das operações recusadas),
 * a operação espera? Espera quem aponta para algo recusado e toda exclusão.
 */
export function precisaEsperar(op: OperacaoPlano, recusados: Set<string>): boolean {
  if (recusados.size === 0) return false;
  if (op.tipo === 'delete' || op.tipo === 'remover-arquivo') return true;
  const onde = `${op.caminho}\n${textoDoCorpo(op)}`;
  for (const id of recusados) {
    if (id && onde.includes(id)) return true;
  }
  return false;
}

export interface PendenciaUsuario {
  usuarioId: string;
  nome: string | null;
  total: number;
  comErro: number;
}

/** Quanto cada usuário do aparelho ainda tem para subir (aviso no login e no logoff). */
export function pendenciasPorUsuario(ops: OperacaoPlano[]): PendenciaUsuario[] {
  const mapa = new Map<string, PendenciaUsuario>();
  for (const op of ops) {
    const p = mapa.get(op.usuarioId) ?? { usuarioId: op.usuarioId, nome: null, total: 0, comErro: 0 };
    p.total++;
    if (op.estado === 'erro') p.comErro++;
    if (!p.nome && op.usuarioNome) p.nome = op.usuarioNome;
    mapa.set(op.usuarioId, p);
  }
  return [...mapa.values()];
}

/**
 * Inclusão recusada pelo índice único do módulo (ex.: o mesmo material
 * cadastrado offline em dois aparelhos): devolve a linha para a fila juntar
 * com o registro que já está no servidor, em vez de travar como recusa.
 * Só inclusão de uma linha com `id` — o id vira o do registro existente para
 * quem depende dele (fotos adicionais).
 */
export function duplicadoParaMesclar(op: OperacaoPlano, mensagem: string, indice: string): Record<string, unknown> & { id: string } | null {
  if (op.tipo !== 'insert' || !mensagem.includes(`"${indice}"`)) return null;
  try {
    const dados = JSON.parse(textoDoCorpo(op) || 'null');
    const linhas = Array.isArray(dados) ? dados : dados ? [dados] : [];
    if (linhas.length !== 1) return null;
    const linha = linhas[0];
    return linha && typeof linha === 'object' && typeof linha.id === 'string' && linha.id ? linha : null;
  } catch {
    return null;
  }
}
