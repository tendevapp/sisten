import { describe, expect, it } from 'vitest';
import { chamadaIdempotente, RPC_IDEMPOTENTE } from './idempotencia';

const CHAVE = '00000000-0000-4000-8000-000000000001';

describe('chamadaIdempotente', () => {
  it('troca a RPC pelo porteiro e embrulha os argumentos com a chave', () => {
    const r = chamadaIdempotente('/rest/v1/rpc/alm_req_balcao_salvar', 'alm_req_balcao_salvar', '{"p_id":null,"p_req":{"a":1}}', CHAVE);
    expect(r?.caminho).toBe(`/rest/v1/rpc/${RPC_IDEMPOTENTE}`);
    expect(JSON.parse(r!.corpo)).toEqual({ p_chave: CHAVE, p_rpc: 'alm_req_balcao_salvar', p_args: { p_id: null, p_req: { a: 1 } } });
  });

  it('mantém a query string', () => {
    const r = chamadaIdempotente('/rest/v1/rpc/alm_inv_criar?select=*', 'alm_inv_criar', '{}', CHAVE);
    expect(r?.caminho).toBe(`/rest/v1/rpc/${RPC_IDEMPOTENTE}?select=*`);
  });

  it('corpo vazio vira argumentos vazios', () => {
    const r = chamadaIdempotente('/rest/v1/rpc/x', 'x', '', CHAVE);
    expect(JSON.parse(r!.corpo).p_args).toEqual({});
  });

  it('não embrulha corpo que não é objeto, nome que não bate ou o próprio porteiro', () => {
    expect(chamadaIdempotente('/rest/v1/rpc/x', 'x', '[1,2]', CHAVE)).toBeNull();
    expect(chamadaIdempotente('/rest/v1/rpc/x', 'x', 'não é json', CHAVE)).toBeNull();
    expect(chamadaIdempotente('/rest/v1/rpc/x_maior', 'x', '{}', CHAVE)).toBeNull();
    expect(chamadaIdempotente(`/rest/v1/rpc/${RPC_IDEMPOTENTE}`, RPC_IDEMPOTENTE, '{}', CHAVE)).toBeNull();
  });
});
