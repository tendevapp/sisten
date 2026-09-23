-- =====================================================================
-- Revisao de controladoria do de-para de SERVICOS -> rubrica.
--
-- Com o realizado vindo da NF (ver 20260922220000), os servicos (NFS-e)
-- passaram a pesar R$ 7,0 mi e expuseram dois problemas da carga inicial:
--
-- 1. O grupo S0001 "Servico de fornecimento" e generico: o SAP usa esse
--    grupo para consultoria, vigilancia, advocacia, laudos, aluguel de imovel
--    etc. Ele estava ligado a Transporte (pela classificacao_nivel2 "Manutencao
--    de Frotas e Veiculos") e jogava R$ 2,96 mi em Transporte.
-- 2. O mapeamento em massa por classificacao_nivel2 errou varios grupos S*:
--    Transportes de Pessoal -> Frete, Vigilancia -> Consultorias,
--    Telefone/Internet -> Energia, Seguro saude -> Vigilancia, Mensalidade
--    escolar -> Energia, Aluguel de imoveis -> Aluguel de equipamento.
--
-- Correcao:
-- a) de-para por CODIGO DE SERVICO SAP (numero_servico da NFS-e), que
--    descreve o servico prestado e tem prioridade sobre o grupo;
-- b) grupos S* corrigidos; os que nao correspondem a nenhuma rubrica do
--    catalogo (seguro, mensalidade, multa, aluguel de imovel) ficam
--    inativos - caem em "Sem rubrica" ate existir rubrica propria.
--
-- Valores de referencia: snapshot ZL0136 de 22/09/2026.
-- =====================================================================

-- a) De-para por codigo de servico
insert into public.fin_rubrica_mapeamentos (rubrica_id, tipo_chave, chave_valor, chave_descricao)
select r.id, 'servico', v.codigo, v.descricao
from (values
  -- Vigilancia
  ('3000431', 'VIGILANCIA/SEGURANCA-BENS E PESSOAS', 'vigilancia'),
  -- Limpeza, conservacao, residuos, controle de pragas
  ('3000114', 'LIMPEZA VIAS PUBLICAS/IMOVEIS/PARQUES', 'limpeza'),
  ('3000573', 'LIMPEZA DE MAQUINAS/VEICULOS/IGUAIS', 'limpeza'),
  ('3000745', 'LIMPEZA DE MAQUINAS/VEICULOS/IGUAIS', 'limpeza'),
  ('3000120', 'PULVERIZACAO DESINSETIZACAO E AFINS', 'limpeza'),
  ('3000108', 'LIXO/REJEITOS/RESIDUOS - COLETA', 'limpeza'),
  -- Saude ocupacional
  ('3000021', 'LOCAIS DE ATENDIMENTO MEDICO', 'hospitais_clinicas_aso'),
  ('3000019', 'MEDICINA E BIOMEDICINA', 'hospitais_clinicas_aso'),
  -- Transporte de pessoas e veiculos
  ('3000320', 'TRANSPORTE RODOVIARIO DE PASSAGEIROS', 'transporte'),
  ('3000420', 'LOCACAO DE VEICULOS LEVES S/ MO', 'transporte'),
  ('3000359', 'ALUGUEL DE VEICULOS - PASSEIO TIPO B', 'transporte'),
  ('3000391', 'LOCACAO DE VEICULOS PESADOS S/ MO', 'transporte'),
  ('3000783', 'RECARGA CARTAO VALE TRANSPORTE', 'transporte'),
  -- Alimentacao
  ('3000612', 'EMISSAO VALES-ALIMENTACAO, TRANSP. E AFINS', 'alimentacao'),
  -- Manutencao
  ('3000369', 'MANUTENCAO DE PEQ. EQUIP. - OBRAS', 'despesas_manutencao'),
  ('3000368', 'MANUTENCAO DE PEQ. EQUIP. - ESCRITORIOS', 'despesas_manutencao'),
  ('3000194', 'MANUTENCAO DE MAQ./VEICULOS - CONTINUA', 'despesas_manutencao'),
  ('3000551', 'MANUTENCAO DE EQUIP. ELETRICO - CONTINUA', 'despesas_manutencao'),
  ('3000584', 'ASSISTENCIA TECNICA', 'despesas_manutencao'),
  ('3000195', 'ASSISTENCIA TECNICA', 'despesas_manutencao'),
  ('3000192', 'RESTAURACAO DE MAQUINAS/VEICULOS/IGUAIS', 'despesas_manutencao'),
  ('3000730', 'RESTAURACAO/PINTURA/RECONDICIONAMENTO', 'despesas_manutencao'),
  ('3000115', 'MANUTENCAO VIAS PUBLICAS/IMOVEIS/PARQUES', 'manutencao_predial'),
  ('3000100', 'COLOCACAO/INSTALACAO - CORTINAS', 'manutencao_predial'),
  -- TI e software
  ('3000008', 'MANUT. DE SISTEMAS/DADOS E SUP. TECNICO', 'material_informatica'),
  ('3000007', 'CONFIGURACAO INFORMATICA', 'material_informatica'),
  ('3000661', 'LICENCIAMENTO/CESSAO-SW E AFINS - UN', 'licencas_softwares_producao'),
  ('3000004', 'LICENCIAMENTO/CESSAO-SOFTWARES E AFINS', 'licencas_softwares_producao'),
  ('3000430', 'PROGRAMAS DE COMPUTADORES/COMPUTACAO', 'licencas_softwares_producao'),
  -- Aluguel de equipamento
  ('3000352', 'LOCACAO DE PEQUENOS EQUIPAMENTOS S/ MO', 'aluguel_equipamento'),
  ('3000400', 'LOCACAO DE PEQUENOS EQUIPAMENTOS S/ MO', 'aluguel_equipamento'),
  ('3000622', 'LOCACAO DE PEQUENOS EQUIPAMENTOS S/ MO', 'aluguel_equipamento'),
  ('3000401', 'LOCACAO DE GRANDES EQUIPAMENTOS S/ MO', 'aluguel_equipamento'),
  ('3000353', 'LOCACAO DE GRANDES EQUIPAMENTOS S/ MO', 'aluguel_equipamento'),
  ('3000471', 'LOCACAO DE GRANDES EQUIPAMENTOS C/ MO', 'aluguel_equipamento'),
  -- Consultorias, servicos tecnicos e administrativos
  ('3000296', 'CONSULTORIA E ASSESSORIA', 'contratos_consultorias'),
  ('3000632', 'ENGENHARIA AGRONOMIA URBANISMO E AFINS', 'contratos_consultorias'),
  ('3000285', 'PERICIAS LAUDOS EXAMES E ANALISES TEC.', 'contratos_consultorias'),
  ('3000273', 'DIGITACAO REDACAO EDICAO E AFINS', 'contratos_consultorias'),
  ('3000275', 'AREA TECNICA FINANC. OU ADM - COORDENACAO', 'contratos_consultorias'),
  ('3000269', 'ASSESSORIA OU CONSULTORIA - COLETA DADOS', 'contratos_consultorias'),
  ('3000271', 'ASSESSORIA/CONSULTORIA - FORNEC DADOS/INFO', 'contratos_consultorias'),
  ('3000290', 'ADVOCACIA', 'contratos_consultorias'),
  ('3000500', 'TREINAMENTO (UN)', 'contratos_consultorias'),
  ('3000133', 'TREINAMENTO', 'contratos_consultorias'),
  ('3000295', 'CONTABILIDADE', 'consultoria_contabilidade'),
  ('3000497', 'SERVICO DE CALIBRACAO / AFERICAO', 'consultoria_qualidade'),
  -- Logistica (armazenagem, aduana)
  ('3000163', 'ARMAZENAMENTO E DEPOSITO', 'frete'),
  ('3000342', 'TRATO ADUANEIRO DESPACHANTE E AFINS', 'frete'),
  ('3000152', 'AGENCIA/CORRETAGEM/INTERMEDIACAO', 'frete'),
  -- Comunicacao visual
  ('3000186', 'CONFECCAO DE IMPRESSOS GRAFICOS', 'materiais_comunicacao'),
  ('3000494', 'CONFECCAO DE ADESIVOS DIVERSOS', 'materiais_comunicacao'),
  ('3000326', 'CHAVEIROS CARIMBOS PLACAS E AFINS', 'materiais_comunicacao'),
  ('3000184', 'FOTOGRAFIA E CINEMATOGRAFIA', 'materiais_comunicacao'),
  ('3000283', 'PROPAGANDA E PUBLICIDADE', 'materiais_comunicacao')
) as v(codigo, descricao, rubrica_codigo)
join public.fin_rubricas r on r.codigo = v.rubrica_codigo
on conflict (tipo_chave, chave_valor) do nothing;

-- b) Grupos de servico: correcoes de rubrica
update public.fin_rubrica_mapeamentos m
set rubrica_id = r.id
from (values
  ('S0018', 'vigilancia'),              -- era Consultorias
  ('S0095', 'transporte'),              -- Transportes de Pessoal; era Frete
  ('S0034', 'material_informatica'),    -- Telefone; era Energia
  ('S0035', 'material_informatica'),    -- Celular; era Energia
  ('S0043', 'material_informatica'),    -- TV a cabo; era Energia
  ('S0044', 'material_informatica'),    -- Internet; era Energia
  ('S0046', 'alimentacao'),             -- Alimentacao em viagem; era Energia
  ('S0048', 'transporte'),              -- Combustivel; era Energia
  ('S0135', 'transporte'),              -- Conservacao e reparo de viaturas; era Consultorias
  ('S0136', 'manutencao_predial'),      -- Instalacoes eletricas; era Consultorias
  ('S0031', 'frete'),                   -- Despachantes aduaneiros; era Consultorias
  ('S0134', 'consultoria_contabilidade') -- Auditoria externa; era Consultorias
) as v(grupo, rubrica_codigo)
join public.fin_rubricas r on r.codigo = v.rubrica_codigo
where m.tipo_chave = 'grupo_mercadoria'
  and m.chave_valor = v.grupo;

-- Grupos genericos ou sem rubrica correspondente no catalogo: inativos.
update public.fin_rubrica_mapeamentos
set ativo = false
where tipo_chave = 'grupo_mercadoria'
  and chave_valor in (
    'S0001', -- Servico de fornecimento (generico)
    'S0114', -- Outros gastos com pessoal (generico)
    'S0026', -- Aluguel de imoveis
    'S0027', -- Seguros carros e equipamentos
    'S0028', -- Seguros saude
    'S0033', -- Mensalidade escolar
    'S0045', -- Taxas aeroportuarias
    'S0021'  -- Pagamento de multas
  );
