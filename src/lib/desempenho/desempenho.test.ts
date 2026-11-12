import { describe, expect, it } from 'vitest';
import {
  AcumuladorDesempenho,
  CHAVE_OUTROS,
  LIMITE_LENTA_MS,
  MAX_ENDPOINTS,
  chaveEndpoint,
  normalizarPagina,
} from './acumulador';
import { diagnosticar, formatarBytes, formatarDuracao, nomeConsulta, type RetratoAgora } from './diagnostico';

const URL = 'https://abc.supabase.co';

describe('chaveEndpoint', () => {
  it('agrupa REST, RPC, Storage, Auth e funções', () => {
    expect(chaveEndpoint(`${URL}/rest/v1/vw_x?select=*&limit=1000`, 'get', URL)).toBe('GET vw_x');
    expect(chaveEndpoint(`${URL}/rest/v1/rpc/buscar_materiais`, 'POST', URL)).toBe('RPC buscar_materiais');
    expect(chaveEndpoint(`${URL}/storage/v1/object/sign/fotos/a/b.jpg`, 'POST', URL)).toBe('STORAGE assinar fotos');
    expect(chaveEndpoint(`${URL}/storage/v1/object/fotos/a/b.jpg`, 'POST', URL)).toBe('STORAGE enviar fotos');
    expect(chaveEndpoint(`${URL}/storage/v1/object/fotos/a/b.jpg`, 'GET', URL)).toBe('STORAGE baixar fotos');
    expect(chaveEndpoint(`${URL}/auth/v1/token?grant_type=refresh_token`, 'POST', URL)).toBe('AUTH token');
    expect(chaveEndpoint(`${URL}/functions/v1/enviar-email`, 'POST', URL)).toBe('FUNÇÃO enviar-email');
  });

  it('ignora o que não é do Supabase', () => {
    expect(chaveEndpoint('https://outro.com/rest/v1/x', 'GET', URL)).toBeNull();
    expect(chaveEndpoint(`${URL}/realtime/v1/websocket`, 'GET', URL)).toBeNull();
    expect(chaveEndpoint(`${URL}/rest/v1/x`, 'GET', '')).toBeNull();
  });
});

describe('normalizarPagina', () => {
  it('troca ids por :id e tira query', () => {
    expect(normalizarPagina('/compras/solicitacao/1234567?x=1')).toBe('/compras/solicitacao/:id');
    expect(normalizarPagina('/a/3f2b8c1e-1111-2222-3333-444455556666/')).toBe('/a/:id');
    expect(normalizarPagina('')).toBe('/');
  });
});

describe('AcumuladorDesempenho', () => {
  it('soma chamadas por endpoint e página, com lentas, erros e bytes', () => {
    const a = new AcumuladorDesempenho(0);
    a.registrarVisita('/central');
    a.registrarChamada({ endpoint: 'GET vw_x', pagina: '/central', ms: 120, erro: false, bytes: 1000 });
    a.registrarChamada({ endpoint: 'GET vw_x', pagina: '/central', ms: LIMITE_LENTA_MS + 1, erro: true });
    a.adicionarBytes('GET vw_x', '/central', 500);
    a.registrarTravamento(150, '/central'); // abaixo do limite: ignora
    a.registrarTravamento(800, '/central');

    const s = a.extrair(10);
    expect(s).toMatchObject({ inicio: 0, fim: 10, requisicoes: 2, lentas: 1, erros: 1, bytes: 1500, travamentos: 1, travamento_ms: 800 });
    expect(s.endpoints['GET vw_x']).toMatchObject({ n: 2, mx: LIMITE_LENTA_MS + 1, l: 1, e: 1, b: 1500, p: { '/central': 2 } });
    expect(s.paginas['/central']).toMatchObject({ v: 1, n: 2, b: 1500, tv: 1, tms: 800 });
    expect(a.temDados()).toBe(false);
  });

  it('põe o excedente de endpoints em OUTROS', () => {
    const a = new AcumuladorDesempenho(0);
    for (let i = 0; i < MAX_ENDPOINTS + 5; i++) a.registrarChamada({ endpoint: `GET t${i}`, pagina: '/', ms: 1, erro: false });
    const s = a.extrair(1);
    expect(Object.keys(s.endpoints)).toHaveLength(MAX_ENDPOINTS + 1);
    expect(s.endpoints[CHAVE_OUTROS].n).toBe(5);
  });

  it('mescla de volta uma janela que não subiu', () => {
    const a = new AcumuladorDesempenho(100);
    a.registrarChamada({ endpoint: 'RPC f', pagina: '/', ms: 50, erro: false, bytes: 10 });
    const falhou = a.extrair(200);
    a.registrarChamada({ endpoint: 'RPC f', pagina: '/', ms: 70, erro: false, bytes: 5 });
    a.mesclar(falhou);
    const s = a.extrair(300);
    expect(s.inicio).toBe(100);
    expect(s.requisicoes).toBe(2);
    expect(s.endpoints['RPC f']).toMatchObject({ n: 2, ms: 120, mx: 70, b: 15 });
  });
});

describe('nomeConsulta', () => {
  it('reconhece as formas do PostgREST', () => {
    expect(nomeConsulta('WITH pgrst_source AS ( SELECT "public"."vw_sap_requisicoes_enriquecidas".* FROM "public"."vw_sap_requisicoes_enriquecidas" WHERE')).toEqual({
      alvo: 'vw_sap_requisicoes_enriquecidas',
      tipo: 'leitura',
    });
    expect(nomeConsulta('WITH pgrst_source AS (SELECT pgrst_call.pgrst_scalar FROM (SELECT "public"."refresh_material_sinais"() pgrst_scalar) pgrst_call)')).toEqual({
      alvo: 'refresh_material_sinais',
      tipo: 'função',
    });
    expect(nomeConsulta('WITH pgrst_source AS (INSERT INTO "public"."ops_eventos_uso"("email") SELECT')).toEqual({ alvo: 'ops_eventos_uso', tipo: 'inclusão' });
    expect(nomeConsulta('WITH pgrst_source AS (DELETE FROM "public"."sap_fbl1n_pagar" WHERE')).toEqual({ alvo: 'sap_fbl1n_pagar', tipo: 'exclusão' });
    expect(nomeConsulta('REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_historico_pedidos')).toEqual({ alvo: 'mv_historico_pedidos', tipo: 'refresh' });
    expect(nomeConsulta('')).toEqual({ alvo: '—', tipo: '' });
  });
});

function retrato(over: Partial<RetratoAgora> = {}): RetratoAgora {
  return {
    em: '2026-11-11T12:00:00Z',
    max_conexoes: 60,
    statement_timeout: null,
    conexoes: [{ usuario: 'authenticator', app: 'PostgREST', estado: 'idle', n: 10 }],
    processos: [],
    banco: { tamanho_bytes: 1, cache_hit: 99, temp_bytes: 0, temp_arquivos: 0, deadlocks: 0, commits: 0, rollbacks: 0, desde: null },
    ultima_amostra: '2026-11-11T12:00:00Z',
    coletor: null,
    online: [],
    ...over,
  };
}

describe('diagnosticar', () => {
  const agora = new Date('2026-11-11T12:00:30Z').getTime();

  it('sem problema, sem alerta', () => {
    expect(diagnosticar(retrato(), agora)).toEqual([]);
  });

  it('agrupa consultas lentas pelo alvo e aponta quem trava', () => {
    const q = 'SELECT "public"."vw_x".* FROM "public"."vw_x"';
    const alertas = diagnosticar(
      retrato({
        processos: [
          { pid: 1, usuario: 'authenticator', app: null, estado: 'active', espera_tipo: null, espera: null, dur_s: 12, tx_s: 12, bloqueado_por: [], consulta: q },
          { pid: 2, usuario: 'authenticator', app: null, estado: 'active', espera_tipo: null, espera: null, dur_s: 8, tx_s: 8, bloqueado_por: [], consulta: q },
          { pid: 3, usuario: 'authenticator', app: null, estado: 'active', espera_tipo: 'Lock', espera: 'relation', dur_s: 2, tx_s: 2, bloqueado_por: [9], consulta: q },
          { pid: 9, usuario: 'postgres', app: null, estado: 'active', espera_tipo: null, espera: null, dur_s: 3, tx_s: 3, bloqueado_por: [], consulta: 'REFRESH MATERIALIZED VIEW public.mv_y' },
        ],
      }),
      agora,
    );
    expect(alertas[0].nivel).toBe('critico');
    expect(alertas[0].detalhe).toContain('mv_y (refresh)');
    const lentas = alertas.find(a => a.titulo.includes('mais de 5 s'));
    expect(lentas?.titulo).toContain('2 consulta');
    expect(lentas?.detalhe).toContain('2× vw_x (leitura)');
  });

  it('avisa conexões perto do limite e coletor parado', () => {
    const alertas = diagnosticar(
      retrato({ conexoes: [{ usuario: 'authenticator', app: null, estado: 'active', n: 58 }], ultima_amostra: '2026-11-11T11:50:00Z' }),
      agora,
    );
    expect(alertas.map(a => a.titulo)).toEqual(['Conexões em 97% do limite', 'Coletor de amostras parado']);
  });
});

describe('formatos', () => {
  it('bytes e duração', () => {
    expect(formatarBytes(512)).toBe('512 B');
    expect(formatarBytes(1536)).toBe('1,5 KB');
    expect(formatarBytes(5 * 1024 ** 3)).toBe('5 GB');
    expect(formatarDuracao(850)).toBe('850 ms');
    expect(formatarDuracao(7845)).toBe('7,8 s');
    expect(formatarDuracao(152_221)).toBe('2,5 min');
  });
});
