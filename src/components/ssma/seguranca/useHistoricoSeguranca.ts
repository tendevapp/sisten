/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Estado do histórico dos formulários da Segurança: página, período, excluídos
 * (só administrador) e registros ainda na fila do aparelho. Recarrega quando a
 * fila muda — o registro feito sem rede aparece no histórico assim que sobe.
 */

import { useCallback, useEffect, useState } from 'react';
import { assinarFilaOffline } from '../../../lib/offline/filaSupabase';
import { mensagemErro, pendentesNaFila, type FormularioSeguranca } from '../../../lib/ssmaSegurancaRegistro';
import { dataHojeLocal } from '../../../lib/dataLocal';

type Periodo = { de: string; ate: string };

interface Opcoes<T, D> {
  formulario: FormularioSeguranca;
  listar: (periodo: Periodo, pagina: number, incluirExcluidos: boolean) => Promise<T[]>;
  tamanhoPagina: number;
  /** Texto do cartão "Aguardando envio" a partir dos dados na fila. */
  resumirPendente: (dados: D) => { titulo: string; detalhe: string };
}

export function useHistoricoSeguranca<T, D>({ formulario, listar, tamanhoPagina, resumirPendente }: Opcoes<T, D>) {
  const [lista, setLista] = useState<T[]>([]);
  const [pagina, setPagina] = useState(0);
  const [filtro, setFiltroBruto] = useState<Periodo>({ de: '', ate: '' });
  const [recorte, setRecorte] = useState<Periodo>(() => ({ de: dataHojeLocal().slice(0, 7) + '-01', ate: dataHojeLocal() }));
  const [incluirExcluidos, setIncluirBruto] = useState(false);
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [pendentes, setPendentes] = useState<{ id: string; titulo: string; detalhe: string }[]>([]);

  useEffect(() => {
    let vivo = true;
    setErro('');
    if (filtro.de && filtro.ate && filtro.de > filtro.ate) {
      setLista([]); setCarregando(false); setErro('A data final deve ser igual ou posterior à inicial.');
      return;
    }
    setCarregando(true);
    listar(filtro, pagina, incluirExcluidos)
      .then(l => { if (vivo) setLista(l); })
      .catch(e => { if (vivo) { setLista([]); setErro(mensagemErro(e, 'Não foi possível carregar o histórico.')); } })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [listar, filtro, pagina, incluirExcluidos, versao]);

  useEffect(() => {
    let vivo = true;
    void pendentesNaFila<D>(formulario).then(fila => {
      if (vivo) setPendentes(fila.map(a => ({ id: a.p_id, ...resumirPendente(a.p_dados) })));
    });
    return () => { vivo = false; };
    // resumirPendente é estável na tela (função de módulo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formulario, versao]);

  // A fila mudou (subiu ou entrou registro): recarrega lista e pendentes.
  useEffect(() => assinarFilaOffline(() => setVersao(v => v + 1)), []);

  const recarregar = useCallback(() => setVersao(v => v + 1), []);
  const setFiltro = useCallback((p: Periodo) => { setPagina(0); setFiltroBruto(p); }, []);
  const setIncluirExcluidos = useCallback((v: boolean) => { setPagina(0); setIncluirBruto(v); }, []);
  /** Depois de registrar: volta à 1ª página, sem filtro. */
  const reiniciar = useCallback(() => { setPagina(0); setFiltroBruto({ de: '', ate: '' }); setVersao(v => v + 1); }, []);

  return {
    lista, pagina, setPagina, filtro, setFiltro, recorte, setRecorte, incluirExcluidos, setIncluirExcluidos,
    carregando, erro, pendentes, recarregar, reiniciar, temMais: lista.length === tamanhoPagina,
  };
}
