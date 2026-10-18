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
  const trilhaId = 'f39b1a06-a42e-4cb2-8113-750000000006';
  const dados = {
    id: trilhaId,
    setor_id: '2', // Almoxarifado
    codigo: 'PO.ALM-0006',
    titulo: 'Procedimento Operacional e Sistêmico Chapas',
    descricao: 'Recebimento físico e controle sistêmico de chapas de aço: triagem de pátios (Pátio A com Ponte Rolante para projetos em linha x Pátio B com Pórtico Mag 75 Ton para fora de linha), inspeção da Qualidade, gestão de RNC, mapeamento de tramos e virolas, planilhas de controle, protocolo com a Controladoria e arquivamento por data ascendente.',
    revisao: 'Rev. 00',
    total_missoes: 9,
    duracao_min: 45,
    arquivo_origem: 'app',
    arquivo_path: 'treinamentos/trilha-po-alm-0006.html',
    ordem: 4,
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
