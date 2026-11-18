import { describe, expect, it } from 'vitest';
import { extraordinariasPorFicha, itemSaiuExtraordinario, type RssDeFicha } from './fichaEpiBaixas';

const rss = (o: Partial<RssDeFicha>): RssDeFicha => ({
  codigo: 'RSS-181126-01', origem_id: 'f1', origem_ref: 'EPI-181126-01', itens: [{ material: '001356010' }], ...o,
});

describe('itens de ficha que saíram por extraordinária', () => {
  it('agrupa pela ficha e casa o item pelo código SAP', () => {
    const mapa = extraordinariasPorFicha([rss({}), rss({ codigo: 'RSS-2', itens: [{ material: '1280971' }] })]);
    expect(mapa.get('f1')?.codigos).toEqual(['RSS-181126-01', 'RSS-2']);
    expect(itemSaiuExtraordinario(mapa, 'f1', '1356010')).toBe(true);
    expect(itemSaiuExtraordinario(mapa, 'f1', '1280971')).toBe(true);
    expect(itemSaiuExtraordinario(mapa, 'f1', '9999')).toBe(false);
    expect(itemSaiuExtraordinario(mapa, 'f2', '1356010')).toBe(false);
    expect(itemSaiuExtraordinario(mapa, 'f1', null)).toBe(false);
  });

  it('RSS antiga sem origem_id casa pelo código da ficha', () => {
    const mapa = extraordinariasPorFicha(
      [rss({ origem_id: null, origem_ref: 'EPI-9' }), rss({ codigo: 'RSS-x', origem_id: null, origem_ref: 'EPI-sem-ficha' })],
      new Map([['EPI-9', 'f9']]),
    );
    expect([...mapa.keys()]).toEqual(['f9']);
  });
});
