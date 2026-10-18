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
  const trilhaId = 'f39b1a04-a42e-4cb2-8113-750000000004';
  const dados = {
    id: trilhaId,
    setor_id: '2', // Almoxarifado
    codigo: 'PO.ALM-0004',
    titulo: 'Mobilização e Desmobilização de Equipamentos de Terceiros',
    descricao: 'Critérios completos para locação e custódia de maquinários de terceiros na TEN: NF de remessa, check-list com fotos, SAP MIGO depósito 0070, etiqueta de rastreabilidade, controle de manutenções, tratativa de danos (FRM.SUP-0001), SEMINFE e dossiê de operação.',
    revisao: 'Rev. 01',
    total_missoes: 9,
    duracao_min: 45,
    arquivo_origem: 'app',
    arquivo_path: 'treinamentos/trilha-po-alm-0004.html',
    ordem: 3,
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
