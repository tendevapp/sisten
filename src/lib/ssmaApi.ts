/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo SSMA — API de integração para Registros de Identificação de Desvio (RID)
 */

import { supabase } from '../db/supabaseClient';
import type {
  SsmaEmpresa,
  SsmaRidDesvio,
  SsmaRidFiltros,
  SsmaRidFoto,
  SsmaRidMetricas,
  SsmaRidStatus,
  SsmaFormConfig,
  SsmaFormOpcoesConfig,
  SsmaFormPerguntaConfig,
} from '../types';
import { apenasVigentes, marcarExcluido, marcarRestaurado } from './softDelete';

const BUCKET = 'ssma-desvios';

// =====================================================================
// LISTAS PADRÃO E CONSTANTES OPERACIONAIS DE SSMA
// =====================================================================

export const SETORES_SSMA = [
  'PRODUÇÃO',
  'MANUTENÇÃO',
  'ENGENHARIA',
  'SUPRIMENTOS',
  'PLANEJAMENTO',
  'QUALIDADE',
  'FINANCEIRO',
  'RECURSOS HUMANOS',
  'ALMOXARIFADO',
  'SSMA',
  'FACILITES',
] as const;

export const SEMANAS_SSMA = [
  '1ª SEMANA',
  '2ª SEMANA',
  '3ª SEMANA',
  '4ª SEMANA',
  '5ª SEMANA',
] as const;

export const EMPRESAS_SSMA: SsmaEmpresa[] = ['TEN', 'CONTRATADA'];

export const AREAS_DESVIO_SSMA = [
  'ALMOXARIFADO',
  'ÁREA DE VIVÊNCIA',
  'ÁREA EXTERNA',
  'BAIA DE GÁS',
  'BAIA DE RESÍDUOS',
  'BUFFER DE VIROLAS',
  'CALANDRA',
  'CALDEIRARIA',
  'CARPINTARIA',
  'CHANFRO',
  'CORTE',
  'ENTRE JATO E PINTURA',
  'ETE',
  'FLANGE',
  'INTERNOS SOLDÁVEIS',
  'JATO',
  'METALIZAÇÃO',
  'MONTAGEM FINAL',
  'MONTAGEM MARCO PORTA',
  'PÁTIO DE CHAPAS',
  'PÁTIO DE TRAMOS',
  'PINTURA',
  'PORTARIA',
  'PRÉ JATO',
  'PRÉ MONTAGEM BAIA DE TINTAS',
  'PRÉDIO ADMINISTRATIVOS',
  'PRÉDIOS EXTERNOS',
  'PRÉDIOS FÁBRICA',
  'REFEITÓRIO',
  'RESERVA LEGAL',
  'SAW 1',
  'SAW 2',
  'SAW 3',
  'VESTIÁRIOS',
  'OUTROS',
] as const;

/**
 * Busca setores cadastrados no banco de dados (rh_setores ou core_setores),
 * com fallback para a lista padrão do SSMA.
 */
export async function listarSetoresDb(): Promise<string[]> {
  try {
    const { data: rhData, error: rhErr } = await supabase
      .from('rh_setores')
      .select('nome')
      .eq('ativo', true)
      .order('nome');
    if (!rhErr && rhData && rhData.length > 0) {
      const setores = Array.from(new Set(rhData.map((s: any) => s.nome.trim().toUpperCase())));
      return setores.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }
  } catch {}

  try {
    const { data: coreData, error: coreErr } = await supabase
      .from('core_setores')
      .select('name')
      .order('name');
    if (!coreErr && coreData && coreData.length > 0) {
      const setores = Array.from(new Set(coreData.map((s: any) => s.name.trim().toUpperCase())));
      return setores.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }
  } catch {}

  return [...SETORES_SSMA].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export const RESPONSAVEIS_SEGURANCA_SSMA = [
  'ADEMIR SANTANA',
  'JOSIMARIA ANDRADE',
  'RAMON SANTOS',
  'N/A - NÃO APLICÁVEL',
] as const;

export const COMPORTAMENTOS_INSEGUROS_SSMA = [
  'NÃO USO DE EPI',
  'SEM TREINAMENTO',
  'TREINAMENTO VENCIDO',
  'NÃO USO DE ESCADAS PARA ACESSOS',
  'DESCARTE INCORRETO DE RESÍDUOS',
  'USO DE FERRAMENTA DEFEITUOSA',
  'USO DE FERRAMENTA IMPROVISADA',
  'FALTA DE ORGANIZAÇÃO E LIMPEZA',
  'FALTA DE INSPEÇÃO DE EQUIPAMENTOS (CHECKLIST)',
  'EXPOSIÇÃO DE PARTES DO CORPO',
  'NÃO MANTER DISTÂNCIA DE CARGAS EM MOVIMENTO',
  'ACESSO DE ÁREAS RESTRITAS SEM AUTORIZAÇÃO',
  'DESCUMPRIMENTO DE PROCEDIMENTO INTERNO',
  'NÃO UTILIZAR DISPOSITIVO DE SEGURANÇA',
  'OUTRO',
] as const;

export const CONDICOES_INSEGURAS_SSMA = [
  'CILINDRO SOLTO OU SEM CAPACETE DE PROTEÇÃO',
  'PAINEL ELÉTRICO DANIFICADO',
  'CABO / MANGUEIRA DANIFICADO',
  'ACESSO OBSTRUÍDO E/OU COM DESNÍVEIS',
  'FALTA DE MANUTENÇÃO DE EQUIPAMENTOS',
  'FALTA DE SISTEMAS E PROTEÇÃO DE SEGURANÇA',
  'FALTA DE SINALIZAÇÃO',
  'FALTA DE ISOLAMENTO',
  'ILUMINAÇÃO INADEQUADA',
  'AUSÊNCIA DE FDS EM PRODUTO QUÍMICO',
  'FALTA/BLOQUEIO DE PROTEÇÃO CONTRA INCÊNDIO',
  'VAZAMENTO E/OU DERRAMAMENTO',
  'FALTA DE BLOQUEIO DE ENERGIA PERIGOSA',
  'OUTRO',
] as const;

/**
 * Calcula a semana do mês a partir de uma data no formato YYYY-MM-DD
 */
export function calcularSemanaDoMes(dataIso: string): string {
  if (!dataIso) return '1ª SEMANA';
  const dia = parseInt(dataIso.slice(8, 10), 10);
  if (isNaN(dia)) return '1ª SEMANA';
  if (dia <= 7) return '1ª SEMANA';
  if (dia <= 14) return '2ª SEMANA';
  if (dia <= 21) return '3ª SEMANA';
  if (dia <= 28) return '4ª SEMANA';
  return '5ª SEMANA';
}

/**
 * Formata data ISO (YYYY-MM-DD) para DDMMYY (ex: 2026-09-03 -> 030926).
 */
export function formatarDataDDMMYY(dataISO?: string | null): string {
  if (!dataISO) {
    const agora = new Date();
    const d = String(agora.getDate()).padStart(2, '0');
    const m = String(agora.getMonth() + 1).padStart(2, '0');
    const y = String(agora.getFullYear()).slice(-2);
    return `${d}${m}${y}`;
  }
  const partes = dataISO.split('-');
  if (partes.length === 3) {
    const [y, m, d] = partes;
    return `${d.slice(0, 2).padStart(2, '0')}${m.padStart(2, '0')}${y.slice(-2)}`;
  }
  const dObj = new Date(dataISO);
  if (isNaN(dObj.getTime())) {
    const agora = new Date();
    const d = String(agora.getDate()).padStart(2, '0');
    const m = String(agora.getMonth() + 1).padStart(2, '0');
    const y = String(agora.getFullYear()).slice(-2);
    return `${d}${m}${y}`;
  }
  const d = String(dObj.getDate()).padStart(2, '0');
  const m = String(dObj.getMonth() + 1).padStart(2, '0');
  const y = String(dObj.getFullYear()).slice(-2);
  return `${d}${m}${y}`;
}

/**
 * Regra padrão de protocolo para todos os formulários criados:
 * Formato: [PREFIXO]-DDMMYY-[INDICE_MES]
 * Exemplo: RID-030926-01
 */
export function gerarCodigoRegistroFormulario(
  prefixo = 'RID',
  dataISO?: string | null,
  indice: number | string = 1
): string {
  const dataFormatada = formatarDataDDMMYY(dataISO);
  const numIndice = typeof indice === 'number' ? indice : parseInt(String(indice), 10) || 1;
  const indiceFormatado = String(Math.max(1, numIndice)).padStart(2, '0');
  return `${prefixo.toUpperCase()}-${dataFormatada}-${indiceFormatado}`;
}

/**
 * Gera o código do formulário RID no padrão obrigatório:
 * RID-DDMMYY-indice por mes (ex: RID-030926-01)
 */
export function gerarNumeroRegistroRid(
  dataISO?: string | null,
  indice: number | string = 1
): string {
  return gerarCodigoRegistroFormulario('RID', dataISO, indice);
}

/**
 * Consulta no banco de dados a quantidade de registros do mês correspondente
 * e calcula o próximo código sequencial: RID-DDMMYY-[próximo índice do mês].
 */
export async function obterProximoNumeroRegistroRid(
  dataISO?: string | null
): Promise<string> {
  const dataRef = dataISO ? dataISO.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const partes = dataRef.split('-');
  const ano = partes[0] || String(new Date().getFullYear());
  const mes = partes[1] || String(new Date().getMonth() + 1).padStart(2, '0');
  const ano2Dig = ano.slice(-2);

  const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();
  const inicioMes = `${ano}-${mes}-01`;
  const fimMes = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`;

  try {
    const { data, error } = await dbDesvios()
      .select('numero_registro, data_registro')
      .gte('data_registro', inicioMes)
      .lte('data_registro', fimMes);

    if (error || !data || data.length === 0) {
      return gerarNumeroRegistroRid(dataRef, 1);
    }

    let maiorIndice = 0;
    for (const item of data) {
      const numReg = item.numero_registro || '';
      // Procura formato RID-DDMMYY-XX onde MM e YY batem com o mês consultado
      const match = numReg.match(/RID-\d{2}(\d{2})(\d{2})-(\d+)/i);
      if (match && match[1] === mes && match[2] === ano2Dig) {
        const idx = parseInt(match[3], 10);
        if (!isNaN(idx) && idx > maiorIndice) {
          maiorIndice = idx;
        }
      }
    }

    const proximoIndice = Math.max(maiorIndice, data.length) + 1;
    return gerarNumeroRegistroRid(dataRef, proximoIndice);
  } catch (err) {
    console.warn('Erro ao consultar próximo índice mensal do RID:', err);
    return gerarNumeroRegistroRid(dataRef, 1);
  }
}

// =====================================================================
// COMPRESSÃO & GESTÃO DE IMAGENS
// =====================================================================

async function comprimirFoto(file: File): Promise<Blob> {
  const LADO_MAXIMO = 1600;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.82);
  });

  return blob && blob.size < file.size ? blob : file;
}

export async function uploadFotoStorage(
  desvioId: string,
  file: File,
  tipo: 'antes' | 'depois' = 'antes'
): Promise<SsmaRidFoto> {
  const blob = await comprimirFoto(file);
  const ehJpeg = blob !== file;
  const extensao = ehJpeg ? 'jpg' : (file.name.split('.').pop() || 'jpg').toLowerCase();
  const fileId = Math.random().toString(36).substring(2, 9);
  const path = `${desvioId}/${tipo}_${fileId}.${extensao}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: ehJpeg ? 'image/jpeg' : file.type, upsert: false });

  if (upErr) throw new Error(`Falha no upload da foto: ${upErr.message}`);

  // Gera URL assinada de 24 horas para pré-visualização imediata
  let previewUrl = '';
  try {
    const { data: signData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24);
    if (signData?.signedUrl) previewUrl = signData.signedUrl;
  } catch {
    // segue sem preview assinado
  }

  return {
    id: fileId,
    path,
    name: file.name,
    size: blob.size,
    mime_type: ehJpeg ? 'image/jpeg' : file.type,
    preview_url: previewUrl,
    tipo,
    created_at: new Date().toISOString(),
  };
}


/**
 * Resolve as URLs assinadas de leitura das fotos de um ou mais desvios
 */
export async function assinarFotosDesvios(desvios: SsmaRidDesvio[]): Promise<SsmaRidDesvio[]> {
  const todosPaths: string[] = [];
  desvios.forEach((d) => {
    (d.fotos || []).forEach((f) => {
      if (f.path && !f.preview_url) todosPaths.push(f.path);
    });
  });

  if (todosPaths.length === 0) return desvios;

  const urlMap: Record<string, string> = {};
  try {
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(todosPaths, 60 * 60 * 24);
    if (data) {
      data.forEach((item) => {
        if (item.path && item.signedUrl) urlMap[item.path] = item.signedUrl;
      });
    }
  } catch (err) {
    console.warn('Erro ao assinar URLs de fotos SSMA:', err);
  }

  return desvios.map((d) => ({
    ...d,
    fotos: (d.fotos || []).map((f) => ({
      ...f,
      preview_url: urlMap[f.path] || f.preview_url || '',
    })),
  }));
}

// =====================================================================
// BUSCA DE COLABORADORES (RH_PESSOAS)
// =====================================================================

export interface ColaboradorRhSugestao {
  id: string;
  registro: string;
  nome: string;
  cargo: string | null;
}

export async function buscarColaboradoresRh(termo: string): Promise<ColaboradorRhSugestao[]> {
  const t = termo.trim();
  let query = supabase
    .from('rh_pessoas')
    .select('id, registro, nome, cargo')
    .eq('ativo', true);

  if (t) {
    query = query.or(`nome.ilike.%${t}%,registro.ilike.%${t}%`);
  }

  const { data, error } = await query.order('nome').limit(20);
  if (error) {
    console.error('Erro ao buscar rh_pessoas:', error);
    return [];
  }

  return (data || []) as ColaboradorRhSugestao[];
}

// =====================================================================
// OPERAÇÕES CRUD DO RID
// =====================================================================

const dbDesvios = () => (supabase.from as any)('ssma_rid_desvios');

export async function listarDesviosRid(
  filtros?: SsmaRidFiltros,
  incluirExcluidos = false
): Promise<SsmaRidDesvio[]> {
  let query = dbDesvios()
    .select('*')
    .order('data_registro', { ascending: false })
    .order('created_at', { ascending: false });

  query = apenasVigentes(query, incluirExcluidos);

  if (filtros?.setor && filtros.setor !== 'TODOS') {
    query = query.eq('setor', filtros.setor);
  }

  if (filtros?.semana && filtros.semana !== 'TODAS') {
    query = query.eq('semana', filtros.semana);
  }

  if (filtros?.empresa && filtros.empresa !== 'TODAS') {
    query = query.eq('empresa', filtros.empresa);
  }

  if (filtros?.status && filtros.status !== 'TODOS') {
    query = query.eq('status', filtros.status);
  }

  if (filtros?.sanado === 'sim') {
    query = query.eq('sanado_imediato', true);
  } else if (filtros?.sanado === 'nao') {
    query = query.eq('sanado_imediato', false);
  }

  if (filtros?.dataInicio) {
    query = query.gte('data_registro', filtros.dataInicio);
  }

  if (filtros?.dataFim) {
    query = query.lte('data_registro', filtros.dataFim);
  }

  if (filtros?.termo && filtros.termo.trim()) {
    const t = filtros.termo.trim();
    query = query.or(
      `numero_registro.ilike.%${t}%,nome_informante.ilike.%${t}%,matricula_informante.ilike.%${t}%,descricao_desvio.ilike.%${t}%,area_desvio.ilike.%${t}%`
    );
  }

  const { data, error } = await query.limit(250);
  if (error) throw new Error(error.message);

  const desvios = (data || []).map((row: any) => ({
    ...row,
    comportamentos_inseguros: row.comportamentos_inseguros || [],
    condicoes_inseguras: row.condicoes_inseguras || [],
    fotos: row.fotos || [],
  })) as SsmaRidDesvio[];

  return assinarFotosDesvios(desvios);
}

export async function obterDesvioRidPorId(id: string): Promise<SsmaRidDesvio | null> {
  const { data, error } = await dbDesvios()
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const [desvio] = await assinarFotosDesvios([data as SsmaRidDesvio]);
  return desvio;
}

export type NovoDesvioRidInput = Omit<
  SsmaRidDesvio,
  'id' | 'created_at' | 'updated_at' | 'fotos' | 'excluido_em' | 'excluido_por'
>;

export type FotoRidItem = { file: File; tipo: 'antes' | 'depois' } | File;

export async function criarDesvioRid(
  input: NovoDesvioRidInput,
  fotosFiles: FotoRidItem[] = []
): Promise<SsmaRidDesvio> {
  const idTemp = crypto.randomUUID();
  const fotosUp: SsmaRidFoto[] = [];

  // Faz upload das fotos comprimidas se houver
  for (const item of fotosFiles) {
    const file = item instanceof File ? item : item.file;
    const tipo = item instanceof File ? 'antes' : item.tipo;
    try {
      const foto = await uploadFotoStorage(idTemp, file, tipo);
      fotosUp.push(foto);
    } catch (err) {
      console.warn('Falha no upload de foto anexada ao RID:', err);
    }
  }

  // Obtém o número de registro oficial padronizado (RID-DDMMYY-indice)
  let numeroRegistroFinal = input.numero_registro;
  if (!numeroRegistroFinal || numeroRegistroFinal.startsWith('RID-202')) {
    numeroRegistroFinal = await obterProximoNumeroRegistroRid(input.data_registro);
  }

  const payload = {
    ...input,
    id: idTemp,
    numero_registro: numeroRegistroFinal,
    fotos: fotosUp,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await dbDesvios()
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data as SsmaRidDesvio;
}

/**
 * Adiciona novas fotos a um RID já existente (ex: fotos do 'depois' ao concluir)
 */
export async function adicionarFotosDesvioRid(
  desvioId: string,
  novasFotos: { file: File; tipo: 'antes' | 'depois' }[]
): Promise<SsmaRidFoto[]> {
  const fotosUp: SsmaRidFoto[] = [];

  for (const item of novasFotos) {
    try {
      const foto = await uploadFotoStorage(desvioId, item.file, item.tipo);
      fotosUp.push(foto);
    } catch (err) {
      console.warn('Falha no upload de foto adicional ao RID:', err);
    }
  }

  if (fotosUp.length === 0) return [];

  // Busca desvio atual para anexar ao array
  const { data: atual, error: getErr } = await dbDesvios()
    .select('fotos')
    .eq('id', desvioId)
    .single();

  if (getErr) throw new Error(getErr.message);

  const fotosAtuais = (atual?.fotos || []) as SsmaRidFoto[];
  const fotosCombinadas = [...fotosAtuais, ...fotosUp];

  const { error: updErr } = await dbDesvios()
    .update({
      fotos: fotosCombinadas,
      updated_at: new Date().toISOString(),
    })
    .eq('id', desvioId);

  if (updErr) throw new Error(updErr.message);

  return fotosUp;
}


export async function atualizarStatusDesvioRid(
  id: string,
  status: SsmaRidStatus,
  parecerSsma?: string | null
): Promise<void> {
  const patch: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (parecerSsma !== undefined) {
    patch.parecer_ssma = parecerSsma;
  }

  const { error } = await dbDesvios()
    .update(patch)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function excluirDesvioRid(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await dbDesvios()
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function restaurarDesvioRid(id: string): Promise<void> {
  const { error } = await dbDesvios()
    .update(marcarRestaurado())
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// =====================================================================
// MÉTRICAS EM TEMPO REAL PARA O HUB
// =====================================================================

export async function obterMetricasRid(): Promise<SsmaRidMetricas> {
  const { data, error } = await dbDesvios()
    .select('id, sanado_imediato, status, semana, created_at')
    .is('excluido_em', null);

  if (error) {
    console.error('Erro ao obter métricas RID:', error);
    return {
      total: 0,
      sanadosImediato: 0,
      pendentesTratamento: 0,
      totalEstaSemana: 0,
      taxaResolucaoImediata: 0,
    };
  }

  const lista = (data as any[]) || [];
  const total = lista.length;
  const sanadosImediato = lista.filter((r) => r.sanado_imediato).length;
  const pendentesTratamento = lista.filter(
    (r) => r.status === 'REGISTRADO' || r.status === 'EM_TRATAMENTO'
  ).length;

  const semanaAtual = calcularSemanaDoMes(new Date().toISOString().slice(0, 10));
  const totalEstaSemana = lista.filter((r) => r.semana === semanaAtual).length;

  const taxaResolucaoImediata = total > 0 ? Math.round((sanadosImediato / total) * 100) : 0;

  return {
    total,
    sanadosImediato,
    pendentesTratamento,
    totalEstaSemana,
    taxaResolucaoImediata,
  };
}

// =====================================================================
// CONFIGURAÇÃO DINÂMICA DO FORMULÁRIO RID (ADMIN)
// =====================================================================

const dbFormConfig = () => (supabase.from as any)('ssma_form_config');

export const CONFIG_PERGUNTAS_PADRAO_RID: SsmaFormPerguntaConfig[] = [
  {
    id: 'identificacao_informante',
    numero: 1,
    campo: 'nome_informante',
    titulo: '1. Identificação do Informante',
    subtitulo: 'Nome do colaborador que está registrando o desvio',
    obrigatorio: true,
    ativo: true,
    tipo: 'autocomplete',
  },
  {
    id: 'matricula',
    numero: 2,
    campo: 'matricula_informante',
    titulo: '2. Matrícula',
    subtitulo: 'Matrícula do informante na TEN',
    obrigatorio: true,
    ativo: true,
    tipo: 'texto',
  },
  {
    id: 'setor',
    numero: 3,
    campo: 'setor',
    titulo: '3. Setor do Informante',
    subtitulo: 'Setor de atuação do colaborador informante',
    obrigatorio: true,
    ativo: true,
    tipo: 'select',
  },
  {
    id: 'data_registro',
    numero: 4,
    campo: 'data_registro',
    titulo: '4. Data do Registro',
    subtitulo: 'Data da identificação do desvio',
    obrigatorio: true,
    ativo: true,
    tipo: 'data',
  },
  {
    id: 'semana',
    numero: 5,
    campo: 'semana',
    titulo: '5. Semana do Mês',
    subtitulo: 'Semana do mês correspondente ao registro',
    obrigatorio: false,
    ativo: false,
    tipo: 'select',
  },
  {
    id: 'empresa',
    numero: 6,
    campo: 'empresa',
    titulo: '6. Nome da Empresa',
    subtitulo: 'Vínculo do informante (TEN ou Contratada)',
    obrigatorio: true,
    ativo: true,
    tipo: 'radio',
  },
  {
    id: 'area_desvio',
    numero: 7,
    campo: 'area_desvio',
    titulo: '7. Área / Local do Desvio',
    subtitulo: 'Local exato dentro da fábrica, galpão ou pátio',
    obrigatorio: true,
    ativo: true,
    tipo: 'select',
  },
  {
    id: 'sanado_imediato',
    numero: 8,
    campo: 'sanado_imediato',
    titulo: '8. O desvio foi sanado de imediato?',
    subtitulo: 'Ação corretiva realizada na hora da observação',
    obrigatorio: true,
    ativo: true,
    tipo: 'boolean',
  },
  {
    id: 'acao_imediata',
    numero: 9,
    campo: 'acao_imediata',
    titulo: '9. O que foi feito? / O que pode ser feito?',
    subtitulo: 'Ação adotada ou sugestão de solução para a liderança',
    obrigatorio: true,
    ativo: true,
    tipo: 'textarea',
  },
  {
    id: 'comunicado_responsavel',
    numero: 10,
    campo: 'comunicado_responsavel_area',
    titulo: '10. Comunicado ao responsável da área?',
    subtitulo: 'O líder ou supervisor do setor foi alertado',
    obrigatorio: true,
    ativo: true,
    tipo: 'boolean',
  },
  {
    id: 'comunicado_seguranca',
    numero: 11,
    campo: 'comunicado_seguranca',
    titulo: '11. Comunicado à Segurança do Trabalho?',
    subtitulo: 'A equipe de SSMA foi acionada para registro e acompanhamento',
    obrigatorio: true,
    ativo: true,
    tipo: 'boolean',
  },
  {
    id: 'responsavel_seguranca',
    numero: 12,
    campo: 'responsavel_seguranca_informado',
    titulo: '12. Quem da Segurança foi comunicado?',
    subtitulo: 'Selecione o profissional de SSMA notificado',
    obrigatorio: true,
    ativo: true,
    tipo: 'select',
  },
  {
    id: 'descricao_desvio',
    numero: 13,
    campo: 'descricao_desvio',
    titulo: '13. Descrição do Desvio',
    subtitulo: 'Relate com clareza o desvio observado (sempre em maiúsculas)',
    obrigatorio: true,
    ativo: true,
    tipo: 'textarea',
  },
  {
    id: 'fotos',
    numero: 14,
    campo: 'fotos',
    titulo: '14. Registro Fotográfico (Antes e Depois)',
    subtitulo: 'Tire fotos na hora ou anexe imagens da situação antes e depois da correção',
    obrigatorio: false,
    ativo: true,
    tipo: 'fotos',
  },

  {
    id: 'comportamentos_inseguros',
    numero: 15,
    campo: 'comportamentos_inseguros',
    titulo: '15. Comportamento Inseguro',
    subtitulo: 'Marque as condutas de risco observadas',
    obrigatorio: false,
    ativo: true,
    tipo: 'checklist',
  },
  {
    id: 'condicoes_inseguras',
    numero: 16,
    campo: 'condicoes_inseguras',
    titulo: '16. Condição Insegura',
    subtitulo: 'Marque as condições físicas/ambientais observadas',
    obrigatorio: false,
    ativo: true,
    tipo: 'checklist',
  },
];

export const CONFIG_OPCOES_PADRAO_RID: SsmaFormOpcoesConfig = {
  empresas: [...EMPRESAS_SSMA],
  areas: [...AREAS_DESVIO_SSMA],
  responsaveis_seguranca: [...RESPONSAVEIS_SEGURANCA_SSMA],
  comportamentos_inseguros: [...COMPORTAMENTOS_INSEGUROS_SSMA],
  condicoes_inseguras: [...CONDICOES_INSEGURAS_SSMA],
};

export const CONFIG_FORM_PADRAO_RID: SsmaFormConfig = {
  id: 'ssma_rid',
  titulo: 'Registro de Identificação de Desvio (RID)',
  descricao: 'Formulário padrão de SSMA para registro, análise e tratamento de desvios operacionais na fábrica.',
  perguntas: CONFIG_PERGUNTAS_PADRAO_RID,
  opcoes: CONFIG_OPCOES_PADRAO_RID,
};

export async function obterConfiguracaoFormulario(formId = 'ssma_rid'): Promise<SsmaFormConfig> {
  try {
    const { data, error } = await dbFormConfig()
      .select('*')
      .eq('id', formId)
      .maybeSingle();

    if (error || !data) {
      return CONFIG_FORM_PADRAO_RID;
    }

    // Mesclar perguntas padrão caso surjam novas perguntas em versões futuras
    const perguntasSalvas: SsmaFormPerguntaConfig[] = Array.isArray(data.perguntas) ? data.perguntas : [];
    const perguntasCompletas = CONFIG_PERGUNTAS_PADRAO_RID.map((padrao) => {
      const salva = perguntasSalvas.find((p) => p.id === padrao.id);
      return salva ? { ...padrao, ...salva } : padrao;
    });

    const opcoesSalvas = (data.opcoes as Partial<SsmaFormOpcoesConfig>) || {};

    return {
      id: data.id,
      titulo: data.titulo || CONFIG_FORM_PADRAO_RID.titulo,
      descricao: data.descricao ?? CONFIG_FORM_PADRAO_RID.descricao,
      perguntas: perguntasCompletas,
      opcoes: {
        empresas: opcoesSalvas.empresas?.length ? opcoesSalvas.empresas : CONFIG_OPCOES_PADRAO_RID.empresas,
        areas: opcoesSalvas.areas?.length ? opcoesSalvas.areas : CONFIG_OPCOES_PADRAO_RID.areas,
        responsaveis_seguranca: opcoesSalvas.responsaveis_seguranca?.length ? opcoesSalvas.responsaveis_seguranca : CONFIG_OPCOES_PADRAO_RID.responsaveis_seguranca,
        comportamentos_inseguros: opcoesSalvas.comportamentos_inseguros?.length ? opcoesSalvas.comportamentos_inseguros : CONFIG_OPCOES_PADRAO_RID.comportamentos_inseguros,
        condicoes_inseguras: opcoesSalvas.condicoes_inseguras?.length ? opcoesSalvas.condicoes_inseguras : CONFIG_OPCOES_PADRAO_RID.condicoes_inseguras,
      },
      atualizado_em: data.atualizado_em,
      atualizado_por: data.atualizado_por,
    };
  } catch (err) {
    console.warn('Erro ao obter configuração do formulário SSMA:', err);
    return CONFIG_FORM_PADRAO_RID;
  }
}

export async function salvarConfiguracaoFormulario(
  config: SsmaFormConfig,
  userId?: string
): Promise<SsmaFormConfig> {
  const payload = {
    id: config.id || 'ssma_rid',
    titulo: config.titulo,
    descricao: config.descricao || null,
    perguntas: config.perguntas,
    opcoes: config.opcoes,
    atualizado_em: new Date().toISOString(),
    atualizado_por: userId || null,
  };

  const { data, error } = await dbFormConfig()
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error('Erro ao salvar configuração do formulário SSMA:', error);
    throw new Error(`Falha ao salvar configuração: ${error.message}`);
  }

  return data as SsmaFormConfig;
}

export async function restaurarConfiguracaoFormularioPadrao(
  userId?: string
): Promise<SsmaFormConfig> {
  return salvarConfiguracaoFormulario(CONFIG_FORM_PADRAO_RID, userId);
}

