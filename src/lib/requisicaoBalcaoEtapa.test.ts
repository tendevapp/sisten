import { describe, expect, it } from 'vitest';
import { etapaSapBalcao, itensSemDocParcial } from './requisicaoBalcaoEtapa';

describe('etapa da Requisição no Balcão até o SAP', () => {
  const it2 = (a: string | null, b: string | null) => [{ doc_sap: a }, { doc_sap: b }];

  it('segue não exportada → exportada → concluído', () => {
    expect(etapaSapBalcao({ itens: it2(null, null) })).toBe('nao_exportada');
    expect(etapaSapBalcao({ exportacao_id: 'e', itens: it2(null, null) })).toBe('exportada');
    expect(etapaSapBalcao({ exportacao_id: 'e', doc_sap: '4904074972', itens: it2('4904074972', '4904074972') })).toBe('concluida');
  });

  it('aguardando confirmação vem antes de tudo', () => {
    expect(etapaSapBalcao({ pendente_confirmacao: true, exportacao_id: 'e', itens: it2(null, null) })).toBe('aguardando');
  });

  it('doc. informado à mão na requisição conclui', () => {
    expect(etapaSapBalcao({ exportacao_id: 'e', doc_sap: '123', itens: it2(null, null) })).toBe('concluida');
  });

  it('importação parcial continua exportada, com os itens que faltam', () => {
    const r = { exportacao_id: 'e', doc_sap: '123', itens: it2('123', null) };
    expect(etapaSapBalcao(r)).toBe('exportada');
    expect(itensSemDocParcial(r)).toBe(1);
  });

  it('com doc. e sem exportação não volta para a planilha', () => {
    expect(etapaSapBalcao({ doc_sap: '123', itens: it2(null, null) })).toBe('concluida');
  });
});
