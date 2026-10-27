-- Login e e-mail com tab/quebra de linha (JSBATISTA\r\n, \tjamille...) não casavam com criado_por_pedido.
update sup_compradores
   set usuario_sistema = nullif(btrim(usuario_sistema, E' \t\r\n'), ''),
       email = nullif(btrim(email, E' \t\r\n'), '')
 where usuario_sistema is distinct from nullif(btrim(usuario_sistema, E' \t\r\n'), '')
    or email is distinct from nullif(btrim(email, E' \t\r\n'), '');
