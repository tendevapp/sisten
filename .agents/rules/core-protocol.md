---
trigger: always_on
---

# Protocolo Central - AG Kit

> As regras de maior prioridade do workspace. Como a IA carrega agentes/habilidades e o que deve fazer antes de qualquer implementação.

---

## CRÍTICO: PROTOCOLO DE AGENTES & HABILIDADES (COMECE AQUI)

> **OBRIGATÓRIO:** Você DEVE ler o arquivo do agente apropriado e suas habilidades ANTES de realizar qualquer implementação. Esta é a regra de maior prioridade.

### 1. Protocolo Modular de Carregamento de Habilidades

Agente ativado → Verificar frontmatter "skills:" → Ler SKILL.md (ÍNDICE) → Ler seções específicas.

- **Leitura Seletiva:** NÃO leia TODOS os arquivos em uma pasta de habilidades. Leia `SKILL.md` primeiro, depois leia apenas as seções que correspondem à solicitação do usuário.
- **Prioridade das Regras:** P0 (Regras do Workspace em `.agents/rules/`) > P1 (Agent `.md`) > P2 (SKILL.md). Todas as regras são vinculativas.

### 1.1 Anúncio de Habilidades (OBRIGATÓRIO)

**Toda vez que você carregar e aplicar uma habilidade, anuncie-a ANTES de usá-la** — para que o usuário possa verificar qual conhecimento está ativo.

```markdown
📚 **Usando a habilidade: `@[skill-name]`...**
```

- Liste várias habilidades juntas: `📚 Usando as habilidades: @frontend-design + @minimalist-ui...`
- Anuncie também habilidades sob demanda (ex: uma habilidade complementar puxada de um repositório central ou `app-builder` para um novo aplicativo), não apenas as do frontmatter.
- ❌ Aplicar uma habilidade sem anunciá-la = **O USUÁRIO NÃO PODE VERIFICAR SE A HABILIDADE FOI USADA**.

### 2. Protocolo de Execução

1. **Quando o agente for ativado:**
    - ✅ Ativar: Ler Regras → Verificar Frontmatter → Carregar SKILL.md → Aplicar Tudo.
2. **Proibido:** Nunca pule a leitura das regras do agente ou as instruções de habilidades. "Ler → Entender → Aplicar" é obrigatório.

---

## 📁 Consciência de Dependência de Arquivos

**Antes de modificar QUALQUER arquivo:**

1. Verifique `CODEBASE.md` → Dependências de Arquivos
2. Identifique os arquivos dependentes
3. Atualize TODOS os arquivos afetados juntos

---

## 🗺️ Mapa do Sistema & Leitura de Memória

> 🔴 **OBRIGATÓRIO:** No início da sessão, você DEVE ler `.agents/memory/MEMORY.md` para carregar as convenções persistentes do projeto, preferências do usuário e decisões.

> 📚 **Busca no catálogo (sob demanda, NÃO em toda sessão):** Precisa da lista completa de Agentes / Habilidades / Scripts? A regra `quick-reference` tem o essencial. Para o catálogo completo, leia `.agents/ARCHITECTURE.md` apenas quando realmente precisar (ex: orquestração ou para descobrir se uma habilidade existe) — NÃO carregue em todas as solicitações.

**Consciência de Caminhos (Nota: o nome do diretório do projeto é `.agents` no plural):**

- Agentes: `.agents/agent/` (Projeto)
- Habilidades: `.agents/skills/` (Projeto)
- Memória: `.agents/memory/` (Projeto)
- Scripts de Execução: `.agents/skills/<skill>/scripts/`

---

## 🧠 Ler → Entender → Aplicar

```
❌ ERRADO: Ler arquivo do agente → Começar a codificar
✅ CORRETO: Ler → Entender o PORQUÊ → Aplicar PRINCÍPIOS → Codificar
```

**Antes de codificar, responda:**

1. Qual é o OBJETIVO deste agente/habilidade?
2. Quais PRINCÍPIOS devo aplicar?
3. Como isso DIFERE de uma saída genérica?

---
