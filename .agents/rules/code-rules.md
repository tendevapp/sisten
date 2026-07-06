---
trigger: model_decision
description: Aplique ao escrever, construir, refatorar ou corrigir código — roteamento de agentes por tipo de projeto, o Portão Sócratico, fases do Modo Plano e a lista de verificação/scripts finais. Pule para perguntas puras ou respostas apenas de texto.
---

# Regras de Código (TIER 1) - AG Kit

> Carregado quando a solicitação envolve escrever ou modificar código.

---

## 📱 Roteamento por Tipo de Projeto

| Tipo de Projeto                        | Agente Principal      | Habilidades                   |
| -------------------------------------- | --------------------- | ----------------------------- |
| **MOBILE** (iOS, Android, RN, Flutter) | `mobile-developer`    | mobile-design                 |
| **WEB** (Next.js, React web)           | `frontend-specialist` | frontend-design               |
| **BACKEND** (API, servidor, BD)        | `backend-specialist`  | api-patterns, database-design |

> 🔴 **Mobile + frontend-specialist = ERRADO.** Mobile = apenas `mobile-developer`.

---

## 🛑 PORTÃO SÓCRATICO GLOBAL

**OBRIGATÓRIO: Toda solicitação do usuário deve passar pelo Portão Socrático antes de QUALQUER uso de ferramenta ou implementação.**

| Tipo de Solicitação     | Estratégia       | Ação Necessária                                                   |
| ----------------------- | ---------------- | ----------------------------------------------------------------- |
| **Nova Feature / Build**| Descoberta Profunda| FAÇA no mínimo 3 perguntas estratégicas                         |
| **Edição / Correção**   | Checagem Contexto| Confirme entendimento + faça perguntas de impacto                 |
| **Vago / Simples**      | Clarificação     | Pergunte sobre Objetivo, Usuários e Escopo                        |
| **Orquestração Total**  | Guardião         | **PARE** subagentes até que o usuário confirme detalhes do plano  |
| **"Proceder" Direto**   | Validação        | **PARE** → Mesmo se as respostas forem dadas, faça 2 perguntas de "Casos de Borda" |

**Protocolo:**

1. **Nunca Presuma:** Se mesmo 1% não estiver claro, PERGUNTE.
2. **Lidar com Solicitações cheias de Especificações:** Quando o usuário fornecer uma lista (Respostas 1, 2, 3...), NÃO pule o portão. Em vez disso, pergunte sobre **Trade-offs** (compensações) ou **Casos de Borda** (ex: "LocalStorage confirmado, mas devemos lidar com limpeza de dados ou versionamento?") antes de começar.
3. **Aguarde:** NÃO invoque subagentes nem escreva código até que o usuário libere o Portão.
4. **Referência:** Protocolo completo em `@[skills/brainstorming]`.

---

## 🏁 Modo Plano (4 Fases)

1. ANÁLISE → Pesquisa, perguntas
2. PLANEJAMENTO → `{task-slug}.md`, detalhamento das tarefas
3. SOLUÇÃO → Arquitetura, design (SEM CÓDIGO!)
4. IMPLEMENTAÇÃO → Código + testes

---

## 🏁 Protocolo da Lista de Verificação Final (Checklist)

**Gatilho:** Quando o usuário disser "execute as verificações finais", "verificações finais", "execute todos os testes" ou frases semelhantes.

| Estágio da Tarefa | Comando                                            | Objetivo                       |
| ----------------- | -------------------------------------------------- | ------------------------------ |
| **Auditoria Manual** | `python .agents/scripts/checklist.py .`             | Auditoria de projeto por prioridade |
| **Pré-Implantação**  | `python .agents/scripts/checklist.py . --url <URL>` | Suite Completa + Desempenho + E2E   |

**Ordem de Execução de Prioridade:**

1. **Segurança** → 2. **Lint** → 3. **Esquema** → 4. **Testes** → 5. **UX** → 6. **SEO** → 7. **Lighthouse/E2E**

**Regras:**

- **Conclusão:** Uma tarefa NÃO está finalizada até que o `checklist.py` retorne sucesso.
- **Relatório:** Se falhar, corrija os bloqueadores **Críticos** primeiro (Segurança/Lint).

**Scripts Disponíveis (10 no total):**

| Script                     | Habilidade            | Quando Usar         |
| -------------------------- | --------------------- | ------------------- |
| `security_scan.py`         | vulnerability-scanner | Sempre no deploy    |
| `lint_runner.py`           | lint-and-validate     | Toda alteração de código |
| `test_runner.py`           | testing-patterns      | Após alteração de lógica |
| `schema_validator.py`      | database-design       | Após alteração de BD |
| `ux_audit.py`              | frontend-design       | Após alteração de UI |
| `accessibility_checker.py` | frontend-design       | Após alteração de UI |
| `seo_checker.py`           | seo-fundamentals      | Após alteração de página |
| `mobile_audit.py`          | mobile-design         | Após alteração de mobile |
| `lighthouse_audit.py`      | performance-profiling | Antes do deploy     |
| `playwright_runner.py`     | webapp-testing        | Antes do deploy     |

> 🔴 **Agentes & Habilidades podem invocar QUALQUER script** via `python .agents/skills/<skill>/scripts/<script>.py`

---
