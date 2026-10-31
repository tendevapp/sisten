import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { chaveItem, type CandidatoInventario } from './inventarioCiclico';
import { definirReservaInventario, listarReservasInventario, type ReservaInventario } from './inventarioCiclicoApi';

export function filtrarSelecaoReservada(selecao: Map<string, CandidatoInventario>, reservas: ReservaInventario[]): Map<string, CandidatoInventario> {
  const minhas = new Set(reservas.filter(r => r.minha).map(r => chaveItem(r.material, r.deposito)));
  return new Map([...selecao].filter(([chave]) => minhas.has(chave)));
}

/** A sessão pertence ao modal, não ao usuário: duas abas também disputam a mesma chave. */
export function useReservasInventario(marcados: Map<string, CandidatoInventario>, setMarcados: Dispatch<SetStateAction<Map<string, CandidatoInventario>>>, aoPerder: () => void) {
  const [sessao] = useState(() => crypto.randomUUID());
  const [reservas, setReservas] = useState<ReservaInventario[]>([]);
  const [pronto, setPronto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const operando = useRef(false);
  const versao = useRef(0);
  const ativo = useRef(true);
  const selecao = useRef(marcados);
  selecao.current = marcados;
  const aplicarResposta = useCallback((r: ReservaInventario[]) => {
    if (!ativo.current) return;
    setReservas(r); setPronto(true); setErro('');
    const mantidos = filtrarSelecaoReservada(selecao.current, r);
    if (mantidos.size !== selecao.current.size) { selecao.current = mantidos; setMarcados(mantidos); aoPerder(); }
  }, [setMarcados, aoPerder]);
  const atualizar = useCallback(async () => {
    if (operando.current) return;
    const v = versao.current;
    try { const r = await listarReservasInventario(sessao); if (!operando.current && v === versao.current) aplicarResposta(r); }
    catch (e) { if (ativo.current) { setPronto(false); setErro(e instanceof Error ? e.message : 'Não foi possível verificar as reservas.'); } }
  }, [sessao, aplicarResposta]);
  const aplicar = useCallback(async (nova: Map<string, CandidatoInventario>): Promise<boolean> => {
    if (operando.current) return false;
    operando.current = true; versao.current++; setOcupado(true);
    try {
      const r = await definirReservaInventario(sessao, [...nova.values()].map(c => ({ material: c.material, deposito: c.deposito })));
      if (!ativo.current) { await definirReservaInventario(sessao, []); return false; }
      const mantidos = filtrarSelecaoReservada(nova, r);
      selecao.current = mantidos; setMarcados(mantidos); setReservas(r); setPronto(true); setErro('');
      return mantidos.size === nova.size;
    } catch (e) {
      if (ativo.current) { setErro(e instanceof Error ? e.message : 'Item reservado por outro inventário.'); setPronto(false); }
      return false;
    } finally { operando.current = false; if (ativo.current) setOcupado(false); }
  }, [sessao, setMarcados]);
  useEffect(() => {
    ativo.current = true;
    void atualizar();
    const consulta = setInterval(() => void atualizar(), 5000);
    const renovar = setInterval(() => { if (document.visibilityState === 'visible' && selecao.current.size && !operando.current) void aplicar(selecao.current); }, 30000);
    return () => {
      ativo.current = false; clearInterval(consulta); clearInterval(renovar);
      // Se a aba fechar sem completar o envio, o lease expira sozinho em 120s.
      void definirReservaInventario(sessao, []).catch(() => {});
    };
  }, [atualizar, aplicar, sessao]);
  const ocupadas = new Map(reservas.filter(r => !r.minha).map(r => [chaveItem(r.material, r.deposito), r]));
  return { sessao, ocupadas, pronto, ocupado, erro, aplicar, atualizar };
}
