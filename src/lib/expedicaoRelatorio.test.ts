import { describe, it, expect } from 'vitest';
import {
  normalizarData,
  parseDataHora,
  formatarHorasHumanas,
  calcularMetricaCarreta,
  agruparPorSemana,
  agruparPorTransportadora,
  calcularResumoKpis,
  filtrarCarretas,
  extrairCarretas,
} from './expedicaoRelatorio';
import type { ExpedicaoCarregamentoCompleto, ExpedicaoTramo } from '../types';

describe('expedicaoRelatorio', () => {
  describe('normalizarData e parseDataHora', () => {
    it('corrige anos digitados com dois dígitos ou com erros comuns', () => {
      expect(normalizarData('0026-08-27')).toBe('2026-08-27');
      expect(normalizarData('2006-09-02')).toBe('2026-09-02');
      expect(normalizarData('2026-09-15')).toBe('2026-09-15');
      expect(normalizarData(null)).toBeNull();
      expect(normalizarData('')).toBeNull();
    });

    it('faz parse correto de data e hora', () => {
      const dt = parseDataHora('2026-09-10', '13:30');
      expect(dt).not.toBeNull();
      expect(dt?.getFullYear()).toBe(2026);
      expect(dt?.getMonth()).toBe(8); // setembro = 8
      expect(dt?.getDate()).toBe(10);
      expect(dt?.getHours()).toBe(13);
      expect(dt?.getMinutes()).toBe(30);
    });

    it('retorna null para horários ou datas inválidos', () => {
      expect(parseDataHora('2026-09-10', '')).toBeNull();
      expect(parseDataHora(null, '13:30')).toBeNull();
      expect(parseDataHora('invalido', '13:30')).toBeNull();
      expect(parseDataHora('2026-09-10', '99:99')).toBeNull();
    });
  });

  describe('formatarHorasHumanas', () => {
    it('formata horas menores que 24h', () => {
      expect(formatarHorasHumanas(5.5)).toBe('5h 30min');
      expect(formatarHorasHumanas(0.75)).toBe('0h 45min');
    });

    it('formata períodos com mais de 24h incluindo dias', () => {
      expect(formatarHorasHumanas(26.5)).toBe('1d 2h 30min');
      expect(formatarHorasHumanas(97.2)).toBe('4d 1h 12min');
    });

    it('retorna traço para nulo ou valores negativos', () => {
      expect(formatarHorasHumanas(null)).toBe('—');
      expect(formatarHorasHumanas(-5)).toBe('—');
    });
  });

  describe('calcularMetricaCarreta e Regras de SLA', () => {
    it('calcula carreta expedida dentro da meta (<= 24h)', () => {
      const tramo: ExpedicaoTramo = {
        id: 'tramo-1',
        carregamento_id: 'c-1',
        ordem: 0,
        tramo: 'T1',
        numero_tramo: '3143',
        numero_nf: '1001',
        motorista: 'JOAO DA SILVA',
        cavalo_placa: 'ABC1D23',
        cavalo_uf: 'BA',
        carreta_placa: 'XYZ9K87',
        carreta_uf: 'BA',
        dolly_placa: '',
        dolly_uf: null,
        data: '2026-09-01',
        data_chegada_portaria: '2026-09-01',
        hora_chegada_portaria: '08:00',
        data_entrada_patio: '2026-09-01',
        hora_entrada_patio: '09:30',
        data_expedicao: '2026-09-01',
        hora_expedicao: '16:00',
        obs_chegada_portaria: null,
        obs_entrada_patio: null,
        obs_expedicao: null,
        created_at: '2026-09-01T08:00:00Z',
        updated_at: '2026-09-01T16:00:00Z',
      };

      const metrica = calcularMetricaCarreta(tramo, {
        numero: 'EXP-2026-001',
        empresa: 'TRANSPES',
      });

      expect(metrica.status).toBe('CONCLUIDO');
      expect(metrica.horasPortariaPatio).toBe(1.5); // 08:00 -> 09:30 = 1.5h
      expect(metrica.horasPatioExpedicao).toBe(6.5); // 09:30 -> 16:00 = 6.5h
      expect(metrica.horasTotal).toBe(8.0); // 08:00 -> 16:00 = 8h
      expect(metrica.passou24h).toBe(false);
      expect(metrica.classificacaoSla).toBe('meta');
      expect(metrica.duracaoTotalFormatada).toBe('8h 0min');
    });

    it('identifica carreta que passou de 24h (> 24h) com classificação crítica', () => {
      const tramo: ExpedicaoTramo = {
        id: 'tramo-2',
        carregamento_id: 'c-2',
        ordem: 0,
        tramo: 'T5',
        numero_tramo: '3192',
        numero_nf: '1002',
        motorista: 'RODRIGO COUTINHO',
        cavalo_placa: 'UPO4A48',
        cavalo_uf: 'MG',
        carreta_placa: 'RUU7G25',
        carreta_uf: 'MG',
        dolly_placa: '',
        dolly_uf: null,
        data: '2026-09-10',
        data_chegada_portaria: '2026-09-10',
        hora_chegada_portaria: '13:35',
        data_entrada_patio: '2026-09-12',
        hora_entrada_patio: '11:04',
        data_expedicao: '2026-09-14',
        hora_expedicao: '14:14',
        obs_chegada_portaria: null,
        obs_entrada_patio: null,
        obs_expedicao: null,
        created_at: '2026-09-10T13:35:00Z',
        updated_at: '2026-09-14T14:14:00Z',
      };

      const metrica = calcularMetricaCarreta(tramo, {
        numero: 'EXP-2026-002',
        empresa: 'TRANSPES',
      });

      expect(metrica.status).toBe('CONCLUIDO');
      expect(metrica.passou24h).toBe(true);
      expect(metrica.classificacaoSla).toBe('critico');
      expect(metrica.horasTotal).toBeGreaterThan(96);
    });

    it('calcula carreta ainda no pátio contra o horário atual', () => {
      const agora = new Date('2026-09-16T10:00:00');
      const tramo: ExpedicaoTramo = {
        id: 'tramo-3',
        carregamento_id: 'c-3',
        ordem: 0,
        tramo: 'Escada / Plataforma',
        motorista: 'ANTONIO JORGE',
        cavalo_placa: 'JBC5G35',
        cavalo_uf: 'BA',
        carreta_placa: 'SWL6I76',
        carreta_uf: 'BA',
        dolly_placa: '',
        dolly_uf: null,
        data: '2026-09-15',
        data_chegada_portaria: '2026-09-15',
        hora_chegada_portaria: '08:00',
        data_entrada_patio: '2026-09-15',
        hora_entrada_patio: '09:00',
        data_expedicao: null,
        hora_expedicao: null,
        obs_chegada_portaria: null,
        obs_entrada_patio: null,
        obs_expedicao: null,
        created_at: '2026-09-15T08:00:00Z',
        updated_at: '2026-09-15T09:00:00Z',
      };

      const metrica = calcularMetricaCarreta(
        tramo,
        { numero: 'EXP-2026-003', empresa: 'EVR' },
        agora
      );

      expect(metrica.status).toBe('NO_PATIO');
      expect(metrica.horasTotal).toBe(26.0); // 15/09 08:00 até 16/09 10:00 = 26 horas
      expect(metrica.passou24h).toBe(true);
      expect(metrica.classificacaoSla).toBe('critico');
    });
  });

  describe('agrupamentos e KPIs', () => {
    const carregamentosMock: ExpedicaoCarregamentoCompleto[] = [
      {
        id: 'c-1',
        numero: 'EXP-2026-001',
        empresa: 'TRANSPES',
        status: 'enviado',
        observacoes: null,
        enviado_em: null,
        criado_por: 'u-1',
        criado_por_nome: 'User Test',
        created_at: '2026-09-01T08:00:00Z',
        updated_at: '2026-09-01T16:00:00Z',
        fotos: [],
        tramos: [
          {
            id: 't-1',
            carregamento_id: 'c-1',
            ordem: 0,
            tramo: 'T1',
            motorista: 'MOTORISTA 1',
            cavalo_placa: 'AAA1111',
            cavalo_uf: 'BA',
            carreta_placa: 'BBB2222',
            carreta_uf: 'BA',
            dolly_placa: '',
            dolly_uf: null,
            data: '2026-09-01',
            data_chegada_portaria: '2026-09-01',
            hora_chegada_portaria: '08:00',
            data_entrada_patio: '2026-09-01',
            hora_entrada_patio: '10:00',
            data_expedicao: '2026-09-01',
            hora_expedicao: '16:00',
            obs_chegada_portaria: null,
            obs_entrada_patio: null,
            obs_expedicao: null,
            created_at: '2026-09-01T08:00:00Z',
            updated_at: '2026-09-01T16:00:00Z',
          },
        ],
      },
      {
        id: 'c-2',
        numero: 'EXP-2026-002',
        empresa: 'EVR',
        status: 'enviado',
        observacoes: null,
        enviado_em: null,
        criado_por: 'u-1',
        criado_por_nome: 'User Test',
        created_at: '2026-09-02T08:00:00Z',
        updated_at: '2026-09-04T12:00:00Z',
        fotos: [],
        tramos: [
          {
            id: 't-2',
            carregamento_id: 'c-2',
            ordem: 0,
            tramo: 'T2',
            motorista: 'MOTORISTA 2',
            cavalo_placa: 'CCC3333',
            cavalo_uf: 'BA',
            carreta_placa: 'DDD4444',
            carreta_uf: 'BA',
            dolly_placa: '',
            dolly_uf: null,
            data: '2026-09-02',
            data_chegada_portaria: '2026-09-02',
            hora_chegada_portaria: '08:00',
            data_entrada_patio: '2026-09-03',
            hora_entrada_patio: '08:00',
            data_expedicao: '2026-09-04',
            hora_expedicao: '12:00',
            obs_chegada_portaria: null,
            obs_entrada_patio: null,
            obs_expedicao: null,
            created_at: '2026-09-02T08:00:00Z',
            updated_at: '2026-09-04T12:00:00Z',
          },
        ],
      },
    ];

    it('extrai carretas e calcula KPIs gerais', () => {
      const carretas = extrairCarretas(carregamentosMock);
      expect(carretas).toHaveLength(2);

      const kpis = calcularResumoKpis(carretas);
      expect(kpis.totalCarretas).toBe(2);
      expect(kpis.totalConcluidas).toBe(2);
      expect(kpis.totalPassou24h).toBe(1); // t-2 passou de 24h (durou ~52h)
      expect(kpis.taxaPassou24h).toBe(50.0);
    });

    it('agrupa por semana corretamente', () => {
      const carretas = extrairCarretas(carregamentosMock);
      const semanas = agruparPorSemana(carretas);

      expect(semanas.length).toBeGreaterThan(0);
      const sem = semanas[0];
      expect(sem.totalCarretas).toBe(2);
      expect(sem.qtdPassou24h).toBe(1);
      expect(sem.taxaPassou24h).toBe(50.0);
    });

    it('agrupa por transportadora', () => {
      const carretas = extrairCarretas(carregamentosMock);
      const porEmpresa = agruparPorTransportadora(carretas);

      expect(porEmpresa).toHaveLength(2);
      const transpes = porEmpresa.find(e => e.empresa === 'TRANSPES');
      expect(transpes?.totalCarretas).toBe(1);
      expect(transpes?.qtdPassou24h).toBe(0);

      const evr = porEmpresa.find(e => e.empresa === 'EVR');
      expect(evr?.totalCarretas).toBe(1);
      expect(evr?.qtdPassou24h).toBe(1);
      expect(evr?.taxaPassou24h).toBe(100.0);
    });

    it('filtra corretamente por SLA (apenas_24h)', () => {
      const carretas = extrairCarretas(carregamentosMock);
      const filtradas = filtrarCarretas(carretas, {
        preset: 'tudo',
        de: null,
        ate: null,
        empresas: new Set(),
        tramos: new Set(),
        filtroSla: 'apenas_24h',
        busca: '',
      });

      expect(filtradas).toHaveLength(1);
      expect(filtradas[0].id).toBe('t-2');
    });

    it('filtra por busca textual (placa ou motorista)', () => {
      const carretas = extrairCarretas(carregamentosMock);
      const buscaPlaca = filtrarCarretas(carretas, {
        preset: 'tudo',
        de: null,
        ate: null,
        empresas: new Set(),
        tramos: new Set(),
        filtroSla: 'todos',
        busca: 'DDD4444',
      });

      expect(buscaPlaca).toHaveLength(1);
      expect(buscaPlaca[0].carreta_placa).toBe('DDD4444');
    });

    it('mapeia corretamente histórico de observações e contagem de evidências', () => {
      const tramoComHistorico: ExpedicaoTramo = {
        id: 't-obs-1',
        carregamento_id: 'c-obs',
        ordem: 0,
        tramo: 'T1',
        motorista: 'MOTORISTA OBS',
        cavalo_placa: 'AAA1111',
        cavalo_uf: 'BA',
        carreta_placa: 'BBB2222',
        carreta_uf: 'BA',
        dolly_placa: '',
        dolly_uf: null,
        data: '2026-09-10',
        data_chegada_portaria: '2026-09-10',
        hora_chegada_portaria: '08:00',
        data_entrada_patio: '2026-09-10',
        hora_entrada_patio: '09:00',
        data_expedicao: '2026-09-11',
        hora_expedicao: '15:00',
        obs_chegada_portaria: null,
        obs_entrada_patio: null,
        obs_expedicao: null,
        observacoes: 'Atraso na liberação da NF pela fiscalização',
        historico_observacoes: [
          {
            id: 'obs-1',
            texto: 'Carreta retida aguardando NF da transportadora',
            tipo: 'justificativa_atraso',
            usuario_id: 'u-1',
            usuario_nome: 'João Inspetor',
            criado_em: '2026-09-10T14:00:00Z',
            evidencias: [
              {
                id: 'evi-1',
                nome_arquivo: 'foto_guia.jpg',
                storage_path: 'c-obs/t-obs-1/evidencias/foto_guia.jpg',
                criado_em: '2026-09-10T14:00:00Z',
              },
              {
                id: 'evi-2',
                nome_arquivo: 'comprovante.pdf',
                storage_path: 'c-obs/t-obs-1/evidencias/comprovante.pdf',
                criado_em: '2026-09-10T14:01:00Z',
              },
            ],
          },
        ],
        created_at: '2026-09-10T08:00:00Z',
        updated_at: '2026-09-11T15:00:00Z',
      };

      const metrica = calcularMetricaCarreta(tramoComHistorico, { numero: 'EXP-OBS', empresa: 'TRANSPES' });
      expect(metrica.observacoes).toBe('Atraso na liberação da NF pela fiscalização');
      expect(metrica.totalObservacoes).toBe(1);
      expect(metrica.totalEvidencias).toBe(2);
      expect(metrica.historico_observacoes[0].evidencias?.[0].nome_arquivo).toBe('foto_guia.jpg');
    });
  });
});
