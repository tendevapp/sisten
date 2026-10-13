-- "Liberado p/ Jato (Pátio)" passa a se chamar só "Liberado p/ Jato".
-- Os eventos guardam uma cópia do texto da atividade; acompanha o cadastro
-- para o histórico não mostrar as duas grafias.
update public.prod_apt_situacoes
   set atividade = 'Liberado p/ Jato'
 where setor = 'Jato' and atividade = 'Liberado p/ Jato (Pátio)'
   and not exists (
     select 1 from public.prod_apt_situacoes
      where setor = 'Jato' and atividade = 'Liberado p/ Jato'
   );

update public.prod_apt_tramo_eventos
   set atividade = 'Liberado p/ Jato'
 where setor = 'Jato' and atividade = 'Liberado p/ Jato (Pátio)';
