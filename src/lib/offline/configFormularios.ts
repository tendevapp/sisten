/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * O que os formulários podem gravar sem rede (ver `filaSupabase.ts`):
 * tabelas, RPCs e buckets. Fora desta lista, a gravação vai direto ao
 * servidor e falha sem rede, como sempre — telas administrativas (excluir,
 * exportar, importar SAP, cadastros) não entram de propósito.
 *
 * Os checklists da Qualidade (Expedição e Internos) têm modo offline próprio
 * e não aparecem aqui.
 *
 * Código de registro: quem calcula no cliente (protocolos da Portaria e da
 * ASE, número da Expedição, RNC, Ficha de EPI) calcula offline sobre a lista
 * guardada no aparelho. Se no envio outro aparelho já tiver usado o código,
 * o `unique` do banco recusa e `regenerar` gera outro com a regra do módulo —
 * o mesmo que a tela faria online.
 */

import type { Linha } from './postgrest';

export interface RegraCodigo {
  /** Coluna com unique — o nome aparece na mensagem de violação. */
  coluna: string;
  /** Recebe o corpo gravado (linha, lista ou argumentos da RPC) e devolve o corpo com código novo. */
  regenerar: (dados: any) => Promise<any | null>;
}

export interface ConfigTabela {
  /** Nome do formulário, para o usuário ("Chegada de transportes"). */
  rotulo: string;
  /** O que identifica o registro ("ABC1D23 · Transportadora X"). */
  resumo?: (linha: Linha) => string;
  /** Nome da alteração ("saída") quando o patch diz o que ela é. */
  rotuloAtualizacao?: (patch: Linha) => string | null;
  codigo?: RegraCodigo;
}

export interface ConfigRpc {
  rotulo: string;
  resumo?: (args: any) => string;
  /** A RPC cria um registro: o id provisório devolvido à tela vira o real no envio. */
  criaRegistro?: boolean;
  /** O que a tela recebe enquanto a chamada está na fila (mesmo formato do retorno real). */
  respostaProvisoria: (args: any, idProvisorio: string) => unknown;
  codigo?: RegraCodigo;
}

export interface ConfigBucket {
  rotulo: string;
}

/** Marca nas respostas provisórias das RPCs: a tela pode avisar que o servidor ainda não respondeu. */
export const MARCA_OFFLINE = '__offline';

// ---------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------

function campos(...nomes: string[]): (linha: Linha) => string {
  return linha => nomes.map(nome => linha?.[nome]).filter(valor => valor !== null && valor !== undefined && String(valor).trim() !== '').map(String).join(' · ');
}

function saidaSe(coluna: string, valores: string[]): (patch: Linha) => string | null {
  return patch => (valores.includes(String(patch[coluna])) ? 'registro de saída' : null);
}

function porLinha(dados: any, alterar: (linha: Linha) => Promise<Linha>): Promise<any> {
  return Array.isArray(dados) ? Promise.all(dados.map(alterar)) : alterar(dados);
}

function sufixoAleatorio(tamanho: number): string {
  return Math.random().toString(36).slice(2, 2 + tamanho).toUpperCase().padEnd(tamanho, 'X');
}

/** Protocolos da Portaria: mesmo prefixo e data, sufixo novo — o que `gerarProtocolo` faz numa colisão online. */
const protocoloPortaria: RegraCodigo = {
  coluna: 'numero_protocolo',
  regenerar: dados => porLinha(dados, async linha => ({
    ...linha,
    numero_protocolo: String(linha.numero_protocolo || '').replace(/-[^-]*$/, '') + `-${sufixoAleatorio(4)}`,
  })),
};

/** ASE-DDMMAA-SETOR-NN: próximo sequencial livre do mesmo prefixo, como `calcularProximoProtocoloAse`. */
const protocoloAse: RegraCodigo = {
  coluna: 'numero_protocolo',
  regenerar: dados => porLinha(dados, async linha => {
    const atual = String(linha.numero_protocolo || '');
    const base = atual.replace(/-\d+$/, '');
    const { supabase } = await import('../../db/supabaseClient');
    const { data } = await supabase.from('rh_ase_solicitacoes').select('numero_protocolo').ilike('numero_protocolo', `${base}%`);
    const padrao = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i');
    const maior = (data || []).reduce((max: number, row: any) => {
      const m = String(row.numero_protocolo || '').match(padrao);
      return m ? Math.max(max, Number(m[1])) : String(row.numero_protocolo).toUpperCase() === base.toUpperCase() ? Math.max(max, 1) : max;
    }, 0);
    return { ...linha, numero_protocolo: `${base}-${String(maior + 1).padStart(2, '0')}` };
  }),
};

// ---------------------------------------------------------------------
// Tabelas
// ---------------------------------------------------------------------

const TABELAS: Record<string, ConfigTabela> = {
  // Portaria & Segurança
  port_registro_transportes: {
    rotulo: 'Chegada de transportes',
    resumo: campos('placa', 'empresa', 'motorista'),
    rotuloAtualizacao: saidaSe('status', ['FINALIZADO']),
    codigo: protocoloPortaria,
  },
  port_controle_equipamentos: {
    rotulo: 'Equipamentos de terceiros',
    resumo: campos('nome_empresa', 'funcionario'),
    rotuloAtualizacao: saidaSe('status', ['DEVOLVIDO']),
    codigo: protocoloPortaria,
  },
  port_controle_carretas: {
    rotulo: 'Carretas de chapas',
    resumo: campos('placa_cavalo', 'empresa', 'nome_motorista'),
    rotuloAtualizacao: saidaSe('status', ['FINALIZADO']),
    codigo: protocoloPortaria,
  },
  port_relatorio_portaria: { rotulo: 'Relatório de ocorrências', resumo: campos('numero_protocolo', 'data', 'turno'), codigo: protocoloPortaria },
  port_relatorio_ocorrencias: { rotulo: 'Relatório de ocorrências — ocorrência', resumo: campos('tipo_registro', 'horario', 'nome_pessoa', 'placa', 'descricao') },
  port_briefing_sessoes: { rotulo: 'Briefing de segurança', resumo: campos('numero_protocolo', 'tema_treinamento', 'data'), codigo: protocoloPortaria },
  port_briefing_participantes: { rotulo: 'Briefing de segurança — participante', resumo: campos('nome', 'empresa') },
  port_passagem_plantao: { rotulo: 'Passagem de plantão', resumo: campos('numero_protocolo', 'data', 'turno'), codigo: protocoloPortaria },
  port_alcoolemia_testes: { rotulo: 'Teste de alcoolemia', resumo: campos('nome', 'empresa', 'resultado') },

  // RH
  rh_ase_solicitacoes: { rotulo: 'ASE — horas extras', resumo: campos('numero_protocolo', 'data_execucao'), codigo: protocoloAse },
  rh_ase_itens: { rotulo: 'ASE — colaborador', resumo: campos('nome', 'registro', 'cargo') },

  // Logística
  expedicao_carregamentos: {
    rotulo: 'Registro de expedição',
    resumo: campos('numero', 'empresa'),
    codigo: {
      coluna: 'numero',
      regenerar: dados => porLinha(dados, async linha => ({ ...linha, numero: `EXP-${new Date().getFullYear()}-${sufixoAleatorio(5)}` })),
    },
  },
  expedicao_tramos: { rotulo: 'Registro de expedição — tramo', resumo: campos('tramo', 'numero_tramo', 'carreta_placa') },
  expedicao_fotos: { rotulo: 'Registro de expedição — foto' },

  // SSMA
  ssma_rid_desvios: { rotulo: 'RID — identificação de desvio', resumo: campos('numero_registro', 'area_desvio', 'nome_informante') },
  ssma_rid_atualizacoes: { rotulo: 'RID — atualização' },

  // Qualidade
  qua_rnc: {
    rotulo: 'RNC — não conformidade',
    resumo: campos('numero_registro', 'fornecedor', 'descricao'),
    codigo: {
      coluna: 'numero_registro',
      regenerar: dados => porLinha(dados, async linha => {
        const { obterProximoNumeroRegistroRnc } = await import('../qualidadeApi');
        return { ...linha, numero_registro: await obterProximoNumeroRegistroRnc(linha.data_emissao as string) };
      }),
    },
  },

  // Almoxarifado (gravações diretas que acompanham as RPCs)
  alm_receb_cargas: { rotulo: 'Recebimento — ficha cega', resumo: campos('codigo', 'transportadora', 'nota_fiscal') },
  alm_receb_conferencias: { rotulo: 'Recebimento — conferência', resumo: campos('codigo') },
  alm_receb_nc: { rotulo: 'Recebimento — não conformidade', resumo: campos('codigo') },
};

// ---------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------

const RPCS: Record<string, ConfigRpc> = {
  alm_receb_registrar_carga: {
    rotulo: 'Recebimento — ficha cega',
    resumo: args => campos('transportadora', 'nota_fiscal', 'veiculo_placa')(args?.p_carga || {}),
    criaRegistro: true,
    respostaProvisoria: (_args, id) => ({ id, codigo: '', divergencia: false, [MARCA_OFFLINE]: true }),
  },
  alm_receb_registrar_conferencia: {
    rotulo: 'Recebimento — conferência',
    criaRegistro: true,
    respostaProvisoria: (args, id) => ({ id, codigo: '', nc_codigo: null, itens_divergentes: 0, tem_nc: !!args?.p_nc, [MARCA_OFFLINE]: true }),
  },
  alm_receb_registrar_nc: {
    rotulo: 'Recebimento — não conformidade',
    criaRegistro: true,
    respostaProvisoria: (_args, id) => ({ id, codigo: '', [MARCA_OFFLINE]: true }),
  },
  alm_receb_editar_carga: { rotulo: 'Recebimento — edição da ficha cega', respostaProvisoria: () => ({ [MARCA_OFFLINE]: true }) },
  alm_receb_editar_conferencia: { rotulo: 'Recebimento — edição da conferência', respostaProvisoria: () => ({ [MARCA_OFFLINE]: true }) },
  alm_receb_editar_nc: { rotulo: 'Recebimento — edição da NC', respostaProvisoria: () => ({ [MARCA_OFFLINE]: true }) },
  // Almoxarifado confirma a devolutiva de Suprimentos na doca. A RPC ignora o
  // que já foi concluído, então o reenvio da fila não duplica.
  sup_receb_pend_executar: {
    rotulo: 'Recebimento — execução da devolutiva',
    resumo: args => `${(args?.p_ids || []).length} pendência(s)`,
    respostaProvisoria: args => ({ concluidas: (args?.p_ids || []).length, [MARCA_OFFLINE]: true }),
  },

  alm_req_balcao_salvar: {
    rotulo: 'Requisição no balcão',
    resumo: args => campos('colaborador_nome', 'aplicacao', 'aplicacao_pep')(args?.p_req || {}),
    criaRegistro: true,
    respostaProvisoria: (args, id) => ({ ...(args?.p_req || {}), id: args?.p_id || id, codigo: '', [MARCA_OFFLINE]: true }),
  },

  alm_inv_criar: {
    rotulo: 'Inventário cíclico',
    resumo: args => campos('data', 'criterio')(args?.p_inv || {}),
    criaRegistro: true,
    respostaProvisoria: (args, id) => ({ ...(args?.p_inv || {}), id, codigo: '', [MARCA_OFFLINE]: true }),
  },
  alm_inv_adicionar_itens: { rotulo: 'Inventário cíclico — itens', respostaProvisoria: args => (args?.p_itens || []).length },
  alm_inv_registrar_contagem: {
    rotulo: 'Inventário cíclico — contagem',
    resumo: args => (args?.p_quantidade !== undefined ? `quantidade ${args.p_quantidade}` : ''),
    // A comparação com a ZL0024 é do servidor: offline não dá para dizer se confere.
    respostaProvisoria: () => ({ numero: 0, divergente: false, status: 'pendente', pode_recontar: false, saldo_sistema: null, diferenca: null, [MARCA_OFFLINE]: true }),
  },
  alm_inv_encerrar_item: {
    rotulo: 'Inventário cíclico — encerrar item',
    respostaProvisoria: () => ({ status: 'divergente', saldo_sistema: null, diferenca: null, alerta: '', [MARCA_OFFLINE]: true }),
  },

  ssma_ficha_epi_criar: {
    rotulo: 'Ficha de EPI',
    resumo: args => campos('codigo', 'nome', 'registro')(args?.p_ficha || {}),
    criaRegistro: true,
    respostaProvisoria: (_args, id) => id,
    codigo: {
      coluna: 'codigo',
      regenerar: async args => {
        const { proximoCodigoFicha } = await import('../ssmaFichaEpiApi');
        return { ...args, p_ficha: { ...args.p_ficha, codigo: await proximoCodigoFicha(args.p_ficha.data_entrega) } };
      },
    },
  },
  ssma_ficha_epi_registrar_devolucao: { rotulo: 'Ficha de EPI — devolução', respostaProvisoria: () => null },
  ssma_ficha_epi_assinar: { rotulo: 'Ficha de EPI — assinatura', respostaProvisoria: () => null },
};

// ---------------------------------------------------------------------
// Buckets (fotos e anexos)
// ---------------------------------------------------------------------

const BUCKETS: Record<string, ConfigBucket> = {
  'expedicao-fotos': { rotulo: 'Registro de expedição — foto' },
  'ssma-desvios': { rotulo: 'RID — foto' },
  'qua-rnc-evidencias': { rotulo: 'RNC — anexo' },
  'alm-recebimento': { rotulo: 'Recebimento — foto' },
};

/** RPCs que só leem (POST por protocolo): a resposta fica guardada como as leituras comuns. */
const RPCS_LEITURA = new Set(['alm_receb_po_linhas']);

export function rpcDeLeitura(nome: string): boolean {
  return RPCS_LEITURA.has(nome);
}

export function configTabela(tabela: string): ConfigTabela | undefined {
  return TABELAS[tabela];
}

export function configRpc(nome: string): ConfigRpc | undefined {
  return RPCS[nome];
}

export function configBucket(bucket: string): ConfigBucket | undefined {
  return BUCKETS[bucket];
}

/** Resposta provisória de uma RPC na fila (marcada com `__offline`)? */
export function ehRespostaOffline(valor: unknown): boolean {
  return !!valor && typeof valor === 'object' && (valor as Record<string, unknown>)[MARCA_OFFLINE] === true;
}
