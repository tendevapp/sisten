import type { Request, RequestItem } from '../types';
import { formatBRL, formatDateBR, formatQtd } from './format';
import { rotuloCriticidade, rotuloStatus, rotuloTipo } from './solicitacoes';

export interface ParametrosEmailSolicitacao {
  request: Request;
  itens: RequestItem[];
  /** Nome do setor a partir do id; devolve o próprio id quando não achar. */
  nomeSetor: (id?: string) => string;
  /** Quantidade de anexos da solicitação (o e-mail não os leva). */
  totalAnexos: number;
  /** Endereço do SISTEN, sem barra final (ex.: https://sisten.app). */
  origem: string;
}

export interface EmailSolicitacao {
  assunto: string;
  corpo: string;
}

/** Linha "Rótulo: valor", ou nada quando o valor está vazio. */
const linha = (rotulo: string, valor?: string | number | null): string[] => {
  const texto = valor === undefined || valor === null ? '' : String(valor).trim();
  return texto ? [`${rotulo}: ${texto}`] : [];
};

function linhasDoItem(it: RequestItem, indice: number): string[] {
  const cabecalho = `${indice + 1}. ${it.description || '—'}${it.is_generic ? ' [GENÉRICO]' : ''}`;
  const valor = it.estimated_value ? formatBRL(it.estimated_value) : '';
  return [
    '',
    cabecalho,
    ...linha('   Código SAP', it.sap_code || 'sem código SAP'),
    ...linha('   Quantidade', `${formatQtd(it.quantity)} ${it.unit ?? ''}`.trim()),
    ...linha('   Marca', it.brand ? `${it.brand}${it.is_similar_allowed ? ' ou similar' : ''}` : ''),
    ...linha('   Fornecedor sugerido', it.suggested_supplier),
    ...linha('   Valor estimado', valor),
    ...linha('   Setor destinatário', it.setor_destinatario),
    ...(it.sugere_estoque_minimo ? ['   Solicitante sugere cadastro de estoque mínimo'] : []),
    ...linha('   Observação', it.observation),
    ...linha('   Link de referência', it.reference_link),
  ];
}

/**
 * Monta assunto e corpo para reenviar a solicitação por e-mail, com o mesmo
 * conteúdo que o painel mostra. Texto puro: o `mailto:` não leva HTML nem anexo,
 * então os anexos entram só como contagem e o link do SISTEN.
 */
export function montarEmailSolicitacao(p: ParametrosEmailSolicitacao): EmailSolicitacao {
  const { request: r, itens, nomeSetor, totalAnexos, origem } = p;
  const titulo = r.titulo?.trim();

  const assunto = `${rotuloTipo(r.type)} #${r.number}${titulo ? ` — ${titulo}` : ''} (${rotuloStatus(r)})`;

  const contato = [r.representante_nome, r.representante_cargo, r.representante_telefone, r.representante_email]
    .filter(Boolean)
    .join(' · ');
  const operacao =
    r.fornecedor_operacao === 'atualizacao' ? 'Atualização de cadastro'
      : r.fornecedor_operacao === 'novo' ? 'Novo cadastro'
        : '';

  const corpo: string[] = [
    `Segue o conteúdo da solicitação #${r.number} do SISTEN:`,
    '',
    ...linha('Número', `#${r.number}`),
    ...linha('Tipo', rotuloTipo(r.type)),
    ...linha('Status', rotuloStatus(r)),
    ...linha('Criticidade', rotuloCriticidade(r.criticality)),
    ...linha('Solicitante', r.solicitante_name),
    ...linha('Setor', nomeSetor(r.solicitante_sector_id)),
    ...linha('Aberta em', formatDateBR(r.created_at)),
    ...linha('Título', titulo),
    ...linha('Data de necessidade', r.data_necessidade ? formatDateBR(r.data_necessidade) : ''),
    ...linha('Tipo de compra', r.tipo_compra),
    ...linha('RM vinculada', r.linked_rm_number),
    ...linha('Setor de destino', r.target_sector_id ? nomeSetor(r.target_sector_id) : ''),
    ...linha('Local', r.local),
    ...linha('Tipo de cadastro', r.registration_type),
    ...linha('Operação', operacao),
    ...linha('Fabricante / CNPJ', r.brand),
    ...linha('Fornecedor de referência / representante', r.suggested_supplier),
    ...linha('Cód. fornecedor SAP', r.codigo_fornecedor_sap),
    ...linha('Cód. SAP gerado', r.codigo_sap_gerado),
    ...linha('Contato do representante', contato),
    '',
    'Justificativa e especificações:',
    r.justificativa?.trim() || 'Sem justificativa registrada.',
  ];

  if (itens.length > 0) {
    corpo.push('', `Itens (${itens.length}):`);
    itens.forEach((it, i) => corpo.push(...linhasDoItem(it, i)));
    const total = itens.reduce((acc, it) => acc + (it.estimated_value || 0) * (Number(it.quantity) || 0), 0);
    if (total > 0) corpo.push('', `Valor estimado total: ${formatBRL(total)}`);
  }

  corpo.push(
    '',
    totalAnexos > 0
      ? `Anexos: ${totalAnexos} (o e-mail não leva os arquivos; veja no SISTEN pelo link abaixo)`
      : 'Anexos: nenhum',
    '',
    `Acompanhe a solicitação no SISTEN: ${origem}/#/solicitacoes?id=${r.id}`,
  );

  return { assunto, corpo: corpo.join('\n') };
}
