/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * As 4 propostas reais (ver documentoUnificadoReal.ts) já transcritas para
 * o formato estruturado que a Edge Function `estruturar-cotacao` devolve —
 * ou seja, o formato que validacao.ts/calculo.ts/vinculo.ts efetivamente
 * consomem (a extração de texto bruto para números é responsabilidade da
 * IA, não de código TS; ver a nota no schema da Edge Function).
 *
 * MANGLOG e FERIMPORT têm as 26 e 27 linhas completas, transcritas à mão a
 * partir do PDF convertido — a soma de cada uma bate exatamente com o total
 * declarado no documento (32.175,99 e 21.645,80), o que valida tanto a
 * transcrição quanto a lógica de conferência aritmética.
 *
 * ANHANGUERA e LOJA_DO_MECANICO trazem um subconjunto representativo,
 * suficiente para exercitar os casos específicos do plano (reconciliação
 * soma+IPI, soma+frete, %Red, ST, produto divergente) sem exigir
 * transcrever as ~40 linhas inteiras de cada uma.
 */

import type { PropostaExtraida } from '../tipos';

export const PROPOSTA_MANGLOG: PropostaExtraida = {
  fornecedor: { nome_extraido: 'MANGLOG PRODUTOS INDUSTRIAIS', cnpj_extraido: '48.802.880/0001-46', uf_extraido: 'SP' },
  numero_proposta: '64495',
  data_cotacao: '2026-07-14',
  validade_texto: '29/07/2026',
  condicao_pagamento_texto: '30 DDLIQ',
  frete_texto: '1 - Contratação do Frete por conta do Destinatário (FOB)',
  frete_valor: 0,
  total_declarado: 32175.99,
  itens_declarados: 26,
  itens: [
    { linha_ordem: 1, numero_item_original: '1', descricao_bruta: 'FURADEIRA DE IMPACTO BOSCH GSB 20-2 RE 800W 220V', referencia: 'BOSCH-06011A21E2', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 2983.34, subtotal: 2983.34, icms_percentual: 7, ipi_percentual: 0 },
    { linha_ordem: 2, numero_item_original: '2', descricao_bruta: 'ESPÁTULA CHATA 12"', referencia: '38-12', unidade: 'UN', quantidade: 3, preco_unitario_bruto: 136.44, subtotal: 409.32, icms_percentual: 7 },
    { linha_ordem: 3, numero_item_original: '3', descricao_bruta: 'JOGO DE CHAVES ALLEN COM 12 PEÇAS', referencia: 'GEDORE-42-12P', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 234.98, subtotal: 234.98, icms_percentual: 7 },
    { linha_ordem: 4, numero_item_original: '4', descricao_bruta: 'SOQUETE HEXAGONAL LONGO 6MM ENCAIXE 1/2"', referencia: 'IN19L-6', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 150.26, subtotal: 150.26, icms_percentual: 7 },
    { linha_ordem: 5, numero_item_original: '5', descricao_bruta: 'SOQUETE HEXAGONAL 6 MM, ENCAIXE DE 1/2"', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 67.98, subtotal: 67.98, icms_percentual: 7 },
    { linha_ordem: 6, numero_item_original: '6', descricao_bruta: 'ALICATE DE PRESSÃO COM MORDENTE CURVO DE 10"', referencia: '137-10', unidade: 'UN', quantidade: 3, preco_unitario_bruto: 130.46, subtotal: 391.38, icms_percentual: 7 },
    { linha_ordem: 7, numero_item_original: '7', descricao_bruta: "ALICATE ISOLADO UNIVERSAL 8''", referencia: '169069', unidade: 'UN', quantidade: 3, preco_unitario_bruto: 49.86, subtotal: 149.58, icms_percentual: 7 },
    { linha_ordem: 8, numero_item_original: '8', descricao_bruta: 'ALICATE DE CORTE 8" ISOLADO 1000V VDE', referencia: '48-22-2208', unidade: 'UN', quantidade: 3, preco_unitario_bruto: 538.00, subtotal: 1614.00, icms_percentual: 0 },
    { linha_ordem: 9, numero_item_original: '9', descricao_bruta: 'ALICATE TIPO TELEFONE BICO RETO VDE H ISOLADO EN 60900', unidade: 'UN', quantidade: 3, preco_unitario_bruto: 762.00, subtotal: 2286.00, icms_percentual: 7 },
    { linha_ordem: 10, numero_item_original: '10', descricao_bruta: 'ALICATE TIPO TELEFONE BICO CURVO 45º JC ISOLADO NBR 9699', unidade: 'UN', quantidade: 3, preco_unitario_bruto: 576.88, subtotal: 1730.64, icms_percentual: 7 },
    { linha_ordem: 11, numero_item_original: '11', descricao_bruta: 'CHAVE GRIFO 8" TIPO STILLSON, ENCARTELADA', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 110.86, subtotal: 110.86, icms_percentual: 7 },
    { linha_ordem: 12, numero_item_original: '12', descricao_bruta: 'CHAVE GRIFO 12" TIPO STILLSON, ENCARTELADA', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 156.58, subtotal: 156.58, icms_percentual: 7 },
    { linha_ordem: 13, numero_item_original: '13', descricao_bruta: 'CHAVE GRIFO 14" TIPO STILLSON, ENCARTELADA', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 204.48, subtotal: 204.48, icms_percentual: 7 },
    { linha_ordem: 14, numero_item_original: '14', descricao_bruta: 'CHAVE GRIFO 18" TIPO STILLSON', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 378.72, subtotal: 378.72, icms_percentual: 7 },
    { linha_ordem: 15, numero_item_original: '15', descricao_bruta: 'CHAVE GRIFO 24" TIPO STILLSON', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 563.84, subtotal: 563.84, icms_percentual: 7 },
    { linha_ordem: 16, numero_item_original: '16', descricao_bruta: 'TESOURA PARA CHAPAS MODELO FUNILEIRO 10"', referencia: '8516-10', unidade: 'UN', quantidade: 4, preco_unitario_bruto: 390.66, subtotal: 1562.64, icms_percentual: 7 },
    { linha_ordem: 17, numero_item_original: '17', descricao_bruta: 'EXTENSOR PORTA BITS FLEXÍVEL 300MM', referencia: 'B-29094', unidade: 'UN', quantidade: 2, preco_unitario_bruto: 150.00, subtotal: 300.00, icms_percentual: 7 },
    { linha_ordem: 18, numero_item_original: '18', descricao_bruta: 'MACACO HIDRÁULICO TIPO GARRAFA, 2 TONELADAS (2 TF)', referencia: '6874020000', unidade: 'UN', quantidade: 2, preco_unitario_bruto: 204.48, subtotal: 408.96, icms_percentual: 7 },
    { linha_ordem: 19, numero_item_original: '19', descricao_bruta: 'TARRAXA COSSINETE MANUAL AÇO LIGA M16 X 2,0', unidade: 'UN', quantidade: 2, preco_unitario_bruto: 140.00, subtotal: 280.00, icms_percentual: 7 },
    { linha_ordem: 20, numero_item_original: '20', descricao_bruta: 'JOGO DE MACHO MANUAL HSS M16X2,00MM DIN 352 3 PEÇAS', referencia: '101', unidade: 'UN', quantidade: 2, preco_unitario_bruto: 912.80, subtotal: 1825.60, icms_percentual: 7 },
    { linha_ordem: 21, numero_item_original: '21', descricao_bruta: 'KIT 6 BROCAS AÇO RAPIDO 12MM 14MM 16MM 18MM 20MM 22MM', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 715.86, subtotal: 715.86, icms_percentual: 7 },
    { linha_ordem: 22, numero_item_original: '22', descricao_bruta: 'RETÍFICA RETA GGS 30 LS 750W 220V', referencia: 'BOSCH-06012B50E0-000', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 2613.12, subtotal: 2613.12, icms_percentual: 7, observacoes: 'CONFIRMAR SE ATENDE VOCÊS' },
    { linha_ordem: 23, numero_item_original: '23', descricao_bruta: 'FRESA LIMA ROTATIVA METAL DURO ESCAREAR MADEIRA AÇO FERRO', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 191.54, subtotal: 191.54, icms_percentual: 7 },
    { linha_ordem: 24, numero_item_original: '24', descricao_bruta: 'ADES LOCTITE 7063 - 400ML', referencia: '2098749', ncm: '38140090', unidade: 'PC', quantidade: 23, preco_unitario_bruto: 477.93, subtotal: 10992.39, icms_percentual: 7 },
    { linha_ordem: 25, numero_item_original: '25', descricao_bruta: 'PASTA ANTIATRITO ROCOL J-166 - 1 KG', unidade: 'UN', quantidade: 1, preco_unitario_bruto: 484.00, subtotal: 484.00, icms_percentual: 7 },
    { linha_ordem: 26, numero_item_original: '26', descricao_bruta: "CHAVE CATRACA REDSTRIPE 1/2'", referencia: '5763012901', unidade: 'UN', quantidade: 4, preco_unitario_bruto: 342.48, subtotal: 1369.92, icms_percentual: 7 },
  ],
};

export const PROPOSTA_FERIMPORT: PropostaExtraida = {
  fornecedor: { nome_extraido: 'FERIMPORT COMERCIO REP E IMPORTACAO', cnpj_extraido: '01.791.324/0001-58', uf_extraido: 'BA' },
  numero_proposta: '5027061537',
  data_cotacao: '2026-07-20',
  condicao_pagamento_texto: '30 DIAS',
  total_declarado: 21645.80,
  itens_declarados: 27,
  itens: [
    { linha_ordem: 1, numero_item_original: '1', descricao_bruta: 'FURAD IMP GSB 16 RE 850W 220V', marca: 'BOSCH', ncm: '84672100', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 525.00, subtotal: 525.00, icms_percentual: 12.06, pis_percentual: 1.65, cofins_percentual: 7.60 },
    { linha_ordem: 2, numero_item_original: '2', descricao_bruta: 'ESPATULA 38 12', marca: 'GEDORE', ncm: '82055900', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 3, preco_unitario_bruto: 59.07, subtotal: 177.21, icms_percentual: 12.06, pis_percentual: 1.65, cofins_percentual: 7.60 },
    { linha_ordem: 3, numero_item_original: '3', descricao_bruta: 'JOGO CHAVE ALLEN 42 12P 1/16-1/2', marca: 'GEDORE', ncm: '82054000', cst: '20', cfop: '5102', unidade: 'JG', quantidade: 1, preco_unitario_bruto: 68.80, subtotal: 68.80, icms_percentual: 12.06 },
    { linha_ordem: 4, numero_item_original: '4', descricao_bruta: 'CHAVE SOQ ALLEN 6MM 1/2 INL19', marca: 'GEDORE', ncm: '82079000', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 39.11, subtotal: 39.11, icms_percentual: 12.06 },
    { linha_ordem: 5, numero_item_original: '5', descricao_bruta: 'CHAVE SOQ ALLEN 6MM 1/2 IN19', marca: 'GEDORE', ncm: '82079000', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 34.65, subtotal: 34.65, icms_percentual: 12.06 },
    { linha_ordem: 6, numero_item_original: '6', descricao_bruta: 'ALICATE PRESSAO 10 137 029010', marca: 'GEDORE', ncm: '82032010', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 3, preco_unitario_bruto: 51.81, subtotal: 155.43, icms_percentual: 12.06 },
    { linha_ordem: 7, numero_item_original: '7', descricao_bruta: 'ALICATE UNIVERSAL 8 8280 200 IOX 029400', marca: 'GEDORE', ncm: '82032010', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 3, preco_unitario_bruto: 47.70, subtotal: 143.10, icms_percentual: 12.06 },
    { linha_ordem: 8, numero_item_original: '8', descricao_bruta: 'ALICATE CORTE DIAG VDE 8314 160H', marca: 'GEDORE', ncm: '82032010', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 3, preco_unitario_bruto: 210.00, subtotal: 630.00, icms_percentual: 12.06 },
    { linha_ordem: 9, numero_item_original: '9', descricao_bruta: 'ALICATE TELEF BICO RETO VDE 8132 160H', referencia: 'VDE 8132 160H', marca: 'GEDORE', ncm: '82032010', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 3, preco_unitario_bruto: 195.00, subtotal: 585.00, icms_percentual: 12.06 },
    { linha_ordem: 10, numero_item_original: '10', descricao_bruta: 'ALICATE TELEF BICO CURVO VDE 8132AB-160H', marca: 'GEDORE', ncm: '82032010', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 3, preco_unitario_bruto: 217.00, subtotal: 651.00, icms_percentual: 12.06 },
    { linha_ordem: 11, numero_item_original: '11', descricao_bruta: 'CHAVE TUBO 8 STILLSON', referencia: '3513408100', marca: 'VONDER', ncm: '82041200', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 35.90, subtotal: 35.90, icms_percentual: 12.06 },
    { linha_ordem: 12, numero_item_original: '12', descricao_bruta: 'CHAVE TUBO 12 STILLSON', referencia: '3513412100', marca: 'VONDER', ncm: '82041200', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 55.00, subtotal: 55.00, icms_percentual: 12.06 },
    { linha_ordem: 13, numero_item_original: '13', descricao_bruta: 'CHAVE TUBO 14 STILLSON 954', marca: 'NOVE54', ncm: '82041200', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 47.00, subtotal: 47.00, icms_percentual: 12.06 },
    { linha_ordem: 14, numero_item_original: '14', descricao_bruta: 'CHAVE GRIFO 18', marca: 'FERTAK', ncm: '82041200', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 52.00, subtotal: 52.00, icms_percentual: 12.06 },
    { linha_ordem: 15, numero_item_original: '15', descricao_bruta: 'CHAVE TUBO 24 87-626', marca: 'STANLEY', ncm: '82041200', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 190.82, subtotal: 190.82, icms_percentual: 12.06 },
    { linha_ordem: 16, numero_item_original: '16', descricao_bruta: 'TESOURA FUNILEIRO 8516 10', referencia: '8516 10', marca: 'GEDORE', ncm: '82130000', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 4, preco_unitario_bruto: 169.78, subtotal: 679.12, icms_percentual: 12.06 },
    { linha_ordem: 17, numero_item_original: '17', descricao_bruta: 'MACACO GARRAFA 2T', referencia: '6874020000', marca: 'VONDER', ncm: '84254200', cst: '60', cfop: '5405', unidade: 'PC', quantidade: 2, preco_unitario_bruto: 110.68, subtotal: 221.36, icms_percentual: 0 },
    { linha_ordem: 18, numero_item_original: '18', descricao_bruta: 'COSSINETE M 16X2', marca: 'DORMER', ncm: '82074020', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 2, preco_unitario_bruto: 490.00, subtotal: 980.00, icms_percentual: 12.06 },
    { linha_ordem: 19, numero_item_original: '19', descricao_bruta: 'MACHO MANUAL AR M 16X2,0', referencia: 'E100M16NO8', marca: 'DORMER', ncm: '82074010', cst: '20', cfop: '5102', unidade: 'JG', quantidade: 2, preco_unitario_bruto: 560.00, subtotal: 1120.00, icms_percentual: 12.06 },
    { linha_ordem: 20, numero_item_original: '20', descricao_bruta: 'BROCA AR HP REVENIDA DIN338 12,00MM A100', marca: 'DORMER', ncm: '82075011', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 48.83, subtotal: 48.83, icms_percentual: 12.06 },
    { linha_ordem: 21, numero_item_original: '21', descricao_bruta: 'BROCA AR HP REVENIDA DIN338 16,00MM A100', marca: 'DORMER', ncm: '82075011', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 250.01, subtotal: 250.01, icms_percentual: 12.06 },
    { linha_ordem: 22, numero_item_original: '22', descricao_bruta: 'BROCA AR HP REVENIDA DIN338 18,00MM A100', marca: 'DORMER', ncm: '82075011', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 306.75, subtotal: 306.75, icms_percentual: 12.06 },
    { linha_ordem: 23, numero_item_original: '23', descricao_bruta: 'BROCA AR HP REVENIDA DIN338 20,00MM A100', marca: 'DORMER', ncm: '82075011', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 375.86, subtotal: 375.86, icms_percentual: 12.06 },
    { linha_ordem: 24, numero_item_original: '24', descricao_bruta: 'BROCA AR HP REVENIDA DIN338 22,00MM A100', marca: 'DORMER', ncm: '82075011', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 518.83, subtotal: 518.83, icms_percentual: 12.06 },
    // Lacuna real do documento: 25 e 26 não existem. O item seguinte é 27 —
    // nunca renumerar para "25".
    { linha_ordem: 25, numero_item_original: '27', descricao_bruta: 'DESENGRAXANTE SF 7063 400ML', referencia: '2098749', marca: 'LOCTITE', ncm: '38140090', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 23, preco_unitario_bruto: 476.79, subtotal: 10966.17, icms_percentual: 12.06 },
    { linha_ordem: 26, numero_item_original: '28', descricao_bruta: 'CATRACA CABO 1/2 120 DENTES SATA APEX', referencia: 'ST13974G', marca: 'APEX', ncm: '82042000', cst: '20', cfop: '5102', unidade: 'PC', quantidade: 4, preco_unitario_bruto: 184.23, subtotal: 736.92, icms_percentual: 12.06 },
    { linha_ordem: 27, numero_item_original: '29', descricao_bruta: 'RETIFICA RETA GGS-28 LCE 1221 220V', marca: 'BOSCH', ncm: '84672999', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 2051.93, subtotal: 2051.93, icms_percentual: 12.06 },
  ],
};

/** Subconjunto representativo — não as ~40 linhas inteiras. */
export const PROPOSTA_ANHANGUERA_PARCIAL: PropostaExtraida = {
  fornecedor: { nome_extraido: 'ANHANGUERA COMERCIO DE FERRAMENTAS', cnpj_extraido: '00.565.813/0009-86', uf_extraido: 'ES' },
  numero_proposta: '6383330',
  data_cotacao: '2026-07-23',
  validade_texto: '3 dias dentro do mês vigente ou enquanto durarem os estoques.',
  condicao_pagamento_texto: 'A prazo - 30 dias',
  frete_texto: 'FOB - BAHIA SUL - Descarga/Montagem por conta do cliente.',
  faturamento_minimo: 300.00,
  total_declarado: 17421.24, // inclui IPI de R$ 76,53 sobre a soma dos itens (17.344,71)
  itens: [
    { linha_ordem: 1, numero_item_original: '1', descricao_bruta: 'FURADEIRA IMP 1/2" 870W EL REV 220V', referencia: '06011A21E2GSB 20-2RE', marca: 'BOSCH', ncm: '84672100', cst: '500', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 1125.71, subtotal: 1125.71, icms_percentual: 12, disponibilidade_texto: 'IMEDIATO SVP' },
    { linha_ordem: 9, numero_item_original: '9', descricao_bruta: 'ALICATE BICO MEIA CANA 6.1/2" ISOLADO 1000V', referencia: 'VDE 8132-160H', marca: 'GEDORE', ncm: '82032010', cst: '200', unidade: 'PC', quantidade: 3, preco_unitario_bruto: 133.88, subtotal: 401.64, icms_percentual: 4, disponibilidade_texto: 'IMEDIATO SVP' },
    { linha_ordem: 22, numero_item_original: '22', descricao_bruta: 'RETIFICADEIRA 750W 33000RPM LONGA 220V', referencia: '06012B50E0GGS 30 LS', marca: 'BOSCH', ncm: '84672999', cst: '200', unidade: 'PC', quantidade: 1, preco_unitario_bruto: 1001.40, subtotal: 1001.40, icms_percentual: 4, disponibilidade_texto: 'IMEDIATO SVP' },
    {
      linha_ordem: 25, numero_item_original: '25', descricao_bruta: 'PASTA COBREADA 1100C 1KG', referencia: 'J-166', marca: 'ROCOL', ncm: '27101999', cst: '030', unidade: 'PT', quantidade: 1,
      preco_unitario_bruto: 296.77, subtotal: 296.77, st_percentual: 25.79, icms_reducao_percentual: 100, icms_percentual: 0, disponibilidade_texto: 'IMEDIATO SVP',
    },
  ],
};

/** Subconjunto representativo, cobrindo desconto por item, ST, e o total com frete/impostos no rodapé. */
export const PROPOSTA_LOJA_DO_MECANICO_PARCIAL: PropostaExtraida = {
  fornecedor: { nome_extraido: 'GurgelMix Máquinas e Ferramentas', cnpj_extraido: null, uf_extraido: null },
  numero_proposta: '80075821',
  data_cotacao: '2026-07-21',
  validade_texto: '25/07/2026',
  condicao_pagamento_texto: 'a combinar',
  frete_valor: 216.39,
  total_declarado: 7688.39, // Subtotal produtos 7.472,00 + frete 216,39 (impostos já embutidos no subtotal)
  itens: [
    {
      linha_ordem: 1, descricao_bruta: 'Tesoura de Chapas Tipo Aviação Corte Esquerdo e Reto 10 Polegadas', referencia: 'IRWIN-014077', ncm: '82033000-6', unidade: 'UN', quantidade: 4,
      preco_unitario_bruto: 116.56, desconto_valor: 46.64, subtotal: 419.60, st_valor: 0, fcp_valor: 0, ipi_valor: 0,
    },
    {
      linha_ordem: 9, descricao_bruta: 'Macaco Garrafa Hidráulico 2 Toneladas', referencia: 'VONDER-6874020000', ncm: '84254200-7', unidade: 'UN', quantidade: 2,
      preco_unitario_bruto: 104.33, desconto_valor: 20.86, subtotal: 187.80, st_valor: 31.95, st_percentual: 4, fcp_valor: 0, ipi_valor: 0,
    },
    {
      linha_ordem: 17, descricao_bruta: 'Furadeira de Impacto GSB 20-2RE 1/2 Pol. 800W 220V', referencia: 'BOSCH-06011A21E2-000', ncm: '84672100-0', unidade: 'UN', quantidade: 1,
      preco_unitario_bruto: 1522.11, desconto_valor: 152.21, subtotal: 1369.90, st_valor: 0, fcp_valor: 0, ipi_valor: 0,
    },
  ],
};
