/**
 * Chamado para a TI (Nova Solicitação › Helpdesk, destino TI).
 *
 * Algumas categorias pedem dados fixos (Pasta de Rede, Conta e E-mail). A
 * tabela `requests` não tem coluna para eles, então entram no começo da
 * justificativa num bloco delimitado — aparece igual no painel, no e-mail e
 * no PDF, e a edição faz o caminho inverso com `separarJustificativaTi`.
 */

/** Id do setor TI em `sectors` (o mesmo usado no restante do Helpdesk). */
export const SETOR_TI_ID = '9';

export const CATEGORIA_TI_CONTA_EMAIL = 'Conta e E-mail';
export const CATEGORIA_TI_PASTA_REDE = 'Pasta de Rede';
export const CATEGORIA_TI_SOFTWARE = 'Software';

export const CATEGORIAS_TI = [
  'Acesso/Senha',
  CATEGORIA_TI_CONTA_EMAIL,
  'Lista de Distribuição',
  CATEGORIA_TI_PASTA_REDE,
  'Equipamento',
  'Hardware (Teclado, Mouse, Base para Notebook)',
  'Impressora',
  CATEGORIA_TI_SOFTWARE,
  'Rede',
  'Outro',
] as const;

export type TipoAcessoPasta = 'Full' | 'Read';

export interface CampoTi {
  chave: string;
  rotulo: string;
  tipo: 'texto' | 'cpf' | 'data' | 'acesso';
  placeholder?: string;
}

/** Campos obrigatórios de cada categoria que pede dados fixos. */
export const CAMPOS_POR_CATEGORIA_TI: Record<string, CampoTi[]> = {
  [CATEGORIA_TI_PASTA_REDE]: [
    { chave: 'nome', rotulo: 'Nome', tipo: 'texto', placeholder: 'Quem vai acessar a pasta' },
    { chave: 'tipo_acesso', rotulo: 'Tipo de acesso', tipo: 'acesso' },
    { chave: 'caminho', rotulo: 'Caminho da pasta de rede', tipo: 'texto', placeholder: 'Ex.: Grupos\\qualidade' },
  ],
  [CATEGORIA_TI_CONTA_EMAIL]: [
    { chave: 'nome_completo', rotulo: 'Nome completo', tipo: 'texto' },
    { chave: 'cpf', rotulo: 'CPF', tipo: 'cpf', placeholder: '000.000.000-00' },
    { chave: 'matricula', rotulo: 'Matrícula', tipo: 'texto' },
    { chave: 'funcao', rotulo: 'Função', tipo: 'texto' },
    { chave: 'data_admissao', rotulo: 'Data de admissão', tipo: 'data' },
  ],
};

export type DadosChamadoTi = Record<string, string>;

export function camposDaCategoriaTi(categoria: string): CampoTi[] {
  return CAMPOS_POR_CATEGORIA_TI[categoria] ?? [];
}

/** Nas categorias com campos fixos, a descrição vira observação opcional. */
export function descricaoObrigatoriaTi(categoria: string): boolean {
  return camposDaCategoriaTi(categoria).length === 0;
}

export function formatarCpf(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Rótulos dos campos que faltam (ou estão inválidos), na ordem da tela. */
export function camposTiPendentes(categoria: string, dados: DadosChamadoTi): string[] {
  return camposDaCategoriaTi(categoria)
    .filter((c) => {
      const v = (dados[c.chave] || '').trim();
      if (!v) return true;
      if (c.tipo === 'cpf') return v.replace(/\D/g, '').length !== 11;
      if (c.tipo === 'acesso') return v !== 'Full' && v !== 'Read';
      if (c.tipo === 'data') return !/^\d{4}-\d{2}-\d{2}$/.test(v);
      return false;
    })
    .map((c) => c.rotulo);
}

/** Texto de apoio da descrição conforme a categoria. */
export function placeholderDescricaoTi(categoria: string): string {
  if (categoria === CATEGORIA_TI_SOFTWARE) {
    return 'Informe qual software você precisa (nome e versão, se souber) e para que vai usá-lo no seu trabalho.';
  }
  if (categoria === CATEGORIA_TI_PASTA_REDE) return 'Observações (opcional): por que precisa do acesso, prazo, etc.';
  if (categoria === CATEGORIA_TI_CONTA_EMAIL) return 'Observações (opcional): listas de distribuição, sistemas que precisa acessar, etc.';
  return 'Descreva as características do erro, mensagens de sistema apresentadas, impactos causados no setor, e passos já efetuados para tentar resolver.';
}

const INICIO_BLOCO = '--- Dados do chamado ---';
const FIM_BLOCO = '--- Descrição ---';

const dataBR = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso);
const dataISO = (br: string) => {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : br;
};

/**
 * Justificativa gravada: bloco com os campos da categoria + a descrição.
 * Categoria sem campos fixos devolve só a descrição.
 */
export function montarJustificativaTi(categoria: string, dados: DadosChamadoTi, descricao: string): string {
  const campos = camposDaCategoriaTi(categoria);
  const texto = descricao.trim();
  if (campos.length === 0) return texto;
  const linhas = campos.map((c) => {
    const v = (dados[c.chave] || '').trim();
    return `${c.rotulo}: ${c.tipo === 'data' ? dataBR(v) : c.tipo === 'cpf' ? formatarCpf(v) : v}`;
  });
  return [INICIO_BLOCO, ...linhas, FIM_BLOCO, texto || '—'].join('\n');
}

/** Caminho inverso de `montarJustificativaTi`, para reabrir o chamado em edição. */
export function separarJustificativaTi(
  categoria: string,
  justificativa: string,
): { dados: DadosChamadoTi; descricao: string } {
  const texto = justificativa || '';
  const campos = camposDaCategoriaTi(categoria);
  const fim = texto.indexOf(FIM_BLOCO);
  if (campos.length === 0 || !texto.startsWith(INICIO_BLOCO) || fim < 0) {
    return { dados: {}, descricao: texto };
  }
  const dados: DadosChamadoTi = {};
  texto
    .slice(INICIO_BLOCO.length, fim)
    .split('\n')
    .forEach((linha) => {
      const campo = campos.find((c) => linha.startsWith(`${c.rotulo}: `));
      if (!campo) return;
      const v = linha.slice(campo.rotulo.length + 2).trim();
      dados[campo.chave] = campo.tipo === 'data' ? dataISO(v) : v;
    });
  const descricao = texto.slice(fim + FIM_BLOCO.length).replace(/^\n/, '');
  return { dados, descricao: descricao.trim() === '—' ? '' : descricao };
}

/** E-mail aberto no Outlook ao enviar o chamado para a TI. */
export function montarEmailChamadoTi(p: {
  numero: string;
  categoria: string;
  solicitante: string;
  cargo?: string | null;
  setorSolicitante: string;
  criticidade: number | null;
  justificativa: string;
  totalAnexos: number;
  link: string;
  assuntoPadrao?: string | null;
}): { assunto: string; corpo: string } {
  const assunto = `${p.assuntoPadrao?.trim() || 'Chamado TI'} #${p.numero} — ${p.categoria}`;
  const corpo = [
    'Olá, equipe de TI!',
    '',
    'Abri um chamado no SISTEN:',
    '',
    `Número: #${p.numero}`,
    `Categoria: ${p.categoria}`,
    `Solicitante: ${p.solicitante}${p.cargo ? ` (${p.cargo})` : ''}`,
    `Setor: ${p.setorSolicitante || '—'}`,
    `Criticidade: ${p.criticidade ? `Grau ${p.criticidade}` : '—'}`,
    '',
    p.justificativa.trim() || '—',
    '',
    p.totalAnexos > 0
      ? `Anexos: ${p.totalAnexos} (o e-mail não leva os arquivos; veja no SISTEN pelo link abaixo)`
      : 'Anexos: nenhum',
    '',
    `Acompanhe o chamado no SISTEN: ${p.link}`,
  ];
  return { assunto, corpo: corpo.join('\n') };
}
