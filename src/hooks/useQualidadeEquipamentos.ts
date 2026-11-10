import { useCallback, useEffect, useState } from 'react';
import { listarEquipamentosQualidade } from '../lib/qualidadeEquipamentosApi';
import type { EquipamentoQualidade } from '../lib/qualidadeEquipamentos';

export function useQualidadeEquipamentos() {
  const [registros, setRegistros] = useState<EquipamentoQualidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const recarregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try { setRegistros(await listarEquipamentosQualidade()); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar equipamentos.'); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { registros, carregando, erro, recarregar };
}
