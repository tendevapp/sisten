-- Cadastro de Itens: o mesmo material cadastrado em dois aparelhos.
--
-- 27/11/2026: um cadastro feito no celular com a lista desatualizada (sem
-- rede, o item já tinha sido cadastrado de outro aparelho na véspera) ficou
-- preso na fila com 'duplicate key ... uq_alm_catalogo_itens_sap_ativo'. O
-- registro trazia a posição no estoque e uma foto nova — descartar perdia isso.
--
-- A fila offline (configFormularios.ts › duplicado) chama esta função quando
-- a inclusão bate no unique do código SAP ativo. Ela junta o que o aparelho
-- trouxe no item que já existe e devolve o id dele (as fotos adicionais que
-- apontavam para o id do aparelho passam a apontar para este).
--
-- Regra, campo a campo (o mesmo que salvar online faria, sem perder nada):
--   * campo vazio no aparelho: não mexe;
--   * campo vazio no servidor: completa;
--   * os dois preenchidos: vale o mais recente — o do aparelho só se foi feito
--     depois da última alteração no servidor (p_feito_em >= updated_at).
-- Foto: nunca se perde. Se o item não tem foto, vira a principal. Se tem, a
-- do aparelho vira principal quando é a mais recente (a anterior vai para as
-- adicionais); senão entra como adicional. Reenviar não duplica (confere o
-- caminho). saldo_zl0024 não entra: vem da importação do SAP.
--
-- security invoker: valem as mesmas políticas de quem grava pela tela.

create or replace function public.alm_catalogo_mesclar_offline(p_linha jsonb, p_feito_em timestamptz default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.alm_catalogo_itens%rowtype;
  v_atual jsonb;
  v_valor jsonb;
  v_campo text;
  v_novo_vence boolean;
  v_mudou boolean := false;
  v_uid uuid := auth.uid();
  v_nome text;
  v_foto text := nullif(btrim(coalesce(p_linha->>'imagem_path', '')), '');
  v_ordem int;
begin
  if v_uid is null then
    raise exception 'Sessão expirada: entre de novo para sincronizar.';
  end if;

  select * into v_item
    from public.alm_catalogo_itens
   where codigo_sap = btrim(p_linha->>'codigo_sap') and ativo
   for update;
  if not found then
    return null;
  end if;

  select name into v_nome from public.profiles where id = v_uid::text;
  v_novo_vence := p_feito_em is not null and v_item.updated_at <= p_feito_em;
  v_atual := to_jsonb(v_item);

  foreach v_campo in array array[
    'descricao', 'texto_tecnico', 'grp_mercad', 'grupo_mercadorias', 'classificacao_nivel1',
    'classificacao_nivel2', 'umb', 'observacao', 'posicao_estoque', 'etiqueta_descricao',
    'etiqueta_aplicacao', 'estoque_minimo', 'lotes_validade'
  ] loop
    v_valor := p_linha->v_campo;
    if v_valor is null or v_valor in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
       or (jsonb_typeof(v_valor) = 'string' and btrim(v_valor #>> '{}') = '') then
      continue;
    end if;
    if v_atual->v_campo is null or v_atual->v_campo in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
       or (v_novo_vence and v_atual->v_campo is distinct from v_valor) then
      v_atual := jsonb_set(v_atual, array[v_campo], v_valor);
      v_mudou := true;
    end if;
  end loop;

  -- Foto do aparelho (já está no Storage: o upload sobe antes da linha).
  if v_foto is not null and v_foto is distinct from v_item.imagem_path
     and not exists (select 1 from public.alm_catalogo_item_fotos f where f.catalogo_item_id = v_item.id and f.imagem_path = v_foto) then
    select coalesce(max(ordem) + 1, 0) into v_ordem from public.alm_catalogo_item_fotos where catalogo_item_id = v_item.id;
    if v_item.imagem_path is null or v_novo_vence then
      if v_item.imagem_path is not null then
        insert into public.alm_catalogo_item_fotos
          (catalogo_item_id, imagem_path, imagem_nome, imagem_mime, imagem_tamanho, ordem, criado_por, criado_por_nome)
        values
          (v_item.id, v_item.imagem_path, v_item.imagem_nome, coalesce(v_item.imagem_mime, 'image/jpeg'), v_item.imagem_tamanho,
           v_ordem, coalesce(v_item.atualizado_por, v_uid::text), v_item.atualizado_por_nome);
      end if;
      v_atual := v_atual || jsonb_build_object(
        'imagem_path', v_foto,
        'imagem_nome', p_linha->'imagem_nome',
        'imagem_mime', coalesce(p_linha->'imagem_mime', '"image/jpeg"'::jsonb),
        'imagem_tamanho', p_linha->'imagem_tamanho');
      v_mudou := true;
    else
      insert into public.alm_catalogo_item_fotos
        (catalogo_item_id, imagem_path, imagem_nome, imagem_mime, imagem_tamanho, ordem, criado_por, criado_por_nome)
      values
        (v_item.id, v_foto, p_linha->>'imagem_nome', coalesce(p_linha->>'imagem_mime', 'image/jpeg'),
         nullif(p_linha->>'imagem_tamanho', '')::int, v_ordem, v_uid::text, v_nome);
    end if;
  end if;

  if v_mudou then
    v_item := jsonb_populate_record(v_item, v_atual);
    update public.alm_catalogo_itens set
      descricao = v_item.descricao,
      texto_tecnico = v_item.texto_tecnico,
      grp_mercad = v_item.grp_mercad,
      grupo_mercadorias = v_item.grupo_mercadorias,
      classificacao_nivel1 = v_item.classificacao_nivel1,
      classificacao_nivel2 = v_item.classificacao_nivel2,
      umb = v_item.umb,
      observacao = v_item.observacao,
      posicao_estoque = v_item.posicao_estoque,
      etiqueta_descricao = v_item.etiqueta_descricao,
      etiqueta_aplicacao = v_item.etiqueta_aplicacao,
      estoque_minimo = v_item.estoque_minimo,
      lotes_validade = v_item.lotes_validade,
      imagem_path = v_item.imagem_path,
      imagem_nome = v_item.imagem_nome,
      imagem_mime = v_item.imagem_mime,
      imagem_tamanho = v_item.imagem_tamanho,
      atualizado_por = v_uid::text,
      atualizado_por_nome = coalesce(v_nome, atualizado_por_nome)
    where id = v_item.id;
  end if;

  return v_item.id;
end;
$$;

revoke all on function public.alm_catalogo_mesclar_offline(jsonb, timestamptz) from public, anon;
grant execute on function public.alm_catalogo_mesclar_offline(jsonb, timestamptz) to authenticated;
