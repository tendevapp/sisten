/**
 * Passagem de Plantão: o que o plantão novo herda do anterior quando a
 * equipe que chega fecha o plantão aberto (FRM.SGP-0010).
 */
import type { PortItemConferido, PortMaterialSeguranca, PortPassagemPlantao } from '../types';

/**
 * Quem entrega o posto é a equipe do plantão anterior: a Portaria e o
 * primeiro vigilante de ronda (o formulário tem duas vagas de "quem
 * entregou"). Sem anterior, as duas ficam em branco.
 */
export function entregadoresDoAnterior(anterior?: PortPassagemPlantao | null): [string, string] {
  if (!anterior) return ['', ''];
  return [anterior.vigilante_portaria || '', anterior.vigilante_ronda01 || anterior.vigilante_ronda02 || ''];
}

/**
 * Checklist inicial a partir dos materiais ativos. Com anterior: a
 * quantidade conferida vem dele, e a pendência anotada (item que ele NÃO
 * conferiu, com a observação) continua anotada. Todo item começa
 * desmarcado: quem recebe confere de novo, item a item.
 */
export function itensIniciaisDoPlantao(
  materiais: PortMaterialSeguranca[],
  anterior?: PortPassagemPlantao | null,
): PortItemConferido[] {
  return materiais.map((m) => {
    const doAnterior = anterior?.itens_conferidos?.find((i) => i.material_id === m.id);
    return {
      material_id: m.id,
      nome: m.nome,
      quantidade_esperada: m.quantidade_padrao,
      unidade: m.unidade || 'UN',
      categoria: m.categoria,
      conferido: false,
      quantidade_conferida: doAnterior?.quantidade_conferida ?? m.quantidade_padrao,
      observacao: doAnterior && !doAnterior.conferido ? (doAnterior.observacao || '') : '',
    };
  });
}

/**
 * Quem pode encerrar um plantão: qualquer pessoa com acesso à tela, desde
 * que ele esteja em aberto e não excluído. Encerrar é o ato de entregar o
 * posto — quem fecha quase nunca é quem abriu (é a equipe que sai ou a que
 * chega), e os plantões antigos não têm autor gravado, então a regra
 * autor/admin escondia o botão de todo vigilante. A RLS da tabela já é
 * `true`; excluir/restaurar continua só autor/admin.
 */
export function podeEncerrarPlantao(
  plantao: Pick<PortPassagemPlantao, 'status' | 'excluido_em'> | null | undefined,
): boolean {
  return !!plantao && plantao.status === 'EM_ANDAMENTO' && !plantao.excluido_em;
}
