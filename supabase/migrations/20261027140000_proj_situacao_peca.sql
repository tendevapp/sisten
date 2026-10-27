-- =====================================================================
-- Situação da peça de projeto (QR da etiqueta BOM e Ctrl+K)
-- =====================================================================
-- Peça de projeto sem código SAP não tem ZL0024, ME5A nem MB51: o que existe
-- dela está no módulo Projetos do SISTEN. `proj_situacao_peca` junta numa ida:
--   * item do catálogo do projeto (`proj_itens`) e o saldo (entradas, saídas,
--     refugo, como `vw_proj_saldo_almox`);
--   * localização e foto do Cadastro de Itens › BOM (`alm_bom_itens_cadastro`);
--   * consumo por tramo da BOM (`vw_proj_consumo_tramo`) com os tramos ainda
--     pendentes de kit (`proj_tramos_gwjaco.status = 'pendente'`) — a tela
--     calcula a autonomia;
--   * o que ficou para chegar nos próximos carregamentos (`proj_entregas_pendentes`);
--   * os últimos movimentos.
-- `p_chave` aceita part number (com ou sem pontos) ou o código SAP da peça.
--
-- `proj_buscar_pecas` acha peças por part number ou descrição para o Ctrl+K.

create or replace function public.proj_situacao_peca(p_chave text, p_projeto text default 'GW_JACOBINA')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_norm text := nullif(upper(regexp_replace(coalesce(p_chave, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_item public.proj_itens%rowtype;
  v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if v_norm is null then
    return null;
  end if;

  select * into v_item
    from public.proj_itens i
   where i.projeto = p_projeto
     and (i.part_number_norm = v_norm
          or (i.cod_sap is not null and ltrim(i.cod_sap, '0') = ltrim(v_norm, '0')))
   order by (i.part_number_norm = v_norm) desc, i.fora_da_bom
   limit 1;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'item', jsonb_build_object(
      'id', v_item.id, 'projeto', v_item.projeto, 'part_number', v_item.part_number,
      'part_number_norm', v_item.part_number_norm, 'cod_sap', v_item.cod_sap,
      'descricao', v_item.descricao, 'description', v_item.description, 'uom', v_item.uom,
      'fornecedor', v_item.fornecedor, 'estoque_minimo', v_item.estoque_minimo,
      'fora_da_bom', v_item.fora_da_bom, 'ignorar_premontagem', v_item.ignorar_premontagem),
    'saldo', (
      select jsonb_build_object(
        'entradas', coalesce(sum(m.quantidade) filter (where m.quantidade > 0), 0),
        'saidas', coalesce(-sum(m.quantidade) filter (where m.quantidade < 0), 0),
        'refugo', coalesce(-sum(m.quantidade) filter (where m.tipo = 'saida_sobressalente'), 0),
        'saldo', coalesce(sum(m.quantidade), 0))
        from public.proj_movimentos m
       where m.item_id = v_item.id and m.excluido_em is null),
    'cadastro_bom', (
      select jsonb_build_object('posicao_estoque', c.posicao_estoque, 'etiqueta_descricao', c.etiqueta_descricao,
                                'imagem_path', c.imagem_path)
        from public.alm_bom_itens_cadastro c
       where c.projeto = v_item.projeto and c.part_number_norm = v_item.part_number_norm
       limit 1),
    'consumo', coalesce((
      select jsonb_agg(jsonb_build_object(
          'tramo', ct.tramo, 'secao', ct.secao, 'qtd_por_torre', ct.qtd_por_torre,
          'subconjuntos', to_jsonb(ct.subconjuntos),
          'tramos_pendentes', (select count(*) from public.proj_tramos_gwjaco t
                                where t.projeto = ct.projeto and t.tramo = ct.tramo and t.status = 'pendente'),
          'tramos_total', (select count(*) from public.proj_tramos_gwjaco t
                            where t.projeto = ct.projeto and t.tramo = ct.tramo))
          order by ct.tramo)
        from public.vw_proj_consumo_tramo ct
       where ct.projeto = v_item.projeto and ct.part_number_norm = v_item.part_number_norm), '[]'::jsonb),
    'pendentes_entrega', (
      select jsonb_build_object('quantidade', coalesce(sum(e.quantidade_esperada), 0), 'linhas', count(*),
                                'notas', count(distinct e.numero_nf), 'desde', min(e.data_nf))
        from public.proj_entregas_pendentes e
       where e.projeto = v_item.projeto and e.part_number_norm = v_item.part_number_norm
         and e.status = 'PENDENTE' and e.excluido_em is null),
    'movimentos', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', mv.tipo, 'quantidade', mv.quantidade, 'documento', mv.documento_codigo,
                                          'tramo', mv.tramo, 'em', mv.created_at, 'por', mv.criado_por_nome)
                       order by mv.created_at desc)
        from (select * from public.proj_movimentos m
               where m.item_id = v_item.id and m.excluido_em is null
               order by m.created_at desc limit 5) mv), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.proj_situacao_peca(text, text) from public, anon;
grant execute on function public.proj_situacao_peca(text, text) to authenticated;

create or replace function public.proj_buscar_pecas(p_termo text, p_limite integer default 6, p_projeto text default 'GW_JACOBINA')
returns table (part_number text, part_number_norm text, cod_sap text, descricao text, uom text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_termo text := btrim(coalesce(p_termo, ''));
  v_norm text := upper(regexp_replace(v_termo, '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if length(v_norm) < 3 then
    return;
  end if;

  return query
  select i.part_number, i.part_number_norm, i.cod_sap, coalesce(nullif(i.descricao, ''), i.description), i.uom
    from public.proj_itens i
   where i.projeto = p_projeto
     and (i.part_number_norm like v_norm || '%'
          or (length(v_norm) >= 5 and i.part_number_norm like '%' || v_norm || '%')
          or (i.cod_sap is not null and ltrim(i.cod_sap, '0') like ltrim(v_norm, '0') || '%' and length(v_norm) >= 5)
          -- Descrição: todas as palavras do termo, em português ou inglês.
          or not exists (
               select 1 from unnest(regexp_split_to_array(lower(v_termo), '\s+')) w
                where w <> ''
                  and position(w in lower(coalesce(i.descricao, '') || ' ' || coalesce(i.description, ''))) = 0))
   order by (i.part_number_norm like v_norm || '%') desc, i.part_number
   limit greatest(1, least(coalesce(p_limite, 6), 50));
end;
$$;

revoke all on function public.proj_buscar_pecas(text, integer, text) from public, anon;
grant execute on function public.proj_buscar_pecas(text, integer, text) to authenticated;
