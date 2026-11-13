/**
 * Passagem de Plantão: o que o plantão novo herda do anterior quando a
 * equipe que chega fecha o plantão aberto (FRM.SGP-0010).
 */
import type {
  PortItemConferido, PortMaterialSeguranca, PortPassagemPlantao, PortRelatorioPortaria, PortTurno,
} from '../types';

const TURNOS_DO_LIVRO: readonly PortTurno[] = ['MANHA', 'TARDE', 'NOITE', 'DIURNO', 'NOTURNO', 'TURNO_A', 'TURNO_B', 'TURNO_C'];

/** Turno do livro de ocorrências a partir do turno do plantão (DIURNO/NOTURNO). */
export function turnoDoLivro(turnoPlantao: string | null | undefined): PortTurno {
  const t = (turnoPlantao || '').trim().toUpperCase() as PortTurno;
  return TURNOS_DO_LIVRO.includes(t) ? t : 'DIURNO';
}

export type DestinoLancamento =
  | { tipo: 'existente'; livroId: string }
  | { tipo: 'novo'; livro: Partial<PortRelatorioPortaria> };

/**
 * Em que livro de ocorrências entra um lançamento novo: o livro é do PLANTÃO.
 *
 * - Há plantão em aberto na Passagem de Plantão: vai para o livro dele, ou
 *   abre um com a data, o turno e o horário do plantão. Encerrado o plantão,
 *   o próximo lançamento já cai no livro do plantão seguinte — antes o livro
 *   era do dia, e a ronda da madrugada do noturno abria o livro em que todo o
 *   diurno era lançado.
 * - Nenhum plantão aberto: livro em andamento do dia que não pertence a
 *   plantão nenhum (como era antes), ou um novo.
 *
 * `livros` são os candidatos já buscados: os do plantão ou os do dia.
 */
export function destinoDoLancamento(params: {
  plantao: PortPassagemPlantao | null;
  livros: PortRelatorioPortaria[];
  hoje: string;
  turnoAgora: PortTurno;
  vigilante: string;
  usuarioId: string;
}): DestinoLancamento {
  const { plantao, livros, hoje, turnoAgora, vigilante, usuarioId } = params;

  if (plantao) {
    const doPlantao = livros.find((l) => l.plantao_id === plantao.id && !l.excluido_em);
    if (doPlantao) return { tipo: 'existente', livroId: doPlantao.id };
    return {
      tipo: 'novo',
      livro: {
        plantao_id: plantao.id,
        data: plantao.data,
        turno: turnoDoLivro(plantao.turno),
        horario_inicio: plantao.horario_inicio,
        horario_fim: plantao.horario_fim,
        vigilante_principal: plantao.vigilante_portaria || vigilante,
        vigilante_ronda01: plantao.vigilante_ronda01,
        vigilante_ronda02: plantao.vigilante_ronda02,
        // Autor do livro = quem abriu o plantão (é quem edita os lançamentos).
        criado_por: plantao.criado_por || usuarioId,
      },
    };
  }

  const doDia = livros.find(
    (l) => l.data === hoje && l.status === 'EM_ANDAMENTO' && !l.excluido_em && !l.plantao_id,
  );
  if (doDia) return { tipo: 'existente', livroId: doDia.id };
  return {
    tipo: 'novo',
    livro: { data: hoje, turno: turnoAgora, vigilante_principal: vigilante, criado_por: usuarioId },
  };
}

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
