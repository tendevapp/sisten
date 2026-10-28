import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  upload: vi.fn(), remove: vi.fn(), upsert: vi.fn(), compress: vi.fn(),
}));
vi.mock('../db/supabaseClient', () => ({ supabase: {
  from: () => ({ upsert: mock.upsert }),
  storage: { from: () => ({ upload: mock.upload, remove: mock.remove }) },
} }));
vi.mock('./imageCompression', () => ({ comprimirImagemUpload: mock.compress }));

import { salvarLinkMercadoLivre } from './compraMercadoLivreApi';

const item = { ri: '123/10', rm: '123', item_reqc: '10', material_code: null, texto_breve: 'Cabo', qtd: 2, unidade: 'UN' };
const usuario = { id: 'comprador', nome: 'Comprador' };

describe('comprovante Mercado Livre na Central', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.upload.mockResolvedValue({ error: null });
    mock.remove.mockResolvedValue({ error: null });
    mock.upsert.mockResolvedValue({ error: null });
  });

  it('editar somente o link preserva o comprovante e o número da compra', async () => {
    await salvarLinkMercadoLivre(item, 'https://mercadolivre.com.br/a', usuario, true);
    const payload = mock.upsert.mock.calls[0][0];
    expect(payload).not.toHaveProperty('comprovante');
    expect(payload).not.toHaveProperty('numero_compra');
    expect(mock.upload).not.toHaveBeenCalled();
  });

  it('comprime antes do upload e grava o MIME e tamanho dos bytes enviados', async () => {
    const file = new File(['imagem original'], 'print.png', { type: 'image/png' });
    const comprimido = new Blob(['jpg'], { type: 'image/jpeg' });
    mock.compress.mockResolvedValue(comprimido);
    await salvarLinkMercadoLivre(item, 'https://mercadolivre.com.br/a', usuario, false, file);
    expect(mock.upload.mock.calls[0][1]).toBe(comprimido);
    expect(mock.compress.mock.invocationCallOrder[0]).toBeLessThan(mock.upload.mock.invocationCallOrder[0]);
    expect(mock.upsert.mock.calls[0][0].comprovante).toMatchObject({
      nome: 'print.jpg', mime_type: 'image/jpeg', tamanho_bytes: 3,
      path: mock.upload.mock.calls[0][0],
    });
  });

  it('remover o vínculo na Central preserva o arquivo de cotações anteriores', async () => {
    await salvarLinkMercadoLivre(item, 'https://mercadolivre.com.br/a', usuario, true, null);
    expect(mock.upsert.mock.calls[0][0].comprovante).toBeNull();
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it('falha de upload não altera o item', async () => {
    const file = new File(['png'], 'print.png', { type: 'image/png' });
    mock.compress.mockResolvedValue(file);
    mock.upload.mockResolvedValue({ error: { message: 'Sem conexão' } });
    await expect(salvarLinkMercadoLivre(item, 'https://mercadolivre.com.br/a', usuario, true, file)).rejects.toThrow('Sem conexão');
    expect(mock.upsert).not.toHaveBeenCalled();
  });
});
