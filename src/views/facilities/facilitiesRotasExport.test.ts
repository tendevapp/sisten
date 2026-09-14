import { describe, it, expect } from 'vitest';
import {
  converterRotasParaExportacao,
  formatarDataIso,
  gerarWorkbookRotas,
} from './facilitiesRotasExport';
import type { RhRota } from '../../types';

describe('facilitiesRotasExport', () => {
  const rotasMock: RhRota[] = [
    {
      id: 'rota-1',
      funcionario: 'Carlos Silva',
      ponto_embarque: 'Praça Central - Bairro Nobre',
      horario: '06:15',
      contato: '71999990001',
      rota: 'Rota 01',
      ativo: true,
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'rota-2',
      funcionario: 'Mariana Santos',
      ponto_embarque: 'Posto Shell BR-324',
      horario: '06:30',
      contato: null,
      rota: 'Rota 02',
      ativo: false,
      created_at: '2026-09-05T14:30:00.000Z',
      updated_at: '2026-09-05T14:30:00.000Z',
    },
  ];

  describe('formatarDataIso', () => {
    it('deve formatar data ISO válida em pt-BR', () => {
      const data = formatarDataIso('2026-09-01T10:00:00.000Z');
      expect(data).toMatch(/01\/09\/2026/);
    });

    it('deve retornar traço para valor nulo ou vazio', () => {
      expect(formatarDataIso(null)).toBe('—');
      expect(formatarDataIso(undefined)).toBe('—');
      expect(formatarDataIso('')).toBe('—');
    });

    it('deve lidar com string não conversível devolvendo o próprio valor', () => {
      expect(formatarDataIso('data-invalida')).toBe('data-invalida');
    });
  });

  describe('converterRotasParaExportacao', () => {
    it('deve converter corretamente os campos de RhRota para o formato de planilha', () => {
      const linhas = converterRotasParaExportacao(rotasMock);

      expect(linhas).toHaveLength(2);

      expect(linhas[0]).toEqual({
        'Colaborador': 'Carlos Silva',
        'Rota': 'Rota 01',
        'Ponto de Embarque': 'Praça Central - Bairro Nobre',
        'Horário': '06:15',
        'Contato': '71999990001',
        'Status': 'Ativo',
        'Data de Cadastro': formatarDataIso('2026-09-01T10:00:00.000Z'),
      });

      expect(linhas[1]).toEqual({
        'Colaborador': 'Mariana Santos',
        'Rota': 'Rota 02',
        'Ponto de Embarque': 'Posto Shell BR-324',
        'Horário': '06:30',
        'Contato': '—',
        'Status': 'Inativo',
        'Data de Cadastro': formatarDataIso('2026-09-05T14:30:00.000Z'),
      });
    });

    it('deve retornar array vazio para lista sem rotas', () => {
      expect(converterRotasParaExportacao([])).toEqual([]);
    });
  });

  describe('gerarWorkbookRotas', () => {
    it('deve montar o workbook com a aba Cadastro de Rotas e colunas configuradas', () => {
      const wb = gerarWorkbookRotas(rotasMock);

      expect(wb.SheetNames).toContain('Cadastro de Rotas');
      const ws = wb.Sheets['Cadastro de Rotas'];
      expect(ws).toBeDefined();
      expect(ws['!cols']).toBeDefined();
      expect(ws['!cols']?.length).toBe(7);
    });
  });
});
