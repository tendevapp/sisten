/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Monta a "Lista de Coleta" enviada à logística a partir dos itens marcados na
 * aba Sem MIGO da Central de Compras: o material já está pronto no fornecedor e
 * alguém precisa ir buscar. O destinatário lê o texto no Outlook e sai a campo
 * com ele — por isso o agrupamento é por FORNECEDOR (uma parada de coleta por
 * bloco), não por PO.
 *
 * Módulo puro: a montagem do texto é o que precisa de teste e não deve depender
 * de React nem do Supabase. Mesma divisão de `expedicaoEmail.ts`.
 */

import { formatBRL } from './format';
import type { CidadeForn, ContatoFornecedor } from '../types';

/** Chave do gatilho em `config_envio_emails` (Admin › E-mails). */
export const CHAVE_CONFIG_COLETA = 'coleta_jacobina';
export const ASSUNTO_COLETA_PADRAO = 'Coleta Jacobina';
export const DESTINATARIO_COLETA_PADRAO = 'andre.araujo@ten.ind.br';

const SEPARADOR_CABECALHO = '--------------------------------------------------------------------';
const SEPARADOR_FORNECEDOR = '--------------------------------------------------';

export interface LinhaColeta {
  /** Data da coleta = previsão de entrega efetiva do item (ISO), quando houver. */
  dataColeta: string | null;
  fornecedor: string;
  fornecedorCodigo?: string | null;
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  rm: string;
  po: string;
  codigoItem: string;
  material: string;
  quantidade?: number | null;
  unidade?: string | null;
  valor?: number | null;
}

export interface DadosFornecedorColeta {
  nomeFantasia: string | null;
  razaoSocial: string | null;
  endereco: string | null;
  telefone: string | null;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/**
 * Resolve nome fantasia, razão social, endereço e telefone a partir do
 * cadastro de contatos de fornecedores e da tabela de cidades/endereços (cidadeforn).
 */
export function resolverDadosFornecedor(params: {
  fornecedorNome?: string | null;
  fornecedorCodigo?: string | null;
  contatos?: ContatoFornecedor[];
  cidadesPorCodigo?: Map<string, CidadeForn>;
  cidadesLista?: CidadeForn[];
}): DadosFornecedorColeta {
  const cod = String(params.fornecedorCodigo || '').trim();
  const codSemZeros = cod.replace(/^0+/, '');
  const codComPad = codSemZeros ? codSemZeros.padStart(10, '0') : '';
  const nome = (params.fornecedorNome || '').trim();
  const nomeNorm = semAcento(nome);

  const contatos = params.contatos || [];
  let contato: ContatoFornecedor | undefined;

  // 1. Busca contato por código SAP do fornecedor
  if (cod) {
    contato = contatos.find(c => {
      const cCod = String(c.cod_vendor || '').trim();
      const cSemZeros = cCod.replace(/^0+/, '');
      return cCod === cod || (codSemZeros && cSemZeros === codSemZeros);
    });
  }

  // 2. Busca contato por nome ou nome fantasia se não achou por código
  if (!contato && nomeNorm) {
    contato = contatos.find(c => {
      const cForn = semAcento(c.fornecedor || '');
      const cFant = semAcento(c.nome_fantasia || '');
      return (cForn && (cForn === nomeNorm || cForn.includes(nomeNorm) || nomeNorm.includes(cForn))) ||
             (cFant && (cFant === nomeNorm || cFant.includes(nomeNorm) || nomeNorm.includes(cFant)));
    });
  }

  // 3. Busca endereço em cidadeforn
  let cidForn: CidadeForn | undefined;
  if (params.cidadesPorCodigo && cod) {
    cidForn = params.cidadesPorCodigo.get(cod) ||
              params.cidadesPorCodigo.get(codSemZeros) ||
              (codComPad ? params.cidadesPorCodigo.get(codComPad) : undefined);
  }
  if (!cidForn && params.cidadesLista && nomeNorm) {
    cidForn = params.cidadesLista.find(cf => {
      const cfNome = semAcento(cf.forn_nome || '');
      return cfNome && (cfNome === nomeNorm || cfNome.includes(nomeNorm) || nomeNorm.includes(cfNome));
    });
  }

  // Nome Fantasia e Razão Social
  const nomeFantasia = contato?.nome_fantasia?.trim() || null;
  const razaoSocial = contato?.fornecedor?.trim() || cidForn?.forn_nome?.trim() || (nome || null);

  // Telefone: junta telefone geral e representante (sem duplicar)
  const telsDisponiveis = [contato?.telefone?.trim(), contato?.representante_telefone?.trim()]
    .filter((t): t is string => Boolean(t && t !== '—'));
  const telsUnicos = Array.from(new Set(telsDisponiveis));
  const telefone = telsUnicos.length > 0 ? telsUnicos.join(' / ') : null;

  // Endereço
  let endereco: string | null = null;
  const rua = cidForn?.rua?.trim();
  const localidade = cidForn?.localidade?.trim() || contato?.cidade?.trim();
  const uf = cidForn?.estado_uf?.trim() || contato?.estado_uf?.trim();
  const cep = cidForn?.codigo_postal?.trim();

  if (rua) {
    const partesEnd: string[] = [rua];
    if (localidade && !rua.toLowerCase().includes(localidade.toLowerCase())) {
      partesEnd.push(localidade);
    }
    let endStr = partesEnd.join(', ');
    if (uf) endStr += ` - ${uf}`;
    if (cep) endStr += ` - CEP ${cep}`;
    endereco = endStr;
  } else if (localidade || uf) {
    let cidUf = localidade || '';
    if (localidade && uf) cidUf += ` - ${uf}`;
    else if (uf) cidUf += uf;
    if (cep) cidUf += ` - CEP ${cep}`;
    endereco = cidUf;
  }

  return {
    nomeFantasia,
    razaoSocial,
    endereco,
    telefone,
  };
}

/**
 * "Coleta Jacobina — TRANSPORTADORA X (3 itens)". A transportadora entra no
 * assunto porque a lista costuma ser filtrada por ela: quem recebe já sabe, na
 * caixa de entrada, de quem é a viagem.
 */
export function montarAssuntoColeta(params: {
  assuntoBase?: string | null;
  transportadora?: string | null;
  quantidadeItens: number;
}): string {
  const base = (params.assuntoBase || ASSUNTO_COLETA_PADRAO).trim() || ASSUNTO_COLETA_PADRAO;
  const transp = (params.transportadora || '').trim();
  const qtd = params.quantidadeItens;
  const sufixo = `${qtd} ${qtd === 1 ? 'item' : 'itens'}`;
  return transp ? `${base} — ${transp} (${sufixo})` : `${base} (${sufixo})`;
}

/** "10 UN" · "10" quando não há unidade · "—" quando não há quantidade. */
function quantidadeTexto(quantidade?: number | null, unidade?: string | null): string {
  if (quantidade === null || quantidade === undefined || Number.isNaN(quantidade)) return '—';
  const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(quantidade);
  const un = (unidade || '').trim();
  return un ? `${numero} ${un}` : numero;
}

function textoOuTraco(valor?: string | null): string {
  const v = (valor || '').trim();
  return v || '—';
}

/**
 * Uma linha por item no modelo:
 * Código: 1437256 | Material: CAMISA TERM UNI 90PES/10EL% PT G | Qtd: 5 UN | Valor: R$ 224,50
 */
function linhaItem(linha: LinhaColeta): string {
  const campos = [
    `Código: ${textoOuTraco(linha.codigoItem)}`,
    `Material: ${textoOuTraco(linha.material)}`,
    `Qtd: ${quantidadeTexto(linha.quantidade, linha.unidade)}`,
    `Valor: ${linha.valor === null || linha.valor === undefined ? '—' : formatBRL(linha.valor)}`,
  ];
  return campos.join(' | ');
}

/**
 * Corpo em texto puro da lista de coleta.
 * Estrutura:
 * - Saudação "Bom dia!" e mensagem de introdução
 * - Totais (Itens e Valor total)
 * - Separador de cabeçalho
 * - Blocos por FORNECEDOR (alfabético) com Nome Fantasia, Razão Social, Endereço e Telefone (quando houver)
 * - Sub-blocos por PO com itens listados
 * - Separador ao fim de cada fornecedor
 */
export function montarCorpoColeta(params: {
  linhas: LinhaColeta[];
  transportadora?: string | null;
  solicitante?: string | null;
}): string {
  const { linhas } = params;
  const partes: string[] = [];

  partes.push('Bom dia!');
  partes.push('');
  partes.push('Segue a lista de coleta para busca do material junto aos fornecedores.');
  partes.push(`Itens: ${linhas.length}`);

  const total = linhas.reduce((acc, l) => acc + (l.valor || 0), 0);
  if (total > 0) {
    partes.push(`Valor total: ${formatBRL(total)}`);
  }

  partes.push(SEPARADOR_CABECALHO);

  const porFornecedor = new Map<string, LinhaColeta[]>();
  for (const linha of linhas) {
    const chave = textoOuTraco(linha.fornecedor);
    const grupo = porFornecedor.get(chave);
    if (grupo) grupo.push(linha);
    else porFornecedor.set(chave, [linha]);
  }

  const fornecedores = Array.from(porFornecedor.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  for (let fIdx = 0; fIdx < fornecedores.length; fIdx++) {
    const fornecedor = fornecedores[fIdx];
    const itens = porFornecedor.get(fornecedor) || [];

    // Localiza dados enriquecidos do cadastro caso existam em algum item do grupo
    const itemComDados = itens.find(i => i.nomeFantasia || i.endereco || i.telefone || i.razaoSocial);
    const nomeFantasia = itemComDados?.nomeFantasia?.trim();
    const razaoSocial = itemComDados?.razaoSocial?.trim() || fornecedor;
    const endereco = itemComDados?.endereco?.trim();
    const telefone = itemComDados?.telefone?.trim();

    // Se tiver Nome Fantasia, exibe como título principal; senão, o do cadastro / fornecedor
    const titulo = nomeFantasia || razaoSocial || fornecedor;
    partes.push(`FORNECEDOR: ${titulo}`);

    // Se usou Nome Fantasia e há Razão Social diferente, adiciona a Razão Social
    if (nomeFantasia && razaoSocial && razaoSocial.toLowerCase() !== nomeFantasia.toLowerCase()) {
      partes.push(`Razão Social: ${razaoSocial}`);
    }

    if (endereco) {
      partes.push(`Endereço: ${endereco}`);
    }

    if (telefone) {
      partes.push(`Telefone: ${telefone}`);
    }

    partes.push('');

    const itensOrdenados = [...itens].sort((a, b) => {
      if (a.dataColeta && b.dataColeta) return a.dataColeta < b.dataColeta ? -1 : 1;
      if (a.dataColeta) return -1;
      if (b.dataColeta) return 1;
      return a.po.localeCompare(b.po);
    });

    const porPo = new Map<string, LinhaColeta[]>();
    for (const item of itensOrdenados) {
      const chavePo = textoOuTraco(item.po);
      const grupoPo = porPo.get(chavePo);
      if (grupoPo) grupoPo.push(item);
      else porPo.set(chavePo, [item]);
    }

    for (const [po, itensDoPo] of porPo) {
      partes.push(po);
      for (const item of itensDoPo) {
        partes.push(linhaItem(item));
      }
    }

    partes.push(SEPARADOR_FORNECEDOR);
    if (fIdx < fornecedores.length - 1) {
      partes.push('');
    }
  }

  return partes.join('\n').trimEnd();
}
