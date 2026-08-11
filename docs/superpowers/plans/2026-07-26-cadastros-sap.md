# Cadastros SAP — Implementation Plan

> **Para executores agênticos:** este plano é só banco de dados (migrations via MCP Supabase `apply_migration`/`execute_sql`), sem código no repositório. Execução inline nesta sessão, sem subagentes — os dados de carga vêm da conversa e não devem ser re-derivados.

**Goal:** Criar 4 tabelas de cadastro SAP (status de requisição, tipo de documento, grupo de mercadoria, tipo de movimento) populadas, mais 4 views decoradas que juntam essas tabelas com `requisicoes`, `estoque`, `pedidos` e `pedidosforn` para uso em relatórios.

**Architecture:** Ver [2026-07-26-cadastros-sap-design.md](../specs/2026-07-26-cadastros-sap-design.md). Tabelas `cadastro_*` com RLS de leitura para `authenticated` (sem policy de escrita, igual a `compradores`). FK real só em status de requisição; tipo de documento e grupo de mercadoria são decorados via `LEFT JOIN` nas views, sem FK enforçada.

**Tech Stack:** Postgres/Supabase, projeto `fwezzgduywgyhxinjurn`, MCP `apply_migration`/`execute_sql`.

## Global Constraints

- Toda migration usa `mcp__claude_ai_Supabase__apply_migration` com `project_id: "fwezzgduywgyhxinjurn"`.
- RLS habilitada em toda tabela nova, policy de leitura `for select to authenticated using (true)`, sem policy de escrita.
- Nenhuma FK enforçada em `tipo_de_documento`/`tpdc`/`tipo_doc_compra` nem em `grupo_de_mercadorias`/`grp_mercad`/`grupo_mercadorias`/`grp_mercads` — só em `requisicoes.status_processamento`.
- Views sempre `LEFT JOIN`, nunca podem reduzir o número de linhas da tabela de origem.

---

### Task 1: `cadastro_status_requisicao`

**Files:** nenhum arquivo local — migration remota via MCP.

**Interfaces:**
- Produz: tabela `public.cadastro_status_requisicao(codigo text PK, descricao text, detalhe text)`.

- [ ] **Passo 1: Aplicar a migration**

`name: "create_cadastro_status_requisicao"`

```sql
create table public.cadastro_status_requisicao (
  codigo text primary key,
  descricao text not null,
  detalhe text
);

alter table public.cadastro_status_requisicao enable row level security;
create policy cadastro_status_requisicao_read on public.cadastro_status_requisicao
  for select to authenticated using (true);

insert into public.cadastro_status_requisicao (codigo, descricao, detalhe) values
('A', 'Solicitação de cotação criada', 'Indica que o processamento já foi iniciado, porém a requisição ainda não se transformou em um pedido de compra para o mercado'),
('B', 'Pedido criado', 'Indica que já foi emitido um pedido de compra para a requisição, devendo este constar na base de Pedidos de Compra'),
('E', 'Solicitação de suprimento enviada a sistema externo', 'É utilizado quando se tem algum tipo de interface com sistemas externos de cotação'),
('K', 'Contrato criado', 'Indica que a linha da requisição está vinculada a algum contrato vigente da companhia e, portanto, deverá ser processada por meio deste contrato'),
('L', 'Programa de remessa criado', 'É utilizado quando uma requisição de compras é criada de forma referenciada a um programa de remessa'),
('N', 'Não processado', 'Indica que a requisição de compras foi apenas criada no SAP, mas ainda não foi iniciada nenhuma etapa de seu processamento'),
('S', 'Folha de registro de serviços criada', 'Pode ser utilizada no processo de compras de serviços, com o pedido de compras já tendo sua folha de medição criada');
```

- [ ] **Passo 2: Verificar**

```sql
select count(*) from public.cadastro_status_requisicao; -- esperado: 7

select count(*) from requisicoes r
left join cadastro_status_requisicao st on st.codigo = r.status_processamento
where r.status_processamento is not null and st.codigo is null; -- esperado: 0
```

---

### Task 2: `cadastro_tipo_documento`

**Interfaces:**
- Produz: tabela `public.cadastro_tipo_documento(categoria text, codigo text, denominacao text, PK (categoria, codigo))`.

- [ ] **Passo 1: Aplicar a migration**

`name: "create_cadastro_tipo_documento"`

```sql
create table public.cadastro_tipo_documento (
  categoria text not null,
  codigo text not null,
  denominacao text not null,
  primary key (categoria, codigo)
);

alter table public.cadastro_tipo_documento enable row level security;
create policy cadastro_tipo_documento_read on public.cadastro_tipo_documento
  for select to authenticated using (true);

insert into public.cadastro_tipo_documento (categoria, codigo, denominacao) values
('A','AB','Solicitação cotação'),
('A','AN','Solicitação cotação'),
('A','CPL','Consulta de estoque'),
('A','RAN','Consulta de estoque'),
('A','ZS01','Orçamento'),
('A','ZS02','Orçament. Projecto'),
('A','ZS03','Sub-Empreitada'),
('A','ZS04','Serviço'),
('B','FO','ZReq.compra quadro'),
('B','NB','ZRequisição compra'),
('B','RV','ZReq.contrato básic'),
('B','ZR01','Material Normal'),
('B','ZR02','Material Urgente'),
('B','ZR03','Material Máq Parada'),
('B','ZR04','Equipamento Pesado'),
('B','ZR05','Exportação Normal'),
('B','ZR06','Exportação Urgente'),
('B','ZR07','Exportação M.Parada'),
('B','ZR08','Export Equip Pesado'),
('B','ZR09','Orçamento'),
('B','ZR10','Sub-Empreitada'),
('B','ZR11','Serviço Normal'),
('B','ZR12','Transf. Imobilizado'),
('B','ZR13','Transf. entre Obras'),
('B','ZR14','Req. Devolução'),
('B','ZR15','Requisição MRP'),
('B','ZR16','Serviço Urgente'),
('B','ZR17','Serviço Máq Parada'),
('B','ZR18','Mater. Transf. Obras'),
('F','DB','Pedido dummy'),
('F','ENB','Pedido normal DFPS'),
('F','EUB','DFPS, tipo pedido'),
('F','FO','Pedido quadro'),
('F','NB','Pedido normal'),
('F','NBXE','Pedido transf.XLO'),
('F','NBXI','Pedido interno XLO'),
('F','UB','Pedido transf.estq.'),
('F','ZP01','Compra Local'),
('F','ZP02','Compra Impor/Expor'),
('F','ZP03','Compra Econstroi'),
('F','ZP04','Transferências'),
('F','ZP05','Sub-Empreitada'),
('F','ZP06','Serviço'),
('F','ZP07','Imobilizado Local'),
('F','ZP08','Imob. Impor/Expor'),
('F','ZP09','Imobilizado Portal'),
('F','ZP10','Consignação Local'),
('F','ZP11','Pedido Devolução'),
('F','ZP12','Transf. Imobilizado'),
('F','ZP13','Pedido Simplificado'),
('F','ZP14','Pedido InCompany'),
('F','ZP15','Importação'),
('F','ZP16','Entreg Futur/Benefic'),
('F','ZP17','Pedido Posterior'),
('F','ZP20','Pedido Externo SAP'),
('F','ZP99','Migração de Pedidos'),
('K','MK','Acordo em Quantidade'),
('K','WK','Contrato em Valor'),
('K','ZC01','Contrato Quantidade'),
('K','ZC02','Contrato Valor'),
('K','ZC03','Contrato Desconto'),
('K','ZC04','Contrato Preço'),
('K','ZC05','DGS Contrato Quant.'),
('K','ZC06','DGS Contrato Valor'),
('K','ZC07','DGS Contrato Preço'),
('L','LP','Programa de remessas'),
('L','LPA','Programa de remessas'),
('L','LPXE','Progr.rems.tranf.XLO'),
('L','LPXI','Progr.rems.int.XLO'),
('L','LU','Prg.remessas transf.');
```

- [ ] **Passo 2: Verificar**

```sql
select count(*) from public.cadastro_tipo_documento; -- esperado: 71

select count(*) from requisicoes r
left join cadastro_tipo_documento td on td.codigo = r.tipo_de_documento and td.categoria = 'B'
where r.tipo_de_documento is not null and td.codigo is null; -- esperado: 0

select count(*) from pedidosforn p
left join cadastro_tipo_documento td_rc on td_rc.codigo = p.tpdc and td_rc.categoria = 'B'
where p.tpdc is not null and td_rc.codigo is null; -- esperado: 0

select count(*) from pedidosforn p
left join cadastro_tipo_documento td_pc on td_pc.codigo = p.tipo_doc_compra and td_pc.categoria = 'F'
where p.tipo_doc_compra is not null and td_pc.codigo is null; -- esperado: 0
```

---

### Task 3: `cadastro_grupo_mercadoria`

**Interfaces:**
- Produz: tabela `public.cadastro_grupo_mercadoria(codigo text PK, denominacao text, denominacao2 text, classificacao_nivel1 text, codigo_pai text FK self)`.

- [ ] **Passo 1: Aplicar a migration**

`name: "create_cadastro_grupo_mercadoria"`

```sql
create table public.cadastro_grupo_mercadoria (
  codigo text primary key,
  denominacao text not null,
  denominacao2 text,
  classificacao_nivel1 text,
  codigo_pai text references public.cadastro_grupo_mercadoria(codigo)
);

alter table public.cadastro_grupo_mercadoria enable row level security;
create policy cadastro_grupo_mercadoria_read on public.cadastro_grupo_mercadoria
  for select to authenticated using (true);

insert into public.cadastro_grupo_mercadoria (codigo, denominacao, denominacao2, classificacao_nivel1) values
('1','Grp.mercadorias 1',null,'CONSUMÍVEL'),
('2','Grp.mercadorias 2',null,'CONSUMÍVEL'),
('B01','ABRASIVOS','ABRASIVOS','CONSUMÍVEL'),
('B0101','ABRASIVOS DISCO, LIX','ABRASIVOS DISCO, LIXA E REBOLO x','CONSUMÍVEL'),
('B0102','GRANALHAS DE ACO','GRANALHAS DE ACO','CONSUMÍVEL'),
('B04','AGREGADOS','AGREGADOS','CONSUMÍVEL'),
('B0401','AREIA','AREIA','CONSUMÍVEL'),
('B0402','BRITA GRADUADA','BRITA GRADUADA','CONSUMÍVEL'),
('B0403','SAIBRO E ARGILA','SAIBRO E ARGILA','CONSUMÍVEL'),
('B0404','SEIXO ROLADO','SEIXO ROLADO','CONSUMÍVEL'),
('B05','AGROPECUÁRIA','AGROPECUÁRIA','CONSUMÍVEL'),
('B0501','ACESSORIOS PARA JARD','ACESSORIOS PARA JARDIM','CONSUMÍVEL'),
('B0502','ADUBOS E SEMENTES','ADUBOS E SEMENTES','CONSUMÍVEL'),
('B0503','DEFENSIVOS AGRICOLAS','DEFENSIVOS AGRICOLAS','CONSUMÍVEL'),
('B0504','EQUIPAMENTOS E IMPLE','EQUIPAMENTOS E IMPLEMENTOS','CONSUMÍVEL'),
('B0505','PRODUTOS VETERINARIO','PRODUTOS VETERINARIOS','CONSUMÍVEL'),
('B0506','ANIMAIS VIVOS','ANIMAIS VIVOS','CONSUMÍVEL'),
('B06','ARTIGOS PARA CAMA, M','ARTIGOS PARA CAMA, MESA E BANHO','CONSUMÍVEL'),
('B0601','TECIDO','TECIDO','CONSUMÍVEL'),
('B0602','CAMA, MESA, BANHO E','CAMA, MESA, BANHO E ACESSORIOS','CONSUMÍVEL'),
('B07','BORRACHAS, PLÁSTICOS','BORRACHAS, PLÁSTICOS E ARTEFATOS','CONSUMÍVEL'),
('B0701','APARELHO DE APOIO NE','APARELHO DE APOIO NEOPRENE','CONSUMÍVEL'),
('B0702','ARTEFATO DE BORRACHA','ARTEFATO DE BORRACHA','CONSUMÍVEL'),
('B0703','ARTEFATOS DE PLASTIC','ARTEFATOS DE PLASTICOS','CONSUMÍVEL'),
('B0704','CAMARA DE AR E ACESS','CAMARA DE AR E ACESSORIOS PARA PNEU','CONSUMÍVEL'),
('B0705','ENCERADO E LONA','ENCERADO E LONA','CONSUMÍVEL'),
('B0706','PNEU','PNEU','CONSUMÍVEL'),
('B0707','ELASTÔMEROS, ESPUMAS','ELASTÔMEROS, ESPUMAS E LATEX','CONSUMÍVEL'),
('B10','COMBUSTÍVEIS E LUBRI','COMBUSTÍVEIS E LUBRIFICANTES','CONSUMÍVEL'),
('B1001','CARVAO MINERAL','CARVAO MINERAL','CONSUMÍVEL'),
('B1002','CARVAO VEGETAL','CARVAO VEGETAL','CONSUMÍVEL'),
('B1003','COMBUSTIVEIS','COMBUSTIVEIS','CONSUMÍVEL'),
('B1004','OLEO LUBRIFICANTE','OLEO LUBRIFICANTE','CONSUMÍVEL'),
('B1005','GRAXA','GRAXA','CONSUMÍVEL'),
('B1006','COMBUSTIVEL AERONAVE','COMBUSTIVEL DE AERONAVES','CONSUMÍVEL'),
('B1007','LUBRIF. AERONAVES','LUBRIFICANTES DE AERONAVES','CONSUMÍVEL'),
('B13','COZINHA E UTENSÍLIOS','COZINHA E UTENSÍLIOS','CONSUMÍVEL'),
('B1301','ACESSORIOS E UTENSIL','ACESSORIOS E UTENSILIOS PARA COZINHA','CONSUMÍVEL'),
('B1302','EQUIPAMENTOS DE COZI','EQUIPAMENTOS DE COZINHA','CONSUMÍVEL'),
('B1303','COMISSARIA','COMISSARIA','CONSUMÍVEL'),
('B16','ELEMENTOS DE FIXAÇÃO','ELEMENTOS DE FIXAÇÃO','CONSUMÍVEL'),
('B1601','CHUMBADORES, TIRANTE','CHUMBADORES, TIRANTES  PARA CONCRETO','CONSUMÍVEL'),
('B1602','PARAFUSOS, PORCAS E','PARAFUSOS, PORCAS E ARRUELAS','CONSUMÍVEL'),
('B1603','REBITES E CONTRAPINO','REBITES E CONTRAPINOS','CONSUMÍVEL'),
('B17','EMBALAGENS','EMBALAGENS','CONSUMÍVEL'),
('B1701','CAIXAS E FITAS','CAIXAS E FITAS','CONSUMÍVEL'),
('B1702','EMBALAGENS DESCARTAV','EMBALAGENS DESCARTAVEIS','CONSUMÍVEL'),
('B1703','SACARIA','SACARIA','CONSUMÍVEL'),
('B1704','LACRES','LACRES','CONSUMÍVEL'),
('B1705','CONTAINERS PARA TRAN','CONTAINERS PARA TRANSPORTE','CONSUMÍVEL'),
('B1706','BOMBONAS PLASTICAS','BOMBONAS PLASTICAS','CONSUMÍVEL'),
('B1707','TAMBORES METALICOS','TAMBORES METALICOS','CONSUMÍVEL'),
('B23','ESCRITÓRIOS','ESCRITÓRIOS','CONSUMÍVEL'),
('B2301','BEBEDOUROS','BEBEDOUROS','CONSUMÍVEL'),
('B2302','EQUIPAMENTOS E ACESS','EQUIPAMENTOS E ACESSORIOS','CONSUMÍVEL'),
('B2303','MOVEIS METALICOS','MOVEIS METALICOS','CONSUMÍVEL'),
('B2304','MOVEIS NAO METALICOS','MOVEIS NAO METALICOS','CONSUMÍVEL'),
('B26','FERRAMENTAS','FERRAMENTAS','CONSUMÍVEL'),
('B2601','CORTE EM GERAL','CORTE EM GERAL','CONSUMÍVEL'),
('B2602','ELETRICAS','ELETRICAS','CONSUMÍVEL'),
('B2603','ESPECIAIS PARA MANUT','ESPECIAIS PARA MANUTENCAO','CONSUMÍVEL'),
('B2604','HIDRAULICAS','HIDRAULICAS','CONSUMÍVEL'),
('B2605','MANUAIS','MANUAIS','CONSUMÍVEL'),
('B2606','PNEUMATICAS','PNEUMATICAS','CONSUMÍVEL'),
('B2607','PEÇAS PARA FERRAMENT','PEÇAS PARA FERRAMENTAS EM GERAL','CONSUMÍVEL'),
('B30','GÁS INDUSTRIAL','GÁS INDUSTRIAL','CONSUMÍVEL'),
('B3001','ACETILENO','ACETILENO','CONSUMÍVEL'),
('B3002','OUTROS GASES','OUTROS GASES','CONSUMÍVEL'),
('B3003','OXIGENIO','OXIGENIO','CONSUMÍVEL'),
('B31','GÊNEROS ALIMENTÍCIOS','GÊNEROS ALIMENTÍCIOS','CONSUMÍVEL'),
('B3101','CONSUMIVEIS COMERCIA','CONSUMIVEIS COMERCIALIZADOS POR PESO','CONSUMÍVEL'),
('B3102','CONSUMIVEIS COMERCIA','CONSUMIVEIS COMERCIALIZADOS POR UNIDADE','CONSUMÍVEL'),
('B32','HIGIENE E LIMPEZA','HIGIENE E LIMPEZA','CONSUMÍVEL'),
('B3201','ESTOPAS E TRAPOS','ESTOPAS E TRAPOS','CONSUMÍVEL'),
('B3202','MATERIAIS DOMESTICOS','MATERIAIS DOMESTICOS','CONSUMÍVEL'),
('B3203','MATERIAIS INDUSTRIAI','MATERIAIS INDUSTRIAIS','CONSUMÍVEL'),
('B3204','AGUA','AGUA','CONSUMÍVEL'),
('B3205','ARTIGOS DE HIGIENE','ARTIGOS DE HIGIENE','CONSUMÍVEL'),
('B33','HOSPITALAR','HOSPITALAR','CONSUMÍVEL'),
('B3301','EQUIPAMENTOS HOSPITA','EQUIPAMENTOS HOSPITALARES','CONSUMÍVEL'),
('B3302','MEDICAMENTOS','MEDICAMENTOS','CONSUMÍVEL'),
('B3303','MATERIAL DE PROCEDIM','MATERIAL DE PROCEDIMENTO HOSPITALAR','CONSUMÍVEL'),
('B3304','EQUIPAMENTOS ODONTOL','EQUIPAMENTOS ODONTOLÓGICOS','CONSUMÍVEL'),
('B3305','MATERIAL DE PROCEDIM','MATERIAL DE PROCEDIMENTO ODONTOLÓGICO','CONSUMÍVEL'),
('B34','IDENTIFICAÇÃO E SINA','IDENTIFICAÇÃO E SINALIZAÇÃO','CONSUMÍVEL'),
('B3401','ADESIVOS E ETIQUETAS','ADESIVOS E ETIQUETAS  PARA IDENTIFICACAO VISUAL','CONSUMÍVEL'),
('B3402','SINALIZAÇÃO INDUSTRI','SINALIZAÇÃO INDUSTRIAL.','CONSUMÍVEL'),
('B3403','SINALIZAÇÃO RODOVIAR','SINALIZAÇÃO RODOVIARIA','CONSUMÍVEL'),
('B3404','SINALIZAÇÃO AEREA','SINALIZAÇÃO AEREA','CONSUMÍVEL'),
('B35','IMPERMEABILIZAÇÃO','IMPERMEABILIZAÇÃO','CONSUMÍVEL'),
('B3501','MANTA ASFALTICA','MANTA ASFALTICA','CONSUMÍVEL'),
('B3502','MATERIAIS IMPERMEABI','MATERIAIS IMPERMEABILIZANTES','CONSUMÍVEL'),
('B3503','IMPERMEABILIZAÇÃO MA','IMPERMEABILIZAÇÃO MATERIAIS DE TRATAMENTO DE PISOS','CONSUMÍVEL'),
('B38','ISOLAMENTO','ISOLAMENTO','CONSUMÍVEL'),
('B3801','ISOLANTES ACUSTICOS','ISOLANTES ACUSTICOS','CONSUMÍVEL'),
('B3802','ISOLANTES PARA MOTOR','ISOLANTES PARA MOTORES','CONSUMÍVEL'),
('B3803','ISOLANTES TERMICOS','ISOLANTES TERMICOS','CONSUMÍVEL'),
('B3804','REFRATARIOS','REFRATARIOS','CONSUMÍVEL'),
('B39','JUNTAS E GAXETAS','JUNTAS E GAXETAS','CONSUMÍVEL'),
('B3901','GAXETA GRAFITADA E D','GAXETA GRAFITADA E DE AMIANTO','CONSUMÍVEL'),
('B3902','JUNTA DE BORRACHA','JUNTA DE BORRACHA','CONSUMÍVEL'),
('B3903','JUNTA DE DILATACAO','JUNTA DE DILATACAO','CONSUMÍVEL'),
('B3904','JUNTA DE EXPANSAO','JUNTA DE EXPANSAO','CONSUMÍVEL'),
('B3905','JUNTA DE PAPELAO HID','JUNTA DE PAPELAO HIDRAULICO E GRAFITADA','CONSUMÍVEL'),
('B3906','JUNTA ELASTICA','JUNTA ELASTICA','CONSUMÍVEL'),
('B3907','JUNTA PARA FLANGE','JUNTA PARA FLANGE','CONSUMÍVEL'),
('B3908','JUNTAS METALICAS','JUNTAS METALICAS','CONSUMÍVEL'),
('B48','PAPELARIA E LIVRARIA','PAPELARIA E LIVRARIA','CONSUMÍVEL'),
('B4801','ARTIGOS DE LIVRARIA','ARTIGOS DE LIVRARIA','CONSUMÍVEL'),
('B4802','ARTIGOS DE PAPELARIA','ARTIGOS DE PAPELARIA','CONSUMÍVEL'),
('B4803','CARIMBOS','CARIMBOS','CONSUMÍVEL'),
('B4804','MATERIAL PARA DESENH','MATERIAL PARA DESENHO','CONSUMÍVEL'),
('B4805','PAPEL E FORMULARIOS','PAPEL E FORMULARIOS','CONSUMÍVEL'),
('B49','PEÇA PARA EQUIPAMENT','PEÇA PARA EQUIPAMENTOS DE TERRAPLENAGEM','CONSUMÍVEL'),
('B4901','AUSA','AUSA','CONSUMÍVEL'),
('B4902','BALDAN','BALDAN','CONSUMÍVEL'),
('B4903','BOMAG','BOMAG','CONSUMÍVEL'),
('B4904','BROYT','BROYT','CONSUMÍVEL'),
('B4905','CASE','CASE','CONSUMÍVEL'),
('B4906','CATERPILLAR','CATERPILLAR','CONSUMÍVEL'),
('B4907','CBT','CBT','CONSUMÍVEL'),
('B4908','CIVEMASA','CIVEMASA','CONSUMÍVEL'),
('B4909','CLARK MICHIGAN','CLARK MICHIGAN','CONSUMÍVEL'),
('B4910','DYNAPAC/VIBRO/FLYGT','DYNAPAC/VIBRO/FLYGT','CONSUMÍVEL'),
('B4911','FIATALLIS','FIATALLIS','CONSUMÍVEL'),
('B4912','FLYGTH - TERRAPLENAG','FLYGTH - TERRAPLENAGEM','CONSUMÍVEL'),
('B4913','HUBER WARCO','HUBER WARCO','CONSUMÍVEL'),
('B4914','JCB','JCB','CONSUMÍVEL'),
('B4915','JOHN DEERE','JOHN DEERE','CONSUMÍVEL'),
('B4916','KOMATSU TERRAPLENAGE','KOMATSU TERRAPLENAGEM','CONSUMÍVEL'),
('B4917','MARCHESAN/TATU','MARCHESAN/TATU','CONSUMÍVEL'),
('B4918','MASSEY FERGUSON','MASSEY FERGUSON','CONSUMÍVEL'),
('B4919','MULLER','MULLER','CONSUMÍVEL'),
('B4920','NEW HOLAND','NEW HOLAND','CONSUMÍVEL'),
('B4921','NICOLA ROME/ ROME PL','NICOLA ROME/ ROME PLOW','CONSUMÍVEL'),
('B4922','POCLAIN','POCLAIN','CONSUMÍVEL'),
('B4923','RANDON KOCKUM','RANDON KOCKUM','CONSUMÍVEL'),
('B4924','SANTA MATILDE','SANTA MATILDE','CONSUMÍVEL'),
('B4925','TEMA TERRA','TEMA TERRA','CONSUMÍVEL'),
('B4926','TEREX/GM','TEREX/GM','CONSUMÍVEL'),
('B4927','TOBATTA/KUBOTA TEKKO','TOBATTA/KUBOTA TEKKO','CONSUMÍVEL'),
('B4928','VALMET','VALMET','CONSUMÍVEL'),
('B4929','DOOSAN','DOOSAN','CONSUMÍVEL'),
('B4930','ENGESA','ENGESA','CONSUMÍVEL'),
('B4931','BOBCAT','BOBCAT','CONSUMÍVEL'),
('B4932','DESGASTE','DESGASTE','CONSUMÍVEL'),
('B4933','MATERIAL RODANTE','MATERIAL RODANTE','CONSUMÍVEL'),
('B4934','HITACHI','HITACHI','CONSUMÍVEL'),
('B4935','AMMANN','PECA PARA EQUIPAMENTOS DE TERRAPLENAGEM – AMMANN','CONSUMÍVEL'),
('B4936','PICCIN','PECA PARA EQUIPAMENTOS DE TERRAPLENAGEM – PICCIN','CONSUMÍVEL'),
('B4940','Bitelli','Bitelli','CONSUMÍVEL'),
('B4941','Corinsa','Corinsa','CONSUMÍVEL'),
('B4942','Galucho','Galucho','CONSUMÍVEL'),
('B4943','GHH','GHH','CONSUMÍVEL'),
('B4944','Joper','Joper','CONSUMÍVEL'),
('B4945','Lisprene','Lisprene','CONSUMÍVEL'),
('B4946','Thwaites','Thwaites','CONSUMÍVEL'),
('B4947','Herculano','Herculano','CONSUMÍVEL'),
('B4948','Wirtgen','Wirtgen','CONSUMÍVEL'),
('B4949','LIEBHERR','LIEBHERR','CONSUMÍVEL'),
('B4950','XCMG','XCMG','CONSUMÍVEL'),
('B50','PEÇAS DE EQUIPAMENTO','PEÇAS DE EQUIPAMENTOS PARA ASFALTO','CONSUMÍVEL'),
('B5001','ALMEIDA','ALMEIDA','CONSUMÍVEL'),
('B5002','CLEMENTE CIFALLI','CLEMENTE CIFALLI','CONSUMÍVEL'),
('B5003','CMV','CMV','CONSUMÍVEL'),
('B5004','VOGELE','VOGELE','CONSUMÍVEL'),
('B5005','HAMM','HAMM','CONSUMÍVEL'),
('B5006','ROMANELLI','ROMANELLI','CONSUMÍVEL'),
('B5007','Ermont','Ermont','CONSUMÍVEL'),
('B5008','Massenza','Massenza','CONSUMÍVEL'),
('B5009','IXON','IXON','CONSUMÍVEL'),
('B51','PEÇAS DE EQUIPAMENTO','PEÇAS DE EQUIPAMENTOS PARA CONCRETO','CONSUMÍVEL'),
('B5101','ALFA','ALFA','CONSUMÍVEL'),
('B5102','BETON','BETON','CONSUMÍVEL'),
('B5103','CIBER','CIBER','CONSUMÍVEL'),
('B5104','CIBI','CIBI','CONSUMÍVEL'),
('B5105','CIFALI','CIFALI','CONSUMÍVEL'),
('B5106','CLARIDON','CLARIDON','CONSUMÍVEL'),
('B5107','ERIE','ERIE','CONSUMÍVEL'),
('B5108','FLYGHT - CONCRETO','FLYGHT - CONCRETO','CONSUMÍVEL'),
('B5109','JOHNSON','JOHNSON','CONSUMÍVEL'),
('B5110','LIDER','LIDER','CONSUMÍVEL'),
('B5111','MENEGOTTE','MENEGOTTE','CONSUMÍVEL'),
('B5112','PENEDO','PENEDO','CONSUMÍVEL'),
('B5113','PUTZMEISTER','PUTZMEISTER','CONSUMÍVEL'),
('B5114','REX TIB','REX TIB','CONSUMÍVEL'),
('B5115','SCHWING SIWA','SCHWING SIWA','CONSUMÍVEL'),
('B5116','FIORI','FIORI','CONSUMÍVEL'),
('B5117','Arcen','Arcen','CONSUMÍVEL'),
('B5118','CIFA','CIFA','CONSUMÍVEL'),
('B5119','Elba','Elba','CONSUMÍVEL'),
('B5120','Gomaco','Gomaco','CONSUMÍVEL'),
('B5121','Merlo','Merlo','CONSUMÍVEL'),
('B5122','Power Curbers','Power Curbers','CONSUMÍVEL'),
('B5123','Messersi','Messersi','CONSUMÍVEL'),
('B5124','ROTEC','ROTEC','CONSUMÍVEL'),
('B5125','ELKON','ELKON','CONSUMÍVEL'),
('B5126','SANY','SANY','CONSUMÍVEL'),
('B5127','MAPEL','MAPEL','CONSUMÍVEL'),
('B52','PEÇAS PARA BOMBA','PEÇAS PARA BOMBA','CONSUMÍVEL'),
('B5201','ABS','ABS','CONSUMÍVEL'),
('B5202','ALBRIZZI','ALBRIZZI','CONSUMÍVEL'),
('B5203','ALIVA','ALIVA','CONSUMÍVEL'),
('B5204','AMERICAN AERO-WATER','AMERICAN AERO-WATER BLASTER','CONSUMÍVEL'),
('B5205','FLYGHT - BOMBAS','FLYGHT - BOMBAS','CONSUMÍVEL'),
('B5206','HIDROSUL','HIDROSUL','CONSUMÍVEL'),
('B5207','JACTO','JACTO','CONSUMÍVEL'),
('B5208','JACUZZI','JACUZZI','CONSUMÍVEL'),
('B5209','KARCHER','KARCHER','CONSUMÍVEL'),
('B5210','KSB','KSB','CONSUMÍVEL'),
('B5211','RACINE/REXNORD','RACINE/REXNORD','CONSUMÍVEL'),
('B5212','SPV','SPV','CONSUMÍVEL'),
('B5213','WORTHINGTON','WORTHINGTON','CONSUMÍVEL'),
('B5214','FLOWSERVE','FLOWSERVE','CONSUMÍVEL'),
('B5215','HIDROJATEAMENTO','HIDROJATEAMENTO','CONSUMÍVEL'),
('B5216','ITUBOMBAS','ITUBOMBAS','CONSUMÍVEL'),
('B53','PEÇAS PARA EMPILHADE','PEÇAS PARA EMPILHADEIRA','CONSUMÍVEL'),
('B5301','HYSTER','HYSTER','CONSUMÍVEL'),
('B5302','KOMATSU - EMPILHADEI','KOMATSU - EMPILHADEIRAS','CONSUMÍVEL'),
('B5303','YALE','YALE','CONSUMÍVEL'),
('B5304','Manitou','Manitou','CONSUMÍVEL'),
('B54','PEÇAS PARA EQUIPAMEN','PEÇAS PARA EQUIPAMENTO DE LUBRIFICAÇÃO','CONSUMÍVEL'),
('B5401','BOZZA','BOZZA','CONSUMÍVEL'),
('B5402','COBEL','COBEL','CONSUMÍVEL'),
('B55','PEÇAS PARA EQUIPAMEN','PEÇAS PARA EQUIPAMENTO DE SOLDA','CONSUMÍVEL'),
('B5501','BAMBOZZI','BAMBOZZI','CONSUMÍVEL'),
('B5502','LINCOLN','LINCOLN','CONSUMÍVEL'),
('B5503','PRODELEC','PRODELEC','CONSUMÍVEL'),
('B5504','ESAB','ESAB','CONSUMÍVEL'),
('B5505','MILLER','MILLER','CONSUMÍVEL'),
('B5506','CARBOGRAFITE','PECAS PARA EQUIPAMENTOS DE SOLDA – CARBOGRAFITE','CONSUMÍVEL'),
('B56','PEÇAS PARA EQUIPAMEN','PEÇAS PARA EQUIPAMENTO DE USINAGEM','CONSUMÍVEL'),
('B5601','IMOR / NARDINI','IMOR / NARDINI','CONSUMÍVEL'),
('B5602','INVICTA','INVICTA','CONSUMÍVEL'),
('B5603','ROMI','ROMI','CONSUMÍVEL'),
('B57','PEÇAS PARA EQUIPAMEN','PEÇAS PARA EQUIPAMENTO INDUSTRIAL','CONSUMÍVEL'),
('B5701','DEMAG','DEMAG','CONSUMÍVEL'),
('B5702','TOYO','TOYO','CONSUMÍVEL'),
('B5703','MATHEY DEARMAN','MATHEY DEARMAN','CONSUMÍVEL'),
('B5705','AGTHERM','PECAS PARA EQUIPAMENTO INDUSTRIAL','CONSUMÍVEL'),
('B58','PEÇAS PARA EQUIPAMEN','PEÇAS PARA EQUIPAMENTO PNEUMATICO','CONSUMÍVEL'),
('B5801','AIR SERVICE','AIR SERVICE','CONSUMÍVEL'),
('B5802','ATLAS COPCO','ATLAS COPCO','CONSUMÍVEL'),
('B5803','BROBRAS','BROBRAS','CONSUMÍVEL'),
('B5804','CHICAGO PNEUMATIC','CHICAGO PNEUMATIC','CONSUMÍVEL'),
('B5805','DRESSER','DRESSER','CONSUMÍVEL'),
('B5806','GARDER DENVER','GARDER DENVER','CONSUMÍVEL'),
('B5807','HOOS','HOOS','CONSUMÍVEL'),
('B5808','INGERSOL RAND','INGERSOL RAND','CONSUMÍVEL'),
('B5809','ROCK MACHINES','ROCK MACHINES','CONSUMÍVEL'),
('B5810','SABROE','SABROE','CONSUMÍVEL'),
('B5811','SULLAIR','SULLAIR','CONSUMÍVEL'),
('B5812','TAMROCK','TAMROCK','CONSUMÍVEL'),
('B5813','TORNIBRAS','TORNIBRAS','CONSUMÍVEL'),
('B5814','WAYNE','WAYNE','CONSUMÍVEL'),
('B5815','WIRTH','WIRTH','CONSUMÍVEL'),
('B5816','GARCIA','GARCIA','CONSUMÍVEL'),
('B5817','KAESER','KAESER','CONSUMÍVEL'),
('B5818','PW HIDROPNEUMATICA','PW HIDROPNEUMATICA','CONSUMÍVEL'),
('B5819','Asco','Asco','CONSUMÍVEL'),
('B5820','Compair','Compair','CONSUMÍVEL'),
('B5821','WOLF–HIDROPNEUMATICA','WOLF – HIDROPNEUMATICA','CONSUMÍVEL'),
('B5823','PECAS PARA FERRAMENT','PECAS PARA FERRAMENTAS/EQUIPAMENTOS PNEUMATICOS','CONSUMÍVEL'),
('B59','PEÇAS PARA EQUIPAMEN','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA','CONSUMÍVEL'),
('B5901','BECKER / KOSTAL','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA BECKER / KOSTAL','CONSUMÍVEL'),
('B5902','CLO ZIRONI','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA CLO ZIRONI','CONSUMÍVEL'),
('B5903','ERMETO','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA ERMETO','CONSUMÍVEL'),
('B5904','ESTE','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA ESTE','CONSUMÍVEL'),
('B5905','FAREX','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA FAREX','CONSUMÍVEL'),
('B5906','HATSUTA','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA HATSUTA','CONSUMÍVEL'),
('B5907','HUSQVARNA','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA HUSQVARNA','CONSUMÍVEL'),
('B5908','MONTANA','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA MONTANA','CONSUMÍVEL'),
('B5909','STAHL','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA STAHL','CONSUMÍVEL'),
('B5910','STIHL','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA STIHL','CONSUMÍVEL'),
('B5911','WACKER','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA WACKER','CONSUMÍVEL'),
('B5912','WEBER','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA WEBER','CONSUMÍVEL'),
('B5913','TAETS','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA TAETS','CONSUMÍVEL'),
('B5914','Haulotte','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA Haulotte','CONSUMÍVEL'),
('B5915','Montabert','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA Montabert','CONSUMÍVEL'),
('B5916','Dewalt','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA Dewalt','CONSUMÍVEL'),
('B5917','WAYNE/SOMAR','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA WAYNE/SOMAR','CONSUMÍVEL'),
('B5918','MAQTRON','PEÇAS PARA EQUIPAMENTOS DE APOIO A OBRA MAQTRON','CONSUMÍVEL'),
('B5919','TOYAMA','TOYAMA','CONSUMÍVEL'),
('B60','PEÇAS PARA EQUIPAMEN','PEÇAS PARA EQUIPAMENTOS DE BRITAGEM','CONSUMÍVEL'),
('B6001','BARBER GREENE','BARBER GREENE','CONSUMÍVEL'),
('B6002','BARMAQ','BARMAQ','CONSUMÍVEL'),
('B6003','SANDVIK','SANDVIK','CONSUMÍVEL'),
('B6004','METSO / FACO','METSO / FACO','CONSUMÍVEL'),
('B6005','NORDBERG','NORDBERG','CONSUMÍVEL'),
('B6006','IMETEC','IMETEC','CONSUMÍVEL'),
('B6007','FINTEC','FINTEC','CONSUMÍVEL'),
('B6008','PEÇAS PARA EQUIPAMEN','PEÇAS PARA EQUIPAMENTOS DE BRITAGEM - TELSMITH','CONSUMÍVEL'),
('B61','PEÇAS PARA GUINDASTE','PEÇAS PARA GUINDASTE','CONSUMÍVEL'),
('B6101','AMERICA','AMERICA','CONSUMÍVEL'),
('B6102','AMERICAN HOIST','AMERICAN HOIST','CONSUMÍVEL'),
('B6103','BANTAN','BANTAN','CONSUMÍVEL'),
('B6104','BUCYRUS ERIE','BUCYRUS ERIE','CONSUMÍVEL'),
('B6105','CALMESCRI','CALMESCRI','CONSUMÍVEL'),
('B6106','FMB','FMB','CONSUMÍVEL'),
('B6107','GALION','GALION','CONSUMÍVEL'),
('B6108','MANITOWOC-GROVE','MANITOWOC-GROVE','CONSUMÍVEL'),
('B6109','HERCULES','HERCULES','CONSUMÍVEL'),
('B6110','KRANE KAR','KRANE KAR','CONSUMÍVEL'),
('B6111','LIEBHERR','LIEBHERR','CONSUMÍVEL'),
('B6112','LINKBELT','LINKBELT','CONSUMÍVEL'),
('B6113','MADAL/PALFINGER','MADAL / PALFINGER','CONSUMÍVEL'),
('B6114','MUNCK','MUNCK','CONSUMÍVEL'),
('B6115','P&H VILLARES','P&H VILLARES - PECAS PARA GUINDASTE','CONSUMÍVEL'),
('B6116','SAMPSON','SAMPSON','CONSUMÍVEL'),
('B6117','TORQUE','TORQUE','CONSUMÍVEL'),
('B6118','TEREX - GUINDASTES','TEREX - GUINDASTES','CONSUMÍVEL'),
('B6119','Hiab','Hiab','CONSUMÍVEL'),
('B6120','Potain','Potain','CONSUMÍVEL'),
('B6121','PPM','PPM','CONSUMÍVEL'),
('B6122','TADANO','PECAS PARA GUINDASTE – TADANO','CONSUMÍVEL'),
('B62','PEÇAS PARA IMPLEMENT','PEÇAS PARA IMPLEMENTO RODOVIÁRIO','CONSUMÍVEL'),
('B6201','BISELLI','BISELLI','CONSUMÍVEL'),
('B6202','FACCHINI','FACCHINI','CONSUMÍVEL'),
('B6203','FERROL','FERROL','CONSUMÍVEL'),
('B6204','FNV / FRUEHAUF','FNV / FRUEHAUF','CONSUMÍVEL'),
('B6205','KABI','KABI','CONSUMÍVEL'),
('B6206','KIBRAS','KIBRAS','CONSUMÍVEL'),
('B6207','MASSARI','MASSARI','CONSUMÍVEL'),
('B6208','RANDON','RANDON','CONSUMÍVEL'),
('B6209','ROSSETI','ROSSETI','CONSUMÍVEL'),
('B6210','SANVAS','SANVAS','CONSUMÍVEL'),
('B6211','TRIVELLATO','TRIVELLATO','CONSUMÍVEL'),
('B6212','GASCON','GASCON','CONSUMÍVEL'),
('B63','PEÇAS PARA MOTOR','PEÇAS PARA MOTOR','CONSUMÍVEL'),
('B6301','AGRALE','AGRALE','CONSUMÍVEL'),
('B6302','CUMMINS','CUMMINS','CONSUMÍVEL'),
('B6303','DEUTZ','DEUTZ','CONSUMÍVEL'),
('B6304','EVINRUDE / JOHNSON','EVINRUDE / JOHNSON','CONSUMÍVEL'),
('B6305','HATZ','HATZ','CONSUMÍVEL'),
('B6306','HONDA','HONDA','CONSUMÍVEL'),
('B6307','MERCURY','MERCURY','CONSUMÍVEL'),
('B6308','MONTGOMERY','MONTGOMERY','CONSUMÍVEL'),
('B6309','MWM','MWM','CONSUMÍVEL'),
('B6310','PERKINS','PERKINS','CONSUMÍVEL'),
('B6311','SUPERIOR DIESEL','SUPERIOR DIESEL','CONSUMÍVEL'),
('B6312','SUZUKI','SUZUKI','CONSUMÍVEL'),
('B6313','TIETE','TIETE','CONSUMÍVEL'),
('B6314','TOBATA','TOBATA','CONSUMÍVEL'),
('B6315','YAMAHA','PECAS PARA MOTOR - YAMAHA','CONSUMÍVEL'),
('B6316','YAMMAR','YAMMAR','CONSUMÍVEL'),
('B6317','Lister-Petter','Lister-Petter','CONSUMÍVEL'),
('B6318','Yanmar','Yanmar','CONSUMÍVEL'),
('B6319','Olympian','Olympian','CONSUMÍVEL'),
('B6320','Himoinsa','Himoinsa','CONSUMÍVEL'),
('B6321','Branco','Branco','CONSUMÍVEL'),
('B64','PEÇAS PARA UNIDADE H','PEÇAS PARA UNIDADE HIDRAULICA','CONSUMÍVEL'),
('B6401','COMMERCIAL HIDRAULIC','COMMERCIAL HIDRAULICA / COMERCIAL SHEARING','CONSUMÍVEL'),
('B6402','REXROTH','REXROTH','CONSUMÍVEL'),
('B6403','SCHRADER','SCHRADER','CONSUMÍVEL'),
('B6404','SUNDSTRAND','SUNDSTRAND','CONSUMÍVEL'),
('B6405','HYVA','HYVA','CONSUMÍVEL'),
('B65','PEÇAS PARA VEÍCULOS','PEÇAS PARA VEÍCULOS E EQUIPAMENTOS','CONSUMÍVEL'),
('B6501','CORREIAS','CORREIAS','CONSUMÍVEL'),
('B6502','CRUZETAS E CARDANS','CRUZETAS E CARDANS','CONSUMÍVEL'),
('B6503','FILTROS E ELEMENTOS','FILTROS E ELEMENTOS','CONSUMÍVEL'),
('B6504','FREIOS E EMBREAGENS','FREIOS E EMBREAGENS','CONSUMÍVEL'),
('B6505','INSTRUMENTOS PARA PA','INSTRUMENTOS PARA PAINEIS DE VEICULOS','CONSUMÍVEL'),
('B6506','MATERIAL ELETRICO PA','MATERIAL ELETRICO PARA VEICULOS E EQUIPAMENTOS','CONSUMÍVEL'),
('B6507','PECAS USADAS DE EQUI','PECAS USADAS DE EQUIPAMENTOS','CONSUMÍVEL'),
('B6508','PEÇAS PARA VEÍCULOS','PEÇAS PARA VEÍCULOS E EQUIPAMENTOS T','CONSUMÍVEL'),
('B6509','RADIADORES','RADIADORES','CONSUMÍVEL'),
('B6510','REDUTORES DE VELOCID','REDUTORES DE VELOCIDADE','CONSUMÍVEL'),
('B6511','RETENTORES','RETENTORES','CONSUMÍVEL'),
('B6512','ROLAMENTOS E MANCAIS','ROLAMENTOS E MANCAIS','CONSUMÍVEL'),
('B6513','SUSPENSAO - MOLAS E','SUSPENSAO - MOLAS E AMORTECEDORES','CONSUMÍVEL'),
('B6514','VALVULAS E BOBINAS','VALVULAS E BOBINAS','CONSUMÍVEL'),
('B6515','OUTRAS PEÇAS','OUTRAS PEÇAS','CONSUMÍVEL'),
('B6516','ACOPLAMENTOS','ACOPLAMENTOS','CONSUMÍVEL'),
('B6517','MATERIAL RODANTE','MATERIAL RODANTE','CONSUMÍVEL'),
('B6518','PEÇAS E CONEXOES PAR','PEÇAS E CONEXOES PARA REFRIGERAÇÃO AUTOMOTIVA','CONSUMÍVEL'),
('B66','PEÇAS VEÍCULOS/EQUI','PEÇAS PARA VEÍCULOS LEVES E EQUIPAMENTOS','CONSUMÍVEL'),
('B6601','CHEROKEE','CHEROKEE','CONSUMÍVEL'),
('B6602','CHEVROLET','CHEVROLET','CONSUMÍVEL'),
('B6603','CHRYSLER','CHRYSLER','CONSUMÍVEL'),
('B6604','CITROEN','CITROEN','CONSUMÍVEL'),
('B6605','DAIHATSU','DAIHATSU','CONSUMÍVEL'),
('B6606','FIAT','FIAT','CONSUMÍVEL'),
('B6607','FORD','FORD','CONSUMÍVEL'),
('B6608','HYUNDAI','HYUNDAI','CONSUMÍVEL'),
('B6609','ISUZU','ISUZU','CONSUMÍVEL'),
('B6610','KIA','KIA','CONSUMÍVEL'),
('B6611','LADA','LADA','CONSUMÍVEL'),
('B6612','LAND ROVER','LAND ROVER','CONSUMÍVEL'),
('B6613','MACK','MACK','CONSUMÍVEL'),
('B6614','MAZDA','MAZDA','CONSUMÍVEL'),
('B6615','MERCEDES-BENZ','MERCEDES-BENZ','CONSUMÍVEL'),
('B6616','MITSUBISHI','MITSUBISHI','CONSUMÍVEL'),
('B6617','NISSAN','NISSAN','CONSUMÍVEL'),
('B6618','PEUGEOT','PEUGEOT','CONSUMÍVEL'),
('B6619','RENAULT','RENAULT','CONSUMÍVEL');

-- Deriva codigo_pai por prefixo: B0101 -> pai B01 (só quando o pai existe na tabela).
update public.cadastro_grupo_mercadoria filho
set codigo_pai = pai.codigo
from public.cadastro_grupo_mercadoria pai
where filho.codigo <> pai.codigo
  and left(filho.codigo, 1) = 'B'
  and length(filho.codigo) > 3
  and pai.codigo = left(filho.codigo, 3);
```

- [ ] **Passo 2: Verificar**

```sql
select count(*) from public.cadastro_grupo_mercadoria; -- esperado: 233

select count(*) from public.cadastro_grupo_mercadoria where codigo_pai is not null; -- > 0, filhos B0xxx

-- Cobertura esperada é parcial (só ramo B) — não deve dar 0.
select count(*) filter (where gm.codigo is null) sem_cadastro, count(*) total
from estoque e left join cadastro_grupo_mercadoria gm on gm.codigo = e.grupo_mercadorias;
```

---

### Task 4: `cadastro_tipo_movimento`

**Interfaces:**
- Produz: tabela `public.cadastro_tipo_movimento(codigo text PK, descricao text)`. Sem FK — nenhuma tabela usa esse código hoje.

- [ ] **Passo 1: Aplicar a migration**

`name: "create_cadastro_tipo_movimento"`

```sql
create table public.cadastro_tipo_movimento (
  codigo text primary key,
  descricao text
);

alter table public.cadastro_tipo_movimento enable row level security;
create policy cadastro_tipo_movimento_read on public.cadastro_tipo_movimento
  for select to authenticated using (true);

insert into public.cadastro_tipo_movimento (codigo, descricao) values
('101','EM Entrada mercador.'),
('102','EM p/pedido estorno'),
('103','EM em estoque bloq.'),
('104','EM em EstBlq.estorno'),
('105','EM de estoque bloq.'),
('106','EM EstqBloq.estorno'),
('107','EM no estq.blq.aval.'),
('108','EM em EstBlqAvalEst.'),
('109','EM do estq.blq.aval.'),
('110','EM EstqBloqAval.est.'),
('121','EM compensação post.'),
('122','DM devolução fornec.'),
('123','DM dev.forn.estorno'),
('124','EM devol.estoq.bloq.'),
('125','EM dev.estq.blq.est.'),
('131','Entrada mercadorias'),
('132','Entrada mercadorias'),
('141','EM compens.post.mrc.'),
('142','EM compens.post.mrc.'),
('161','EM devolução'),
('162','EM estorno devolução'),
('201','SM para centro custo'),
('202','DM para centro custo'),
('221','SM para projeto'),
('222','DM para projeto'),
('231','SM p/ordem cliente'),
('232','DM p/ordem cliente'),
('241','SM para imobilizado'),
('242','DM para imobilizado'),
('251','SM para vendas'),
('252','DM para vendas'),
('261','SM para ordem'),
('262','DM para ordem'),
('281','SM para diagr.rede'),
('282','SM para diagr.rede'),
('291','SM todas as ClCont'),
('292','DM todas as ClCont'),
('301','TR transf.cent->cent'),
('302','ET transf.cent->cent'),
('303','TR Retir.dpst.->cent'),
('304','ET ret.do dep.p/cen.'),
('305','TR armazenar no cent'),
('306','ET armazenar no cen.'),
('309','TR Retif.mat.p/mat.'),
('310','ET transf.mat.p/mat.'),
('311','TR transf.no centro'),
('312','ET transf.no centro'),
('313','TR retir.dpst.->dpst'),
('314','ET retir.dpst.->dpst'),
('315','TR armazenar no dpst'),
('316','ET armazenar no dpst'),
('317','Agrup.mat.estrut.'),
('318','DM agrup.mat.estrut.'),
('319','Divisão mat.estrut.'),
('320','DM div.mat.estrut.'),
('321','TR qualidade->livre'),
('322','ET qualidade->livre'),
('323','TR qualidade no cent'),
('324','ET qualidade no cent'),
('325','TR bloqueado no cent'),
('326','ET bloqueado no cent'),
('331','SM para amostra Q.'),
('332','DM para amostra Q.'),
('333','SM para amostra L.'),
('334','DM para amostra L.'),
('335','SM -> amostra bloq.'),
('336','DM -> amostra bloq.'),
('340','Reavaliação Lotes'),
('341','TR livre -> não livr'),
('342','TR não livre-> livre'),
('343','TR bloqueado->livre'),
('344','ET bloqueado->livre'),
('349','TR bloqueado -> qld.'),
('350','ET bloqueado -> qld.'),
('351','TR p/estoq.trânsito'),
('352','ET p/estoq.trânsito'),
('411','TR depósito->depós.'),
('412','ET dep.->dep.'),
('413','TR dep.->ordem cli.'),
('414','ET dep.->ord.cli.'),
('415','TR depósito ->proj.'),
('416','ET dep.->proj.'),
('441','TP liv.->vasilh.ass.'),
('442','TP vasilh.ass.->liv.'),
('451','SM devoluções'),
('452','SM devoluç.Estorno'),
('453','TP devoluções->própr'),
('454','TP próprio->devoluç.'),
('455','TR transf.devoluções'),
('456','ET transf.devoluções'),
('457','TP dev.->próp.ctrl.q'),
('458','TP próp.ctrl.q.->dev'),
('459','TP def.-> próp.bloq.'),
('460','TP próp.bloq.-> dev.'),
('501','Entrada sem pedido'),
('502','DM entrada s/pedido'),
('503','Entrada no CtrQld.'),
('504','DM entrada no CtrQld'),
('505','Entrada estq.bloq.'),
('506','DM entrada bloquead.'),
('511','Remessa gratuita'),
('512','DM remessa gratuita'),
('521','Entrada s/OrdProd'),
('522','DM entrada s/OrdProd'),
('523','Entr.qual.s/OrdProd'),
('524','DM qualid.s/OrdProd'),
('525','Entr.bloq.sem OrdPr.'),
('526','DM bloq.s/OrdProd'),
('531','Entrada co-produto'),
('532','DM co-produto'),
('541','SM dpst.->remessa SC'),
('542','DM estq.SC->depósito'),
('543','SM Sc MDC'),
('544','EM Sc MDC'),
('545','Entrada Sc MDC'),
('546','SM subproduto Sc'),
('551','SM sucata'),
('552','DM sucata'),
('553','SM sucata Q.'),
('554','DM sucata Q.'),
('555','SM sucata bloq.'),
('556','DM sucata bloq.'),
('557','SM correção trânsito'),
('558','SM correção trânsito'),
('561','Reg.inic.estq.sist.'),
('562','DM reg.inic.estoque'),
('563','RegInicEstq.qualid.'),
('564','DM RegInicEstq Qual.'),
('565','RegInicEstq.bloq.'),
('566','DM RegInicEstq bloq.'),
('571','Entrada montagem'),
('572','DM entrada montagem'),
('573','Entr.montagem qual.'),
('574','DM entr.montagem q.'),
('575','Entr.bloq.montagem'),
('576','DM entr.bloq.montag.'),
('581','Entr.co-pr.diag.rede'),
('582','DM co-prod.diag.rede'),
('601','RM remessa mercador.'),
('602','DM rem.merc.estorno'),
('603','TR Retir.dpst.->cent'),
('604','ET ret.do dep.p/cen.'),
('605','TR armazenar no cent'),
('606','ET armazenar no cen.'),
('617','Agrp.est.mat.consig.'),
('618','Vl.agrp.est.mat.con.'),
('619','Div.estrn.mat.consig'),
('620','DM DivEstornMatConsg'),
('621','SM EmbRet emprestado'),
('622','SM EmbRet devolução'),
('623','SM saída EmbRet cli.'),
('624','SM entr.EmbRet clie.'),
('631','SM consig.emprestado'),
('632','SM consig.devolução'),
('633','SM saída consg.clie.'),
('634','SM entr.consig.clie.'),
('635','TR consig.emprestado'),
('636','ET consig.devolução'),
('641','TR p/estoq.trânsito'),
('642','ET p/estoq.trânsito'),
('643','TF to cross company'),
('644','TR to cross company'),
('645','TR interempresarial'),
('646','TD Cross Company'),
('647','TR p/estoq.trânsito'),
('648','ET p/estoq.trânsito'),
('651','RM DevolMerc devol.'),
('652','DM dev.merc.estorno'),
('653','FM devoluç.livre ut.'),
('654','FM devol.liv.ut.est.'),
('655','FM devoluç.qual.'),
('656','FM devoluç.qual.est.'),
('657','FM devoluç.bloq.'),
('658','FM devoluç.bloq.est.'),
('661','SM devol.ao fornec.'),
('662','DM estor.devol.forn.'),
('671','ET p/estoq.trânsito'),
('672','TR p/estoq.trânsito'),
('673','TF to cross company'),
('674','TR to cross company'),
('675','ET interempresarial'),
('676','TR interempresarial'),
('677','ET p/estoq.trânsito'),
('678','TR p/estoq.trânsito'),
('6A1','TR SM1'),
('6A2','ET SM1'),
('6A3','TR IE SM1'),
('6A4','ET IE SM1'),
('6A5','TR IE SM1'),
('6A6','ET IE SM1'),
('6A7','TR SM1'),
('6A8','ET SM1'),
('6AA','ET SM1'),
('6AB','TR SM1'),
('6AC','ET IE SM1'),
('6AD','TR IE SM1'),
('6AE','ET SM1'),
('6AF','TR SM1'),
('6AG','ET IE SM1'),
('6AH','TR IE SM1'),
('6B1','TR SM2'),
('6B2','ET SM2'),
('6B3','TR IE SM2'),
('6B4','ET IE SM2'),
('6B5','TR IE SM2'),
('6B6','ET IE SM2'),
('6B7','TR SM2'),
('6B8','ET SM2'),
('6BA','ET SM2'),
('6BB','TR SM2'),
('6BC','ET IE SM2'),
('6BD','TR IE SM2'),
('6K5','TR SM2 Consignação'),
('6K6','ET SM2 Consignação'),
('6W5','TR SM1 Consignação'),
('6W6','ET SM1 Consignação'),
('701','EM inventário depós.'),
('702','SM inventário dpst.'),
('703','EM inventário CtrQld'),
('704','SM inventário CtrQld'),
('707','EM inventário bloq.'),
('708','SM inventário bloq.'),
('711','SM DifInv depósito'),
('712','EM DifInv depósito'),
('713','SM DifInv CntrQld'),
('714','EM DifInv CntrQld'),
('715','SM DifInv devolução'),
('716','EM DifInv devolução'),
('717','SM DifInv bloq.'),
('718','EM DifInv bloq.'),
('721','Val.vnd.ent.s/ef.mrg'),
('722','Vl.vnd.saíd.s/ef.mrg'),
('731','Val.vnd.ent.c/ef.mrg'),
('732','Vl.vnd.saíd.c/ef.mrg'),
('801','EM c/fat.antec.+imp.'),
('802','EEM c/fat.ant.+imp'),
('803','EM fat.an.ICMS/IPI'),
('804','EEM fat.an.ICMS/IPI'),
('805','EM ft.ant.EsBlo.imp'),
('806','EEM FatAnEsBlo.c/imp'),
('811','EM EntrDir.c/imposto'),
('812','EEM EntrDir.c/imp'),
('815','EM EsBloEntrDi.c/im'),
('816','EEM EsBloEntDi.c/imp'),
('821','EM EsForn.aval.c/imp'),
('822','EEM EsFornAval.c/imp'),
('825','EM EsBlEsForAv.c/imp'),
('826','EEM EsBlEsForAvc/imp'),
('833','Transf.SM c/impost'),
('834','ETransf.SM c/impost'),
('835','Transf.EM c/impost'),
('836','ETransf.EM c/impost'),
('837','BR: Retorno com NF'),
('838','BR: estorn.837'),
('841','EMEqRT'),
('842','EEMEqRT'),
('843','EM EqRT c/impost'),
('844','EEM EqRT c/impost'),
('861','GR TFSD/MM'),
('862','GI TF SD/MM'),
('863','GI TF SD/MM Return'),
('864','GR TF SD/MM Return'),
('871',null),
('872',null),
('888','Entrada sem pedido'),
('889','DM entrada s/pedido'),
('901','Entrada material CAP'),
('902','Estorno entrada CAP'),
('921','SM para projeto'),
('922','DM para projeto'),
('930','DM entrada terceiros'),
('931','Ent Mat Terc. -Locaç'),
('932','DM entrada terceiros'),
('933',null),
('934','Mat Terc.- Rem.Ativo'),
('935','Mat Terc.- Indust.'),
('936','Mat Terc.- UnidIsent'),
('937','Mat Terc.-Ind X.901'),
('938','Mat Terc.- Conserto'),
('941','Envio mat Terceiros'),
('942','Est Envio Mat Terc'),
('951','EM Mat FATDI'),
('952','Est EM Mat FATDI'),
('953','EM Mat FATDI EAA'),
('955','SM Doação/Análise'),
('971',null),
('972',null),
('973',null),
('974',null),
('981','SM dpst.->remessa SC'),
('982','DM estq.SC->depósito'),
('991','EM c/fat.antec.+imp.'),
('992','EEM c/fat.ant.+imp'),
('Z21',null);
```

- [ ] **Passo 2: Verificar**

```sql
select count(*) from public.cadastro_tipo_movimento; -- esperado: 229
```

---

### Task 5: Views decoradas

**Interfaces:**
- Consome: as 4 tabelas de cadastro das Tasks 1-4.
- Produz: `vw_requisicoes_decorada`, `vw_estoque_decorado`, `vw_pedidosforn_decorado`, `vw_pedidos_decorado`.

- [ ] **Passo 1: Aplicar a migration**

`name: "create_views_decoradas_cadastros_sap"`

```sql
create or replace view public.vw_requisicoes_decorada as
select
  r.*,
  st.descricao as status_desc,
  st.detalhe as status_detalhe,
  td.denominacao as tipo_documento_desc,
  gm.denominacao as grupo_mercadoria_desc,
  gm.classificacao_nivel1 as grupo_mercadoria_classificacao
from public.requisicoes r
left join public.cadastro_status_requisicao st on st.codigo = r.status_processamento
left join public.cadastro_tipo_documento td
  on td.codigo = r.tipo_de_documento and td.categoria = 'B'
left join public.cadastro_grupo_mercadoria gm on gm.codigo = r.grupo_de_mercadorias;

grant select on public.vw_requisicoes_decorada to authenticated;

create or replace view public.vw_estoque_decorado as
select
  e.*,
  gm.denominacao as grupo_mercadoria_desc,
  gm.classificacao_nivel1 as grupo_mercadoria_classificacao
from public.estoque e
left join public.cadastro_grupo_mercadoria gm on gm.codigo = e.grupo_mercadorias;

grant select on public.vw_estoque_decorado to authenticated;

create or replace view public.vw_pedidosforn_decorado as
select
  p.*,
  td_rc.denominacao as tipo_requisicao_desc,
  td_pc.denominacao as tipo_pedido_desc,
  gm.denominacao as grupo_mercadoria_desc,
  gm.classificacao_nivel1 as grupo_mercadoria_classificacao
from public.pedidosforn p
left join public.cadastro_tipo_documento td_rc
  on td_rc.codigo = p.tpdc and td_rc.categoria = 'B'
left join public.cadastro_tipo_documento td_pc
  on td_pc.codigo = p.tipo_doc_compra and td_pc.categoria = 'F'
left join public.cadastro_grupo_mercadoria gm on gm.codigo = p.grp_mercads;

grant select on public.vw_pedidosforn_decorado to authenticated;

create or replace view public.vw_pedidos_decorado as
select
  p.*,
  td_rc.denominacao as tipo_requisicao_desc,
  td_pc.denominacao as tipo_pedido_desc,
  gm.denominacao as grupo_mercadoria_desc,
  gm.classificacao_nivel1 as grupo_mercadoria_classificacao
from public.pedidos p
left join public.cadastro_tipo_documento td_rc
  on td_rc.codigo = p.tpdc and td_rc.categoria = 'B'
left join public.cadastro_tipo_documento td_pc
  on td_pc.codigo = p.tipo_doc_compra and td_pc.categoria = 'F'
left join public.cadastro_grupo_mercadoria gm on gm.codigo = p.grp_mercads;

grant select on public.vw_pedidos_decorado to authenticated;
```

- [ ] **Passo 2: Verificar**

```sql
select count(*) from vw_requisicoes_decorada; -- esperado: 1661, igual a requisicoes
select count(*) from vw_estoque_decorado; -- esperado: 2292, igual a estoque
select count(*) from vw_pedidosforn_decorado; -- esperado: 66046, igual a pedidosforn
select count(*) from vw_pedidos_decorado; -- esperado: igual a pedidos

select status_processamento, status_desc, count(*) from vw_requisicoes_decorada
group by 1,2 order by 1;
-- A -> Solicitação de cotação criada, B -> Pedido criado, N -> Não processado

select tipo_doc_compra, tipo_pedido_desc, count(*) from vw_pedidosforn_decorado
group by 1,2 order by 1;
-- ZP01 -> Compra Local, ZP06 -> Serviço, ZP07 -> Imobilizado Local,
-- ZP09 -> Imobilizado Portal, ZP15 -> Importação, ZP16 -> Entreg Futur/Benefic
```

---

## Verificação final (Task 6)

- [ ] Rodar `mcp__claude_ai_Supabase__get_advisors` (tipo `security`) no projeto `fwezzgduywgyhxinjurn` e conferir que nenhuma das tabelas/views novas aparece como alerta (RLS ausente, view sem `security_invoker`, etc.).
- [ ] Conferir manualmente uma linha de cada view contra o texto colado pelo usuário nesta conversa (spot-check).
