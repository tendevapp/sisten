import { describe, expect, it } from 'vitest';
import { configBucket, configRpc, configTabela, rpcDeLeitura } from './configFormularios';

describe('bucket compartilhado: só a pasta do formulário entra na fila', () => {
  it('foto do Cadastro de Itens entra', () => {
    expect(configBucket('request-attachments', ['almox-catalogo/material-123-1.jpg'])).toBeDefined();
    expect(configBucket('request-attachments', ['/almox-catalogo/fotos/x.jpg'])).toBeDefined();
  });
  it('anexo das Solicitações, no mesmo bucket, vai direto ao servidor', () => {
    expect(configBucket('request-attachments', ['solicitacoes/123/nota.pdf'])).toBeUndefined();
    expect(configBucket('request-attachments', ['almox-catalogo/a.jpg', 'solicitacoes/b.pdf'])).toBeUndefined();
  });
  it('bucket sem pastas definidas entra inteiro', () => {
    expect(configBucket('ssma-desvios', ['qualquer/coisa.jpg'])).toBeDefined();
  });
});

describe('Cadastro de Itens e Inventário gravam offline', () => {
  it('tabelas do catálogo registradas', () => {
    expect(configTabela('alm_catalogo_itens')).toBeDefined();
    expect(configTabela('alm_catalogo_item_fotos')).toBeDefined();
  });
  it('contagem e encerramento auditados registrados', () => {
    expect(configRpc('alm_inv_registrar_contagem_auditada')).toBeDefined();
    expect(configRpc('alm_inv_encerrar_auditado')).toBeDefined();
  });
  it('atalho "Contar" sem rede põe o item na fila do inventário avulso', () => {
    const criar = configRpc('alm_inv_criar_auditado')!;
    expect(criar.criaRegistro).toBe(true);
    expect(criar.respostaProvisoria({ p_inv: {} }, 'prov-1')).toMatchObject({ id: 'prov-1', __offline: true });
    expect(configRpc('alm_inv_adicionar_reservados')!.respostaProvisoria({ p_itens: [{}, {}] }, 'x')).toBe(2);
  });
  it('consultas que as telas de campo fazem ao abrir ficam guardadas no aparelho', () => {
    for (const rpc of ['alm_inv_contexto_auditoria', 'alm_codigos_epi_book', 'alm_baixas_pendentes_por_material', 'alm_ultimo_movimento_por_material']) {
      expect(rpcDeLeitura(rpc)).toBe(true);
    }
  });
  it('contagem offline não afirma resultado: a resposta provisória vem marcada', () => {
    const r = configRpc('alm_inv_registrar_contagem_auditada')!.respostaProvisoria({ p_item_id: 'x' }, 'p');
    expect(r).toMatchObject({ __offline: true, status: 'pendente' });
  });
});

describe('Cadastro de Itens: material já cadastrado por outro aparelho junta, não trava', () => {
  it('registra o índice do código SAP e a junção', () => {
    const regra = configTabela('alm_catalogo_itens')?.duplicado;
    expect(regra?.indice).toBe('uq_alm_catalogo_itens_sap_ativo');
    expect(typeof regra?.mesclar).toBe('function');
  });
});
