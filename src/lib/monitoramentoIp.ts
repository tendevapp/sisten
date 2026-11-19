/**
 * Logica pura de monitoramento de IP por usuario: validacao/normalizacao CIDR,
 * parsing leve de User-Agent, KPIs e agregacao por usuario.
 */

export type ClassificacaoIp = 'corporativo' | 'confiavel_usuario' | 'desconhecido';
export type TipoEventoIp = 'login' | 'sessao' | 'troca_ip';
export type PeriodoMonitorIp = '24h' | '7d' | '30d' | '90d' | 'tudo';

export interface AcessoIpRegistro {
  id: string;
  user_id: string;
  user_name: string | null;
  email: string | null;
  sector_id: string | null;
  usuario_status: string | null;
  usuario_roles: string[] | null;
  ip_texto: string;
  session_id: string | null;
  tipo_evento: TipoEventoIp;
  user_agent: string | null;
  pais: string | null;
  ocorrencias: number;
  primeiro_visto_em: string;
  ultimo_visto_em: string;
  classificacao: ClassificacaoIp;
  regra_rotulo: string | null;
  regra_cidr: string | null;
  user_ip_conhecido_id: string | null;
}

export interface IpConfiavelCorporativo {
  id: string;
  cidr: string;
  rotulo: string;
  descricao: string | null;
  ativo: boolean;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface ResumoIpDoUsuario {
  ip: string;
  classificacao: ClassificacaoIp;
  regraRotulo: string | null;
  regraCidr: string | null;
  userIpConhecidoId: string | null;
  ocorrencias: number;
  eventos: number;
  primeiroVistoEm: string;
  ultimoVistoEm: string;
  pais: string | null;
  dispositivo: string;
  ultimoTipoEvento: TipoEventoIp;
}

export interface ResumoUsuarioIp {
  userId: string;
  userName: string;
  email: string;
  sectorId: string | null;
  status: string | null;
  totalEventos: number;
  totalSinais: number;
  ipsDistintos: number;
  ipsDesconhecidos: number;
  ultimoIp: string;
  ultimoVistoEm: string;
  ultimaClassificacao: ClassificacaoIp;
  temTrocaIp: boolean;
  ips: ResumoIpDoUsuario[];
}

export interface KpisMonitorIp {
  usuariosMonitorados: number;
  acessosDesconhecidos: number;
  usuariosComExterno: number;
  ipsDesconhecidosDistintos: number;
  trocasIp: number;
}

export interface ResultadoCidr {
  valido: boolean;
  normalizado: string;
  erro?: string;
}

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_CHARS_REGEX = /^[0-9a-fA-F:]+$/;

function parseIpv4ParaInt(ip: string): number | null {
  const match = IPV4_REGEX.exec(ip);
  if (!match) return null;
  const octetos = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  if (octetos.some(o => Number.isNaN(o) || o < 0 || o > 255)) return null;
  return (((octetos[0] << 24) | (octetos[1] << 16) | (octetos[2] << 8) | octetos[3]) >>> 0);
}

function intParaIpv4(valor: number): string {
  return [
    (valor >>> 24) & 255,
    (valor >>> 16) & 255,
    (valor >>> 8) & 255,
    valor & 255,
  ].join('.');
}

function ehIpv6Basico(ip: string): boolean {
  if (!ip.includes(':') || !IPV6_CHARS_REGEX.test(ip)) return false;
  const partesDuplas = ip.split('::');
  if (partesDuplas.length > 2) return false;
  const grupos = ip.split(':').filter(Boolean);
  if (grupos.length === 0 && ip !== '::') return false;
  if (grupos.some(g => g.length > 4)) return false;
  if (partesDuplas.length === 1 && ip.split(':').length !== 8) return false;
  if (partesDuplas.length === 2 && grupos.length >= 8) return false;
  return true;
}

/**
 * Valida e normaliza um IP ou faixa CIDR (IPv4 ou IPv6) antes de enviar ao Postgres.
 * Para IPv4 com mascara, zera bits de host automaticamente (ex: 200.150.10.5/24 -> 200.150.10.0/24).
 */
export function normalizarEntradaCidr(entrada: string): ResultadoCidr {
  const texto = entrada.trim();
  if (!texto) {
    return { valido: false, normalizado: '', erro: 'Informe um IP ou faixa CIDR.' };
  }

  const partes = texto.split('/');
  if (partes.length > 2) {
    return { valido: false, normalizado: '', erro: 'Formato inválido. Use IP (ex: 200.150.10.5) ou CIDR (ex: 200.150.10.0/24).' };
  }

  const hostStr = partes[0].trim();
  const mascaraStr = partes[1]?.trim();

  const ipv4Int = parseIpv4ParaInt(hostStr);
  if (ipv4Int !== null) {
    let prefixo = 32;
    if (mascaraStr !== undefined) {
      if (!/^\d{1,2}$/.test(mascaraStr)) {
        return { valido: false, normalizado: '', erro: 'Máscara IPv4 deve ser um número entre 0 e 32.' };
      }
      prefixo = Number(mascaraStr);
      if (prefixo < 0 || prefixo > 32) {
        return { valido: false, normalizado: '', erro: 'Máscara IPv4 deve estar entre 0 e 32.' };
      }
    }
    const mask = prefixo === 0 ? 0 : (~0 << (32 - prefixo)) >>> 0;
    const rede = (ipv4Int & mask) >>> 0;
    return { valido: true, normalizado: `${intParaIpv4(rede)}/${prefixo}` };
  }

  if (ehIpv6Basico(hostStr)) {
    let prefixo = 128;
    if (mascaraStr !== undefined) {
      if (!/^\d{1,3}$/.test(mascaraStr)) {
        return { valido: false, normalizado: '', erro: 'Máscara IPv6 deve ser um número entre 0 e 128.' };
      }
      prefixo = Number(mascaraStr);
      if (prefixo < 0 || prefixo > 128) {
        return { valido: false, normalizado: '', erro: 'Máscara IPv6 deve estar entre 0 e 128.' };
      }
    }
    return { valido: true, normalizado: `${hostStr.toLowerCase()}/${prefixo}` };
  }

  return { valido: false, normalizado: '', erro: 'Endereço IP ou CIDR inválido.' };
}

export function dataInicioPeriodo(periodo: PeriodoMonitorIp, agora: Date = new Date()): string | null {
  if (periodo === 'tudo') return null;
  const horas =
    periodo === '24h' ? 24 :
    periodo === '7d' ? 24 * 7 :
    periodo === '30d' ? 24 * 30 :
    24 * 90;
  return new Date(agora.getTime() - horas * 60 * 60 * 1000).toISOString();
}

export function resumirUserAgent(ua: string | null): string {
  if (!ua) return 'Dispositivo desconhecido';

  let navegador = 'Navegador';
  if (/Edg\//i.test(ua)) navegador = 'Edge';
  else if (/OPR\//i.test(ua)) navegador = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) navegador = 'Chrome';
  else if (/Firefox\//i.test(ua)) navegador = 'Firefox';
  else if (/Safari\//i.test(ua)) navegador = 'Safari';

  let sistema = '';
  if (/iPhone/i.test(ua)) sistema = 'iPhone';
  else if (/iPad/i.test(ua)) sistema = 'iPad';
  else if (/Android/i.test(ua)) sistema = 'Android';
  else if (/Windows/i.test(ua)) sistema = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) sistema = 'macOS';
  else if (/Linux/i.test(ua)) sistema = 'Linux';

  return sistema ? `${navegador} · ${sistema}` : navegador;
}

export function rotuloClassificacao(c: ClassificacaoIp): string {
  if (c === 'corporativo') return 'Rede corporativa';
  if (c === 'confiavel_usuario') return 'Confiável p/ usuário';
  return 'Externo / Desconhecido';
}

export function rotuloTipoEvento(t: TipoEventoIp): string {
  if (t === 'login') return 'Login';
  if (t === 'troca_ip') return 'Troca de IP';
  return 'Sessão ativa';
}

/**
 * Conta quantos usuarios distintos usaram cada IP no conjunto carregado.
 * Util para diferenciar um IP compartilhado (ex: link da empresa ainda nao cadastrado)
 * de um acesso isolado.
 */
export function detectarIpsCompartilhados(registros: AcessoIpRegistro[]): Map<string, number> {
  const usuariosPorIp = new Map<string, Set<string>>();
  for (const r of registros) {
    let set = usuariosPorIp.get(r.ip_texto);
    if (!set) {
      set = new Set();
      usuariosPorIp.set(r.ip_texto, set);
    }
    set.add(r.user_id);
  }
  const contagem = new Map<string, number>();
  usuariosPorIp.forEach((users, ip) => contagem.set(ip, users.size));
  return contagem;
}

export function calcularKpisMonitorIp(registros: AcessoIpRegistro[]): KpisMonitorIp {
  const usuarios = new Set<string>();
  const usuariosExterno = new Set<string>();
  const ipsDesconhecidos = new Set<string>();
  let acessosDesconhecidos = 0;
  let trocasIp = 0;

  for (const r of registros) {
    usuarios.add(r.user_id);
    if (r.classificacao === 'desconhecido') {
      acessosDesconhecidos += 1;
      usuariosExterno.add(r.user_id);
      ipsDesconhecidos.add(r.ip_texto);
    }
    if (r.tipo_evento === 'troca_ip') {
      trocasIp += 1;
    }
  }

  return {
    usuariosMonitorados: usuarios.size,
    acessosDesconhecidos,
    usuariosComExterno: usuariosExterno.size,
    ipsDesconhecidosDistintos: ipsDesconhecidos.size,
    trocasIp,
  };
}

/**
 * Agrupa registros por usuario, ordenando primeiro quem possui IP desconhecido
 * e depois pelo ultimo acesso mais recente.
 */
export function agruparAcessosPorUsuario(registros: AcessoIpRegistro[]): ResumoUsuarioIp[] {
  const porUsuario = new Map<string, {
    userId: string;
    userName: string;
    email: string;
    sectorId: string | null;
    status: string | null;
    totalEventos: number;
    totalSinais: number;
    ultimoIp: string;
    ultimoVistoEm: string;
    ultimaClassificacao: ClassificacaoIp;
    temTrocaIp: boolean;
    ipsMap: Map<string, ResumoIpDoUsuario>;
  }>();

  for (const r of registros) {
    let grupo = porUsuario.get(r.user_id);
    if (!grupo) {
      grupo = {
        userId: r.user_id,
        userName: r.user_name || r.email || 'Usuário sem nome',
        email: r.email || '',
        sectorId: r.sector_id,
        status: r.usuario_status,
        totalEventos: 0,
        totalSinais: 0,
        ultimoIp: r.ip_texto,
        ultimoVistoEm: r.ultimo_visto_em,
        ultimaClassificacao: r.classificacao,
        temTrocaIp: false,
        ipsMap: new Map(),
      };
      porUsuario.set(r.user_id, grupo);
    }

    grupo.totalEventos += 1;
    grupo.totalSinais += r.ocorrencias || 1;
    if (r.tipo_evento === 'troca_ip') grupo.temTrocaIp = true;

    if (r.ultimo_visto_em > grupo.ultimoVistoEm) {
      grupo.ultimoVistoEm = r.ultimo_visto_em;
      grupo.ultimoIp = r.ip_texto;
      grupo.ultimaClassificacao = r.classificacao;
    }

    const existenteIp = grupo.ipsMap.get(r.ip_texto);
    if (!existenteIp) {
      grupo.ipsMap.set(r.ip_texto, {
        ip: r.ip_texto,
        classificacao: r.classificacao,
        regraRotulo: r.regra_rotulo,
        regraCidr: r.regra_cidr,
        userIpConhecidoId: r.user_ip_conhecido_id,
        ocorrencias: r.ocorrencias || 1,
        eventos: 1,
        primeiroVistoEm: r.primeiro_visto_em,
        ultimoVistoEm: r.ultimo_visto_em,
        pais: r.pais,
        dispositivo: resumirUserAgent(r.user_agent),
        ultimoTipoEvento: r.tipo_evento,
      });
    } else {
      existenteIp.ocorrencias += r.ocorrencias || 1;
      existenteIp.eventos += 1;
      if (r.primeiro_visto_em < existenteIp.primeiroVistoEm) {
        existenteIp.primeiroVistoEm = r.primeiro_visto_em;
      }
      if (r.ultimo_visto_em > existenteIp.ultimoVistoEm) {
        existenteIp.ultimoVistoEm = r.ultimo_visto_em;
        existenteIp.dispositivo = resumirUserAgent(r.user_agent);
        existenteIp.ultimoTipoEvento = r.tipo_evento;
        if (r.pais) existenteIp.pais = r.pais;
      }
    }
  }

  return Array.from(porUsuario.values())
    .map(g => {
      const ips = Array.from(g.ipsMap.values()).sort((a, b) => {
        if (a.classificacao === 'desconhecido' && b.classificacao !== 'desconhecido') return -1;
        if (b.classificacao === 'desconhecido' && a.classificacao !== 'desconhecido') return 1;
        return b.ultimoVistoEm.localeCompare(a.ultimoVistoEm);
      });
      const ipsDesconhecidos = ips.filter(i => i.classificacao === 'desconhecido').length;
      return {
        userId: g.userId,
        userName: g.userName,
        email: g.email,
        sectorId: g.sectorId,
        status: g.status,
        totalEventos: g.totalEventos,
        totalSinais: g.totalSinais,
        ipsDistintos: ips.length,
        ipsDesconhecidos,
        ultimoIp: g.ultimoIp,
        ultimoVistoEm: g.ultimoVistoEm,
        ultimaClassificacao: g.ultimaClassificacao,
        temTrocaIp: g.temTrocaIp || ips.length > 1,
        ips,
      };
    })
    .sort((a, b) => {
      if (a.ipsDesconhecidos > 0 && b.ipsDesconhecidos === 0) return -1;
      if (b.ipsDesconhecidos > 0 && a.ipsDesconhecidos === 0) return 1;
      return b.ultimoVistoEm.localeCompare(a.ultimoVistoEm);
    });
}

