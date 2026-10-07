import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { lerPlanilhaTramos, montarLoteCatalogoTramos } from './producaoTramosImportacao';

const DATA_INICIO = '2026-04-22';
const DATA_NAV02 = '2026-05-01';
const DATA_JATO = '2026-06-11';
const DATA_PATIO = '2026-08-12';
const DATA_EXPEDIDO = '2026-08-27';

function criarPlanilhaTramos(): ArrayBuffer {
  const torre = Array.from({ length: 120 }, () => Array(12).fill(undefined));
  torre[2] = ['TORRE', 'T1', 'T2', 'T3', 'T4', 'T5'];
  torre[0][10] = 'Sequencial';
  torre[0][11] = 'Tramo';

  const cadastro: Array<{ sequencial: number; tramo: string }> = [];
  for (let torreNumero = 1; torreNumero <= 23; torreNumero += 1) {
    torre[torreNumero + 2][0] = torreNumero;
    for (let tramoNumero = 1; tramoNumero <= 5; tramoNumero += 1) {
      const sequencial = torreNumero === 8 && tramoNumero === 5
        ? 3102
        : 3143 + ((torreNumero - 1) * 5) + (tramoNumero - 1);
      torre[torreNumero + 2][tramoNumero] = sequencial;
      cadastro.push({ sequencial, tramo: `T${tramoNumero}` });
    }
  }

  cadastro.forEach((item, indice) => {
    const sequencial = item.sequencial === 3102 ? 3202 : item.sequencial;
    torre[indice + 1][10] = sequencial;
    torre[indice + 1][11] = item.tramo;
  });

  const tramos: unknown[][] = [
    ['', '', 'Setor', 'Tramo', 'Sequencial', 'Atividade', 'Reparo de Solda', 'Inicio', 'Liberado P/ NAV02', '', '', 'Liberado P/ Jato', '', '', '', 'Liberado P/ Pátio', '', '', '', '', 'Expedido'],
  ];
  const sequenciais = cadastro.map(item => (item.sequencial === 3102 ? 3202 : item.sequencial));
  for (let indice = 0; indice < 98; indice += 1) {
    const sequencial = sequenciais[indice];
    const tramo = cadastro.find(item => (item.sequencial === 3102 ? 3202 : item.sequencial) === sequencial)?.tramo;
    tramos.push([
      '', '', indice < 26 ? 'Expedido' : 'Jato', tramo, sequencial,
      indice < 26 ? 'Expedido' : 'Jato em Andamento', indice % 4,
      indice < 88 ? DATA_INICIO : undefined,
      indice < 80 ? DATA_NAV02 : undefined,
      '', '', indice < 62 ? DATA_JATO : undefined,
      '', '', '', indice < 36 ? DATA_PATIO : undefined,
      '', '', '', '', indice < 26 ? DATA_EXPEDIDO : undefined,
    ]);
  }

  const workbook = XLSX.utils.book_new();
  const torreSheet = XLSX.utils.aoa_to_sheet(torre);
  torreSheet.A5 = { t: 'n', f: 'A4+1', v: 2 as any };
  XLSX.utils.book_append_sheet(workbook, torreSheet, 'TORRE');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(tramos), 'TRAMOS');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

describe('lerPlanilhaTramos', () => {
  it('extrai somente os valores apontados e sinaliza a divergência 3102/3202', () => {
    const resultado = lerPlanilhaTramos(criarPlanilhaTramos());

    expect(resultado.cadastro).toHaveLength(115);
    expect(resultado.snapshots).toHaveLength(98);
    expect(resultado.totaisDiretos).toEqual({
      inicio: 88,
      liberadoNav02: 80,
      liberadoJato: 62,
      liberadoPatio: 36,
      expedido: 26,
    });
    expect(resultado.divergencias).toContainEqual(expect.objectContaining({
      codigo: 'CADASTRO_3102_3202',
      sequencial: 3202,
      bloqueante: false,
    }));
  });

  it('normaliza a confirmação de 3202 ao montar o lote auditável', () => {
    const resultado = lerPlanilhaTramos(criarPlanilhaTramos());
    const lote = montarLoteCatalogoTramos(resultado, 'a'.repeat(64), 'origem.xlsx');

    expect(lote.arquivo).toBe('origem.xlsx');
    expect(lote.sha256).toHaveLength(64);
    expect(lote.itens).toHaveLength(115);
    expect(lote.itens).toContainEqual(expect.objectContaining({ torreNumero: 8, tramo: 'T5', sequencial: 3202 }));
    expect(lote.itens.some(item => item.sequencial === 3102)).toBe(false);
  });
});
