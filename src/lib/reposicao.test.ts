import { describe, it, expect } from 'vitest';
import {
  classificarPadrao, classificarConfianca, calcularSugestao, resumirReposicao,
  MIN_EVENTOS_PARA_MINIMO, MULTIPLO_EXCESSO, CONCENTRACAO_PROJETO,
} from './reposicao';
import { EstoqueReposicao } from '../types';

const rep = (over: Partial<EstoqueReposicao>): EstoqueReposicao => ({
  material: '1000001',
  saldo_atual: 100,
  valor_estoque: 1000,
  preco_medio: 10,
  eventos_consumo: 20,
  meses_com_consumo: 4,
  consumo_total: 400,
  consumo_diario: 4,
  maior_lote: 30,
  lote_p75: 25,
  lote_p90: 30,
  concentracao_maior_lote: 0.1,
  media_lote: 20,
  dp_lote: 5,
  adi: 1,
  cv2: 0.06,
  lead_dias: 10,
  lead_amostras: 3,
  lead_proprio: true,
  umb: 'KG',
  ...over,
});

describe('classificarPadrao', () => {
  it('usa os dois eixos de Syntetos-Boylan', () => {
    expect(classificarPadrao(rep({ adi: 1.0, cv2: 0.2 }))).toBe('suave');
    expect(classificarPadrao(rep({ adi: 1.0, cv2: 0.9 }))).toBe('erratica');
    expect(classificarPadrao(rep({ adi: 6.0, cv2: 0.2 }))).toBe('intermitente');
    expect(classificarPadrao(rep({ adi: 6.0, cv2: 0.9 }))).toBe('irregular');
  });

  it('sem consumo é sem_demanda, independentemente dos eixos', () => {
    expect(classificarPadrao(rep({ eventos_consumo: 0, adi: 1, cv2: 0.1 }))).toBe('sem_demanda');
  });

  it('cai no padrão mais conservador quando falta ADI ou CV²', () => {
    // Com demanda registrada mas eixos indisponíveis, assumir "suave" faria o
    // método parecer mais confiante do que é.
    expect(classificarPadrao(rep({ adi: null, cv2: 0.1 }))).toBe('irregular');
    expect(classificarPadrao(rep({ adi: 1, cv2: null }))).toBe('irregular');
  });
});

describe('classificarConfianca', () => {
  it('escalona por número de eventos', () => {
    expect(classificarConfianca(rep({ eventos_consumo: 0 }))).toBe('nenhuma');
    expect(classificarConfianca(rep({ eventos_consumo: 2 }))).toBe('baixa');
    expect(classificarConfianca(rep({ eventos_consumo: 5 }))).toBe('media');
    expect(classificarConfianca(rep({ eventos_consumo: 30 }))).toBe('alta');
  });
});

describe('calcularSugestao — recusa de estimar', () => {
  it('não fabrica mínimo para material com poucas saídas', () => {
    // Fabricar número onde não há padrão é como se acumula estoque morto.
    const s = calcularSugestao(rep({ eventos_consumo: MIN_EVENTOS_PARA_MINIMO - 1 }));
    expect(s.minimoSugerido).toBeNull();
    expect(s.recomendacao).toBe('sob_demanda');
    expect(s.explicacao).toContain('comprar quando surgir a necessidade');
  });

  it('sem demanda e com saldo vira revisão de obsolescência, não reposição', () => {
    const s = calcularSugestao(rep({ eventos_consumo: 0, saldo_atual: 500 }));
    expect(s.minimoSugerido).toBeNull();
    expect(s.recomendacao).toBe('revisar_obsoleto');
    expect(s.explicacao).toContain('obsolescência');
  });

  it('sem demanda e sem saldo não gera ação', () => {
    const s = calcularSugestao(rep({ eventos_consumo: 0, saldo_atual: 0 }));
    expect(s.recomendacao).toBe('sem_acao');
  });
});

describe('calcularSugestao — demanda de projeto', () => {
  it('recusa ponto de reposição quando uma saída domina o consumo', () => {
    // Foi o caso do 92229: uma retirada valia metade do consumo do período e
    // bufferizá-la permanentemente pedia R$ 741 mil de compra.
    const s = calcularSugestao(rep({ concentracao_maior_lote: 0.5, eventos_consumo: 6 }));
    expect(s.recomendacao).toBe('planejar_projeto');
    expect(s.minimoSugerido).toBeNull();
    expect(s.compraSugerida).toBeNull();
    expect(s.explicacao).toContain('cronograma de produção');
    expect(s.explicacao).toContain('50%');
  });

  it('respeita a fronteira de concentração', () => {
    expect(calcularSugestao(rep({ concentracao_maior_lote: CONCENTRACAO_PROJETO })).recomendacao)
      .toBe('planejar_projeto');
    expect(calcularSugestao(rep({ concentracao_maior_lote: CONCENTRACAO_PROJETO - 0.01 })).recomendacao)
      .not.toBe('planejar_projeto');
  });

  it('a checagem de concentração não atropela a de demanda insuficiente', () => {
    // Com 2 saídas a resposta certa é "sob demanda", não "planejar projeto":
    // não há base nem para afirmar que a demanda é de projeto.
    const s = calcularSugestao(rep({ eventos_consumo: 2, concentracao_maior_lote: 0.9 }));
    expect(s.recomendacao).toBe('sob_demanda');
  });
});

describe('calcularSugestao — cálculo do mínimo', () => {
  it('protege pelo p90, não pela maior saída', () => {
    // Usar o máximo inflava o mínimo de item caro por um evento isolado.
    const s = calcularSugestao(rep({ consumo_diario: 4, lead_dias: 10, lote_p90: 30, maior_lote: 66 }));
    expect(s.consumoNoLead).toBe(40);
    expect(s.protecao).toBe(30);
    expect(s.minimoSugerido).toBe(70);
  });

  it('cai para a maior saída quando não há p90', () => {
    const s = calcularSugestao(rep({ consumo_diario: 4, lead_dias: 10, lote_p90: null, maior_lote: 30 }));
    expect(s.protecao).toBe(30);
  });

  it('cita a maior saída na explicação mesmo protegendo pelo p90', () => {
    // O comprador precisa ver o extremo que NÃO está coberto para julgar o risco.
    const s = calcularSugestao(rep({ lote_p90: 30, maior_lote: 66 }));
    expect(s.explicacao).toContain('66');
    expect(s.explicacao).toContain('9 de cada 10');
  });

  it('marca repor_agora e dimensiona a compra quando o saldo está abaixo', () => {
    const s = calcularSugestao(rep({ consumo_diario: 4, lead_dias: 10, maior_lote: 30, saldo_atual: 50 }));
    expect(s.recomendacao).toBe('repor_agora');
    expect(s.compraSugerida).toBe(20);
    expect(s.valorCompraSugerida).toBe(200);
  });

  it('não sugere compra negativa quando o saldo cobre o mínimo', () => {
    const s = calcularSugestao(rep({ consumo_diario: 4, lead_dias: 10, maior_lote: 30, saldo_atual: 100 }));
    expect(s.compraSugerida).toBe(0);
    expect(s.recomendacao).toBe('manter_minimo');
  });

  it('sinaliza reduzir só acima do múltiplo de excesso', () => {
    const args = { consumo_diario: 4, lead_dias: 10, maior_lote: 30 }; // mínimo = 70
    expect(calcularSugestao(rep({ ...args, saldo_atual: 70 * MULTIPLO_EXCESSO })).recomendacao).toBe('manter_minimo');
    expect(calcularSugestao(rep({ ...args, saldo_atual: 70 * MULTIPLO_EXCESSO + 1 })).recomendacao).toBe('reduzir');
  });

  it('calcula quantos dias o mínimo cobre', () => {
    const s = calcularSugestao(rep({ consumo_diario: 4, lead_dias: 10, maior_lote: 30 }));
    expect(s.diasCobertosPeloMinimo).toBe(17.5);
  });

  it('deixa o valor da compra nulo sem preço médio', () => {
    const s = calcularSugestao(rep({ preco_medio: null, saldo_atual: 0 }));
    expect(s.valorCompraSugerida).toBeNull();
  });
});

describe('calcularSugestao — explicação', () => {
  it('mostra a conta, não só o resultado', () => {
    const s = calcularSugestao(rep({ consumo_diario: 4, lead_dias: 10, maior_lote: 30 }));
    expect(s.explicacao).toContain('70');   // mínimo
    expect(s.explicacao).toContain('40');   // consumo no lead
    expect(s.explicacao).toContain('30');   // proteção
    expect(s.explicacao).toContain('20 saídas');
  });

  it('distingue lead time próprio de mediana emprestada', () => {
    const proprio = calcularSugestao(rep({ lead_proprio: true, lead_amostras: 3 }));
    expect(proprio.explicacao).toContain('medido em 3 compra(s)');

    const global = calcularSugestao(rep({ lead_proprio: false, lead_amostras: 0 }));
    expect(global.explicacao).toContain('mediana da fábrica');
  });

  it('ressalva base curta na confiança média e não na alta', () => {
    expect(calcularSugestao(rep({ eventos_consumo: 5 })).explicacao).toContain('Base ainda curta');
    expect(calcularSugestao(rep({ eventos_consumo: 30 })).explicacao).not.toContain('Base ainda curta');
  });
});

describe('resumirReposicao', () => {
  it('omite recomendações vazias e ordena por urgência', () => {
    const r = resumirReposicao([
      calcularSugestao(rep({ saldo_atual: 100_000 })),                    // reduzir
      calcularSugestao(rep({ saldo_atual: 0 })),                          // repor_agora
      calcularSugestao(rep({ eventos_consumo: 0, saldo_atual: 10 })),     // revisar_obsoleto
    ]);
    expect(r.map(x => x.recomendacao)).toEqual(['repor_agora', 'reduzir', 'revisar_obsoleto']);
  });

  it('soma o investimento necessário para recompor', () => {
    const r = resumirReposicao([
      // mínimo = 4×10 + 30 = 70 -> compra 70 a R$ 10 = R$ 700
      calcularSugestao(rep({ saldo_atual: 0, consumo_diario: 4, lead_dias: 10, lote_p90: 30, preco_medio: 10 })),
      // mínimo = 1×10 + 0 = 10 -> compra 10 a R$ 10 = R$ 100
      calcularSugestao(rep({ material: 'B', saldo_atual: 0, consumo_diario: 1, lead_dias: 10, lote_p90: 0, maior_lote: 0, preco_medio: 10 })),
    ]);
    const repor = r.find(x => x.recomendacao === 'repor_agora')!;
    expect(repor.materiais).toBe(2);
    expect(repor.valorCompra).toBe(700 + 100);
  });
});
