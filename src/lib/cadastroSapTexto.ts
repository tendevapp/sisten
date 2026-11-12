/**
 * Cadastro SAP não tem colunas próprias para nome/especificações/CNPJ: na
 * criação eles são compostos em `justificativa` (ver NewRequest.handleSubmit).
 * Este é o parse reverso único — usado para reabrir o formulário em modo
 * edição, no detalhe da solicitação e no PDF.
 *
 * Os campos são texto livre e costumam ter várias linhas (especificações
 * coladas de catálogo), por isso tudo usa `[\s\S]` — `.` não atravessa a
 * quebra de linha, e com ele a edição abria com o texto inteiro na
 * justificativa e as especificações em branco.
 */

export interface CadastroSapTexto {
  tipo: 'item' | 'fornecedor' | 'atualizacao' | 'livre';
  nome: string;
  specs: string;
  justificativa: string;
  codigoFornecedor: string;
  cnpj: string;
  regime: string;
  cpfMei: string;
}

const ITEM = /^Nome: ([\s\S]*?)\. Specs: ([\s\S]*?)\. Justificativa: ([\s\S]*)$/;
const ATUALIZACAO = /Operação:\s*Atualização de Cadastro\.\s*Cód\. Fornecedor SAP:\s*([\s\S]*?)\.(?:\s*NOVO Nome:\s*([\s\S]*?)\.)?\s*Justificativa:\s*([\s\S]*)$/i;
const FORNECEDOR = /^Nome: ([\s\S]*?)\.(?: CNPJ: ([\s\S]*?)\.)?(?: Regime: ([\s\S]*?)\.)?(?: CPF do titular: ([\s\S]*?)\.)?(?: Pendente:[^.]*\.)? Justificativa: ([\s\S]*)$/;

const semTraco = (v?: string) => (v && v.trim() !== '—' ? v.trim() : '');

export function separarJustificativaCadastroSap(texto: string): CadastroSapTexto {
  const vazio = { nome: '', specs: '', justificativa: '', codigoFornecedor: '', cnpj: '', regime: '', cpfMei: '' };

  const item = texto.match(ITEM);
  if (item) return { ...vazio, tipo: 'item', nome: item[1], specs: item[2], justificativa: item[3] };

  const atu = texto.match(ATUALIZACAO);
  if (atu) {
    return {
      ...vazio,
      tipo: 'atualizacao',
      codigoFornecedor: atu[1].trim(),
      nome: atu[2]?.trim() || '',
      justificativa: atu[3].trim(),
    };
  }

  const forn = texto.match(FORNECEDOR);
  if (forn) {
    return {
      ...vazio,
      tipo: 'fornecedor',
      nome: forn[1],
      cnpj: semTraco(forn[2]),
      regime: semTraco(forn[3]),
      cpfMei: forn[4]?.trim() || '',
      justificativa: forn[5],
    };
  }

  return { ...vazio, tipo: 'livre', justificativa: texto };
}
