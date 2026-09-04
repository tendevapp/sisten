import { describe, expect, it } from 'vitest';
import {
  calcularSemanaDoMes,
  formatarDataDDMMYY,
  gerarCodigoRegistroFormulario,
  gerarNumeroRegistroRid,
  SETORES_SSMA,
  SEMANAS_SSMA,
  AREAS_DESVIO_SSMA,
  RESPONSAVEIS_SEGURANCA_SSMA,
  COMPORTAMENTOS_INSEGUROS_SSMA,
  CONDICOES_INSEGURAS_SSMA,
  CONFIG_PERGUNTAS_PADRAO_RID,
  CONFIG_FORM_PADRAO_RID,
} from './ssmaApi';

describe('SSMA API & Constantes', () => {
  it('calcula a semana do mês corretamente', () => {
    expect(calcularSemanaDoMes('2026-09-01')).toBe('1ª SEMANA');
    expect(calcularSemanaDoMes('2026-09-07')).toBe('1ª SEMANA');
    expect(calcularSemanaDoMes('2026-09-08')).toBe('2ª SEMANA');
    expect(calcularSemanaDoMes('2026-09-14')).toBe('2ª SEMANA');
    expect(calcularSemanaDoMes('2026-09-15')).toBe('3ª SEMANA');
    expect(calcularSemanaDoMes('2026-09-21')).toBe('3ª SEMANA');
    expect(calcularSemanaDoMes('2026-09-22')).toBe('4ª SEMANA');
    expect(calcularSemanaDoMes('2026-09-28')).toBe('4ª SEMANA');
    expect(calcularSemanaDoMes('2026-09-29')).toBe('5ª SEMANA');
    expect(calcularSemanaDoMes('2026-09-31')).toBe('5ª SEMANA');
  });

  it('formata data para DDMMYY corretamente', () => {
    expect(formatarDataDDMMYY('2026-09-03')).toBe('030926');
    expect(formatarDataDDMMYY('2026-12-25')).toBe('251226');
    expect(formatarDataDDMMYY('2025-01-08')).toBe('080125');
  });

  it('gera número de registro com formato padronizado RID-DDMMYY-indice por mes', () => {
    expect(gerarNumeroRegistroRid('2026-09-03', 1)).toBe('RID-030926-01');
    expect(gerarNumeroRegistroRid('2026-09-03', 2)).toBe('RID-030926-02');
    expect(gerarNumeroRegistroRid('2026-09-15', 12)).toBe('RID-150926-12');
    expect(gerarNumeroRegistroRid('2026-10-01', 1)).toBe('RID-011026-01');
    expect(gerarCodigoRegistroFormulario('RID', '2026-09-03', 5)).toBe('RID-030926-05');
  });

  it('contém os setores solicitados', () => {
    expect(SETORES_SSMA).toContain('PRODUÇÃO');
    expect(SETORES_SSMA).toContain('MANUTENÇÃO');
    expect(SETORES_SSMA).toContain('ENGENHARIA');
    expect(SETORES_SSMA).toContain('SUPRIMENTOS');
    expect(SETORES_SSMA).toContain('PLANEJAMENTO');
    expect(SETORES_SSMA).toContain('QUALIDADE');
    expect(SETORES_SSMA).toContain('FINANCEIRO');
    expect(SETORES_SSMA).toContain('RECURSOS HUMANOS');
    expect(SETORES_SSMA).toContain('ALMOXARIFADO');
    expect(SETORES_SSMA).toContain('SSMA');
    expect(SETORES_SSMA).toContain('FACILITES');
  });

  it('contém as 5 semanas do mês', () => {
    expect(SEMANAS_SSMA).toHaveLength(5);
    expect(SEMANAS_SSMA).toEqual([
      '1ª SEMANA',
      '2ª SEMANA',
      '3ª SEMANA',
      '4ª SEMANA',
      '5ª SEMANA',
    ]);
  });

  it('contém áreas operacionais ordenadas alfabeticamente com OUTROS ao final', () => {
    expect(AREAS_DESVIO_SSMA).toContain('PÁTIO DE CHAPAS');
    expect(AREAS_DESVIO_SSMA).toContain('CALANDRA');
    expect(AREAS_DESVIO_SSMA).toContain('PINTURA');
    expect(AREAS_DESVIO_SSMA[AREAS_DESVIO_SSMA.length - 1]).toBe('OUTROS');

    // Verifica ordenação alfabética de todos os itens exceto o último ('OUTROS')
    const itensSemOutros = AREAS_DESVIO_SSMA.slice(0, -1);
    const ordenados = [...itensSemOutros].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    expect(itensSemOutros).toEqual(ordenados);
  });

  it('contém os profissionais de segurança e N/A', () => {
    expect(RESPONSAVEIS_SEGURANCA_SSMA).toContain('ADEMIR SANTANA');
    expect(RESPONSAVEIS_SEGURANCA_SSMA).toContain('JOSIMARIA ANDRADE');
    expect(RESPONSAVEIS_SEGURANCA_SSMA).toContain('RAMON SANTOS');
    expect(RESPONSAVEIS_SEGURANCA_SSMA).toContain('N/A - NÃO APLICÁVEL');
  });

  it('contém comportamentos e condições inseguras', () => {
    expect(COMPORTAMENTOS_INSEGUROS_SSMA).toContain('NÃO USO DE EPI');
    expect(CONDICOES_INSEGURAS_SSMA).toContain('CILINDRO SOLTO OU SEM CAPACETE DE PROTEÇÃO');
  });

  it('possui configuração padrão do formulário RID com 16 perguntas mapeadas', () => {
    expect(CONFIG_PERGUNTAS_PADRAO_RID).toHaveLength(16);
    expect(CONFIG_FORM_PADRAO_RID.id).toBe('ssma_rid');
    expect(CONFIG_FORM_PADRAO_RID.perguntas).toHaveLength(16);
    expect(CONFIG_FORM_PADRAO_RID.opcoes.areas.length).toBeGreaterThan(20);
    expect(CONFIG_FORM_PADRAO_RID.opcoes.empresas).toEqual(['TEN', 'CONTRATADA']);

    const perguntaDescricao = CONFIG_PERGUNTAS_PADRAO_RID.find((p) => p.id === 'descricao_desvio');
    expect(perguntaDescricao).toBeDefined();
    expect(perguntaDescricao?.obrigatorio).toBe(true);

    const perguntaSemana = CONFIG_PERGUNTAS_PADRAO_RID.find((p) => p.id === 'semana');
    expect(perguntaSemana).toBeDefined();
    expect(perguntaSemana?.ativo).toBe(false);
  });
});

