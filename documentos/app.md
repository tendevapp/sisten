# Documentação Funcional do Aplicativo Sisten

Este documento descreve detalhadamente todas as funcionalidades do sistema **Sisten**, uma plataforma integrada de gestão de suprimentos, requisições SAP e atendimento de Helpdesk.

---

## 💻 1. Dashboard Principal
O dashboard centralizado fornece uma visão panorâmica e em tempo real sobre as principais operações para tomada de decisão ágil:
- **Indicadores Rápidos (KPIs):** Total de solicitações de compra pendentes, requisições no SAP aguardando associação de pedido (PO), chamados de Helpdesk em aberto e taxa de satisfação média dos atendimentos.
- **Gráficos Analíticos:**
  - Distribuição de solicitações por status (Aprovado, Recusado, Pendente, etc.).
  - Volume de compras por setor solicitante.
  - Gráfico de tendência temporal de novos chamados e requisições abertas.
- **Atalhos Rápidos:** Acesso imediato para abrir chamados, criar solicitações de compra ou visualizar o painel SAP.

---

## 📦 2. Catálogo e Busca de Materiais
Módulo voltado para consulta e seleção de materiais padronizados e cadastrados na base interna:
- **Busca Avançada:** Barra de pesquisa rápida que filtra materiais por nome, código SAP, categoria ou especificações técnicas.
- **Filtros por Categoria:** Navegação simplificada entre suprimentos de TI, escritório, EPIs, manutenção industrial, etc.
- **Visualização de Detalhes:** Exibição detalhada de especificações, estoque disponível, unidade de medida (un, kg, m) e histórico recente de consumo por setor.
- **Criação de Carrinho/Solicitação:** Capacidade de adicionar itens diretamente do catálogo para gerar uma nova solicitação de compra de forma guiada e sem erros de preenchimento.

---

## 🛒 3. Solicitações de Compras e Alçadas de Aprovação
Fluxo completo de requisição de materiais fora de estoque ou contratação de serviços, respeitando as regras corporativas de alçadas:
- **Abertura de Solicitação:** Formulário intuitivo para inclusão de itens, justificativa de compra, estimativa de valor, setor beneficiado e prioridade.
- **Fluxo Automatizado de Aprovação (Workflow):**
  - **Aprovação de Alçada (Gestor):** Direcionamento automático para o gestor do setor caso a solicitação ultrapasse limites pré-estabelecidos ou exija validação orçamentária.
  - **Aprovação de Suprimentos (Coordenador):** Após o gestor, o coordenador de suprimentos valida o alinhamento estratégico da compra.
- **Histórico de Tramitação:** Rastreabilidade total indicando data, hora e responsável por cada alteração ou despacho de aprovação/recusa.

---

## 📑 4. Painel SAP (ME5A & ME2N)
Espelho operacional que integra as visões de compras e suprimentos diretamente correlacionadas com a base SAP:
- **Visão ME5A (Requisições de Compra - RM):**
  - Monitoramento de RMs sem Pedido de Compra (PO) associado.
  - Alertas automáticos baseados no tempo de atraso para colocação do pedido.
  - Campo para inserção de observações do comprador diretamente na linha para acompanhamento do solicitante.
- **Visão ME2N (Pedidos de Compra - PO):**
  - Acompanhamento do status de entrega dos pedidos (no prazo, atrasado, entregue parcialmente, etc.).
  - Integração com o fluxo MIGO para confirmação física do recebimento de mercadorias.
- **Ferramenta de Carga SAP:** Simulador para importação e atualização em lote de dados do SAP via arquivos de texto/planilha para manter o sistema em perfeita sincronia.
- **Exportação Excel (.xls):** Botão para exportação instantânea e formatada da tabela ativa diretamente para visualização e relatórios em planilhas Microsoft Excel.

---

## 🛠️ 5. Helpdesk e Atendimento Técnico
Sistema de chamados e suporte interno estruturado para atendimento aos setores corporativos:
- **Abertura de Chamados:** Solicitação rápida categorizada por urgência (Baixa, Média, Alta, Crítica) e tipo de problema (TI, infraestrutura, logística, etc.).
- **Fila de Atendimento:** Painel para atendentes e administradores gerenciarem e distribuírem os chamados:
  - Aba de chamados sem atribuição (Fila Geral).
  - Aba de chamados sob responsabilidade do próprio técnico.
  - Aba de chamados já resolvidos ou encerrados.
- **Chat em Tempo Real:** Canal de comunicação integrado em cada chamado para troca de mensagens entre o técnico e o solicitante.
- **Workflow de Encerramento:** Quando o suporte conclui o chamado, altera o status para "Resolvido", inserindo um parecer técnico.
- **Avaliação de Satisfação (Rating de 5 Estrelas):** Após a resolução do chamado, o solicitante visualiza em seu painel "Minhas Solicitações" um módulo interativo de avaliação para atribuir de 1 a 5 estrelas e adicionar comentários sobre a qualidade do atendimento.

---

## 📊 6. Relatórios de Helpdesk e Dashboards de Atendimento
Área analítica projetada para monitoramento contínuo dos indicadores de qualidade e produtividade da equipe de suporte:
- **Métricas de Performance (KPIs):**
  - Tempo Médio de Atendimento (SLA).
  - Índice Geral de Satisfação dos Usuários (NPS/Média de Estrelas).
  - Percentual de chamados resolvidos dentro do prazo estipulado.
- **Gráficos Estatísticos:**
  - Volume de chamados abertos por categoria e por setor requisitante.
  - Distribuição das avaliações de estrelas (Gráfico de Distribuição de Satisfação).
  - Produtividade individual dos técnicos atendentes.
- **Filtros por Período:** Capacidade de selecionar datas específicas para auditorias e reuniões de resultados.

---

## 👤 7. Perfil do Usuário e Central de Notificações
Espaço personalizado para cada colaborador gerenciar sua interação com a plataforma:
- **Meus Dados:** Visualização de cargo, e-mail institucional, setor de lotação e papéis de acesso (roles).
- **Preferências de Notificação:** Ajuste dos canais de alerta (Notificações Internas, E-mail, alertas críticos).
- **Notificações em Tempo Real (Push Interno):** Badge flutuante e gaveta de notificações que alerta instantaneamente sobre novos chamados designados, compras aprovadas ou comentários técnicos recebidos.

---

## ⚙️ 8. Painel Administrativo (Exclusivo para Admins)
Módulo restrito para controle de tabelas globais e parametrização do sistema:
- **Gestão de Usuários:** Atribuição de permissões especiais (Admin, Comprador, Gestor, Técnico, Solicitante) e definição de perfis de visualização.
- **Parâmetros de Setores:** Cadastro e edição de setores corporativos e seus respectivos centros de custo ou gerentes responsáveis.
- **Histórico de Logs (Trilha de Auditoria):** Log completo de atividades do sistema contendo ações efetuadas, IP fictício, usuário executor e data/hora para auditoria de segurança.
