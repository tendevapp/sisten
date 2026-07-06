---
trigger: always_on
---

# Regras Universais (TIER 0) - AG Kit

> Regras sempre ativas que se aplicam a todas as solicitações, independentemente do domínio.

---

## 🌐 Tratamento de Idioma

1. **Responda no idioma do usuário** - corresponda à comunicação dele
2. **Comentários de código/variáveis** devem ser em ptbr sem acentos

---

## 🧹 Código Limpo (Obrigatório Globalmente)

**TODO o código DEVE seguir as regras de `@[skills/clean-code]`. Sem exceções.**

- **Código**: Conciso, direto, sem excesso de engenharia. Autodocumentado.
- **Testes**: Obrigatórios. Pirâmide (Unit > Int > E2E) + Padrão AAA.
- **Desempenho**: Meça primeiro. Adira aos padrões atuais de Core Web Vitals.
- **Infraestrutura/Segurança**: Implantação em 5 Fases. Verifique a segurança dos segredos (secrets).

---