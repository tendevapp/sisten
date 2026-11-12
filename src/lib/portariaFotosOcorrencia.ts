/**
 * Fotos e entrega de material dos lançamentos do Relatório de Ocorrências
 * (FRM.SGP-0010). Uma lista única para a tela de detalhes e para o PDF.
 *
 * Ordem: foto antiga (base64 em `foto_url`, até 10/11/2026), fotos do
 * registro (`fotos`) e fotos das notas fiscais (`fotos_nf`).
 */
import type { PortRelatorioOcorrencia, PortTipoRegistroOcorrencia } from '../types';

export type TipoFotoOcorrencia = 'registro' | 'nf';

export interface FotoOcorrencia {
  /** URL para mostrar: data URL (legado) ou URL assinada do Storage. Vazia sem rede. */
  url: string;
  tipo: TipoFotoOcorrencia;
  /** "Foto 1 de 2", "Nota fiscal 1 de 1". */
  legenda: string;
}

/** Lançamentos que podem trazer entrega de material: as entradas e o Outro registro. */
export const TIPOS_COM_ENTREGA_MATERIAL: readonly PortTipoRegistroOcorrencia[] = [
  'ENTRADA_VEICULO', 'ENTRADA_VISITANTE', 'VEICULO_LEVE', 'ENTRADA_COLABORADOR', 'OUTRO_REGISTRO',
];

export function aceitaEntregaMaterial(tipo?: PortTipoRegistroOcorrencia | null): boolean {
  return !!tipo && TIPOS_COM_ENTREGA_MATERIAL.includes(tipo);
}

type ComFotos = Pick<PortRelatorioOcorrencia, 'foto_url' | 'fotos' | 'fotos_nf' | 'tem_foto_legado'>;

/** Quantas fotos o lançamento tem (conta a legada mesmo sem o base64 carregado). */
export function contarFotosOcorrencia(oc: ComFotos): { registro: number; nf: number; total: number } {
  const registro = (oc.foto_url || oc.tem_foto_legado ? 1 : 0) + (oc.fotos?.length || 0);
  const nf = oc.fotos_nf?.length || 0;
  return { registro, nf, total: registro + nf };
}

/** Fotos para mostrar, com legenda. A legada só entra quando o base64 já veio (`foto_url`). */
export function fotosDaOcorrencia(oc: ComFotos): FotoOcorrencia[] {
  const registro = [
    ...(oc.foto_url ? [oc.foto_url] : []),
    ...(oc.fotos || []).map((f) => f.preview_url || ''),
  ];
  const nf = (oc.fotos_nf || []).map((f) => f.preview_url || '');
  return [
    ...registro.map((url, i) => ({ url, tipo: 'registro' as const, legenda: `Foto ${i + 1} de ${registro.length}` })),
    ...nf.map((url, i) => ({ url, tipo: 'nf' as const, legenda: `Nota fiscal ${i + 1} de ${nf.length}` })),
  ];
}

/**
 * Entrega da PRC (refeitório) é recebida pela cozinha, não pelo almoxarifado.
 * No formulário ela só pré-marca "Não" em "Vai para o Almoxarifado?"; no banco
 * (`port_empresa_sem_ficha_cega`) decide quando o lançamento não tem resposta
 * (antigo ou de aparelho com versão anterior). Mudar os dois juntos.
 */
const EMPRESAS_SEM_FICHA_CEGA = /(^|[^A-Z0-9])P\.?R\.?C($|[^A-Z0-9])/;

export function empresaSemFichaCega(empresa: string | null | undefined): boolean {
  return EMPRESAS_SEM_FICHA_CEGA.test(String(empresa ?? '').toUpperCase());
}

export interface ValidacaoEntrega {
  ok: boolean;
  erro?: string;
}

/**
 * Entrada com entrega de material exige a resposta "Vai para o Almoxarifado?",
 * NF conferida pela portaria e ao menos uma foto da nota. `fotosNf` conta as
 * já salvas e as novas do formulário.
 */
export function validarEntregaMaterial(dados: {
  tipo: PortTipoRegistroOcorrencia;
  entrega_material: boolean;
  nf_verificada: boolean;
  fotosNf: number;
  vai_almoxarifado: boolean | null;
}): ValidacaoEntrega {
  if (!aceitaEntregaMaterial(dados.tipo) || !dados.entrega_material) return { ok: true };
  if (dados.vai_almoxarifado === null) return { ok: false, erro: 'Entrega de material: responda se vai para o Almoxarifado.' };
  if (!dados.nf_verificada) return { ok: false, erro: 'Entrega de material: confirme que a nota fiscal foi verificada.' };
  if (dados.fotosNf < 1) return { ok: false, erro: 'Entrega de material: tire a foto da(s) nota(s) fiscal(is).' };
  return { ok: true };
}
