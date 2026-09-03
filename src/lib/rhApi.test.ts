import { describe, it, expect } from 'vitest';
import {
  calcularHorasASE,
  diaDaSemana,
  formatarDataDDMMAA,
  extrairSiglaSetor,
  gerarProtocoloAse,
  normalizarItem,
  isSetorProducao,
  isCargoProducao,
  aplicarPreenchimentoLoteItens,
} from './rhApi';

describe('calcularHorasASE', () => {
  it('calcula um período diurno simples sem intervalo', () => {
    // 17:00 às 19:00, exemplo da FRM.RHU-0007 (Analista de RH, 60%HE)
    const r = calcularHorasASE('17:00', '19:00', 0);
    expect(r.minutosDiurnos).toBe(120);
    expect(r.minutosNoturnos).toBe(0);
    expect(r.totalHoras).toBe(2);
  });

  it('desconta o intervalo do período diurno', () => {
    const r = calcularHorasASE('17:00', '20:00', 60);
    expect(r.minutosDiurnos).toBe(120);
    expect(r.totalHoras).toBe(2);
  });

  it('aplica a redução da hora noturna (22h-5h) integralmente quando o turno está todo nela', () => {
    // 22:00 às 23:00 = 60min de relógio, mas hora noturna reduzida (52min30s = 1h)
    // conta a mais: 60 / 52.5 = 1.142857h
    const r = calcularHorasASE('22:00', '23:00', 0);
    expect(r.minutosDiurnos).toBe(0);
    expect(r.minutosNoturnos).toBe(60);
    expect(r.totalHoras).toBeCloseTo(60 / 52.5, 2);
  });

  it('divide corretamente um turno que cruza a janela noturna', () => {
    // 21:00 às 23:00: 1h diurna (21h-22h) + 1h noturna reduzida (22h-23h)
    const r = calcularHorasASE('21:00', '23:00', 0);
    expect(r.minutosDiurnos).toBe(60);
    expect(r.minutosNoturnos).toBe(60);
    expect(r.totalHoras).toBeCloseTo(1 + 60 / 52.5 / 1, 2);
  });

  it('trata a virada de dia (saída menor que entrada)', () => {
    // 23:00 às 02:00: 3h de relógio, todas dentro da janela noturna
    const r = calcularHorasASE('23:00', '02:00', 0);
    expect(r.minutosNoturnos).toBe(180);
    expect(r.minutosDiurnos).toBe(0);
    expect(r.totalHoras).toBeCloseTo(180 / 52.5, 2);
  });

  it('retorna zero quando entrada ou saída estão vazias', () => {
    expect(calcularHorasASE('', '19:00', 0).totalHoras).toBe(0);
    expect(calcularHorasASE('17:00', '', 0).totalHoras).toBe(0);
  });
});

describe('diaDaSemana', () => {
  it('identifica a sexta-feira do exemplo do FRM.RHU-0007 (06/01/2023)', () => {
    expect(diaDaSemana('2023-01-06')).toBe('Sexta');
  });

  it('identifica corretamente todos os dias da semana', () => {
    expect(diaDaSemana('2026-08-23')).toBe('Domingo');
    expect(diaDaSemana('2026-08-24')).toBe('Segunda');
    expect(diaDaSemana('2026-08-25')).toBe('Terça');
    expect(diaDaSemana('2026-08-26')).toBe('Quarta');
    expect(diaDaSemana('2026-08-27')).toBe('Quinta');
    expect(diaDaSemana('2026-08-28')).toBe('Sexta');
    expect(diaDaSemana('2026-08-29')).toBe('Sábado');
  });

  it('retorna vazio para uma data mal formada', () => {
    expect(diaDaSemana('06/01/2023')).toBe('');
    expect(diaDaSemana('')).toBe('');
  });
});

describe('Consolidação de ASEs por Dia', () => {
  it('separa corretamente listas de transporte e refeição e totaliza horas', () => {
    const itens = [
      { id: '1', nome: 'Colab 1', transporte: true, refeicao: false, total_horas: 2.5 },
      { id: '2', nome: 'Colab 2', transporte: false, refeicao: true, total_horas: 1.5 },
      { id: '3', nome: 'Colab 3', transporte: true, refeicao: true, total_horas: 2.0 },
    ];

    const transp = itens.filter(i => i.transporte);
    const ref = itens.filter(i => i.refeicao);
    const totalHoras = itens.reduce((acc, i) => acc + i.total_horas, 0);

    expect(transp.length).toBe(2);
    expect(ref.length).toBe(2);
    expect(totalHoras).toBe(6.0);
    expect(transp.map(t => t.nome)).toEqual(['Colab 1', 'Colab 3']);
    expect(ref.map(r => r.nome)).toEqual(['Colab 2', 'Colab 3']);
  });
});

describe('gerarProtocoloAse e siglas de setores', () => {
  it('formata data para DDMMAA corretamente', () => {
    expect(formatarDataDDMMAA('2026-08-27')).toBe('270826');
    expect(formatarDataDDMMAA('2023-01-06')).toBe('060123');
  });

  it('extrai siglas de setores conhecidos e limpa acentos', () => {
    expect(extrairSiglaSetor('SUPRIMENTOS / COMPRAS')).toBe('SUPR');
    expect(extrairSiglaSetor('Almoxarifado Central')).toBe('ALMOX');
    expect(extrairSiglaSetor('Manutenção Mecânica')).toBe('MANUT');
    expect(extrairSiglaSetor('Recursos Humanos')).toBe('RH');
    expect(extrairSiglaSetor('Produção - Linha 1')).toBe('PROD');
    expect(extrairSiglaSetor('Portaria / Vigilância')).toBe('PORT');
    expect(extrairSiglaSetor('Segurança do Trabalho')).toBe('SEG');
    expect(extrairSiglaSetor('')).toBe('GERAL');
    expect(extrairSiglaSetor(null)).toBe('GERAL');
  });

  it('gera protocolo no formato ASE-DDMMAA-SETOR', () => {
    expect(gerarProtocoloAse('2026-08-27', 'Suprimentos / Compras')).toBe('ASE-270826-SUPR');
    expect(gerarProtocoloAse('2026-08-27', 'Almoxarifado')).toBe('ASE-270826-ALMOX');
    expect(gerarProtocoloAse('2026-08-27', null)).toBe('ASE-270826-GERAL');
  });

  it('adiciona sufixo sequencial quando especificado para evitar duplicatas', () => {
    expect(gerarProtocoloAse('2026-08-27', 'Suprimentos / Compras', 1)).toBe('ASE-270826-SUPR-01');
    expect(gerarProtocoloAse('2026-08-27', 'Suprimentos / Compras', 2)).toBe('ASE-270826-SUPR-02');
  });
});

describe('Módulo RH: Rotas de Transporte', () => {
  it('valida e agrupa rotas corretamente', () => {
    const rotasMock = [
      { funcionario: 'MATEUS PEREIRA SILVA', rota: 'Rota 01', ponto_embarque: 'Bananeira', horario: '05:40' },
      { funcionario: 'PAULO LOPES DE JESUS', rota: 'Rota 02', ponto_embarque: 'Nazaré', horario: '05:40' },
      { funcionario: 'JAMILLE DA SILVA BATISTA', rota: 'Rota 03', ponto_embarque: 'Rodoviária', horario: '05:45' },
      { funcionario: 'GABRIEL SOBRAL FERREIRA', rota: 'Rota 04', ponto_embarque: 'Caatinga', horario: '06:15' },
      { funcionario: 'EMANUEL SANSAO DOS SANTOS', rota: 'Rota Turno', ponto_embarque: 'Cidade do Ouro', horario: '15:00' },
    ];

    expect(rotasMock.length).toBe(5);
    const rota01 = rotasMock.filter(r => r.rota === 'Rota 01');
    expect(rota01.length).toBe(1);
    expect(rota01[0].funcionario).toBe('MATEUS PEREIRA SILVA');
  });

  it('normalizarItem vincula rota, ponto de embarque e contato pelo nome do colaborador', () => {
    const mapaRotas = new Map();
    mapaRotas.set('mateus pereira silva', {
      id: '1',
      funcionario: 'MATEUS PEREIRA SILVA',
      ponto_embarque: 'Bananeira / No ponto do campo de futebol',
      horario: '05:40',
      contato: '71 98534-1151',
      rota: 'Rota 01',
      ativo: true,
    });

    const itemRaw = {
      id: 'it-1',
      nome: 'Mateus Pereira Silva',
      registro: '1001',
      transporte: true,
      refeicao: false,
      hora_entrada: '17:00:00',
      hora_saida: '19:00:00',
      percentual_he: '60.00',
      total_horas: '2.00',
    };

    const normalizado = normalizarItem(itemRaw, mapaRotas);
    expect(normalizado.rota_transporte).toBe('Rota 01');
    expect(normalizado.ponto_embarque_transporte).toBe('Bananeira / No ponto do campo de futebol');
    expect(normalizado.contato_transporte).toBe('71 98534-1151');
    expect(normalizado.horario_embarque_transporte).toBe('05:40');
    expect(normalizado.percentual_he).toBe(60);
    expect(normalizado.total_horas).toBe(2);
  });
});

describe('Módulo RH: Helpers de Produção', () => {
  it('identifica corretamente o setor de Produção', () => {
    expect(isSetorProducao('PRODUÇÃO')).toBe(true);
    expect(isSetorProducao('PRODUCAO')).toBe(true);
    expect(isSetorProducao('Produção - Linha 1')).toBe(true);
    expect(isSetorProducao('FABRICAÇÃO')).toBe(true);
    expect(isSetorProducao('ALMOXARIFADO')).toBe(false);
    expect(isSetorProducao('RECURSOS HUMANOS')).toBe(false);
    expect(isSetorProducao('')).toBe(false);
    expect(isSetorProducao(null)).toBe(false);
  });

  it('identifica cargos da linha operacional de produção', () => {
    expect(isCargoProducao('AUXILIAR DE PRODUCAO')).toBe(true);
    expect(isCargoProducao('LIDER DE PRODUCAO')).toBe(true);
    expect(isCargoProducao('SOLDADOR I')).toBe(true);
    expect(isCargoProducao('SOLDADOR III')).toBe(true);
    expect(isCargoProducao('CALDEIREIRO II')).toBe(true);
    expect(isCargoProducao('LIXADOR')).toBe(true);
    expect(isCargoProducao('JATISTA I')).toBe(true);
    expect(isCargoProducao('PINTOR INDUSTRIAL I')).toBe(true);
    expect(isCargoProducao('METALIZADOR')).toBe(true);
    expect(isCargoProducao('MECANICO MONTADOR')).toBe(true);
    expect(isCargoProducao('OPERADOR DE PONTE ROLANTE')).toBe(true);
    expect(isCargoProducao('OPERADOR DE PORTICO')).toBe(true);
    expect(isCargoProducao('OPERADOR DE MAQUINAS II')).toBe(true);
    expect(isCargoProducao('OPERADOR DE EMPILHADEIRA')).toBe(true);

    // Cargos que não devem ser classificados como produção direta
    expect(isCargoProducao('DIRETOR PRESIDENTE')).toBe(false);
    expect(isCargoProducao('ANALISTA DE RECURSOS HUMANOS I')).toBe(false);
    expect(isCargoProducao('ANALISTA DE CONTROLADORIA I')).toBe(false);
    expect(isCargoProducao('ENFERMEIRO DO TRABALHO')).toBe(false);
    expect(isCargoProducao('MEDICO DO TRABALHO')).toBe(false);
    expect(isCargoProducao('ALMOXARIFE')).toBe(false);
    expect(isCargoProducao('TECNICO DE SUPORTE TI')).toBe(false);
    expect(isCargoProducao('')).toBe(false);
    expect(isCargoProducao(null)).toBe(false);
  });
});

describe('aplicarPreenchimentoLoteItens', () => {
  const mockItens: any[] = [
    {
      id: 'it-1',
      nome: 'CARLOS SILVA',
      transporte: false,
      refeicao: false,
      hora_entrada: '',
      hora_saida: '',
      intervalo_minutos: 0,
      total_horas: 0,
    },
    {
      id: 'it-2',
      nome: 'MARCOS SOUZA',
      transporte: true,
      refeicao: false,
      hora_entrada: '08:00',
      hora_saida: '12:00',
      intervalo_minutos: 0,
      total_horas: 4,
    },
  ];

  it('atualiza transporte para todos os colaboradores', () => {
    const atualizados = aplicarPreenchimentoLoteItens(mockItens, { transporte: true });
    expect(atualizados.every(i => i.transporte)).toBe(true);

    const desmarcados = aplicarPreenchimentoLoteItens(atualizados, { transporte: false });
    expect(desmarcados.every(i => !i.transporte)).toBe(true);
  });

  it('atualiza refeição para todos os colaboradores', () => {
    const atualizados = aplicarPreenchimentoLoteItens(mockItens, { refeicao: true });
    expect(atualizados.every(i => i.refeicao)).toBe(true);
  });

  it('aplica hora de entrada e saída em lote e recalcula total de horas', () => {
    const atualizados = aplicarPreenchimentoLoteItens(mockItens, {
      hora_entrada: '06:00',
      hora_saida: '14:00',
      intervalo_minutos: 0,
    });

    expect(atualizados[0].hora_entrada).toBe('06:00');
    expect(atualizados[0].hora_saida).toBe('14:00');
    expect(atualizados[0].total_horas).toBe(8);

    expect(atualizados[1].hora_entrada).toBe('06:00');
    expect(atualizados[1].hora_saida).toBe('14:00');
    expect(atualizados[1].total_horas).toBe(8);
  });

  it('preserva horários ao alterar apenas transporte ou refeição', () => {
    const comHoras = aplicarPreenchimentoLoteItens(mockItens, {
      hora_entrada: '14:00',
      hora_saida: '22:00',
    });

    const comTransp = aplicarPreenchimentoLoteItens(comHoras, { transporte: true });
    expect(comTransp[0].transporte).toBe(true);
    expect(comTransp[0].hora_entrada).toBe('14:00');
    expect(comTransp[0].hora_saida).toBe('22:00');
    expect(comTransp[0].total_horas).toBe(8);
  });
});

