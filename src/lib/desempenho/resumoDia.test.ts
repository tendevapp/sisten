import { describe, expect, it } from 'vitest';
import { analisarDia, cargaMedia, sugestaoParaConsulta, textoResumo, type ResumoDia } from './resumoDia';

const VIEW = 'WITH pgrst_source AS ( SELECT "public"."vw_sap_requisicoes_enriquecidas".* FROM "public"."vw_sap_requisicoes_enriquecidas"';

function resumo(over: Partial<ResumoDia> = {}): ResumoDia {
  return {
    dia: '2026-11-10',
    gerado_em: '2026-11-11T03:15:00Z',
    parcial: false,
    banco: {
      amostras: 1440,
      minutos_periodo: 1440,
      primeira: '2026-11-10T03:00:00Z',
      ultima: '2026-11-11T02:59:00Z',
      tempo_ms: 1440 * 60_000 * 0.3, // carga 0,3
      segundos: 1440 * 60,
      chamadas: 100_000,
      temp_bytes: 0,
      lido_disco_bytes: 0,
      minutos_com_lentas: 0,
      max_lentas: 0,
      minutos_com_lock: 0,
      max_conexoes: 20,
      limite_conexoes: 60,
      hora_max_conexoes: null,
      mais_longa_s: 1,
      banco_inicio: 900_000_000,
      banco_fim: 910_000_000,
    },
    horas: [{ hora: 9, amostras: 60, carga: 0.5, lentas: 0, conexoes: 20, minutos_lock: 0 }],
    piores: [],
    consultas: [],
    longas: [],
    buracos: [],
    aparelhos: {
      totais: { usuarios: 30, aparelhos: 32, requisicoes: 10_000, tempo_ms: 1_000_000, lentas: 10, erros: 5, bytes: 1e9, storage_n: 10, storage_bytes: 1e7, travamentos: 0, travamento_ms: 0, memoria_max_mb: 300 },
      paginas: [],
      endpoints: [],
      usuarios: [],
    },
    consumo: { storage_novos: [], logins: 30 },
    anterior: null,
    ...over,
  };
}

describe('analisarDia', () => {
  it('dia tranquilo vira um achado verde', () => {
    const a = analisarDia(resumo());
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ nivel: 'ok', titulo: 'Dia sem problema de desempenho' });
    expect(cargaMedia(resumo().banco)).toBeCloseTo(0.3);
  });

  it('aponta buraco, pico, disco temporário e consulta dominante, críticos primeiro', () => {
    const base = resumo();
    const a = analisarDia(
      resumo({
        buracos: [{ de: '2026-11-10T11:40:00Z', ate: '2026-11-10T12:50:00Z', minutos: 70 }],
        piores: [{ balde: '2026-11-10T11:35:00Z', carga: 6.2, lentas: 9, conexoes: 55, consultas: [{ id: '1', ms: 1, chamadas: 1, texto: VIEW }] }],
        banco: { ...base.banco, temp_bytes: 20 * 1024 ** 3 },
        consultas: [{ id: '1', ms: base.banco.tempo_ms! * 0.6, chamadas: 600, temp_blks: 0, minutos: 300, texto: VIEW }],
      }),
    );
    expect(a.map(x => x.nivel).slice(0, 4)).toEqual(['critico', 'critico', 'critico', 'critico']);
    expect(a.find(x => x.area === 'Disponibilidade')?.titulo).toBe('Banco sem responder por 70 min');
    expect(a.find(x => x.area === 'Consultas')?.titulo).toBe('vw_sap_requisicoes_enriquecidas (leitura) = 60% do tempo de banco');
    expect(a.find(x => x.area === 'Consultas')?.acao).toContain('materializar');
    expect(a.some(x => x.nivel === 'ok')).toBe(false);
  });

  it('pega página que baixa a base inteira e tela travada', () => {
    const a = analisarDia(
      resumo({
        aparelhos: {
          ...resumo().aparelhos,
          paginas: [{ pagina: '/compras/central', visitas: 10, n: 1200, ms: 600_000, bytes: 300 * 1_048_576, lentas: 40, erros: 0, travamento_ms: 400_000, usuarios: 5 }],
        },
      }),
    );
    expect(a.some(x => x.titulo.includes('/compras/central: 120 requisições'))).toBe(true);
    expect(a.find(x => x.titulo.startsWith('Tela travada'))?.nivel).toBe('critico');
    expect(a.find(x => x.titulo.includes('concentra'))?.titulo).toContain('60%');
  });

  it('sem amostras avisa a cobertura', () => {
    const a = analisarDia(resumo({ banco: { ...resumo().banco, amostras: 0, segundos: 0, tempo_ms: 0 } }));
    expect(a[0].area).toBe('Cobertura');
  });
});

describe('sugestaoParaConsulta', () => {
  it('muitas chamadas baratas = laço; muito disco = matview', () => {
    expect(sugestaoParaConsulta(VIEW, 50_000, 50_000 * 20, 0)).toContain('laço');
    expect(sugestaoParaConsulta(VIEW, 10, 100_000, 200_000)).toContain('memória');
  });
});

describe('textoResumo', () => {
  it('monta o texto para copiar', () => {
    const r = resumo();
    const texto = textoResumo(r, analisarDia(r));
    expect(texto).toContain('*SISTEN — desempenho de 10/11/2026*');
    expect(texto).toContain('🟢 Dia sem problema de desempenho');
  });
});
