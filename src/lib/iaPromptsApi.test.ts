/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  normalizarParametrosPrompt,
  PROMPTS_PADRAO,
  PROVEDORES_IA_INFO,
  ORDEM_PROVEDORES_PADRAO,
  type ProvedorIaId,
} from './iaPromptsApi';

describe('iaPromptsApi — normalização de parâmetros e ordem de provedores', () => {
  it('preenche ordem padrão quando parametros são vazios ou nulos', () => {
    const normalizado = normalizarParametrosPrompt(null);
    expect(normalizado.ordem_provedores).toEqual(['gemini', 'openrouter', 'openai']);
    expect(normalizado.provedores_ativos).toEqual(['gemini', 'openrouter', 'openai']);
    expect(normalizado.modelo_gemini).toBe(PROVEDORES_IA_INFO.gemini.modeloPadrao);
    expect(normalizado.modelo_openrouter).toBe(PROVEDORES_IA_INFO.openrouter.modeloPadrao);
    expect(normalizado.modelo_openai).toBe(PROVEDORES_IA_INFO.openai.modeloPadrao);
  });

  it('respeita ordem customizada do admin e anexa provedores faltantes', () => {
    const normalizado = normalizarParametrosPrompt({
      ordem_provedores: ['openrouter', 'gemini'] as ProvedorIaId[],
      provedores_ativos: ['openrouter'] as ProvedorIaId[],
      modelo_openrouter: 'deepseek/deepseek-chat',
    });

    expect(normalizado.ordem_provedores).toEqual(['openrouter', 'gemini', 'openai']);
    expect(normalizado.provedores_ativos).toEqual(['openrouter']);
    expect(normalizado.modelo_openrouter).toBe('deepseek/deepseek-chat');
    expect(normalizado.modelo_gemini).toBe(PROVEDORES_IA_INFO.gemini.modeloPadrao);
  });

  it('mantém parâmetros adicionais como temperatura e max_tokens', () => {
    const normalizado = normalizarParametrosPrompt({
      temperatura: 0.2,
      max_tokens: 16000,
      itens_por_lote: 30,
    });

    expect(normalizado.temperatura).toBe(0.2);
    expect(normalizado.max_tokens).toBe(16000);
    expect(normalizado.itens_por_lote).toBe(30);
  });

  it('PROMPTS_PADRAO contém chaves extrair-cotacao e vincular-cotacao-sap configuradas', () => {
    expect(PROMPTS_PADRAO['extrair-cotacao']).toBeDefined();
    expect(PROMPTS_PADRAO['vincular-cotacao-sap']).toBeDefined();
    expect(PROMPTS_PADRAO['extrair-cotacao']?.parametros?.ordem_provedores).toEqual(['gemini', 'openrouter', 'openai']);
  });
});
