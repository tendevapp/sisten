# Equipamentos da Qualidade

Página: `/qualidade/equipamentos`. Permissão: `qualidade_equipamentos`, restrita a administradores por padrão; os demais usuários precisam de liberação pela Gestão de Acessos. A rota, o cartão do hub, as tabelas, RPCs e evidências privadas respeitam essa permissão.

## Mapeamento da planilha fornecida

Arquivo: `Lista de Equipamentos.xlsx`. Cabeçalhos na linha 3 e dados a partir da linha 4. A carga inicial foi realizada em 10/11/2026 exclusivamente no projeto SISTEN `fwezzgduywgyhxinjurn`.

| Aba | Registros | Campos preservados |
| --- | ---: | --- |
| Estoque atual | 73 | Nº; equipamento/aparelho; descrição/especificação; fabricante/modelo; patrimônio/ID; qtd. em estoque; qtd. necessária; qtd. a comprar; local/setor; responsável; situação; observações |
| Necessidade de compra | 24 | Nº; equipamento/aparelho; descrição/especificação; fabricante/modelo/referência; qtd. necessária; prioridade; justificativa/aplicação; setor solicitante; responsável; situação; observações |
| Danificados e segregados | 9 | Nº; equipamento/aparelho; descrição/especificação; fabricante/modelo; patrimônio/ID; quantidade; defeito/condição; data da segregação; local de segregação; ação necessária; responsável; situação; observações |
| Compras solicitadas | 10 | Nº; equipamento/aparelho; descrição/especificação; fabricante/modelo/referência; qtd. solicitada; nº RM/solicitação; data da solicitação; fornecedor/cotação; previsão de entrega; responsável; situação; observações |
| **Total** | **116** | Linhas apenas numeradas, sem conteúdo operacional, são ignoradas. |

Os controles são independentes. Não há correspondência inequívoca entre todas as linhas das quatro abas; portanto não se somam equipamentos nem se descontam danos/compras do estoque automaticamente. Equipamentos com o mesmo nome e especificações diferentes continuam separados.

“Estoque mínimo”, “N/A”, “AGUARDANDO”, códigos de RM e demais textos são mantidos. O conteúdo original fica em `origem_dados`, com arquivo e linha. Fórmulas de quantidade são lidas pelo resultado armazenado no Excel; o app não executa fórmulas nem instruções em células. Situações divergentes não são corrigidas automaticamente.

## Operação

- Quatro abas de dados e uma de avisos; busca em todos os campos, filtros por setor, responsável e situação, paginação e consulta de arquivados.
- Cadastro e edição de todos os campos; prazo, responsável e plano de ação; aplicabilidade do controle metrológico, próxima calibração/verificação, certificado e resultado.
- Lançamentos de acompanhamento, manutenção, calibração/verificação, segregação, transferência, recebimento, devolução, baixa e correção/estorno. O operador atualiza os campos e descreve a ação; o tipo do lançamento não movimenta quantidades automaticamente.
- Arquivamento reversível. Baixa e arquivamento são distintos: a baixa é uma ocorrência operacional; o arquivamento retira o registro da lista ativa.
- Evidência por lançamento: imagem ou PDF até 10 MB; imagens passam por `prepareAttachment` antes do Storage. Bucket privado `qua-equipamentos`, links assinados por cinco minutos. Evidências já auditadas não podem ser removidas pelo cliente.
- Histórico permanente com autor autenticado, data da ocorrência, horário do registro e snapshots anteriores/posteriores. Correções são novos lançamentos; eventos anteriores não são editados.

## Importação e exportação

A importação oferece prévia e valida o arquivo inteiro antes de gravar, até 5.000 registros/10 MB. Erros em cabeçalhos obrigatórios, colunas desconhecidas preenchidas, campos duplicados, números repetidos, datas inválidas e quantidades negativas bloqueiam a carga, sem gravar parcialmente. Abas não reconhecidas aparecem como aviso e não são importadas.

A chave da planilha original é `categoria:Nº`; na ausência de Nº usa a linha. Exportações incluem `ID SISTEN`, utilizado como identificador estável, inclusive para cadastros manuais. Registros existentes são preservados sem sobrescrita, mesmo que o arquivo tenha mudado. Alterações nesses registros devem ser feitas pela página. Não renumerar a planilha para tentar atualizar registros existentes.

A exportação completa inclui ativos e arquivados; a filtrada inclui todos os resultados do filtro, não só a página visível. Ambas geram as quatro abas com todas as colunas originais, campos de gestão, código, arquivamento e ID. O histórico é uma aba adicional quando houver eventos; anexos são referenciados pelo nome, sem links públicos permanentes.

Novos registros usam `EQP-DDMMYY-INDICE`, pela função compartilhada `gerarCodigoFormulario`. O índice reinicia por mês e inclui arquivados. O banco garante unicidade; uma colisão concorrente provoca nova consulta e tentativa. Edições usam versão para bloquear sobrescrita concorrente.

## Avisos

Exibidos na página, sem envio de e-mail ou mensagens externas. Antecedência selecionável: 7, 15, 30, 60 ou 90 dias; padrão 30. Vencimento no dia atual não é tratado como atraso.

- Déficit: `máximo(qtd. necessária − qtd. em estoque, 0)`, apenas para valores numéricos; divergência com “Atende à necessidade” ou com a quantidade a comprar informada.
- Estoque textual sem saldo; defeitos citados nas observações; responsável ausente.
- Danificados/segregados em aberto e ausência de data da segregação.
- Compras de prioridade alta, RM pendente e previsão de entrega ausente.
- Prazos de ação, entrega e calibração/verificação vencidos ou próximos; controle metrológico exigido sem prazo; resultado reprovado e necessidade de avaliar impacto nas medições.
- Compras concluídas não geram cobrança de entrega; calibração continua sendo avaliada. Arquivados não geram avisos.

A carga inicial produziu 19 registros de estoque com déficit e 98 registros com algum aviso, principalmente pelos dados faltantes de responsável/prazos. Avisos são calculados a partir dos dados, não são declaração de conformidade ou liberação técnica.

## Verificação

Testes de regressão usam os valores das quatro abas fornecidas, incluindo repetições, estoques textuais, fórmulas em cache, datas Excel, exportação/reimportação e limites de prazo. O banco foi verificado com transações revertidas para cadastro/edição auditados, concorrência, trilha imutável, importação atômica, reimportação e bloqueio de usuário sem permissão. Não restaram registros de teste.

A conferência visual autenticada, responsiva e de anexos reais permanece pendente: o controle do navegador foi interrompido pela ferramenta por não conseguir identificar a URL com segurança. Nenhum deploy foi realizado nesta entrega.

Resultado final em 10/11/2026: `npx vitest run` aprovou 2.787 testes em 243 arquivos; `npm run build` passou. `npx tsc --noEmit` manteve 130 diagnósticos preexistentes, com os mesmos diagnósticos principais da linha de base e nenhum nos novos arquivos da funcionalidade. A execução anterior da suíte teve um timeout em SSMA; a repetição isolada e a suíte final passaram.

### Compatibilidade XLSX no desenvolvimento

O cache do Vite pode conter a edição ESM do XLSX sem exportação `default`, mesmo quando o pacote instalado oferece essa exportação. Os imports da funcionalidade usam `import * as XLSX from 'xlsx'`, compatível com os exports nomeados nas duas edições. O teste `qualidadeEquipamentosEsm.test.ts` empacota a página e o importador contra a API real reexportada sem `default`, reproduzindo o contrato que causou a falha no navegador. A correção também foi exercitada diretamente sobre o arquivo do cache que falhou e confirmada na resposta do servidor local.
