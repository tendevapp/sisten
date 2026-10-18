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
  const trilhaId = 'f39b1a07-a42e-4cb2-8113-750000000007';
  const dados = {
    id: trilhaId,
    setor_id: '2', // Almoxarifado
    codigo: 'PO.ALM-0007',
    titulo: 'Controle de Processos, Produtos e Serviços Providos Externamente',
    descricao: 'Diretrizes completas para qualificação e seleção de fornecedores (ISO 9001, sistema AG, auditoria TEN), análise de risco conjunta (Qualidade/Engenharia/Suprimentos), aprovação de MPP, alçadas de aprovação de materiais e serviços, informações mandatórias no Pedido de Compra, recebimento e inspeção no Almoxarifado e avaliação anual no portal AG.',
    revisao: 'Rev. 00',
    total_missoes: 9,
    duracao_min: 45,
    arquivo_origem: 'app',
    arquivo_path: 'treinamentos/trilha-po-alm-0007.html',
    ordem: 5,
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
