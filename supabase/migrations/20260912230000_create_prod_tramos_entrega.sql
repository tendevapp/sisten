-- =====================================================================
-- Produção > Controle de Entrega — Gestão visual de prontidão de tramos e torres.
--
-- Tabela dedicada para espelhar o quadro físico de controle de produção
-- da TEN Nordeste, registrando etapa de fabricação, categoria de acabamento,
-- pendência ("o que está aguardando") e tempo de espera (aging em dias)
-- para suporte à tomada de decisão operacional e de expedição.
-- =====================================================================

create table if not exists public.prod_tramos_entrega (
  id text primary key, -- igual ao id de proj_tramos_gwjaco: 'T1-3143', etc.
  projeto text not null default 'GW_JACOBINA',
  torre_numero integer not null,
  tramo text not null check (tramo in ('T1','T2','T3','T4','T5')),
  serie integer not null,
  subprojeto_id text references public.proj_subprojetos (id),
  etapa_categoria text not null default 'saw02'
    check (etapa_categoria in ('expedido','patio','white','internos','saw03','saw02','nav01')),
  etapa_nome text not null default 'SAW02',
  status_aguardando text,
  data_entrada_etapa timestamptz not null default now(),
  dias_espera integer not null default 0,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (projeto, torre_numero, tramo)
);

create index if not exists idx_prod_tramos_entrega_torre on public.prod_tramos_entrega (projeto, torre_numero);
create index if not exists idx_prod_tramos_entrega_categoria on public.prod_tramos_entrega (etapa_categoria);
create index if not exists idx_prod_tramos_entrega_espera on public.prod_tramos_entrega (dias_espera desc);

grant select, insert, update, delete on public.prod_tramos_entrega to anon, authenticated, service_role;
alter table public.prod_tramos_entrega enable row level security;
drop policy if exists "prod_tramos_entrega_all" on public.prod_tramos_entrega;
create policy "prod_tramos_entrega_all" on public.prod_tramos_entrega for all using (true) with check (true);

-- Inicializa os tramos a partir do catálogo existente de proj_tramos_gwjaco
insert into public.prod_tramos_entrega (
  id, projeto, torre_numero, tramo, serie, subprojeto_id,
  etapa_categoria, etapa_nome, status_aguardando, dias_espera
)
select
  t.id,
  t.projeto,
  t.torre_numero,
  t.tramo,
  t.serie,
  t.subprojeto_id,
  'saw02',
  'SAW02',
  'Aguardando início de soldagem SAW',
  1
from public.proj_tramos_gwjaco t
on conflict (id) do nothing;

-- Sementeia os dados reais da fábrica para as torres 1 a 15 (conforme quadro visual de produção)

-- TORRE 1 (100% Expedida)
update public.prod_tramos_entrega set etapa_categoria = 'expedido', etapa_nome = 'EXPEDIDO', status_aguardando = 'Expedido para o parque', dias_espera = 0, serie = 3147 where torre_numero = 1 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'expedido', etapa_nome = 'EXPEDIDO', status_aguardando = 'Expedido para o parque', dias_espera = 0, serie = 3146 where torre_numero = 1 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'expedido', etapa_nome = 'EXPEDIDO', status_aguardando = 'Expedido para o parque', dias_espera = 0, serie = 3145 where torre_numero = 1 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'expedido', etapa_nome = 'EXPEDIDO', status_aguardando = 'Expedido para o parque', dias_espera = 0, serie = 3144 where torre_numero = 1 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'expedido', etapa_nome = 'EXPEDIDO', status_aguardando = 'Expedido para o parque', dias_espera = 0, serie = 3143 where torre_numero = 1 and tramo = 'T1';

-- TORRE 2 (4 expedidos, falta T1 em montagem - prioridade de desbloqueio!)
update public.prod_tramos_entrega set etapa_categoria = 'expedido', etapa_nome = 'EXPEDIDO', status_aguardando = 'Expedido para o parque', dias_espera = 0, serie = 3182 where torre_numero = 2 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'expedido', etapa_nome = 'EXPEDIDO', status_aguardando = 'Expedido para o parque', dias_espera = 0, serie = 3156 where torre_numero = 2 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'expedido', etapa_nome = 'EXPEDIDO', status_aguardando = 'Expedido para o parque', dias_espera = 0, serie = 3160 where torre_numero = 2 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'expedido', etapa_nome = 'EXPEDIDO', status_aguardando = 'Expedido para o parque', dias_espera = 0, serie = 3169 where torre_numero = 2 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'patio', etapa_nome = 'MONTAGEM', status_aguardando = 'Aguardando liberação final de montagem para pátio', dias_espera = 5, serie = 3148 where torre_numero = 2 and tramo = 'T1';

-- TORRE 3
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'MONTAGEM', status_aguardando = 'Montagem do tramo em andamento', dias_espera = 3, serie = 3192 where torre_numero = 3 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'expedido', etapa_nome = 'EXPEDIDO', status_aguardando = 'Expedido para o parque', dias_espera = 0, serie = 3151 where torre_numero = 3 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'patio', etapa_nome = 'PÁTIO', status_aguardando = 'Liberado no pátio, aguardando carreta', dias_espera = 2, serie = 3150 where torre_numero = 3 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'patio', etapa_nome = 'EXPEDIDO', status_aguardando = 'No pátio pronto para embarque', dias_espera = 1, serie = 3149 where torre_numero = 3 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'patio', etapa_nome = 'PINTURA', status_aguardando = 'Pintura concluída, em liberação no pátio', dias_espera = 4, serie = 3153 where torre_numero = 3 and tramo = 'T1';

-- TORRE 4
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA', status_aguardando = 'Aguardando cabine de pintura', dias_espera = 2, serie = 3187 where torre_numero = 4 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA (PÁTIO)', status_aguardando = 'Pintado no pátio, aguardando secagem', dias_espera = 3, serie = 3161 where torre_numero = 4 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'MONTAGEM', status_aguardando = 'Montagem de componentes', dias_espera = 4, serie = 3195 where torre_numero = 4 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'patio', etapa_nome = 'PÁTIO', status_aguardando = 'No pátio, pronto para expedição', dias_espera = 1, serie = 3159 where torre_numero = 4 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'patio', etapa_nome = 'PINTURA', status_aguardando = 'Retoque de pintura no pátio', dias_espera = 3, serie = 3158 where torre_numero = 4 and tramo = 'T1';

-- TORRE 5
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA (PÁTIO)', status_aguardando = 'Aguardando secagem', dias_espera = 2, serie = 3152 where torre_numero = 5 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA (PÁTIO)', status_aguardando = 'Aguardando secagem', dias_espera = 2, serie = 3166 where torre_numero = 5 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA', status_aguardando = 'Em pintura externa', dias_espera = 3, serie = 3200 where torre_numero = 5 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'MONTAGEM (PÁTIO)', status_aguardando = 'Montagem final no pátio', dias_espera = 4, serie = 3154 where torre_numero = 5 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA', status_aguardando = 'Aplicação de acabamento', dias_espera = 2, serie = 3163 where torre_numero = 5 and tramo = 'T1';

-- TORRE 6
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA (PÁTIO)', status_aguardando = 'Em estocagem temporária', dias_espera = 3, serie = 3162 where torre_numero = 6 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA (PÁTIO)', status_aguardando = 'Em estocagem temporária', dias_espera = 3, serie = 3176 where torre_numero = 6 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA (PÁTIO)', status_aguardando = 'Aguardando cura total', dias_espera = 3, serie = 3155 where torre_numero = 6 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA', status_aguardando = 'Aguardando cabine de pintura', dias_espera = 2, serie = 3194 where torre_numero = 6 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA', status_aguardando = 'Pintura intermediária', dias_espera = 2, serie = 3168 where torre_numero = 6 and tramo = 'T1';

-- TORRE 7
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'LIB.JATO', status_aguardando = 'Aguardando laudo de rugosidade', dias_espera = 2, serie = 3197 where torre_numero = 7 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA (PÁTIO)', status_aguardando = 'Aguardando inspeção visual', dias_espera = 3, serie = 3186 where torre_numero = 7 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA (PÁTIO)', status_aguardando = 'Aguardando inspeção visual', dias_espera = 3, serie = 3185 where torre_numero = 7 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA (PÁTIO)', status_aguardando = 'Aguardando liberação de qualidade', dias_espera = 4, serie = 3179 where torre_numero = 7 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'CAB.JATO', status_aguardando = 'Em jateamento abrasivo na cabine', dias_espera = 1, serie = 3173 where torre_numero = 7 and tramo = 'T1';

-- TORRE 8
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'LIB.JATO (PÁTIO)', status_aguardando = 'Jateado, aguardando primer', dias_espera = 2, serie = 3157 where torre_numero = 8 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'LIB.JATO', status_aguardando = 'Aguardando liberação de jato', dias_espera = 1, serie = 3206 where torre_numero = 8 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'LIB.JATO (PÁTIO)', status_aguardando = 'Jateado, aguardando primer', dias_espera = 2, serie = 3190 where torre_numero = 8 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA (PÁTIO)', status_aguardando = 'Aguardando medição de película seca', dias_espera = 4, serie = 3184 where torre_numero = 8 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS', status_aguardando = 'Montagem de suportes internos', dias_espera = 3, serie = 3178 where torre_numero = 8 and tramo = 'T1';

-- TORRE 9
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'LIB.JATO (PÁTIO)', status_aguardando = 'Jateado, aguardando transferência', dias_espera = 3, serie = 3167 where torre_numero = 9 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'LIB.JATO (PÁTIO)', status_aguardando = 'Jateado, aguardando transferência', dias_espera = 2, serie = 3191 where torre_numero = 9 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS', status_aguardando = 'Instalação de escadas e cabos', dias_espera = 4, serie = 3165 where torre_numero = 9 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'PINTURA (PÁTIO)', status_aguardando = 'Aguardando cura da tinta', dias_espera = 3, serie = 3189 where torre_numero = 9 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS', status_aguardando = 'Soldagem de suportes', dias_espera = 5, serie = 3183 where torre_numero = 9 and tramo = 'T1';

-- TORRE 10
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'LIB.JATO', status_aguardando = 'Aguardando liberação de jato', dias_espera = 1, serie = 3202 where torre_numero = 10 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'LIB.JATO (PÁTIO)', status_aguardando = 'Aguardando transferência para pintura', dias_espera = 2, serie = 3196 where torre_numero = 10 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS', status_aguardando = 'Montagem de flanges intermediárias', dias_espera = 4, serie = 3170 where torre_numero = 10 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'LIB.JATO (PÁTIO)', status_aguardando = 'Aguardando aplicação de fundo', dias_espera = 3, serie = 3164 where torre_numero = 10 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'saw02', etapa_nome = 'MARCO PORTA', status_aguardando = 'Aguardando ajuste e solda do marco de porta', dias_espera = 6, serie = 3188 where torre_numero = 10 and tramo = 'T1';

-- TORRE 11
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS (PÁTIO)', status_aguardando = 'Internos concluídos, em pátio fabril', dias_espera = 3, serie = 3172 where torre_numero = 11 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'LIB.JATO (PÁTIO)', status_aguardando = 'Aguardando fila de pintura', dias_espera = 2, serie = 3201 where torre_numero = 11 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS (PÁTIO)', status_aguardando = 'Aguardando transferência', dias_espera = 3, serie = 3175 where torre_numero = 11 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'white', etapa_nome = 'LIB.JATO (PÁTIO)', status_aguardando = 'Aguardando fila de pintura', dias_espera = 2, serie = 3174 where torre_numero = 11 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'saw02', etapa_nome = 'MARCO PORTA', status_aguardando = 'Solda SAW do marco de porta', dias_espera = 5, serie = 3193 where torre_numero = 11 and tramo = 'T1';

-- TORRE 12
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS', status_aguardando = 'Soldagem de braçadeiras internas', dias_espera = 3, serie = 3207 where torre_numero = 12 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS (PÁTIO)', status_aguardando = 'Aguardando liberação dimensional', dias_espera = 4, serie = 3181 where torre_numero = 12 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS (PÁTIO)', status_aguardando = 'Aguardando liberação dimensional', dias_espera = 4, serie = 3180 where torre_numero = 12 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS', status_aguardando = 'Montagem de olhais', dias_espera = 3, serie = 3199 where torre_numero = 12 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'saw02', etapa_nome = 'MARCO PORTA', status_aguardando = 'Gargalo: aguardando inspeção de UT no marco', dias_espera = 7, serie = 3198 where torre_numero = 12 and tramo = 'T1';

-- TORRE 15
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS (PÁTIO)', status_aguardando = 'Internos soldados, aguardando jato', dias_espera = 3, serie = 3177 where torre_numero = 15 and tramo = 'T5';
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS (PÁTIO)', status_aguardando = 'Internos soldados, aguardando jato', dias_espera = 3, serie = 3171 where torre_numero = 15 and tramo = 'T4';
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS', status_aguardando = 'Montagem de internos mecânicos', dias_espera = 2, serie = 3205 where torre_numero = 15 and tramo = 'T3';
update public.prod_tramos_entrega set etapa_categoria = 'internos', etapa_nome = 'INTERNOS', status_aguardando = 'Montagem de internos mecânicos', dias_espera = 2, serie = 3204 where torre_numero = 15 and tramo = 'T2';
update public.prod_tramos_entrega set etapa_categoria = 'saw02', etapa_nome = 'SAW02', status_aguardando = 'Solda SAW em execução no posto 2', dias_espera = 4, serie = 3203 where torre_numero = 15 and tramo = 'T1';
