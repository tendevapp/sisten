import { describe, expect, it } from 'vitest';
import { conferirAntesDeExportar, mensagemConflitoExportacao } from './requisicaoBalcaoExportacao';

const r = (id: string, exportacao_id: string | null = null, extra: Record<string, unknown> = {}) => ({ id, codigo: `RQB-${id}`, exportacao_id, pendente_confirmacao: false, ...extra });

describe('antes de exportar, confere no servidor (duas pessoas exportando ao mesmo tempo)', () => {
  it('tudo ainda sem exportar: segue com as linhas atuais do servidor', () => {
    const tela = [r('1'), r('2')];
    const servidor = [r('1'), r('2')];
    expect(conferirAntesDeExportar(tela, servidor)).toEqual({ ok: true, reexportar: [], atuais: servidor });
  });
  it('outra pessoa exportou depois que a lista carregou: bloqueia e diz quais', () => {
    const res = conferirAntesDeExportar([r('1'), r('2')], [r('1', 'lote-ayron'), r('2')]);
    expect(res).toMatchObject({ ok: false, jaExportadas: ['RQB-1'] });
  });
  it('a que a pessoa já via como exportada e confirmou "Exportar de novo" segue, e só ela vai como reexportação', () => {
    const res = conferirAntesDeExportar([r('1', 'lote-a'), r('2')], [r('1', 'lote-a'), r('2')]);
    expect(res).toMatchObject({ ok: true, reexportar: ['1'] });
  });
  it('a que estava num lote e foi parar noutro lote depois: bloqueia (alguém exportou de novo)', () => {
    expect(conferirAntesDeExportar([r('1', 'lote-a')], [r('1', 'lote-b')])).toMatchObject({ ok: false, jaExportadas: ['RQB-1'] });
  });
  it('excluída ou que voltou a pendente enquanto isso: bloqueia', () => {
    expect(conferirAntesDeExportar([r('1'), r('2')], [r('2')])).toMatchObject({ ok: false, sumiram: ['RQB-1'] });
    expect(conferirAntesDeExportar([r('1')], [r('1', null, { pendente_confirmacao: true })])).toMatchObject({ ok: false, pendentes: ['RQB-1'] });
  });
  it('mensagem fala para não lançar e atualizar', () => {
    const msg = mensagemConflitoExportacao({ ok: false, jaExportadas: ['RQB-1', 'RQB-2'], sumiram: [], pendentes: [] });
    expect(msg).toMatch(/RQB-1, RQB-2/);
    expect(msg).toMatch(/já foram exportadas/i);
  });
});
