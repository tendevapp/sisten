-- Busca de materiais: casar apenas na descrição por padrão.
--
-- Contexto: `materials.busca_texto` (description + technical_text) trazia ruído
-- para o caso comum — quem digita "valvula esfera" não quer casar em norma
-- técnica. Mas o texto técnico não pode simplesmente sair: existem materiais
-- com descrição IDÊNTICA que só se distinguem por ele (a LUVA FM FM197 1/2"
-- NPT 300# existe três vezes; o que difere é GALVANIZADO FOGO vs SEM
-- REVESTIMENTO). Por isso o técnico vira caminho opcional, não caminho morto:
-- `busca_texto` continua existindo e o modal expõe um checkbox para usá-la.
--
-- Além disso a RPC ganha `deslocamento`, para o "Carregar mais" do modal
-- pedir a próxima página em vez de inflar o payload da primeira busca.

-- 1. Coluna gerada e índice cobrindo apenas a descrição.
alter table materials
  add column if not exists busca_desc text
  generated always as (f_unaccent(upper(coalesce(description, '')))) stored;

create index if not exists materials_busca_desc_trgm
  on materials using gin (busca_desc gin_trgm_ops);

analyze materials;

-- 2. Nova assinatura da RPC.
--
-- É preciso derrubar a versão de 3 argumentos antes de criar a de 5: como os
-- argumentos novos têm default, manter as duas deixaria a chamada
-- `(termo, area_usuario, limite)` ambígua para o PostgREST.
drop function if exists public.buscar_materiais(text, text, integer);

create or replace function public.buscar_materiais(
  termo           text,
  area_usuario    text    default null,
  limite          integer default 20,
  deslocamento    integer default 0,
  incluir_tecnico boolean default false
)
returns table(
  material_code text, description text, technical_text text, unit text,
  qtd_estoque numeric, depositos text[], rms_12m integer, ultima_rm date,
  rms_sem_pedido integer, rm_aberta text, qtd_rm_aberta numeric,
  pedido_aberto text, qtd_pedido_aberto numeric, chega_em date,
  pedido_pela_area boolean
)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  norm     text;
  toks     text[];
  maior    text;
  eh_cod   boolean;
  teto     int := least(coalesce(limite, 20), 50);
  salto    int := greatest(coalesce(deslocamento, 0), 0);
  tecnico  boolean := coalesce(incluir_tecnico, false);
begin
  norm := regexp_replace(trim(f_unaccent(upper(coalesce(termo, '')))), '\s+', ' ', 'g');
  if norm = '' then return; end if;

  eh_cod := norm ~ '^\d+$';
  toks   := array_remove(string_to_array(norm, ' '), '');

  select t into maior from unnest(toks) t order by length(t) desc limit 1;

  return query
  select m.material_code, m.description, m.technical_text, m.unit,
         s.qtd_estoque, s.depositos, s.rms_12m, s.ultima_rm,
         s.rms_sem_pedido, s.rm_aberta, s.qtd_rm_aberta,
         s.pedido_aberto, s.qtd_pedido_aberto, s.chega_em,
         coalesce(area_usuario is not null and s.areas @> array[area_usuario], false)
           as pedido_pela_area
  from materials m
  left join mv_material_sinais s on s.material_code = m.material_code
  where m.is_active
    and case
          when eh_cod then m.material_code like norm || '%'
          when tecnico then
               m.busca_texto like '%' || escapar_like(maior) || '%'
               and m.busca_texto like all (
                 select '%' || escapar_like(t) || '%' from unnest(toks) t
               )
          else m.busca_desc like '%' || escapar_like(maior) || '%'
               and m.busca_desc like all (
                 select '%' || escapar_like(t) || '%' from unnest(toks) t
               )
        end
  order by
    (coalesce(s.qtd_estoque, 0) > 0) desc,
    coalesce(area_usuario is not null and s.areas @> array[area_usuario], false) desc,
    -- Posição do termo na descrição, antes da frequência de RM.
    --
    -- Buscando "OCULOS" vinham antes LENTE OCULOS STEALTH (4 RMs) e CANULA
    -- NASAL DESC ADU 10 OCULOS 40CM (1 RM), porque `rms_12m` decidia e a
    -- posição não pesava. Quem digita "oculos" quer óculos; que o termo caia
    -- na 26ª letra da descrição de uma cânula é coincidência, não relevância.
    --
    -- `nullif(..., 0)` com `nulls last`: quando o termo não está na descrição
    -- (busca por código, ou casamento vindo só do texto técnico), strpos
    -- devolve 0 e sem isso essas linhas iriam para o topo — o oposto do que
    -- queremos. Vão para o fim, e `rms_12m` volta a decidir entre iguais.
    nullif(strpos(m.busca_desc, maior), 0) asc nulls last,
    coalesce(s.rms_12m, 0) desc,
    case when tecnico
         then greatest(similarity(m.description, norm), similarity(m.technical_text, norm))
         else similarity(m.description, norm)
    end desc,
    m.material_code
  limit teto offset salto;

  -- A queda para similaridade só vale para a primeira página. Numa página
  -- seguinte, "nenhuma linha" significa "acabou a lista", não "não achei" —
  -- devolver aproximações ali plantaria resultados alheios no fim do scroll.
  if found or salto > 0 then return; end if;

  return query
  select m.material_code, m.description, m.technical_text, m.unit,
         s.qtd_estoque, s.depositos, s.rms_12m, s.ultima_rm,
         s.rms_sem_pedido, s.rm_aberta, s.qtd_rm_aberta,
         s.pedido_aberto, s.qtd_pedido_aberto, s.chega_em,
         coalesce(area_usuario is not null and s.areas @> array[area_usuario], false)
           as pedido_pela_area
  from materials m
  left join mv_material_sinais s on s.material_code = m.material_code
  where m.is_active and m.description % norm
  order by similarity(m.description, norm) desc, m.material_code
  limit teto;
end;
$function$;
