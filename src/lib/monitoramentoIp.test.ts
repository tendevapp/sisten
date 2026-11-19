import { describe, it, expect } from 'vitest';
import {
  normalizarEntradaCidr,
  resumirUserAgent,
  agruparAcessosPorUsuario,
  calcularKpisMonitorIp,
  detectarIpsCompartilhados,
  dataInicioPeriodo,
  type AcessoIpRegistro,
} from './monitoramentoIp';

function criarRegistro(parcial: Partial<AcessoIpRegistro> = {}): AcessoIpRegistro {
  return {
    id: parcial.id ?? 'reg-1',
    user_id: parcial.user_id ?? 'u-1',
    user_name: parcial.user_name ?? 'MARIA SILVA',
    email: parcial.email ?? 'maria@ten.com.br',
    sector_id: parcial.sector_id ?? 'setor-1',
    usuario_status: parcial.usuario_status ?? 'ativo',
    usuario_roles: parcial.usuario_roles ?? ['solicitante'],
    ip_texto: parcial.ip_texto ?? '200.150.10.5',
    session_id: parcial.session_id ?? 'sess-1',
    tipo_evento: parcial.tipo_evento ?? 'login',
    user_agent: parcial.user_agent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36',
    pais: parcial.pais ?? 'BR',
    ocorrencias: parcial.ocorrencias ?? 1,
    primeiro_visto_em: parcial.primeiro_visto_em ?? '2026-11-18T10:00:00.000Z',
    ultimo_visto_em: parcial.ultimo_visto_em ?? '2026-11-18T10:05:00.000Z',
    classificacao: parcial.classificacao ?? 'corporativo',
    regra_rotulo: parcial.regra_rotulo ?? 'Fabrica TEN',
    regra_cidr: parcial.regra_cidr ?? '200.150.10.0/24',
    user_ip_conhecido_id: parcial.user_ip_conhecido_id ?? null,
  };
}

describe('monitoramentoIp', () => {
  describe('normalizarEntradaCidr', () => {
    it('aceita IPv4 simples e aplica /32', () => {
      expect(normalizarEntradaCidr('200.150.10.5')).toEqual({
        valido: true,
        normalizado: '200.150.10.5/32',
      });
    });

    it('zera bits de host em CIDR IPv4 para compatibilidade com tipo cidr do Postgres', () => {
      expect(normalizarEntradaCidr('200.150.10.55/24')).toEqual({
        valido: true,
        normalizado: '200.150.10.0/24',
      });
      expect(normalizarEntradaCidr('187.45.99.12/16')).toEqual({
        valido: true,
        normalizado: '187.45.0.0/16',
      });
    });

    it('aceita IPv6 simples e CIDR IPv6', () => {
      expect(normalizarEntradaCidr('2001:db8::1')).toEqual({
        valido: true,
        normalizado: '2001:db8::1/128',
      });
      expect(normalizarEntradaCidr('2001:DB8::/32')).toEqual({
        valido: true,
        normalizado: '2001:db8::/32',
      });
    });

    it('rejeita entradas vazias, octetos > 255 ou mascaras invalidas', () => {
      expect(normalizarEntradaCidr('').valido).toBe(false);
      expect(normalizarEntradaCidr('999.1.1.1').valido).toBe(false);
      expect(normalizarEntradaCidr('200.150.10.0/33').valido).toBe(false);
      expect(normalizarEntradaCidr('abc.def.ghi.jkl').valido).toBe(false);
      expect(normalizarEntradaCidr('200.150.10.0/24/8').valido).toBe(false);
    });
  });

  describe('resumirUserAgent', () => {
    it('identifica navegador e sistema corretamente', () => {
      expect(
        resumirUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'),
      ).toBe('Chrome · Windows');
      expect(
        resumirUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Edg/130.0.0.0'),
      ).toBe('Edge · Windows');
      expect(
        resumirUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'),
      ).toBe('Safari · iPhone');
      expect(resumirUserAgent(null)).toBe('Dispositivo desconhecido');
    });
  });

  describe('calcularKpisMonitorIp e detectarIpsCompartilhados', () => {
    it('calcula totais de desconhecidos, usuarios afetados e trocas de IP', () => {
      const registros: AcessoIpRegistro[] = [
        criarRegistro({ id: '1', user_id: 'u1', ip_texto: '200.150.10.5', classificacao: 'corporativo', tipo_evento: 'login' }),
        criarRegistro({ id: '2', user_id: 'u1', ip_texto: '177.22.33.44', classificacao: 'desconhecido', tipo_evento: 'troca_ip' }),
        criarRegistro({ id: '3', user_id: 'u2', ip_texto: '177.22.33.44', classificacao: 'desconhecido', tipo_evento: 'login' }),
        criarRegistro({ id: '4', user_id: 'u3', ip_texto: '191.10.20.30', classificacao: 'confiavel_usuario', tipo_evento: 'sessao' }),
      ];

      expect(calcularKpisMonitorIp(registros)).toEqual({
        usuariosMonitorados: 3,
        acessosDesconhecidos: 2,
        usuariosComExterno: 2,
        ipsDesconhecidosDistintos: 1,
        trocasIp: 1,
      });

      const compartilhados = detectarIpsCompartilhados(registros);
      expect(compartilhados.get('177.22.33.44')).toBe(2);
      expect(compartilhados.get('200.150.10.5')).toBe(1);
    });
  });

  describe('agruparAcessosPorUsuario', () => {
    it('prioriza usuarios com IP desconhecido e consolida multiplos IPs', () => {
      const registros: AcessoIpRegistro[] = [
        criarRegistro({
          id: '1',
          user_id: 'u-corp',
          user_name: 'ANA CORP',
          ip_texto: '200.150.10.5',
          classificacao: 'corporativo',
          ultimo_visto_em: '2026-11-18T15:00:00.000Z',
        }),
        criarRegistro({
          id: '2',
          user_id: 'u-ext',
          user_name: 'JOAO EXTERNO',
          ip_texto: '200.150.10.5',
          classificacao: 'corporativo',
          ultimo_visto_em: '2026-11-18T08:00:00.000Z',
        }),
        criarRegistro({
          id: '3',
          user_id: 'u-ext',
          user_name: 'JOAO EXTERNO',
          ip_texto: '189.90.10.22',
          classificacao: 'desconhecido',
          tipo_evento: 'troca_ip',
          ocorrencias: 3,
          ultimo_visto_em: '2026-11-18T12:00:00.000Z',
        }),
      ];

      const agrupados = agruparAcessosPorUsuario(registros);
      expect(agrupados).toHaveLength(2);
      expect(agrupados[0].userId).toBe('u-ext');
      expect(agrupados[0].ipsDesconhecidos).toBe(1);
      expect(agrupados[0].ipsDistintos).toBe(2);
      expect(agrupados[0].temTrocaIp).toBe(true);
      expect(agrupados[0].ultimoIp).toBe('189.90.10.22');
      expect(agrupados[0].ips[0].ip).toBe('189.90.10.22');
      expect(agrupados[1].userId).toBe('u-corp');
    });
  });

  describe('dataInicioPeriodo', () => {
    it('retorna null para tudo e calcula janela de 24h corretamente', () => {
      const ref = new Date('2026-11-18T12:00:00.000Z');
      expect(dataInicioPeriodo('tudo', ref)).toBeNull();
      expect(dataInicioPeriodo('24h', ref)).toBe('2026-11-17T12:00:00.000Z');
    });
  });
});

