---
trigger: glob
globs: **/*.{tsx,jsx,vue,svelte,css,scss},**/components/**,**/app/**/page.tsx
---

# Regras de Design (TIER 2) - AG Kit

> Carregado ao manipular arquivos de UI. As regras de design ficam nos agentes especialistas, NÃO aqui.

## 🛑 PORTÃO (GATE): DESIGN.md antes de qualquer código de UI (OBRIGATÓRIO)

Antes de escrever ou editar UI (componentes, páginas, estilos — web ou mobile), um **`DESIGN.md` deve existir na raiz do projeto**.

1. **Verifique** a existência de `DESIGN.md` na raiz do projeto.
2. **Se estiver ausente:** infira a direção do design a partir do brief, então **crie o `DESIGN.md` primeiro** (tokens + justificativa) seguindo a habilidade `design-spec`. Não escreva código de UI até que ele exista.
3. **Se estiver presente:** LEIA-O e desenvolva estritamente de acordo com seus tokens. Nomes descritivos na prosa devem mapear para os nomes dos tokens.
4. **Mantenha-o sincronizado** quando a linguagem visual mudar — ele é a única fonte de verdade.

> Exceção: nenhuma para novas UIs. Um ajuste genuinamente trivial em uma UI existente (a cor de um botão, um pequeno ajuste de espaçamento) pode prosseguir se um `DESIGN.md` já governar o projeto. Novas UIs sempre exigem o portão (gate).

| Necessidade | Ler |
| ----------- | --- |
| Formato / tokens do DESIGN.md | `.agents/skills/design-spec/SKILL.md` |

---

| Tarefa       | Ler |
| ------------ | --- |
| Web UI/UX    | `.agents/agent/frontend-specialist.md` |
| Mobile UI/UX | `.agents/agent/mobile-developer.md`    |

**Estes agentes contêm:**

- Proibição de Roxo (sem roxo por padrão — permitido se sobrescrito pela marca/brief)
- Proibição de Templates (sem layouts padrão prontos)
- Regras anti-clichê
- Protocolo de Pensamento Profundo de Design (Deep Design Thinking)

> 🔴 **Para trabalhos de design:** Abra e LEIA o arquivo do agente. As regras estão lá.

---
