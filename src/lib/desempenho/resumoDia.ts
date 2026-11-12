/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Resumo do dia do Monitor de Desempenho: tipos do JSON que a RPC
 * `admin_desempenho_resumo_dia` devolve, a análise (o que foi mal, onde, e o
 * que fazer) e o texto pronto para copiar. Regras fixas, sem IA: o mesmo dia
 * dá sempre a mesma análise. Puro e testado.
 */

import { formatarBytes, formatarDuracao, formatarNumero, nomeConsulta, rotuloEndpoint } from './diagnostico';

export interface ResumoDia {
  dia: string;
  gerado_em: string;
  parcial: boolean;
  banco: {
    amostras: number;
    minutos_periodo: number;
    primeira: string | null;
    ultima: string | null;
    tempo_ms: number | null;
    segundos: number | null;
    chamadas: number | null;
    temp_bytes: number | null;
    lido_disco_bytes: number | null;
    minutos_com_lentas: number;
    max_lentas: number | null;
    minutos_com_lock: number;
    max_conexoes: number | null;
    limite_conexoes: number | null;
    hora_max_conexoes: string | null;
    mais_longa_s: number | null;
    banco_inicio: number | null;
    banco_fim: number | null;
  };
  horas: { hora: number; amostras: number; carga: number | null; lentas: number; conexoes: number; minutos_lock: number }[];
  piores: {
    balde: string;
    carga: number;
    lentas: number;
    conexoes: number;
    consultas: { id: string; ms: number; chamadas: number; texto: string | null }[];
  }[];
  consultas: { id: string; ms: number; chamadas: number; temp_blks: number; minutos: number; texto: string | null }[];
  longas: { s: number; visto_em: string; bloqueios: number | null; consulta: string }[];
  buracos: { de: string; ate: string; minutos: number }[];
  aparelhos: {
    totais: {
      usuarios: number;
      aparelhos: number;
      requisicoes: number;
      tempo_ms: number;
      lentas: number;
      erros: number;
      bytes: number;
      storage_n: number;
      storage_bytes: number;
      travamentos: number;
      travamento_ms: number;
      memoria_max_mb: number | null;
    };
    paginas: { pagina: string; visitas: number; n: number; ms: number; bytes: number; lentas: number; erros: number; travamento_ms: number; usuarios: number }[];
    endpoints: { endpoint: string; n: number; ms: number; mx: number; lentas: number; erros: number; bytes: number; usuarios: number }[];
    usuarios: {
      user_name: string | null;
      requisicoes: number;
      tempo_ms: number;
      lentas: number;
      erros: number;
      travamento_ms: number;
      travamento_max_ms: number;
      memoria_mb: number | null;
      bytes: number;
    }[];
  };
  consumo: { storage_novos: { bucket: string; arquivos: number; bytes: number }[] | null; logins: number | null };
  anterior: { banco: ResumoDia['banco'] | null; totais: ResumoDia['aparelhos']['totais'] | null } | null;
}

export type NivelAchado = 'critico' | 'atencao' | 'ok' | 'info';

export interface Achado {
  nivel: NivelAchado;
  area: 'Disponibilidade' | 'Banco' | 'Consultas' | 'Páginas' | 'Aparelhos' | 'Consumo' | 'Cobertura' | 'Geral';
  titulo: string;
  detalhe: string;
  /** O que fazer. */
  acao?: string;
}

const n = (v: unknown) => Number(v) || 0;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

/** Carga média do dia: tempo de banco por segundo de relógio. */
export function cargaMedia(b: ResumoDia['banco'] | null | undefined): number | null {
  if (!b || !n(b.segundos)) return null;
  return n(b.tempo_ms) / (n(b.segundos) * 1000);
}

/** Recomendação conforme o tipo de consulta que dominou. */
export function sugestaoParaConsulta(texto: string | null, chamadas: number, ms: number, tempBlks: number): string {
  const nome = nomeConsulta(texto);
  const media = chamadas ? ms / chamadas : ms;
  if (tempBlks * 8192 > 500 * 1_048_576) {
    return `Ordenação/junção grande demais para a memória (${formatarBytes(tempBlks * 8192)} em disco). Materializar ${nome.alvo} (matview atualizada na importação) ou indexar a coluna do ORDER BY/filtro.`;
  }
  if (media < 200 && chamadas > 2000) {
    return `Pouco por chamada (${formatarDuracao(media)}), mas chamada ${formatarNumero(chamadas)} vezes: alguma tela ou a sync chama em laço. Espaçar, usar cache ou trocar por contagem/marcador de versão.`;
  }
  if (nome.alvo.startsWith('vw_')) {
    return `View recalculada a cada página (${formatarDuracao(media)} em média). Tirar da sync geral, materializar ou paginar por coluna indexada em vez de OFFSET.`;
  }
  if (nome.tipo === 'função') {
    return `Função lenta (${formatarDuracao(media)} em média). Revisar o plano (EXPLAIN), índices e LIMIT dentro da função.`;
  }
  if (nome.tipo === 'refresh') {
    return 'Refresh de view materializada: usar CONCURRENTLY e rodar fora do horário de pico.';
  }
  return `Média de ${formatarDuracao(media)}. Ver o plano (EXPLAIN ANALYZE) e se há índice para o filtro.`;
}

export function analisarDia(r: ResumoDia): Achado[] {
  const achados: Achado[] = [];
  const b = r.banco;
  const t = r.aparelhos.totais;
  const carga = cargaMedia(b);

  // Cobertura: o monitor viu o dia inteiro?
  if (!n(b.amostras)) {
    achados.push({
      nivel: 'info',
      area: 'Cobertura',
      titulo: 'Sem amostras do banco neste dia',
      detalhe: 'O monitor não estava instalado ou o coletor não rodou. Só os dados dos aparelhos (se houver) entram na análise.',
    });
  } else if (b.primeira && n(b.minutos_periodo) && n(b.amostras) < n(b.minutos_periodo) * 0.9) {
    achados.push({
      nivel: 'info',
      area: 'Cobertura',
      titulo: `Monitor cobriu ${pct(n(b.amostras), n(b.minutos_periodo))}% do dia`,
      detalhe: `${formatarNumero(b.amostras)} de ${formatarNumero(b.minutos_periodo)} minutos, a partir das ${hhmm(b.primeira)}.`,
    });
  }

  // Disponibilidade: buracos depois da primeira amostra = banco sem responder.
  const buracos = r.buracos.filter(x => n(x.minutos) >= 5);
  if (buracos.length) {
    const total = buracos.reduce((s, x) => s + n(x.minutos), 0);
    achados.push({
      nivel: total >= 15 ? 'critico' : 'atencao',
      area: 'Disponibilidade',
      titulo: `Banco sem responder por ${formatarNumero(total)} min`,
      detalhe: buracos.slice(0, 4).map(x => `${hhmm(x.de)}–${hhmm(x.ate)} (${formatarNumero(x.minutos)} min)`).join(' · '),
      acao: 'Ver na Linha do tempo o que rodava logo antes do buraco: costuma ser importação, refresh sem CONCURRENTLY ou muitas leituras pesadas juntas.',
    });
  }

  // Carga
  const pior = r.piores[0];
  if (pior && n(pior.carga) >= 2) {
    const quem = pior.consultas.slice(0, 2).map(q => nomeConsulta(q.texto).alvo).join(', ');
    achados.push({
      nivel: n(pior.carga) >= 4 ? 'critico' : 'atencao',
      area: 'Banco',
      titulo: `Pico de carga ${formatarNumero(Math.round(n(pior.carga) * 10) / 10)} às ${hhmm(pior.balde)}`,
      detalhe: `${formatarNumero(Math.round(n(pior.carga) * 10) / 10)} consultas rodando juntas em média naqueles 5 min${quem ? `, puxadas por ${quem}` : ''}.`,
      acao: n(pior.carga) >= 4 ? 'Acima de ~4 o banco enfileira: atacar a consulta que puxou o pico (ver "Consultas do dia").' : undefined,
    });
  }

  if (n(b.minutos_com_lentas) && n(b.amostras)) {
    const p = pct(n(b.minutos_com_lentas), n(b.amostras));
    if (p >= 5) {
      achados.push({
        nivel: p >= 20 ? 'critico' : 'atencao',
        area: 'Banco',
        titulo: `Consultas de mais de 5 s em ${p}% dos minutos`,
        detalhe: `${formatarNumero(b.minutos_com_lentas)} minutos com pelo menos uma lenta (pico de ${formatarNumero(b.max_lentas)} ao mesmo tempo; a mais longa durou ${formatarDuracao(n(b.mais_longa_s) * 1000)}).`,
      });
    }
  }

  if (n(b.limite_conexoes) && n(b.max_conexoes) / n(b.limite_conexoes) >= 0.8) {
    achados.push({
      nivel: n(b.max_conexoes) / n(b.limite_conexoes) >= 0.95 ? 'critico' : 'atencao',
      area: 'Banco',
      titulo: `Conexões chegaram a ${pct(n(b.max_conexoes), n(b.limite_conexoes))}% do limite`,
      detalhe: `${formatarNumero(b.max_conexoes)} de ${formatarNumero(b.limite_conexoes)}${b.hora_max_conexoes ? ` às ${hhmm(b.hora_max_conexoes)}` : ''}.`,
      acao: 'Consultas longas seguram conexão: resolvê-las libera o pool. Se persistir, avaliar o tamanho do pool/plano.',
    });
  }

  if (n(b.minutos_com_lock) >= 3) {
    achados.push({
      nivel: n(b.minutos_com_lock) >= 15 ? 'critico' : 'atencao',
      area: 'Banco',
      titulo: `Consultas esperando lock em ${formatarNumero(b.minutos_com_lock)} minuto(s)`,
      detalhe: 'Uma escrita ou refresh segurou a tabela enquanto outras esperavam.',
      acao: 'Importações e refresh de matview fora do expediente, e REFRESH ... CONCURRENTLY.',
    });
  }

  const tempGb = n(b.temp_bytes) / 1024 ** 3;
  if (tempGb >= 1) {
    achados.push({
      nivel: tempGb >= 10 ? 'critico' : 'atencao',
      area: 'Banco',
      titulo: `${formatarBytes(b.temp_bytes)} escritos em disco temporário`,
      detalhe: 'Consultas que não couberam na memória (ordenações e junções grandes). Deixa o banco lento para todos e gasta IO.',
      acao: 'A consulta com mais "disco temporário" em Consultas do dia é a primeira candidata a matview ou índice.',
    });
  }

  // Consultas dominantes
  const totalMs = n(b.tempo_ms);
  for (const q of r.consultas.slice(0, 3)) {
    const parte = pct(n(q.ms), totalMs);
    if (parte < 15) break;
    const nome = nomeConsulta(q.texto);
    achados.push({
      nivel: parte >= 40 ? 'critico' : 'atencao',
      area: 'Consultas',
      titulo: `${nome.alvo} (${nome.tipo || 'SQL'}) = ${parte}% do tempo de banco`,
      detalhe: `${formatarDuracao(q.ms)} em ${formatarNumero(q.chamadas)} chamadas (média ${formatarDuracao(n(q.chamadas) ? n(q.ms) / n(q.chamadas) : 0)}).`,
      acao: sugestaoParaConsulta(q.texto, n(q.chamadas), n(q.ms), n(q.temp_blks)),
    });
  }

  // Páginas
  const paginas = r.aparelhos.paginas.filter(p => p.pagina !== 'OUTROS');
  const pagLenta = paginas[0];
  if (pagLenta && n(pagLenta.ms) > 0 && n(t.tempo_ms) && pct(n(pagLenta.ms), n(t.tempo_ms)) >= 25) {
    achados.push({
      nivel: 'atencao',
      area: 'Páginas',
      titulo: `${pagLenta.pagina} concentra ${pct(n(pagLenta.ms), n(t.tempo_ms))}% da espera dos usuários`,
      detalhe: `${formatarDuracao(pagLenta.ms)} esperando, ${formatarNumero(pagLenta.visitas)} visitas, ${formatarNumero(pagLenta.lentas)} chamadas lentas, ${formatarNumero(pagLenta.usuarios)} usuário(s).`,
    });
  }
  for (const p of paginas) {
    const visitas = Math.max(1, n(p.visitas));
    const reqVisita = n(p.n) / visitas;
    const bytesVisita = n(p.bytes) / visitas;
    if (reqVisita >= 60 || bytesVisita >= 10 * 1_048_576) {
      achados.push({
        nivel: 'atencao',
        area: 'Páginas',
        titulo: `${p.pagina}: ${formatarNumero(Math.round(reqVisita))} requisições e ${formatarBytes(bytesVisita)} por visita`,
        detalhe: 'A tela baixa muito a cada abertura — provavelmente a base inteira, paginada de 1.000 em 1.000.',
        acao: 'Filtrar no servidor (RPC com o recorte da tela), paginar sob demanda ou reaproveitar a cópia local em vez de rebaixar.',
      });
      break;
    }
  }
  const travou = [...paginas].sort((a, b2) => n(b2.travamento_ms) - n(a.travamento_ms))[0];
  if (travou && n(travou.travamento_ms) >= 60_000) {
    achados.push({
      nivel: n(travou.travamento_ms) >= 5 * 60_000 ? 'critico' : 'atencao',
      area: 'Páginas',
      titulo: `Tela travada ${formatarDuracao(travou.travamento_ms)} em ${travou.pagina}`,
      detalhe: 'Tempo em que o navegador não respondia ao toque/clique, somando os usuários. Não é o servidor: é processamento no aparelho.',
      acao: 'Procurar laço pesado na tela (filtros/ordenações sobre milhares de linhas a cada render, montagem de PDF/XLSX): memorizar, paginar a lista ou mover para Web Worker.',
    });
  }

  // Aparelhos
  if (n(t.requisicoes)) {
    const pErro = (n(t.erros) / n(t.requisicoes)) * 100;
    if (pErro >= 1) {
      const pior = [...r.aparelhos.endpoints].sort((a, b2) => n(b2.erros) - n(a.erros))[0];
      achados.push({
        nivel: pErro >= 5 ? 'critico' : 'atencao',
        area: 'Aparelhos',
        titulo: `${pErro.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% das chamadas falharam`,
        detalhe: `${formatarNumero(t.erros)} erros (5xx, 429 ou rede)${pior && n(pior.erros) ? `; o que mais falhou: ${rotuloEndpoint(pior.endpoint)} (${formatarNumero(pior.erros)})` : ''}.`,
        acao: 'Erro 500 em leitura costuma ser statement timeout (consulta passou do limite); 429/rede, excesso de chamadas ou sinal ruim.',
      });
    }
    const pLenta = (n(t.lentas) / n(t.requisicoes)) * 100;
    if (pLenta >= 2) {
      const pior = [...r.aparelhos.endpoints].sort((a, b2) => n(b2.lentas) - n(a.lentas))[0];
      achados.push({
        nivel: pLenta >= 10 ? 'critico' : 'atencao',
        area: 'Aparelhos',
        titulo: `${pLenta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% das chamadas levaram mais de 3 s`,
        detalhe: pior && n(pior.lentas) ? `A que mais demorou: ${rotuloEndpoint(pior.endpoint)} (${formatarNumero(pior.lentas)} lentas, máx. ${formatarDuracao(pior.mx)}).` : '',
      });
    }
  }
  const memoria = r.aparelhos.usuarios.find(u => n(u.memoria_mb) >= 1500);
  if (memoria) {
    achados.push({
      nivel: 'atencao',
      area: 'Aparelhos',
      titulo: `${memoria.user_name || 'Um usuário'} chegou a ${formatarNumero(memoria.memoria_mb)} MB de memória`,
      detalhe: 'Aba aberta há muito tempo ou tela que acumula dados. Em aparelho fraco, isso trava tudo.',
      acao: 'Pedir para recarregar a página; se repetir, investigar a tela onde a pessoa passa o dia.',
    });
  }

  // Consumo
  const ant = r.anterior?.totais;
  const baixado = n(t.bytes) + n(t.storage_bytes);
  if (ant && !r.parcial) {
    const antBaixado = n(ant.bytes) + n(ant.storage_bytes);
    if (antBaixado > 0 && baixado > antBaixado * 1.5 && baixado - antBaixado > 200 * 1_048_576) {
      achados.push({
        nivel: 'atencao',
        area: 'Consumo',
        titulo: `Volume baixado subiu ${pct(baixado - antBaixado, antBaixado)}% em relação ao dia anterior`,
        detalhe: `${formatarBytes(baixado)} contra ${formatarBytes(antBaixado)}.`,
        acao: 'Importação SAP faz todos os aparelhos rebaixarem as bases; fora disso, ver a página com mais MB por visita.',
      });
    }
  }
  if (n(b.banco_inicio) && n(b.banco_fim) && n(b.banco_fim) - n(b.banco_inicio) > 100 * 1_048_576) {
    achados.push({
      nivel: 'atencao',
      area: 'Consumo',
      titulo: `Banco cresceu ${formatarBytes(n(b.banco_fim) - n(b.banco_inicio))} no dia`,
      detalhe: 'Importação grande, log sem faxina ou tabela inchada (linhas mortas). Ver "Maiores tabelas" na aba Banco.',
    });
  }

  // Comparação com o dia anterior
  const cargaAnt = cargaMedia(r.anterior?.banco);
  if (carga != null && cargaAnt != null && cargaAnt > 0.05 && !r.parcial) {
    const variacao = Math.round(((carga - cargaAnt) / cargaAnt) * 100);
    if (Math.abs(variacao) >= 30) {
      achados.push({
        nivel: variacao > 0 ? 'atencao' : 'ok',
        area: 'Geral',
        titulo: `Carga média ${variacao > 0 ? 'subiu' : 'caiu'} ${Math.abs(variacao)}% em relação ao dia anterior`,
        detalhe: `${carga.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} contra ${cargaAnt.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}.`,
      });
    }
  }

  if (!achados.some(a => a.nivel === 'critico' || a.nivel === 'atencao')) {
    achados.push({
      nivel: 'ok',
      area: 'Geral',
      titulo: r.parcial ? 'Até agora, dia sem problema de desempenho' : 'Dia sem problema de desempenho',
      detalhe:
        carga != null
          ? `Carga média de ${carga.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}, sem picos, buracos ou erros relevantes.`
          : 'Nenhum sinal de lentidão nos dados disponíveis.',
    });
  }

  const ordem: Record<NivelAchado, number> = { critico: 0, atencao: 1, info: 2, ok: 3 };
  return achados.sort((a, b2) => ordem[a.nivel] - ordem[b2.nivel]);
}

/** Hora do dia com mais carga (para a manchete). */
export function horaDePico(r: ResumoDia): { hora: number; carga: number } | null {
  const h = [...r.horas].filter(x => x.carga != null).sort((a, b) => n(b.carga) - n(a.carga))[0];
  return h ? { hora: h.hora, carga: n(h.carga) } : null;
}

function dataBr(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

const MARCA: Record<NivelAchado, string> = { critico: '🔴', atencao: '🟡', info: 'ℹ️', ok: '🟢' };

/** Texto para colar no WhatsApp/e-mail. */
export function textoResumo(r: ResumoDia, achados: Achado[]): string {
  const t = r.aparelhos.totais;
  const carga = cargaMedia(r.banco);
  const pico = horaDePico(r);
  const linhas = [
    `*SISTEN — desempenho de ${dataBr(r.dia)}*${r.parcial ? ' (parcial)' : ''}`,
    '',
    `Usuários: ${formatarNumero(t.usuarios)} · Requisições: ${formatarNumero(t.requisicoes)} · Lentas (>3 s): ${formatarNumero(t.lentas)} · Erros: ${formatarNumero(t.erros)}`,
    `Banco: carga média ${carga != null ? carga.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'}${pico ? ` · pico às ${String(pico.hora).padStart(2, '0')}h (${pico.carga.toLocaleString('pt-BR', { maximumFractionDigits: 2 })})` : ''} · disco temporário ${formatarBytes(r.banco.temp_bytes)}`,
    `Consumo: ${formatarBytes(n(t.bytes) + n(t.storage_bytes))} baixados pelos aparelhos · banco ${formatarBytes(r.banco.banco_fim)}`,
    '',
    '*Análise*',
    ...achados.map(a => `${MARCA[a.nivel]} ${a.titulo}${a.detalhe ? ` — ${a.detalhe}` : ''}${a.acao ? `\n   → ${a.acao}` : ''}`),
  ];
  const top = r.consultas.slice(0, 5);
  if (top.length) {
    linhas.push('', '*Consultas que mais pesaram*');
    top.forEach((q, i) => linhas.push(`${i + 1}. ${nomeConsulta(q.texto).alvo} — ${formatarDuracao(q.ms)} (${pct(n(q.ms), n(r.banco.tempo_ms))}%), ${formatarNumero(q.chamadas)} chamadas`));
  }
  const pags = r.aparelhos.paginas.slice(0, 5);
  if (pags.length) {
    linhas.push('', '*Páginas com mais espera*');
    pags.forEach((p, i) => linhas.push(`${i + 1}. ${p.pagina} — ${formatarDuracao(p.ms)}, ${formatarNumero(p.visitas)} visitas, ${formatarBytes(p.bytes)}`));
  }
  return linhas.join('\n');
}
