import { describe, expect, it } from 'vitest';
import { interpretarDetalheCompraMl, lerValorMl, pareceDetalheCompraMl } from './detalheCompraMl';

// Texto real colado da página "Detalhe da compra" do ML (28/10/2026).
const COLADO = `Detalhe da compra
28 de outubro  |  # 2000015748279995

Produtos (24)
Produtos (24)

1878 reais com 74 centavosR$ 1.87874

Frete
Frete

GrátisGrátis

Total
Total

1878 reais com 74 centavosR$ 1.87874

BoletoBoleto


Detalhes do pagamento e envio

Pagamento
Boleto
1878 reais com 74 centavosR$ 1.87874

BoletoBoleto

28 de outubro. Pagamento número 18548436270328 de outubro  |  # 185484362703

Pagamento pendente

Frete

Rua Maria Telma Teixeira Rocha 11ARua Maria Telma Teixeira Rocha 11A

Jacobina, Bahia.Jacobina, Bahia.

Pacote 1Pacote 1
Anel Oring 2207 Polegada 13,87 X 3,53 (kit Com 10 Unidades)
Anel Oring 2207 Polegada 13,87 X 3,53 (kit Com 10 Unidades)
R$ 22,18 | 2 unidades

Pacote 2Pacote 2
Kit 4 Pilhas Aa Recarregáveis 1.5v 2600mah 1200vezes Usb-c
Kit 4 Pilhas Aa Recarregáveis 1.5v 2600mah 1200vezes Usb-c
R$ 280 | 5 unidades

Pacote 3Pacote 3
Kit Estante Gaveteiro Com 54 Gavetas Empilháveis Nr5 Preto
Kit Estante Gaveteiro Com 54 Gavetas Empilháveis Nr5 Preto
R$ 543,10 | 1 unidade

Pacote 4Pacote 4
Kit 5 Cabos Anti Chicoteamento 1/8 Nr12 Whip Check Segurança 760 760mm
Kit 5 Cabos Anti Chicoteamento 1/8 Nr12 Whip Check Segurança 760 760mm
R$ 154,23 | 1 unidade

Pacote 5Pacote 5
Gancho Olhal Forjado Em Aço Carbono Com Trava 1,5ton Verm
Gancho Olhal Forjado Em Aço Carbono Com Trava 1,5ton Verm
R$ 87,74 | 2 unidades

Pacote 6Pacote 6
Retentor 85x130x10 Nbr Brg Medidas 85 130 10 Dupla Vedação
Retentor 85x130x10 Nbr Brg Medidas 85 130 10 Dupla Vedação
R$ 253,65 | 3 unidades

Pacote 7Pacote 7
10x Lixa Flap Rotativa 50x25mm Haste 6mm Grão # 80
10x Lixa Flap Rotativa 50x25mm Haste 6mm Grão # 80
R$ 413,88 | 6 unidades

Pacote 8Pacote 8
Chave Torx Com Cabo T Gedore T20 3,86mm 42tx-t20 024430 Azul
Chave Torx Com Cabo T Gedore T20 3,86mm 42tx-t20 024430 Azul
R$ 123,96 | 4 unidades`;

const REF = new Date(2026, 9, 28);

describe('lerValorMl', () => {
  it('devolve a vírgula que some com os centavos sobrescritos', () => {
    expect(lerValorMl('1.87874')).toBe(1878.74);
    expect(lerValorMl('R$ 12.345.67890')).toBe(12345678.9);
  });

  it('lê os formatos normais', () => {
    expect(lerValorMl('22,18')).toBe(22.18);
    expect(lerValorMl('1.878,74')).toBe(1878.74);
    expect(lerValorMl('1.878')).toBe(1878);
    expect(lerValorMl('280')).toBe(280);
    expect(lerValorMl('1878.74')).toBe(1878.74);
    expect(lerValorMl('R$ 1.878,74')).toBe(1878.74);
    expect(lerValorMl('')).toBeNull();
  });
});

describe('interpretarDetalheCompraMl', () => {
  const d = interpretarDetalheCompraMl(COLADO, REF);

  it('lê cabeçalho, totais e pagamento', () => {
    expect(d.numeroCompra).toBe('2000015748279995');
    expect(d.dataCompra).toBe('2026-10-28');
    expect(d.qtdProdutos).toBe(24);
    expect(d.valorProdutos).toBe(1878.74);
    expect(d.valorFrete).toBe(0);
    expect(d.valorTotal).toBe(1878.74);
    expect(d.formaPagamento).toBe('Boleto');
    expect(d.numeroPagamento).toBe('185484362703');
    expect(d.statusPagamento).toBe('Pagamento pendente');
    expect(d.endereco).toBe('Rua Maria Telma Teixeira Rocha 11A — Jacobina, Bahia.');
  });

  it('lê os pacotes sem duplicar a descrição, e a soma fecha', () => {
    expect(d.pacotes).toHaveLength(8);
    expect(d.pacotes[0]).toEqual({ descricao: 'Anel Oring 2207 Polegada 13,87 X 3,53 (kit Com 10 Unidades)', valor: 22.18, quantidade: 2 });
    expect(d.pacotes[1]).toMatchObject({ valor: 280, quantidade: 5 });
    expect(d.pacotes[6].descricao).toBe('10x Lixa Flap Rotativa 50x25mm Haste 6mm Grão # 80');
    expect(d.avisos).toEqual([]);
  });

  it('avisa quando a soma dos pacotes não fecha', () => {
    const r = interpretarDetalheCompraMl(COLADO.replace('R$ 280 | 5', 'R$ 28 | 5'), REF);
    expect(r.avisos.some(a => a.includes('soma dos pacotes'))).toBe(true);
  });

  it('sem ano, data depois da referência é do ano anterior', () => {
    const r = interpretarDetalheCompraMl('15 de dezembro | # 2000015748279995', new Date(2027, 0, 5));
    expect(r.dataCompra).toBe('2026-12-15');
  });

  it('nº do pagamento sem "#": separa o dia grudado', () => {
    const r = interpretarDetalheCompraMl('Pagamento número 18548436270328 de outubro', REF);
    expect(r.numeroPagamento).toBe('185484362703');
  });

  it('reconhece texto de detalhe e ignora só o número', () => {
    expect(pareceDetalheCompraMl(COLADO)).toBe(true);
    expect(pareceDetalheCompraMl('# 2000015748279995')).toBe(false);
  });
});
