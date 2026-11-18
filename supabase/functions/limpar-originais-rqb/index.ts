import { createClient } from 'npm:@supabase/supabase-js@2.110.0';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });

  const token = request.headers.get('x-rqb-cron-token');
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return new Response(null, { status: 403 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: paths, error } = await supabase.rpc('alm_rqb_originais_expirados', { p_token: token });
  if (error?.code === '42501') return new Response(null, { status: 403 });
  if (error) {
    console.error('Falha ao listar originais de RQB expirados:', error.message);
    return new Response(null, { status: 500 });
  }

  if (paths.length === 0) return Response.json({ removidos: 0 });
  const { data: removidos, error: erroRemocao } = await supabase.storage.from('alm-rqb-exportacoes').remove(paths);
  if (erroRemocao) {
    console.error('Falha ao remover originais de RQB expirados:', erroRemocao.message);
    return new Response(null, { status: 500 });
  }
  return Response.json({ removidos: removidos.length });
});
