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
  const trilhaId = 'd14f49b2-a42e-4cb2-8113-750000000003';
  const dados = {
    id: trilhaId,
    setor_id: '2', // Almoxarifado
    codigo: 'PO.ALM-0003',
    titulo: 'Preservação de Materiais',
    descricao: 'Controle de preservação, acondicionamento, manuseio seguro, rotatividade FIFO/FEFO, controle de validade FRM.ALM-0023, consumíveis de soldagem PO.ENG-0001, segregação de avarias internas e salvaguarda de patrimônio de clientes e terceiros FRM.SUP-0001.',
    revisao: 'Rev. 03',
    total_missoes: 9,
    duracao_min: 45,
    arquivo_origem: 'app',
    arquivo_path: 'treinamentos/trilha-po-alm-0003.html',
    ordem: 2,
    ativo: true,
  };

  const { data, error } = await sb
    .from('trein_trilhas')
    .upsert(dados, { onConflict: 'id' })
    .select();

  if (error) {
    console.error('Erro ao cadastrar trilha no Supabase:', error);
    process.exit(1);
  }

  console.log('Trilha cadastrada/atualizada com sucesso no banco supabase-sisten:');
  console.log(data);
}

main();
