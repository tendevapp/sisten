---
trigger: always_on
---

# Roteamento de Solicitações - AG Kit

> Sempre ativo. Classifique cada solicitação e, em seguida, roteie automaticamente para o(s) melhor(es) agente(s) especialista(s) antes de responder.

---

## 📥 CLASSIFICADOR DE SOLICITAÇÕES (PASSO 1)

**Antes de QUALQUER ação, classifique a solicitação:**

| Tipo de Solicitação | Palavras-chave Gatilho                     | Tiers Ativos                   | Resultado                   |
| ------------------- | ------------------------------------------ | ------------------------------ | --------------------------- |
| **PERGUNTA**        | "o que é", "como faz", "explique"          | Apenas TIER 0                  | Resposta em Texto           |
| **LEVANTAMENTO/INTEL**| "analise", "listar arquivos", "visão geral"| TIER 0 + Explorer              | Informações da Sessão (Sem Arquivo) |
| **CÓDIGO SIMPLES**  | "corrija", "adicione", "altere" (um arquivo) | TIER 0 + TIER 1 (lite)        | Edição Inline               |
| **CÓDIGO COMPLEXO** | "construa", "crie", "implemente", "refatore" | TIER 0 + TIER 1 (completo) + Agente | **{task-slug}.md Necessário** |
| **NOVO APP**        | "novo app", "do zero", "construa um(a)", multi-página | `project-planner` (carrega `app-builder`) → `orchestrator` | **{task-slug}.md + app-builder** |
| **DESIGN/UI**       | "design", "UI", "página", "dashboard"      | TIER 0 + TIER 1 + Agente        | **{task-slug}.md Necessário** |
| **COMANDO SLASH (/)**| /create, /orchestrate, /debug              | Fluxo específico do comando    | Variável                    |

> 🔴 **NOVO APP / scaffold do zero:** roteie através de `project-planner` ou `orchestrator` (ambos carregam `app-builder`), NÃO por um agente especialista isolado como `frontend-specialist`. Um especialista sozinho não tem conhecimento sobre detecção de projeto, seleção de pilha tecnológica ou templates — o `app-builder` tem. Ou execute `/create`.

---

## 🤖 ROTEAMENTO INTELIGENTE DE AGENTES (PASSO 2 - AUTOMÁTICO)

**SEMPRE ATIVO: Antes de responder a QUALQUER solicitação, analise e selecione automaticamente o(s) melhor(es) agente(s).**

> 🔴 **OBRIGATÓRIO:** Você DEVE seguir o protocolo definido em `@[skills/intelligent-routing]`.

### Protocolo de Seleção Automática

1. **Análise (Silenciosa)**: Detecte domínios (Frontend, Backend, Segurança, etc.) a partir da solicitação do usuário.
2. **Selecionar Agente(s)**: Escolha o especialista mais apropriado.
3. **Informar o Usuário**: Indique de forma concisa qual conhecimento especializado está sendo aplicado.
4. **Aplicar**: Gere a resposta usando a persona e as regras do agente selecionado.

### Formato de Resposta (OBRIGATÓRIO)

Ao aplicar automaticamente um agente, informe o usuário:

```markdown
🤖 **Aplicando conhecimento de `@[nome-do-agente]`...**

[Continue com a resposta especializada]
```

**Regras:**

1. **Análise Silenciosa**: Sem comentários verbose sobre o que está fazendo ("Estou analisando...").
2. **Respeitar Sobrescritas**: Se o usuário mencionar `@agente`, use-o.
3. **Tarefas Complexas**: Para solicitações de múltiplos domínios, use o `orchestrator` e faça perguntas socráticas primeiro.

### ⚠️ CHECKLIST DE ROTEAMENTO DE AGENTES (OBRIGATÓRIO ANTES DE QUALQUER RESPOSTA DE CÓDIGO/DESIGN)

**Antes de QUALQUER trabalho de código ou design, você DEVE concluir esta checklist mental:**

| Passo | Verificação | Se Não Verificado |
|-------|-------------|-------------------|
| 1 | Identifiquei o agente correto para este domínio? | → PARE. Analise o domínio da solicitação primeiro. |
| 2 | Eu LI o arquivo `.md` do agente (ou lembro das suas regras)? | → PARE. Abra `.agents/agent/{agente}.md` |
| 3 | Anunciei `🤖 Aplicando conhecimento de @[agente]...`? | → PARE. Adicione o anúncio antes da resposta. |
| 4 | Carreguei as habilidades necessárias listadas no frontmatter do agente? | → PARE. Verifique o campo `skills:` e leia-os. |

**Condições de Falha:**

- ❌ Escrever código sem identificar um agente = **VIOLAÇÃO DE PROTOCOLO**
- ❌ Pular o anúncio = **O USUÁRIO NÃO PODE VERIFICAR SE O AGENTE FOI USADA**
- ❌ Ignorar regras específicas do agente (ex: Proibição de Roxo) = **FALHA DE QUALIDADE**

> 🔴 **Gatilho de Auto-verificação:** Sempre que estiver prestes a escrever código ou criar uma UI, pergunte-se:
> "Eu concluí a Checklist de Roteamento de Agentes?" Se NÃO → Conclua-a primeiro.

---

## 🎭 Mapeamento de Modos do Gemini

| Modo     | Agente            | Comportamento                                 |
| -------- | ----------------- | --------------------------------------------- |
| **plan** | `project-planner` | Metodologia de 4 fases. SEM CÓDIGO antes da Fase 4. |
| **ask**  | -                 | Foco na compreensão. Faça perguntas.          |
| **edit** | `orchestrator`    | Executar. Verifique o `{task-slug}.md` primeiro. |

> 🔴 **Modo edit:** Se houver alteração em múltiplos arquivos ou alteração estrutural → Ofereça criar `{task-slug}.md`. Para correções de arquivo único → Prossiga diretamente.
> O protocolo completo do Modo Plano (4 Fases) reside em `code-rules.md`.

---
