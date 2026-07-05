/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Material, MaterialCategory } from '../types';

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  { id: '1', name: 'CHAPAS', keywords: ['CHAPA', 'PLACA', 'PERFIL', 'VIGA'] },
  { id: '2', name: 'PARAFUSOS E FIXADORES', keywords: ['PARAFUSO', 'PORCA', 'ARRUELA', 'CHAVETA', 'PRISIONEIRO'] },
  { id: '3', name: 'CABOS E CONECTORES', keywords: ['CABO', 'FIO', 'CONECTOR', 'TERMINAL', 'DISJUNTOR', 'CONTATORA'] },
  { id: '4', name: 'EPI E SEGURANÇA', keywords: ['EPI', 'MÁSCARA', 'LUVA', 'ÓCULOS', 'PROTETOR', 'BOTINA', 'CINTO'] },
  { id: '5', name: 'PINTURA E QUÍMICOS', keywords: ['TINTA', 'PRIMER', 'SOLVENTE', 'GRAXA', 'ÓLEO', 'SILICONE'] },
  { id: '6', name: 'AUTOMAÇÃO E SENSORES', keywords: ['SENSOR', 'INDUTIVO', 'CLP', 'RELE', 'INVERSOR', 'IHM'] },
  { id: '7', name: 'VALVULAS E TUBULAÇÕES', keywords: ['VALVULA', 'TUBO', 'CONEXÃO', 'FLANGE', 'MANGUEIRA'] },
  { id: '8', name: 'OUTROS', keywords: [] }
];

export function getAutoCategory(description: string): string {
  const upperDesc = description.toUpperCase();
  for (const cat of MATERIAL_CATEGORIES) {
    if (cat.name === 'OUTROS') continue;
    for (const kw of cat.keywords) {
      if (upperDesc.includes(kw)) {
        return cat.name;
      }
    }
  }
  return 'OUTROS';
}

// Generate exactly 200 realistic materials based on the company's wind tower manufacturing business
export function generateMaterials(): Material[] {
  const materials: Material[] = [];

  const bases = [
    { cat: 'CHAPAS', desc: 'CHAPA AÇO GALVANIZADO 1050 x 2000 x {thick}MM', text: 'CHAPA ACO GALV 1050X2000X{thick}MM PT-12', unit: 'UN' },
    { cat: 'CHAPAS', desc: 'PERFIL METÁLICO ESTRUTURAL U {size}MM', text: 'PERFIL U DOBRADO {size}MM CHAPA 1/4', unit: 'M' },
    { cat: 'PARAFUSOS E FIXADORES', desc: 'PARAFUSO M{size} X {len} CLASSE 8.8 ZINCADO', text: 'PARAF M{size}X{len} 8.8 ZN ISO 4017', unit: 'KG' },
    { cat: 'PARAFUSOS E FIXADORES', desc: 'PORCA SEXTAVADA PESADA M{size} GRAU 8 ZN', text: 'PORCA SEXT M{size} CLASSE 8 ZINCADA', unit: 'UN' },
    { cat: 'CABOS E CONECTORES', desc: 'CABO FLEXÍVEL {cond}MM² 450/750V PRETO', text: 'CABO FLEX {cond}MM² SILICONADO ALTA TEMP', unit: 'M' },
    { cat: 'CABOS E CONECTORES', desc: 'DISJUNTOR TRIPOLAR DIN {amp}A CURVA C', text: 'DISJ DIN TRIPO {amp}A 10KA IEC 60898', unit: 'UN' },
    { cat: 'EPI E SEGURANÇA', desc: 'LUVA NITRÍLICA ANTI-CORTE TAM {size}', text: 'LUVA SEGURANÇA ADERENTE PU RESISTENTE', unit: 'UN' },
    { cat: 'EPI E SEGURANÇA', desc: 'CINTO DE SEGURANÇA TIPO PARAQUEDISTA 3 PONTOS', text: 'CINTO ERGONOMICO CONFORTO C/ TALABARTE', unit: 'UN' },
    { cat: 'PINTURA E QUÍMICOS', desc: 'TINTA EPOXI POLIURETANO {color} GALÃO 3.6L', text: 'TINTA BI-COMPONENTE ALTO SOLIDO {color}', unit: 'UN' },
    { cat: 'PINTURA E QUÍMICOS', desc: 'GRAXA SINTÉTICA PARA ROLAMENTOS DE CARGA AZUL', text: 'GRAXA INDUSTRIAL EP2 ALTA VISCOSIDADE', unit: 'KG' },
    { cat: 'AUTOMAÇÃO E SENSORES', desc: 'SENSOR INDUTIVO M{size} NPN NF SENS: 4MM', text: 'SENSOR APROXIMACAO CILINDRICO METALICO NF', unit: 'UN' },
    { cat: 'VALVULAS E TUBULAÇÕES', desc: 'MANGUEIRA HIDRÁULICA SAE 100R2 1/2"', text: 'MANG HIDR SAE100R2 1/2" ALTA PRESSAO', unit: 'M' },
    { cat: 'VALVULAS E TUBULAÇÕES', desc: 'VÁLVULA DE ESFERA MONOBLOCO 1" BSP', text: 'VALV ESFERA LATÃO CROMADO PASSAGEM PLENA', unit: 'UN' },
  ];

  for (let i = 1; i <= 200; i++) {
    const baseIdx = i % bases.length;
    const base = bases[baseIdx];
    const code = (10000000 + i).toString(); // 8 digits starting with 10000001
    
    // Create variables to fill placeholders
    const thick = (i % 5) + 2;
    const size = (i % 20) + 8;
    const len = ((i % 5) + 1) * 20;
    const cond = [2.5, 4.0, 6.0, 10.0, 16.0, 25.0, 35.0, 50.0][i % 8];
    const amp = [10, 16, 20, 32, 40, 63, 80, 100][i % 8];
    const colors = ['CINZA MUNSELL', 'BRANCO SEGURANÇA', 'VERMELHO SEGURANÇA', 'AMARELO SEGURANÇA'];
    const color = colors[i % colors.length];

    let desc = base.desc
      .replace('{thick}', thick.toString())
      .replace('{size}', size.toString())
      .replace('{len}', len.toString())
      .replace('{cond}', cond.toString())
      .replace('{amp}', amp.toString())
      .replace('{color}', color);

    let text = base.text
      .replace('{thick}', thick.toString())
      .replace('{size}', size.toString())
      .replace('{len}', len.toString())
      .replace('{cond}', cond.toString())
      .replace('{amp}', amp.toString())
      .replace('{color}', color);

    // Some specific items from screenshots to make it match exactly!
    if (i === 1) {
      desc = 'CHAPA AÇO GALVANIZADO 1050 x 2000 x 3MM';
      text = 'CHAPA ACO GALV 1050X2000X3.0MM';
    } else if (i === 2) {
      desc = 'PARAFUSO M16 X 60 CLASSE 8.8 ZINCADO';
      text = 'PARAF M16X60 8.8 ZN';
    } else if (i === 3) {
      desc = 'CABO FLEXÍVEL 6MM² 450/750V PRETO';
      text = 'CABO FLEX 6MM 450/750V PT';
    } else if (i === 4) {
      desc = 'ELETRODO SOLDA AWS E7018 3.25MM';
      text = 'ELET AWS E7018 3.25';
    } else if (i === 5) {
      desc = 'TINTA EPOXI PRIMER ZINCO 2K 20L';
      text = 'TINTA EPOXI ZN 2K 20L';
    } else if (i === 6) {
      desc = 'JUNTA DE VEDAÇÃO NEOPRENE 50x3MM';
      text = 'JUNTA NEOPRENE 50X3';
    } else if (i === 7) {
      desc = 'CHAVE CANHÃO 17MM';
      text = 'CHAVE CANHAO 17';
    } else if (i === 8) {
      desc = 'LUVA NITRÍLICA ANTI-CORTE TAM M';
      text = 'LUVA NITRIL AC M';
    } else if (i === 9) {
      desc = 'MANGUEIRA HIDRÁULICA SAE 100R2 1/2"';
      text = 'MANG HIDR SAE100R2 1/2';
    } else if (i === 10) {
      desc = 'SENSOR INDUTIVO M12 NPN NO';
      text = 'SENS IND M12 NPN NO';
    }

    const company: 'TEN2' | 'AG' = i % 3 === 0 ? 'AG' : 'TEN2';

    materials.push({
      id: i.toString(),
      material_code: code,
      description: desc,
      technical_text: text,
      category: getAutoCategory(desc),
      company,
      unit: base.unit,
      is_active: true,
      created_at: '2026-01-01T08:00:00-03:00'
    });
  }

  return materials;
}
