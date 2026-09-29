import { describe, expect, it } from 'vitest';
import {
  aplicarEfeitos, atendeFiltro, corpoNoFormato, idDoFiltro, lerConsulta, lerEmbeds, lerFiltros, linhasAfetadas, substituirIds,
  type EfeitoPendente,
} from './postgrest';

const url = (q: string) => new URL(`https://x.supabase.co/rest/v1/port_controle_carretas?${q}`);

describe('offline dos formulários — PostgREST', () => {
  it('lê filtros, ordem e embeds da URL', () => {
    const consulta = lerConsulta(url('select=*,itens:rh_ase_itens!fk(*),setor:rh_setores (nome)&status=eq.NO_PATIO&excluido_em=is.null&order=data_entrada.desc,hora_entrada.desc.nullslast&limit=300'))!;
    expect(consulta.tabela).toBe('port_controle_carretas');
    expect(consulta.filtros).toEqual([
      { coluna: 'status', negado: false, operador: 'eq', valor: 'NO_PATIO' },
      { coluna: 'excluido_em', negado: false, operador: 'is', valor: 'null' },
    ]);
    expect(consulta.ordem).toEqual([{ coluna: 'data_entrada', desc: true, nullsFirst: undefined }, { coluna: 'hora_entrada', desc: true, nullsFirst: false }]);
    expect(consulta.embeds).toEqual([{ nome: 'itens', tabela: 'rh_ase_itens' }, { nome: 'setor', tabela: 'rh_setores' }]);
    expect(lerEmbeds('*')).toEqual([]);
  });

  it('ignora filtros de embed e lê o not', () => {
    expect(lerFiltros(new URLSearchParams('itens.excluido_em=is.null&codigo=not.is.null'))).toEqual([{ coluna: 'codigo', negado: true, operador: 'is', valor: 'null' }]);
  });

  it('avalia os operadores do PostgREST', () => {
    const linha = { status: 'NO_PATIO', peso: 12, data: '2026-09-29', codigo: 'EPI-290926-03', excluido_em: null };
    expect(atendeFiltro(linha, { coluna: 'status', negado: false, operador: 'eq', valor: 'NO_PATIO' })).toBe(true);
    expect(atendeFiltro(linha, { coluna: 'status', negado: false, operador: 'neq', valor: 'NO_PATIO' })).toBe(false);
    expect(atendeFiltro(linha, { coluna: 'status', negado: false, operador: 'in', valor: '(FINALIZADO,NO_PATIO)' })).toBe(true);
    expect(atendeFiltro(linha, { coluna: 'excluido_em', negado: false, operador: 'is', valor: 'null' })).toBe(true);
    expect(atendeFiltro(linha, { coluna: 'peso', negado: false, operador: 'gte', valor: '10' })).toBe(true);
    expect(atendeFiltro(linha, { coluna: 'peso', negado: false, operador: 'lt', valor: '9' })).toBe(false);
    expect(atendeFiltro(linha, { coluna: 'data', negado: false, operador: 'lte', valor: '2026-09-30' })).toBe(true);
    expect(atendeFiltro(linha, { coluna: 'codigo', negado: false, operador: 'like', valor: 'EPI-__0926-%' })).toBe(true);
    expect(atendeFiltro(linha, { coluna: 'codigo', negado: false, operador: 'ilike', valor: '*epi*' })).toBe(true);
    expect(atendeFiltro(linha, { coluna: 'status', negado: false, operador: 'fts', valor: 'x' })).toBe(true);
  });

  it('registro feito offline entra na lista certa, e a saída offline tira da lista "no pátio"', () => {
    const consulta = lerConsulta(url('select=*&status=eq.NO_PATIO&order=hora_entrada.desc'))!;
    const servidor = [{ id: 'a', status: 'NO_PATIO', hora_entrada: '08:00' }, { id: 'b', status: 'NO_PATIO', hora_entrada: '09:00' }];
    const efeitos: EfeitoPendente[] = [
      { tabela: 'port_controle_carretas', tipo: 'insert', linhas: [{ id: 'n1', status: 'NO_PATIO', hora_entrada: '10:00' }] },
      { tabela: 'port_controle_carretas', tipo: 'insert', linhas: [{ id: 'n2', status: 'FINALIZADO', hora_entrada: '11:00' }] },
      { tabela: 'port_controle_carretas', tipo: 'update', linhas: [{ status: 'FINALIZADO' }], filtros: [{ coluna: 'id', negado: false, operador: 'eq', valor: 'a' }] },
      { tabela: 'outra', tipo: 'insert', linhas: [{ id: 'z' }] },
    ];
    expect(aplicarEfeitos(servidor, consulta, efeitos).map(l => l.id)).toEqual(['n1', 'b']);
  });

  it('exclusão offline some da lista; sem ordem, o que nasceu no aparelho vai para o topo', () => {
    const consulta = lerConsulta(url('select=*'))!;
    const efeitos: EfeitoPendente[] = [
      { tabela: 'port_controle_carretas', tipo: 'insert', linhas: [{ id: 'n1' }] },
      { tabela: 'port_controle_carretas', tipo: 'delete', linhas: [{}], filtros: [{ coluna: 'id', negado: false, operador: 'eq', valor: 'a' }] },
    ];
    expect(aplicarEfeitos([{ id: 'a' }, { id: 'b' }], consulta, efeitos).map(l => l.id)).toEqual(['n1', 'b']);
  });

  it('filho criado offline aparece embutido no pai certo', () => {
    const consulta = { tabela: 'rh_ase_solicitacoes', filtros: [], ordem: [], embeds: [{ nome: 'itens', tabela: 'rh_ase_itens' }] };
    const efeitos: EfeitoPendente[] = [
      { tabela: 'rh_ase_itens', tipo: 'insert', linhas: [{ id: 'i2', solicitacao_id: 's1' }, { id: 'i3', solicitacao_id: 's2' }] },
      { tabela: 'rh_ase_solicitacoes', tipo: 'insert', linhas: [{ id: 's2' }] },
    ];
    const linhas = aplicarEfeitos([{ id: 's1', itens: [{ id: 'i1', solicitacao_id: 's1' }] }], consulta, efeitos);
    expect(linhas.find(l => l.id === 's1')?.itens).toEqual([{ id: 'i1', solicitacao_id: 's1' }, { id: 'i2', solicitacao_id: 's1' }]);
    expect(linhas.find(l => l.id === 's2')?.itens).toEqual([{ id: 'i3', solicitacao_id: 's2' }]);
    // Só o filho mudou: o pai passa pela mesma regra.
    const soFilho = aplicarEfeitos([{ id: 's1', itens: [] }], consulta, [efeitos[0]]);
    expect(soFilho[0].itens).toEqual([{ id: 'i2', solicitacao_id: 's1' }]);
  });

  it('acha a linha que um update offline altera', () => {
    const filtros = lerFiltros(new URLSearchParams('id=eq.b'));
    expect(idDoFiltro(filtros)).toBe('b');
    expect(linhasAfetadas([{ id: 'a' }, { id: 'b', x: 1 }, { id: 'b', x: 1 }], filtros)).toEqual([{ id: 'b', x: 1 }]);
  });

  it('responde no formato do .single()', () => {
    expect(corpoNoFormato([{ id: 'a' }], 'application/vnd.pgrst.object+json')).toEqual({ corpo: { id: 'a' }, status: 200 });
    expect(corpoNoFormato([], 'application/vnd.pgrst.object+json').status).toBe(406);
    expect(corpoNoFormato([{ id: 'a' }], 'application/json')).toEqual({ corpo: [{ id: 'a' }], status: 200 });
  });

  it('troca ids provisórios pelos reais em qualquer profundidade', () => {
    const prov = '11111111-1111-4111-8111-111111111111';
    const real = '22222222-2222-4222-8222-222222222222';
    expect(substituirIds({ p_item_id: prov, lista: [prov, 'x'], caminho: `/rest/v1/t?id=eq.${prov}` }, { [prov]: real }))
      .toEqual({ p_item_id: real, lista: [real, 'x'], caminho: `/rest/v1/t?id=eq.${real}` });
  });
});
