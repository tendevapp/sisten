/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação em Excel do Cadastro de Rotas de Transporte (Facilities / RH).
 */

import * as XLSX from 'xlsx';
import type { RhRota } from '../../types';

export interface LinhaExportacaoRota {
  'Colaborador': string;
  'Rota': string;
  'Ponto de Embarque': string;
  'Horário': string;
  'Contato': string;
  'Status': string;
  'Data de Cadastro': string;
}

export function formatarDataIso(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

export function converterRotasParaExportacao(rotas: RhRota[]): LinhaExportacaoRota[] {
  return rotas.map(r => ({
    'Colaborador': r.funcionario,
    'Rota': r.rota,
    'Ponto de Embarque': r.ponto_embarque,
    'Horário': r.horario,
    'Contato': r.contato && r.contato.trim() ? r.contato.trim() : '—',
    'Status': r.ativo ? 'Ativo' : 'Inativo',
    'Data de Cadastro': formatarDataIso(r.created_at),
  }));
}

export function gerarWorkbookRotas(rotas: RhRota[]): XLSX.WorkBook {
  const dados = converterRotasParaExportacao(rotas);
  const ws = XLSX.utils.json_to_sheet(dados);
  ws['!cols'] = [
    { wch: 32 }, // Colaborador
    { wch: 18 }, // Rota
    { wch: 32 }, // Ponto de Embarque
    { wch: 12 }, // Horário
    { wch: 18 }, // Contato
    { wch: 12 }, // Status
    { wch: 18 }, // Data de Cadastro
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cadastro de Rotas');
  return wb;
}

export function exportarRotasParaExcel(rotas: RhRota[], nomeArquivo?: string): void {
  const wb = gerarWorkbookRotas(rotas);
  const hoje = new Date().toISOString().slice(0, 10);
  const arquivo = nomeArquivo || `cadastro_rotas_facilities_${hoje}.xlsx`;
  XLSX.writeFile(wb, arquivo);
}
