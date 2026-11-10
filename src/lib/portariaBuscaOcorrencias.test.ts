import { describe, expect, it } from 'vitest';
import { ocorrenciaCombina, palavrasBusca, trechosDestacados } from './portariaBuscaOcorrencias';

const oc = (descricao: string, extra: Record<string, unknown> = {}) => ({
  descricao, vigilante: 'CARLOS', local_setor: 'PORTARIA' as const, ...extra,
});

const DESC = '13:06:00 - EDSON CALIXTO DA SILVA (027.778.524-30) [MOTORISTA] - TRANSPES, acessou a fábrica, autorizado por LEOBALDO';

describe('busca no conteúdo das ocorrências', () => {
  it('ignora maiúsculas e acentos', () => {
    expect(ocorrenciaCombina(oc(DESC), 'fabrica')).toBe(true);
    expect(ocorrenciaCombina(oc(DESC), 'Calixto')).toBe(true);
    expect(ocorrenciaCombina(oc('JOÃO PEDRO'), 'joao')).toBe(true);
  });

  it('várias palavras precisam aparecer todas, em qualquer ordem', () => {
    expect(ocorrenciaCombina(oc(DESC), 'leobaldo edson')).toBe(true);
    expect(ocorrenciaCombina(oc(DESC), 'leobaldo maria')).toBe(false);
  });

  it('CPF e placa casam com ou sem pontuação', () => {
    expect(ocorrenciaCombina(oc(DESC), '02777852430')).toBe(true);
    expect(ocorrenciaCombina(oc(DESC), '027.778')).toBe(true);
    expect(ocorrenciaCombina(oc('Placa: RPN-3C38'), 'rpn3c38')).toBe(true);
    expect(ocorrenciaCombina(oc(DESC), '99')).toBe(false);
  });

  it('procura também no vigilante e nos campos estruturados', () => {
    expect(ocorrenciaCombina(oc('ENTRADA'), 'carlos')).toBe(true);
    expect(ocorrenciaCombina(oc('ENTRADA', { empresa: 'ATLANTA' }), 'atlanta')).toBe(true);
    expect(ocorrenciaCombina(oc('ENTRADA', { pessoas: [{ nome: 'JAQUELINE BANDERA' }] }), 'bandera')).toBe(true);
  });

  it('termo vazio casa com tudo', () => {
    expect(ocorrenciaCombina(oc(DESC), '   ')).toBe(true);
    expect(palavrasBusca('  a  b ')).toEqual(['a', 'b']);
  });

  it('destaca os trechos achados preservando o texto original', () => {
    const t = trechosDestacados('Acessou a FÁBRICA às 13h', 'fabrica 13');
    expect(t.map((x) => x.texto).join('')).toBe('Acessou a FÁBRICA às 13h');
    expect(t.filter((x) => x.achado).map((x) => x.texto)).toEqual(['FÁBRICA', '13']);
    expect(trechosDestacados('abc', '')).toEqual([{ texto: 'abc', achado: false }]);
  });

  it('destaca todas as ocorrências da palavra', () => {
    const t = trechosDestacados('CARRETA RPN3C38 CARRETA', 'carreta');
    expect(t.filter((x) => x.achado)).toHaveLength(2);
  });
});
