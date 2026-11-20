import { describe, expect, it } from 'vitest';
import { sugerirDocsSemSap, type CandidatosSemSap, type ItemSemDocMb51, type LinhaDocMb51 } from './requisicaoBalcaoDocProvavel';

/** "DD HH:MM" de novembro/2026 no horário de Brasília. */
const em = (dh: string) => `2026-11-${dh.slice(0, 2)}T${dh.slice(3)}:00-03:00`;

/** codigo|criada HH:MM|kind|material|dep|pep|qtd|exportações "DD HH:MM,..." */
function itens(txt: string, dia = '17'): ItemSemDocMb51[] {
  return txt.trim().split(/\s*;\s*/).map((l, i) => {
    const [codigo, criada, kind, material, dep, pep, qtd, exps] = l.split('|');
    return {
      requisicao_id: codigo, codigo, criado_em: em(`${dia} ${criada}`), item_id: `${codigo}#${i}`, ordem: i,
      kind: kind as 'S' | 'T', material, dep, dep_dest: null, pep: pep === '-' ? null : pep, qtd: Number(qtd),
      exportacoes: exps.split(',').map(em),
    };
  });
}

/** doc|"DD HH:MM"|kind|material|dep|pep|qtd */
function linhas(txt: string): LinhaDocMb51[] {
  return txt.trim().split(/\s*;\s*/).map((l) => {
    const [doc, quando, kind, material, dep, pep, qtd] = l.split('|');
    return { doc, instante: em(quando), kind: kind as 'S' | 'T', material, dep, pep: pep === '-' ? null : pep, qtd: Number(qtd) };
  });
}

// Recorte real de 17/11 (alm_rqb_sem_doc_candidatos): RQBs exportadas às 07:31 e
// às 08:21; a planilha das 07:31 virou 4904116382/383 e a das 08:21, 4904116637/638.
const ITENS_1711 = `
RQB-171126-01|07:21|S|1357022|0002|TEN001201090000|1|17 07:31;
RQB-171126-01|07:21|S|1044965|0002|TEN001201090000|1|17 07:31;
RQB-171126-02|07:25|T|1443846|0002|-|10|17 07:31;
RQB-171126-03|07:26|T|1173283|0002|-|32|17 07:31;
RQB-171126-04|07:26|T|1216098|0002|-|10|17 07:31;
RQB-171126-05|07:27|S|1132570|0004|TEN001202001606|1|17 07:31;
RQB-171126-06|07:29|S|1409640|0004|TEN001202001606|1|17 07:31;
RQB-171126-06|07:29|S|1436218|0004|TEN001202001606|1|17 07:31;
RQB-171126-06|07:29|S|1437957|0004|TEN001202001606|1|17 07:31;
RQB-171126-07|07:30|S|1194263|0002|TEN001134003000|2|17 07:31;
RQB-171126-07|07:30|S|1373439|0002|TEN001134003000|10|17 07:31;
RQB-171126-08|07:31|S|1352181|0002|TEN001134003000|1|17 07:31;
RQB-171126-08|07:31|S|1357288|0002|TEN001134003000|1|17 07:31;
RQB-171126-08|07:31|S|1434046|0002|TEN001134003000|1|17 07:31;
RQB-171126-09|07:34|S|1194263|0002|TEN001134003000|4|17 08:21;
RQB-171126-09|07:34|S|1487162|0002|TEN001134003000|1|17 08:21;
RQB-171126-09|07:34|S|1356435|0002|TEN001134003000|1|17 08:21;
RQB-171126-09|07:34|S|1044966|0002|TEN001134003000|1|17 08:21;
RQB-171126-11|07:36|S|1352434|0002|TEN001134003000|2|17 08:21;
RQB-171126-12|07:37|S|1352434|0002|TEN001134003000|3|17 08:21;
RQB-171126-12|07:37|S|1020179|0002|TEN001134003000|1|17 08:21;
RQB-171126-13|07:37|T|1354640|0004|-|16|17 08:21;
RQB-171126-14|07:37|S|1412253|0002|TEN001201090000|1|17 08:21;
RQB-171126-16|07:38|S|1357288|0002|TEN001134003000|1|17 08:21;
RQB-171126-18|07:40|S|1194263|0002|TEN001134003000|3|17 08:21;
RQB-171126-18|07:40|S|1357125|0002|TEN001134003000|1|17 08:21;
RQB-171126-19|07:42|S|1403496|0002|TEN001134003000|1|17 08:21;
RQB-171126-19|07:42|S|1408850|0002|TEN001134003000|1|17 08:21;
RQB-171126-19|07:42|S|1408710|0002|TEN001134003000|1|17 08:21;
RQB-171126-20|07:42|S|1194263|0002|TEN001134003000|1|17 08:21;
RQB-171126-22|07:44|S|1407228|0002|TEN001134003000|1|17 08:21;
RQB-171126-22|07:44|S|1386811|0002|TEN001134003000|1|17 08:21;
RQB-171126-22|07:44|S|1358947|0002|TEN001134003000|1|17 08:21;
RQB-171126-23|07:45|S|1194263|0002|TEN001134003000|2|17 08:21;
RQB-171126-23|07:45|S|1352181|0002|TEN001134003000|1|17 08:21;
RQB-171126-23|07:45|S|1291809|0002|TEN001134003000|1|17 08:21;
RQB-171126-23|07:45|S|1045921|0002|TEN001134003000|1|17 08:21;
RQB-171126-24|07:58|S|1352434|0002|TEN001201090000|3|17 08:21;
RQB-171126-25|07:58|S|1020178|0002|TEN001201090000|1|17 08:21`;

const LINHAS_1711 = `
4904116382|17 07:33|S|1132570|0004|TEN001202001606|1;
4904116382|17 07:33|S|1173028|0004|TEN001201016505|1;
4904116382|17 07:33|S|1194263|0002|TEN001134003000|2;
4904116382|17 07:33|S|1352181|0002|TEN001134003000|1;
4904116382|17 07:33|S|1357022|0002|TEN001201090000|1;
4904116382|17 07:33|S|1357288|0002|TEN001134003000|1;
4904116382|17 07:33|S|1373439|0002|TEN001134003000|10;
4904116382|17 07:33|S|1409640|0004|TEN001202001606|1;
4904116382|17 07:33|S|1434046|0002|TEN001134003000|1;
4904116382|17 07:33|S|1436218|0004|TEN001202001606|1;
4904116382|17 07:33|S|1437957|0004|TEN001202001606|1;
4904116382|17 07:33|S|1440267|0004|TEN001201016505|1;
4904116382|17 07:33|S|1442925|0004|TEN001202001606|1;
4904116383|17 07:34|T|1173283|0002|-|32;
4904116383|17 07:34|T|1216098|0002|-|10;
4904116383|17 07:34|T|1229445|0002|-|100;
4904116383|17 07:34|T|1443846|0002|-|10;
4904116635|17 08:00|S|1194263|0002|TEN001134003000|1;
4904116635|17 08:00|S|1373439|0002|TEN001134003000|5;
4904116635|17 08:00|S|1386811|0002|TEN001134003000|1;
4904116635|17 08:00|S|1407228|0002|TEN001134003000|1;
4904116637|17 08:21|S|1020178|0002|TEN001201090000|1;
4904116637|17 08:21|S|1020179|0002|TEN001134003000|1;
4904116637|17 08:21|S|1044966|0002|TEN001134003000|1;
4904116637|17 08:21|S|1045921|0002|TEN001134003000|1;
4904116637|17 08:21|S|1194263|0002|TEN001134003000|3;
4904116637|17 08:21|S|1194263|0002|TEN001134003000|1;
4904116637|17 08:21|S|1194263|0002|TEN001134003000|2;
4904116637|17 08:21|S|1194263|0002|TEN001134003000|4;
4904116637|17 08:21|S|1291809|0002|TEN001134003000|1;
4904116637|17 08:21|S|1352181|0002|TEN001134003000|1;
4904116637|17 08:21|S|1352434|0002|TEN001134003000|3;
4904116637|17 08:21|S|1352434|0002|TEN001134003000|2;
4904116637|17 08:21|S|1352434|0002|TEN001201090000|3;
4904116637|17 08:21|S|1356435|0002|TEN001134003000|1;
4904116637|17 08:21|S|1357125|0002|TEN001134003000|1;
4904116637|17 08:21|S|1357288|0002|TEN001134003000|1;
4904116637|17 08:21|S|1358947|0002|TEN001134003000|1;
4904116637|17 08:21|S|1386811|0002|TEN001134003000|1;
4904116637|17 08:21|S|1407228|0002|TEN001134003000|1;
4904116637|17 08:21|S|1408710|0002|TEN001134003000|1;
4904116637|17 08:21|S|1408850|0002|TEN001134003000|1;
4904116637|17 08:21|S|1412253|0002|TEN001201090000|1;
4904116638|17 08:21|T|1354640|0004|-|16`;

const base = (parcial: Partial<CandidatosSemSap>): CandidatosSemSap => ({
  mb51_ate: '2026-11-19', mb51_ultimo: '2026-11-19T11:36:25-03:00', itens: [], linhas: [], estornos: [], vinculados: [], ...parcial,
});

describe('doc. SAP mais provável — recorte real de 17/11', () => {
  const r = sugerirDocsSemSap(base({ itens: itens(ITENS_1711), linhas: linhas(LINHAS_1711) }));

  it('cada RQB da planilha das 08:21 vai para o 4904116637, que fecha nos dois sentidos', () => {
    for (const c of ['RQB-171126-11', 'RQB-171126-12', 'RQB-171126-14', 'RQB-171126-16', 'RQB-171126-18',
      'RQB-171126-20', 'RQB-171126-22', 'RQB-171126-23', 'RQB-171126-24', 'RQB-171126-25']) {
      expect(r.get(c), c).toMatchObject({ situacao: 'doc_confere', docs: ['4904116637'], docFecha: true, sobraNoDoc: 0 });
    }
    expect(r.get('RQB-171126-25')?.minutosAposExportacao).toBe(0);
    expect(r.get('RQB-171126-13')).toMatchObject({ situacao: 'doc_confere', docs: ['4904116638'] });
  });

  it('PEP separa as duas linhas de 3 macacões GG do mesmo documento', () => {
    expect(r.get('RQB-171126-24')?.pepDiferente).toBe(0);
    expect(r.get('RQB-171126-12')?.pepDiferente).toBe(0);
  });

  it('a planilha das 07:31 vai para o 4904116382/383; com linhas sem requisição, é só provável', () => {
    for (const c of ['RQB-171126-05', 'RQB-171126-06', 'RQB-171126-07', 'RQB-171126-08']) {
      expect(r.get(c), c).toMatchObject({ situacao: 'doc_provavel', docs: ['4904116382'], docFecha: false, sobraNoDoc: 3 });
    }
    for (const c of ['RQB-171126-02', 'RQB-171126-03', 'RQB-171126-04']) {
      expect(r.get(c), c).toMatchObject({ situacao: 'doc_provavel', docs: ['4904116383'], sobraNoDoc: 1 });
    }
  });

  it('a mesma linha não vai para duas RQBs: o 1352181 do 382 é da RQB-08 e o do 637 da RQB-23', () => {
    expect(r.get('RQB-171126-08')?.docs).toEqual(['4904116382']);
    expect(r.get('RQB-171126-23')?.docs).toEqual(['4904116637']);
  });

  it('item que nenhum documento tem deixa a RQB em parte', () => {
    expect(r.get('RQB-171126-01')).toMatchObject({ situacao: 'em_parte', encontrados: 1, itens: 2, docs: ['4904116382'] });
    expect(r.get('RQB-171126-09')).toMatchObject({ situacao: 'em_parte', encontrados: 3, itens: 4, docs: ['4904116637'] });
    expect(r.get('RQB-171126-19')).toMatchObject({ situacao: 'em_parte', encontrados: 2, itens: 3 });
  });
});

describe('doc. SAP mais provável — regras', () => {
  it('documento já inteiro com outra RQB não recebe mais nada (conta inversa)', () => {
    const r = sugerirDocsSemSap(base({
      itens: itens('RQB-171126-25|07:58|S|1020178|0002|TEN001201090000|1|17 08:21'),
      linhas: linhas('4904119447|19 11:35|S|1020178|0002|TEN001201090000|1'),
      vinculados: [{ docs: ['4904119447'], kind: 'S', material: '1020178', dep: '0002', pep: 'TEN001201090000', qtd: 1 }],
    }));
    expect(r.get('RQB-171126-25')).toMatchObject({ situacao: 'nao_encontrada', docs: [] });
  });

  it('linha estornada não serve', () => {
    const r = sugerirDocsSemSap(base({
      itens: itens('RQB-A|07:00|S|1|0002|-|5|17 07:10'),
      linhas: linhas('4900000001|17 07:15|S|1|0002|-|5'),
      estornos: [{ doc: '4900000002', instante: em('17 09:00'), kind: 'S', material: '1', dep: '0002', pep: null, qtd: 5 }],
    }));
    expect(r.get('RQB-A')?.situacao).toBe('nao_encontrada');
  });

  it('documento lançado antes da criação da requisição não é dela', () => {
    const r = sugerirDocsSemSap(base({
      itens: itens('RQB-A|08:00|S|1|0002|-|1|17 08:10'),
      linhas: linhas('4900000001|17 07:30|S|1|0002|-|1'),
    }));
    expect(r.get('RQB-A')?.situacao).toBe('nao_encontrada');
  });

  it('vence o documento lançado logo depois da exportação; o lançado antes fica como alternativa fraca', () => {
    const r = sugerirDocsSemSap(base({
      itens: itens('RQB-A|07:00|S|1|0002|-|1|17 08:00'),
      linhas: linhas('4900000001|17 07:30|S|1|0002|-|1; 4900000002|17 08:02|S|1|0002|-|1'),
    }));
    expect(r.get('RQB-A')).toMatchObject({
      situacao: 'doc_confere', docs: ['4900000002'], alternativas: ['4900000001'], ambigua: false, minutosAposExportacao: 2,
    });
  });

  it('dois documentos logo depois da exportação: a escolha é só provável', () => {
    const r = sugerirDocsSemSap(base({
      itens: itens('RQB-A|07:00|S|1|0002|-|1|17 08:00'),
      linhas: linhas('4900000001|17 08:01|S|1|0002|-|1; 4900000002|17 08:03|S|1|0002|-|1'),
    }));
    expect(r.get('RQB-A')).toMatchObject({ situacao: 'doc_provavel', docs: ['4900000001'], ambigua: true });
  });

  it('PEP diferente casa, mas só como provável', () => {
    const r = sugerirDocsSemSap(base({
      itens: itens('RQB-A|07:00|S|1|0002|TEN1|1|17 08:00'),
      linhas: linhas('4900000001|17 08:01|S|1|0002|TEN2|1'),
    }));
    expect(r.get('RQB-A')).toMatchObject({ situacao: 'doc_provavel', pepDiferente: 1 });
  });

  it('exportada depois do último lançamento importado: MB51 não importada', () => {
    const r = sugerirDocsSemSap(base({ itens: itens('RQB-A|12:00|S|1|0002|-|1|19 12:30', '19') }));
    expect(r.get('RQB-A')?.situacao).toBe('mb51_pendente');
  });
});
