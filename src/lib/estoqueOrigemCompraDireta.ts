import type { Request, RequestItem, RequestStatus, Sector } from '../types';
import { normalizeCode } from './almoxarifado';

/**
 * De onde veio o pedido do material quando ele é compra direta: o setor que
 * solicitou. A posição de estoque (ZL0024) não traz essa informação, ela só
 * existe nas solicitações de compra (`tipo_compra = 'Direta'`) cujo item
 * carrega o código SAP do material.
 */
export interface SetorSolicitanteCompraDireta {
  setorId: string;
  setor: string;
  solicitacoes: number;
  /** Solicitação mais recente do setor para o material. */
  ultimaNumero: string;
  ultimaEm: string;
}

// Rascunho nunca foi enviado; rejeitada/cancelada não virou compra.
const STATUS_SEM_COMPRA: RequestStatus[] = ['rascunho', 'rejeitada', 'cancelada'];

/**
 * Índice material (código normalizado) → ids dos setores que o pediram em
 * compra direta. Uma varredura só, para filtrar a posição inteira sem refazer
 * `setoresCompraDireta` por linha.
 */
export function indexarSetoresCompraDireta(
  requests: Request[],
  itens: RequestItem[],
): Map<string, Set<string>> {
  const validas = new Map<string, string>();
  for (const req of requests) {
    if (req.type === 'compra' && req.tipo_compra === 'Direta' && !STATUS_SEM_COMPRA.includes(req.status)) {
      validas.set(req.id, req.solicitante_sector_id);
    }
  }
  const mapa = new Map<string, Set<string>>();
  for (const it of itens) {
    const setorId = validas.get(it.request_id);
    if (setorId === undefined || !it.sap_code) continue;
    const codigo = normalizeCode(it.sap_code);
    if (!codigo) continue;
    const setoresDoMaterial = mapa.get(codigo) ?? new Set<string>();
    setoresDoMaterial.add(setorId);
    mapa.set(codigo, setoresDoMaterial);
  }
  return mapa;
}

export function setoresCompraDireta(
  material: string | null | undefined,
  requests: Request[],
  itens: RequestItem[],
  setores: Pick<Sector, 'id' | 'name'>[],
): SetorSolicitanteCompraDireta[] {
  const codigo = normalizeCode(material);
  if (!codigo) return [];

  const requestIds = new Set(
    itens.filter(it => it.sap_code && normalizeCode(it.sap_code) === codigo).map(it => it.request_id),
  );
  if (requestIds.size === 0) return [];

  const nomePorId = new Map(setores.map(s => [s.id, s.name]));
  const porSetor = new Map<string, SetorSolicitanteCompraDireta>();

  for (const req of requests) {
    if (!requestIds.has(req.id)) continue;
    if (req.type !== 'compra' || req.tipo_compra !== 'Direta') continue;
    if (STATUS_SEM_COMPRA.includes(req.status)) continue;

    const atual = porSetor.get(req.solicitante_sector_id);
    if (!atual) {
      porSetor.set(req.solicitante_sector_id, {
        setorId: req.solicitante_sector_id,
        setor: nomePorId.get(req.solicitante_sector_id) ?? 'Setor não identificado',
        solicitacoes: 1,
        ultimaNumero: req.number,
        ultimaEm: req.created_at,
      });
      continue;
    }
    atual.solicitacoes += 1;
    if (req.created_at > atual.ultimaEm) {
      atual.ultimaEm = req.created_at;
      atual.ultimaNumero = req.number;
    }
  }

  return [...porSetor.values()].sort(
    (a, b) => b.solicitacoes - a.solicitacoes || a.setor.localeCompare(b.setor, 'pt-BR'),
  );
}

export interface TagCompraDireta {
  /**
   * Setor(es) para onde o material vai: o setor destinatário escolhido no item
   * (ou o setor solicitante, em solicitação sem destinatário). Mais de um só no
   * caso inferido pelo material.
   */
  setores: string[];
  /** Solicitação que originou a RM; `null` quando a tag foi inferida só pelo material. */
  solicitacao: string | null;
  /** `true` = confirmado pela RM da linha; `false` = inferido pelo código do material. */
  exata: boolean;
}

/**
 * Resolve, linha a linha, se o item recebido é de compra direta.
 *
 * Prefere a ponte exata RM + material (`linked_rm_number` da solicitação): ela
 * distingue o mesmo material comprado ora para estoque, ora direto. Se a RM da
 * linha leva a uma solicitação de estoque, não há tag. Só quando a RM não leva
 * a nenhuma solicitação (RM aberta fora do SISTEN, linha sem RM) cai para o
 * código do material nas solicitações de compra direta.
 */
export function criarResolvedorCompraDireta(
  requests: Request[],
  itens: RequestItem[],
  setores: Pick<Sector, 'id' | 'name'>[],
): (rm: string | null | undefined, material: string | null | undefined) => TagCompraDireta | null {
  const nomePorId = new Map(setores.map(s => [s.id, s.name]));
  const nomeDoSetor = (id: string) => nomePorId.get(id) ?? 'Setor não identificado';

  const porId = new Map(requests.map(r => [r.id, r]));
  const destinoDoItem = (req: Request, it: RequestItem) => it.setor_destinatario?.trim() || nomeDoSetor(req.solicitante_sector_id);

  const porRmMaterial = new Map<string, { req: Request; item: RequestItem }>();
  const porMaterial = new Map<string, Set<string>>();
  for (const it of itens) {
    if (!it.sap_code) continue;
    const req = porId.get(it.request_id);
    if (!req || req.type !== 'compra' || STATUS_SEM_COMPRA.includes(req.status)) continue;
    const codigo = normalizeCode(it.sap_code);
    if (req.linked_rm_number) {
      const chave = `${normalizeCode(req.linked_rm_number)}::${codigo}`;
      if (!porRmMaterial.has(chave)) porRmMaterial.set(chave, { req, item: it });
    }
    if (req.tipo_compra === 'Direta') {
      const destinos = porMaterial.get(codigo) ?? new Set<string>();
      destinos.add(destinoDoItem(req, it));
      porMaterial.set(codigo, destinos);
    }
  }

  return (rm, material) => {
    const codigo = normalizeCode(material);
    if (!codigo) return null;

    const rmLimpo = normalizeCode(rm);
    const vinculada = rmLimpo ? porRmMaterial.get(`${rmLimpo}::${codigo}`) : undefined;
    if (vinculada) {
      return vinculada.req.tipo_compra === 'Direta'
        ? { setores: [destinoDoItem(vinculada.req, vinculada.item)], solicitacao: vinculada.req.number, exata: true }
        : null;
    }

    const destinos = porMaterial.get(codigo);
    if (!destinos || destinos.size === 0) return null;
    return {
      setores: [...destinos].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      solicitacao: null,
      exata: false,
    };
  };
}
