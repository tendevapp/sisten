/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Monta o e-mail de carregamento a partir do formulário de expedição, no
 * mesmo formato que a equipe já usa hoje (ver `montarCorpoEmail`), e abre o
 * cliente de e-mail padrão — Outlook, na estação de trabalho da TEN.
 *
 * Módulo puro de propósito: a montagem do texto é o que precisa de teste, e
 * ela não deve depender de React nem do Supabase.
 */

import { formatDateBR } from './format';
import type { EtapaExpedicao, ExpedicaoFoto, ExpedicaoTramo } from '../types';

export const DESTINATARIO_PADRAO = 'andre.araujo@ten.ind.br';
export const ASSUNTO_PADRAO = 'Carregamento Tramos';

/**
 * Teto conservador para o `mailto:` já codificado. O protocolo não define
 * limite, mas o handler do Windows corta a linha de comando por volta de 2 KB
 * e o Outlook abre com o corpo truncado — silenciosamente, que é o pior modo
 * de falhar. Acima disso o chamador cai para a área de transferência.
 */
export const LIMITE_MAILTO = 1900;

const ROTULO_ETAPA: Record<EtapaExpedicao, string> = {
  chegada_portaria: 'Horário de chegada portaria',
  entrada_patio: 'Horário de entrada pátio',
  expedicao: 'Horário de expedição',
};

const ORDEM_ETAPAS: EtapaExpedicao[] = ['chegada_portaria', 'entrada_patio', 'expedicao'];

/** "T1" · "T1 e T4" · "T1, T2 e T4" — como se escreve a frase de abertura. */
export function listarTramos(nomes: string[]): string {
  if (nomes.length === 0) return '';
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** "RTX-3B83" + "MG" → "RTX-3B83 /MG"; sem UF, só a placa. */
function placaComUf(placa: string, uf: string | null): string {
  const p = (placa || '').trim();
  const u = (uf || '').trim();
  if (!p && !u) return '';
  return u ? `${p} /${u}` : p;
}

export interface FotoComUrl extends ExpedicaoFoto {
  url: string | null;
}

/**
 * A linha de horário de uma etapa, com os links das fotos daquela etapa entre
 * parênteses — o formato que o destinatário já espera ler. A observação, quando
 * existe, desce indentada na linha seguinte, para não competir com o horário.
 */
function linhasEtapa(
  etapa: EtapaExpedicao,
  hora: string | null,
  obs: string | null,
  data?: string | null,
): string[] {
  const rotulo = ROTULO_ETAPA[etapa];
  const horaTexto = (hora || '').trim();
  const dataFormatada = data ? formatDateBR(data) : null;

  let valorExibicao = '—';
  if (horaTexto && dataFormatada) {
    valorExibicao = `${dataFormatada} às ${horaTexto}`;
  } else if (horaTexto) {
    valorExibicao = horaTexto;
  } else if (dataFormatada) {
    valorExibicao = dataFormatada;
  }

  const linhas = [`${rotulo}: ${valorExibicao}`];
  const texto = (obs || '').trim();
  if (texto) linhas.push(`   Obs.: ${texto}`);
  return linhas;
}

/**
 * Seção de fotos anexadas do tramo, organizada em lista limpa e legível
 * sem quebrar nem poluir a visualização dos horários das etapas.
 */
function blocoFotos(fotos: FotoComUrl[]): string[] {
  const fotosValidas = fotos.filter((f): f is FotoComUrl & { url: string } => Boolean(f.url));
  if (fotosValidas.length === 0) return [];

  const linhas: string[] = ['', 'Fotos anexadas:'];

  const porEtapa: Record<EtapaExpedicao, (FotoComUrl & { url: string })[]> = {
    chegada_portaria: [],
    entrada_patio: [],
    expedicao: [],
  };

  for (const f of fotosValidas) {
    if (porEtapa[f.etapa]) {
      porEtapa[f.etapa].push(f);
    }
  }

  for (const etapa of ORDEM_ETAPAS) {
    const lista = porEtapa[etapa];
    if (lista.length === 1) {
      linhas.push(`• ${ROTULO_ETAPA[etapa]}: ${lista[0].url}`);
    } else if (lista.length > 1) {
      lista.forEach((f, idx) => {
        linhas.push(`• ${ROTULO_ETAPA[etapa]} (foto ${idx + 1}): ${f.url}`);
      });
    }
  }

  return linhas;
}

/** Os campos fixos do tramo (motorista, placas, data), na ordem do e-mail. */
function blocoIdentificacao(t: ExpedicaoTramo): string[] {
  const linhas: string[] = [];
  linhas.push(`Motorista: ${(t.motorista || '').trim()}`, '');
  linhas.push(`Cavalo:      ${placaComUf(t.cavalo_placa, t.cavalo_uf)}`, '');
  linhas.push(`Carreta:     ${placaComUf(t.carreta_placa, t.carreta_uf)}`, '');

  // Dolly só aparece quando o comboio tem um — a maioria não tem, e uma linha
  // vazia no e-mail vira dúvida de quem lê ("faltou preencher?").
  const dolly = placaComUf(t.dolly_placa, t.dolly_uf);
  if (dolly) linhas.push(`Dolly:       ${dolly}`, '');

  linhas.push(`Data:         ${t.data ? formatDateBR(t.data) : ''}`, '');
  return linhas;
}

export function montarCorpoEmail(params: {
  empresa: string;
  observacoes: string | null;
  tramos: ExpedicaoTramo[];
  fotos: FotoComUrl[];
}): string {
  const empresa = (params.empresa || '').trim();
  const nomes = params.tramos.map(t => t.tramo);
  const linhas: string[] = [];

  const abertura = `Segue dados para carregamento do ${listarTramos(nomes)}${empresa ? ` ${empresa}` : ''}.`;
  linhas.push(abertura, '');
  linhas.push(`Empresa: ${empresa}`, '', '');

  params.tramos.forEach((t, i) => {
    const fotosDoTramo = params.fotos.filter(f => f.tramo_id === t.id);

    linhas.push(`Tramo: ${t.tramo}`, '');
    linhas.push(...blocoIdentificacao(t));

    for (const etapa of ORDEM_ETAPAS) {
      const hora = etapa === 'chegada_portaria' ? t.hora_chegada_portaria
        : etapa === 'entrada_patio' ? t.hora_entrada_patio
        : t.hora_expedicao;
      const dataEtapa = etapa === 'chegada_portaria' ? t.data_chegada_portaria
        : etapa === 'entrada_patio' ? t.data_entrada_patio
        : t.data_expedicao;
      const obs = etapa === 'chegada_portaria' ? t.obs_chegada_portaria
        : etapa === 'entrada_patio' ? t.obs_entrada_patio
        : t.obs_expedicao;
      linhas.push(...linhasEtapa(etapa, hora, obs, dataEtapa));
    }

    const fotosLinhas = blocoFotos(fotosDoTramo);
    if (fotosLinhas.length > 0) {
      linhas.push(...fotosLinhas);
    }

    // Respiro entre tramos, mas não sobra no fim do último.
    if (i < params.tramos.length - 1) linhas.push('', '');
  });

  const obs = (params.observacoes || '').trim();
  if (obs) linhas.push('', '', `Obs.: ${obs}`);

  return linhas.join('\n');
}

/**
 * Aviso parcial, disparado assim que o caminhão encosta na portaria — muito
 * antes de o carregamento terminar. Leva a identificação do comboio e só a
 * primeira marcação de tempo: quem recebe precisa saber que chegou, não
 * esperar as outras duas etapas do dia.
 */
export function montarCorpoEmailChegada(params: {
  empresa: string;
  tramo: ExpedicaoTramo;
  fotos: FotoComUrl[];
}): string {
  const empresa = (params.empresa || '').trim();
  const t = params.tramo;
  const linhas: string[] = [];

  linhas.push(`Segue a chegada na portaria do ${t.tramo}${empresa ? ` ${empresa}` : ''}.`, '');
  linhas.push(`Empresa: ${empresa}`, '', '');
  linhas.push(`Tramo: ${t.tramo}`, '');
  linhas.push(...blocoIdentificacao(t));
  linhas.push(...linhasEtapa(
    'chegada_portaria',
    t.hora_chegada_portaria,
    t.obs_chegada_portaria,
    t.data_chegada_portaria,
  ));

  const fotosChegada = params.fotos.filter(f => f.tramo_id === t.id && f.etapa === 'chegada_portaria');
  const fotosLinhas = blocoFotos(fotosChegada);
  if (fotosLinhas.length > 0) {
    linhas.push(...fotosLinhas);
  }

  return linhas.join('\n');
}

/** Assunto do aviso parcial — distinto do final, para o destinatário não confundir os dois. */
export function assuntoChegada(empresa: string, tramo: string): string {
  const e = (empresa || '').trim();
  return `Chegada na portaria - ${tramo}${e ? ` ${e}` : ''}`;
}

/** URL `mailto:` completa, com quebras de linha em CRLF (o que o Outlook espera). */
export function montarMailto(params: {
  destinatario?: string;
  copia?: string;
  copiaOculta?: string;
  assunto?: string;
  corpo: string;
}): string {
  const para = encodeURIComponent(params.destinatario ?? DESTINATARIO_PADRAO);
  const assunto = encodeURIComponent(params.assunto ?? ASSUNTO_PADRAO);
  const corpo = encodeURIComponent(params.corpo.replace(/\n/g, '\r\n'));

  const queryParams: string[] = [];
  if (params.copia) {
    queryParams.push(`cc=${encodeURIComponent(params.copia)}`);
  }
  if (params.copiaOculta) {
    queryParams.push(`bcc=${encodeURIComponent(params.copiaOculta)}`);
  }
  queryParams.push(`subject=${assunto}`);
  queryParams.push(`body=${corpo}`);

  return `mailto:${para}?${queryParams.join('&')}`;
}

/** `true` quando o corpo cabe no `mailto:` sem risco de truncar no Outlook. */
export function cabeNoMailto(mailto: string): boolean {
  return mailto.length <= LIMITE_MAILTO;
}
