# Inventário Cíclico — importação da Base Lançamento

Carga aplicada em 31/10/2026 exclusivamente ao projeto SISTEN `fwezzgduywgyhxinjurn`.

## Resultado inicial

- 1.593 linhas do histórico anterior substituídas por **1.695 registros**, em 21 datas, de **19/08/2026 a 26/10/2026**.
- **102 registros novos, 1.540 iguais, 53 alterados e nenhum ausente** na comparação com a carga anterior.
- Os **26 itens de 10 inventários manuais** foram preservados.
- A nova base tem 1.647 registros OK e 48 divergentes. Nove quantidades físicas ausentes continuam vazias; 1.686 resultados de contagem foram gravados, sem fabricar contagens intermediárias.
- Um depósito ausente foi identificado por `0000`. Validades parciais e o número de contagens original (inclusive 4 e 5) permanecem em `dados_origem`.

| Campo alterado | Registros |
| --- | ---: |
| Nº Contagem | 4 |
| Valor Divergente | 37 |
| Endereço SAP | 11 |
| Endereço Encontrado | 1 |
| Status | 4 |

Um registro pode ter alterações em mais de um campo. Números armazenados como texto são comparados pelo valor; valores monetários são comparados em centavos. Os dados originais mantêm sua precisão.

## Uso do botão

Em **Almoxarifado → Inventário Cíclico → Importar planilha**, selecione um `.xlsm` ou `.xlsx`. A leitura usa exclusivamente a aba **Base Lançamento**, os cabeçalhos da linha 3 e os dados a partir da linha 4. As linhas 1 e 2 são indicadores.

A análise mostra novos, iguais, alterados e ausentes. O botão **Inserir novos registros** grava somente os novos. Não altera nem apaga os anteriores. A comparação é refeita na mesma transação de gravação, com bloqueio entre importações e uma chave única para evitar duplicação.

A identidade é **data + material + depósito + ocorrência na ordem da fonte**. Linhas repetidas no mesmo dia continuam independentes; a posição física da linha não define a identidade. Preserve a ordem relativa das ocorrências repetidas ao atualizar a fonte; reordená-las pode aparecer como alterações no resumo, sem sobrescrever dados.

O acesso ao botão e à RPC fica restrito a administradores ou usuários com liberação explícita `almox_importar_planilhas`. O modal exibe também o resumo da última importação, incluindo as diferenças da substituição inicial, e permite baixar o relatório completo em JSON.

## Evidência e recuperação

A substituição foi transacional. O backup integral dos 18 inventários importados anteriores, incluindo itens e contagens, está em `public.alm_inv_backup_base_20261031`, com RLS e sem privilégios para `anon`/`authenticated`. Registros manuais não participaram da exclusão. O resumo inicial está em `public.alm_inv_importacoes`.

Fonte: `G:\\Suprimentos\\33 - ALMOXARIFADO\\14- INVENTÁRIO CICLÍCO\\Controle Inventario Ciclíco - V1.0.xlsm`.

SHA-256: `df85e98a610d3e5be9d500681d06a62b4f6c7e0820b074bd0f2e389d82bd3469`.

Validação SQL com usuário autenticado administrador: reimportação integral inseriu zero; lote com um registro novo e um antigo alterado inseriu somente um; nova repetição inseriu zero; o antigo ficou intacto; ausências foram relatadas; usuário sem permissão foi recusado. Todas as inserções de teste foram revertidas por rollback. Script: `scripts/testar-importacao-inventario.sql`.

## Alterações encontradas antes da substituição

| Linha da fonte atual | Data | Material | Depósito | Campo | Anterior | Planilha atual |
| ---: | --- | --- | --- | --- | --- | --- |
| 62 | 20/08/2026 | 1371231 | 0001 | Nº Contagem | 1 | 2 |
| 65 | 20/08/2026 | 1403318 | 0001 | Valor Divergente | R$ 187.957,28 | R$ 181.618,08 |
| 61 | 20/08/2026 | 1433206 | 0001 | Valor Divergente | R$ 3.774,86 | R$ 3.452,22 |
| 213 | 21/08/2026 | 1041695 | 0002 | Valor Divergente | -R$ 82,56 | -R$ 61,98 |
| 180 | 21/08/2026 | 1042304 | 0002 | Valor Divergente | R$ 0,00 | -R$ 1.332,50 |
| 153 | 21/08/2026 | 1208382 | 0002 | Valor Divergente | R$ 1.449,00 | R$ 1.417,50 |
| 185 | 21/08/2026 | 1242322 | 0002 | Valor Divergente | R$ 5.273,40 | R$ 5.170,00 |
| 142 | 21/08/2026 | 1270958 | 0002 | Valor Divergente | R$ 26.278,60 | R$ 25.165,10 |
| 172 | 21/08/2026 | 1322870 | 0002 | Valor Divergente | R$ 200,55 | R$ 0,00 |
| 233 | 21/08/2026 | 1375243 | 0002 | Valor Divergente | R$ 25,72 | R$ 12,86 |
| 167 | 21/08/2026 | 1437365 | 0002 | Valor Divergente | R$ 2.846,10 | R$ 2.667,10 |
| 404 | 24/08/2026 | 1427103 | 0004 | Valor Divergente | R$ 2.905,65 | R$ 0,00 |
| 492 | 24/08/2026 | 1427113 | 0004 | Valor Divergente | R$ 9.528,80 | R$ 8.744,94 |
| 886 | 23/09/2026 | 1047385 | 0001 | Endereço SAP | 101040300 | 101040300 |
| 887 | 23/09/2026 | 1216098 | 0002 | Valor Divergente | R$ 1.285,07 | R$ 1.213,04 |
| 938 | 23/09/2026 | 1242322 | 0002 | Valor Divergente | R$ 1.551,00 | R$ 1.520,59 |
| 900 | 23/09/2026 | 1270958 | 0002 | Valor Divergente | R$ 423,85 | R$ 405,89 |
| 894 | 23/09/2026 | 1283294 | 0002 | Valor Divergente | R$ 1.081,87 | R$ 1.035,34 |
| 936 | 23/09/2026 | 1322870 | 0002 | Valor Divergente | R$ 19,57 | R$ 0,00 |
| 937 | 23/09/2026 | 1331033 | 0002 | Valor Divergente | R$ 151,39 | R$ 125,29 |
| 881 | 23/09/2026 | 1371231 | 0001 | Nº Contagem | 2 | 3 |
| 931 | 23/09/2026 | 1386111 | 0002 | Valor Divergente | R$ 36,86 | R$ 36,21 |
| 898 | 23/09/2026 | 1402854 | 0001 | Endereço SAP | 101030100 | 101030100 |
| 927 | 23/09/2026 | 1402855 | 0001 | Endereço SAP | 101030100 | 101030100 |
| 966 | 23/09/2026 | 1408962 | 0001 | Endereço SAP | 101140200 | 101140200 |
| 930 | 23/09/2026 | 1410203 | 0002 | Valor Divergente | R$ 186,78 | R$ 176,25 |
| 882 | 23/09/2026 | 1425762 | 0001 | Nº Contagem | 1 | 2 |
| 906 | 23/09/2026 | 1433185 | 0001 | Endereço SAP | 101040100 | 101040100 |
| 903 | 23/09/2026 | 1434332 | 0001 | Endereço SAP | 101050200 | 101050200 |
| 922 | 23/09/2026 | 1434333 | 0001 | Endereço SAP | 101050200 | 101050200 |
| 888 | 23/09/2026 | 1437442 | 0001 | Endereço SAP | 101100100 | 101100100 |
| 889 | 23/09/2026 | 1438108 | 0001 | Endereço SAP | 101120200 | 101120200 |
| 884 | 23/09/2026 | 1438110 | 0001 | Endereço SAP | 101110300 | 101110300 |
| 892 | 23/09/2026 | 1438129 | 0001 | Endereço SAP | 101120100 | 101120100 |
| 908 | 23/09/2026 | 1443239 | 0002 | Valor Divergente | R$ 199,80 | R$ 84,13 |
| 980 | 24/09/2026 | 1283294 | 0002 | Valor Divergente | R$ 1.081,87 | R$ 1.035,34 |
| 1185 | 01/10/2026 | 1019121 | 0004 | Valor Divergente | R$ 61,84 | R$ 28,63 |
| 1183 | 01/10/2026 | 1196111 | 0004 | Valor Divergente | R$ 62,03 | R$ 44,31 |
| 1178 | 01/10/2026 | 1437768 | 0004 | Endereço Encontrado |   | Vazio |
| 1186 | 01/10/2026 | 1445721 | 0004 | Valor Divergente | R$ 0,00 | R$ 1.359,75 |
| 1195 | 01/10/2026 | 1445723 | 0004 | Valor Divergente | R$ 0,00 | R$ 2.969,46 |
| 1348 | 03/10/2026 | 1202563 | 0002 | Valor Divergente | R$ 176,64 | R$ 172,27 |
| 1349 | 03/10/2026 | 1357125 | 0002 | Valor Divergente | R$ 15,49 | R$ 13,74 |
| 1396 | 06/10/2026 | 1172431 | 0004 | Status | Divergência | OK |
| 1396 | 06/10/2026 | 1172431 | 0004 | Valor Divergente | R$ 30,44 | R$ 23,92 |
| 1400 | 06/10/2026 | 1174805 | 0004 | Status | Divergência | OK |
| 1400 | 06/10/2026 | 1174805 | 0004 | Valor Divergente | R$ 319,62 | R$ 199,76 |
| 1422 | 06/10/2026 | 1196347 | 0004 | Status | Divergência | OK |
| 1422 | 06/10/2026 | 1196347 | 0004 | Valor Divergente | R$ 136,76 | R$ 109,42 |
| 1487 | 06/10/2026 | 1399115 | 0004 | Valor Divergente | R$ 264,04 | R$ 88,01 |
| 1494 | 06/10/2026 | 1411598 | 0004 | Valor Divergente | R$ 6.000,00 | R$ 6.352,08 |
| 1530 | 07/10/2026 | 1151168 | 0004 | Valor Divergente | R$ 85,30 | R$ 80,56 |
| 1523 | 07/10/2026 | 1168545 | 0004 | Status | Divergência | OK |
| 1523 | 07/10/2026 | 1168545 | 0004 | Valor Divergente | R$ 232,89 | R$ 206,46 |
| 1562 | 07/10/2026 | 1171930 | 0004 | Nº Contagem | 1 | 2 |
| 1513 | 07/10/2026 | 1397628 | 0004 | Valor Divergente | R$ 94,34 | R$ 70,76 |
| 1567 | 09/10/2026 | 1412454 | 0004 | Valor Divergente | R$ 306,24 | R$ 212,01 |

