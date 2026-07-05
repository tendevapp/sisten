/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SAPRequisicao, SAPPedido } from '../types';
import { generateMaterials } from './materials';

export function generateSAPSeedData(): { requisicoes: SAPRequisicao[]; pedidos: SAPPedido[] } {
  const materials = generateMaterials();
  const requisicoes: SAPRequisicao[] = [];
  const pedidos: SAPPedido[] = [];

  const requisitantes = [
    'PEDRO LIMA', 'CARLOS SANTOS', 'ANA SOUZA', 'MARIA OLIVEIRA', 
    'RAFAEL COSTA', 'JULIA ALVES', 'LUCAS FERREIRA', 'GUSTAVO SILVA'
  ];

  const compradores = ['G001', 'G002', 'G003', 'G004'];
  const tiposDoc = ['ZR01', 'ZR02', 'ZR03', 'ZR11']; // Normal, Urgente, Máquina Parada, Serviço

  // Generate 100 requisitions
  for (let i = 1; i <= 100; i++) {
    const material = materials[i % materials.length];
    const reqNo = (4500000000 + i).toString();
    const itemNo = '000' + ((i % 5) + 1) * 10;
    const ri = reqNo + itemNo;

    // Dates in May/June/July 2026
    const reqDay = (i % 28) + 1;
    const reqMonth = i % 2 === 0 ? '05' : '06';
    const data_solicitacao = `2026-${reqMonth}-${reqDay.toString().padStart(2, '0')}`;
    
    // Remessa date = solicitacao + 7-15 days
    const remDay = (reqDay + 10) % 28 + 1;
    const remMonth = reqMonth === '05' ? (reqDay + 10 > 28 ? '06' : '05') : (reqDay + 10 > 28 ? '07' : '06');
    const data_remessa = `2026-${remMonth}-${remDay.toString().padStart(2, '0')}`;

    const grupo_comprador = compradores[i % compradores.length];
    const requisitante_name = requisitantes[i % requisitantes.length];
    const tipo_documento = tiposDoc[i % tiposDoc.length];

    // Some buyer operational fields
    let obs_comprador = '';
    let data_entrega_prevista = '';

    if (i % 7 === 1) {
      obs_comprador = 'Cotação enviada';
      data_entrega_prevista = `2026-07-${((i * 3) % 25 + 1).toString().padStart(2, '0')}`;
    } else if (i % 7 === 4) {
      obs_comprador = 'Verificar estoque';
    }

    requisicoes.push({
      ri,
      requisicao_de_compra: reqNo,
      item_reqc: itemNo,
      material_code: material.material_code,
      texto_breve: material.description,
      qtd_requisicao: (i % 5 + 1) * 50 + (i % 10) * 10,
      unidade_medida: material.unit,
      grupo_comprador,
      data_solicitacao,
      data_remessa,
      requisitante_name,
      tipo_documento,
      codigo_de_eliminacao: i === 99, // Soft delete item 99
      presente_ultima_carga: true,
      campos_extras: {
        Grupo_Mercadoria: 'M_ESTRUTURAL_01',
        Divisao: '1000',
        Depósito: '0001',
        Criado_por: 'SAP_BATCH'
      },
      obs_comprador,
      data_entrega_prevista
    });

    // Generate PO (ZL0132) for about 60% of them
    if (i <= 60) {
      const poNo = (4600000000 + i).toString();
      const poDay = (reqDay + 3) % 28 + 1;
      const poMonth = reqDay + 3 > 28 ? (reqMonth === '05' ? '06' : '07') : reqMonth;
      const data_pedido = `2026-${poMonth}-${poDay.toString().padStart(2, '0')}`;

      const sapDelivDay = (poDay + 10) % 28 + 1;
      const sapDelivMonth = poDay + 10 > 28 ? (poMonth === '05' ? '06' : (poMonth === '06' ? '07' : '08')) : poMonth;
      const data_entrega_sap = `2026-${sapDelivMonth}-${sapDelivDay.toString().padStart(2, '0')}`;

      const fornecedores = [
        { code: '300012', name: 'AÇO BRASIL DISTRIBUIDORA S/A' },
        { code: '300045', name: 'METALÚRGICA NORDESTE LTDA' },
        { code: '300088', name: 'FIXACAMP COMÉRCIO DE PARAFUSOS' },
        { code: '300104', name: 'ELÉTRICA JACOBINA EIRELI' },
        { code: '300210', name: 'QUÍMICA INDUSTRIAL BA S/A' },
        { code: '300305', name: 'SOUZA AUTOMATIZAÇÃO INDUSTRIAL' }
      ];
      const forn = fornecedores[i % fornecedores.length];

      pedidos.push({
        ri,
        documento_compra: poNo,
        item_pedido: itemNo,
        fornecedor_code: forn.code,
        fornecedor_name: forn.name,
        data_pedido,
        data_entrega_sap,
        campos_extras: {
          UMP: material.unit,
          Moeda: 'BRL',
          Preço_Líquido: (i % 10 + 1) * 45.5,
          Criado_por: 'COMPRADOR_' + grupo_comprador
        }
      });
    }
  }

  return { requisicoes, pedidos };
}
