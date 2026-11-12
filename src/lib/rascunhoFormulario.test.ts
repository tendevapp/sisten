import { describe, expect, it } from 'vitest';
import {
  algumTextoPreenchido, assinaturaRascunho, chaveRascunho, idBlob, juntarBlobs, rascunhoExpirado, separarBlobs,
  VALIDADE_RASCUNHO_MS,
} from './rascunhoFormulario';

const foto = (nome: string, conteudo = 'abc') => new File([conteudo], nome, { type: 'image/jpeg', lastModified: 1_700_000_000_000 });

describe('separarBlobs / juntarBlobs', () => {
  it('tira os arquivos do objeto e devolve na volta', () => {
    const f1 = foto('a.jpg');
    const f2 = foto('b.jpg', 'outro conteúdo');
    const dados = { nome: 'JOÃO', fotos: [{ key: '1', file: f1 }, { key: '2', file: f2 }], assinatura: { img: 'data:x', em: 'y' } };
    const blobs = new Map<string, Blob>();
    const semBlobs = separarBlobs(dados, blobs);
    expect(blobs.size).toBe(2);
    expect(JSON.stringify(semBlobs)).not.toContain('"file":{}');
    expect((semBlobs as any).fotos[0].file).toEqual({ __rascunhoBlob: idBlob(f1) });
    const volta = juntarBlobs(JSON.parse(JSON.stringify(semBlobs)), blobs) as typeof dados;
    expect(volta.nome).toBe('JOÃO');
    expect(volta.fotos[0].file).toBe(f1);
    expect(volta.fotos[1].file).toBe(f2);
    expect(volta.assinatura).toEqual({ img: 'data:x', em: 'y' });
  });

  it('arquivo que sumiu vira null em vez de quebrar', () => {
    const blobs = new Map<string, Blob>();
    const semBlobs = separarBlobs({ file: foto('a.jpg') }, blobs);
    expect(juntarBlobs(semBlobs, new Map())).toEqual({ file: null });
  });

  it('mesmo arquivo duas vezes é guardado uma vez só', () => {
    const f = foto('a.jpg');
    const blobs = new Map<string, Blob>();
    separarBlobs([f, f], blobs);
    expect(blobs.size).toBe(1);
  });
});

describe('assinaturaRascunho', () => {
  it('muda quando o texto muda e não lê o conteúdo do arquivo', () => {
    const f = foto('a.jpg');
    const a = assinaturaRascunho({ nome: 'A', f });
    expect(assinaturaRascunho({ nome: 'A', f })).toBe(a);
    expect(assinaturaRascunho({ nome: 'B', f })).not.toBe(a);
    expect(a).toContain('blob:');
  });
});

describe('algumTextoPreenchido', () => {
  it('ignora os campos que nascem preenchidos', () => {
    const vazio = { empresa: '', data: '2026-11-12', hora: '10:00', vigilante: 'FULANO', observacoes: '  ' };
    expect(algumTextoPreenchido(vazio, ['data', 'hora', 'vigilante'])).toBe(false);
    expect(algumTextoPreenchido({ ...vazio, empresa: 'X' }, ['data', 'hora', 'vigilante'])).toBe(true);
    expect(algumTextoPreenchido(null)).toBe(false);
    expect(algumTextoPreenchido({ lista: [1] })).toBe(true);
    expect(algumTextoPreenchido({ ligado: true })).toBe(false);
  });
});

describe('rascunhoExpirado', () => {
  it('vale por 3 dias', () => {
    const agora = Date.parse('2026-11-12T12:00:00Z');
    expect(rascunhoExpirado('2026-11-12T11:00:00Z', agora)).toBe(false);
    expect(rascunhoExpirado(new Date(agora - VALIDADE_RASCUNHO_MS - 1).toISOString(), agora)).toBe(true);
    expect(rascunhoExpirado('lixo', agora)).toBe(true);
  });
});

describe('chaveRascunho', () => {
  it('é por usuário; sem usuário não guarda', () => {
    expect(chaveRascunho('u1', 'portaria-x')).toBe('u1:portaria-x');
    expect(chaveRascunho(null, 'portaria-x')).toBeNull();
  });
});
