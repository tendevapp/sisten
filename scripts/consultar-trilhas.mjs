import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8');
const getEnv = (key) => {
  const m = env.match(new RegExp(`^${key}=\"?(.*?)\"?$`, 'm'));
  return m ? m[1].trim() : '';
};

const url = getEnv('VITE_SUPABASE_URL');
const key = getEnv('service_role') || getEnv('VITE_SUPABASE_ANON_KEY');
const sb = createClient(url, key);

async function main() {
  const { data, error } = await sb
    .from('trein_trilhas')
    .select('id, codigo, titulo, setor_id, ordem, arquivo_path, ativo')
    .order('setor_id')
    .order('ordem');

  if (error) {
    console.error('Erro:', error);
    return;
  }
  console.log('Trilhas encontradas:', data.length);
  console.table(data);
}

main();
