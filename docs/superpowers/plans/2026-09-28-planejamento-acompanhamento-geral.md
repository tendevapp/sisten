# Planejamento - Acompanhamento Geral

## Objetivo

Criar o modulo Planejamento com a subpagina Acompanhamento Geral. A planilha `BD.xlsx` e a fonte operacional; o SISTEN recalcula os indicadores e recria os dashboards. A aba `DASHBOARD` e os vinculos externos do Excel nao sao usados como fonte de apresentacao.

## Arquitetura

- O upload e parseado no navegador e enviado a uma RPC transacional.
- A base tipada e o restante das colunas em `raw_data` ficam no Supabase.
- O historico de importacoes e mantido para auditoria.
- As views SQL calculam o engine, lead times, curva semanal, postos, reparos e divergencias.
- A view-base do dashboard nao usa a tabela `CRONOGRAMA`; quando o posto nao vem calculado, a UI deriva a fila pela proxima etapa.
- As abas frontend sao `Dashboard`, `PCP`, `Engine`, `AUX` e `Base`.

## Dashboard

O dashboard e calculado no frontend a partir do engine importado e segue o modelo aprovado: oito KPIs, leitura executiva, esteira semanal, funil de etapas, avanço por torre, carteira por posto, avanço concluido versus pendente, lead time medio e os mapas de calor de avanço e prazo.

## Verificacao

- Testes do parser e do modelo do dashboard.
- Checagem focada de compilacao dos componentes alterados.
- Build completo sujeito ao custo do bundle existente no ambiente OneDrive.
- RLS, policies, views e ausencia de dependencia do `CRONOGRAMA` verificados no Supabase.
