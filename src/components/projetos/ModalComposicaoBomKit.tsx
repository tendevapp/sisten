/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Projetos — Modal de Composição do Kit segundo a BOM.
 *
 * Exibe a lista exata de componentes (folhas da BOM) que compõem o sub-kit
 * de um tramo (ex: T5 Fixadores, T1 Escada Acesso), cruzando com o estoque
 * atual do almoxarifado e identificando o gargalo limitante.
 */

import React, { useMemo, useState } from 'react';
import { AlertCircle, Boxes, Download, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { formatInt, formatQtd } from '../../lib/format';
import type { ComposicaoSubkit } from '../../lib/projetosKitsAutonomia';

interface Props {
  composicao: ComposicaoSubkit;
  onClose: () => void;
}

export default function ModalComposicaoBomKit({ composicao, onClose }: Props) {
  const [busca, setBusca] = useState('');
  const [apenasGargalos, setApenasGargalos] = useState(false);

  const { tramo, subkitRotulo, itens, totalItens, totalPecasPorKit, autonomiaMaxima, gargalo } = composicao;

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (apenasGargalos && !i.isGargalo) return false;
      if (!termo) return true;
      return (
        i.partNumber.toLowerCase().includes(termo) ||
        (i.codSap ?? '').toLowerCase().includes(termo) ||
        i.descricao.toLowerCase().includes(termo) ||
        i.fornecedor.toLowerCase().includes(termo)
      );
    });
  }, [itens, busca, apenasGargalos]);

  const exportarExcel = () => {
    const dadosExcel = itens.map((i) => ({
      Tramo: tramo,
      'Sub-Kit': subkitRotulo,
      'Part Number': i.partNumber,
      'Cód. SAP': i.codSap ?? '',
      Descrição: i.descricao,
      Fornecedor: i.fornecedor,
      Unidade: i.uom,
      'Qtd / Torre': i.qtdPorTorre,
      'Saldo Estoque': i.saldoEstoque,
      'Kits Cobertos': i.kitsCobertos,
      Gargalo: i.isGargalo ? 'SIM' : 'NÃO',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dadosExcel);
    XLSX.utils.book_append_sheet(wb, ws, `${tramo}-${subkitRotulo}`);
    XLSX.writeFile(wb, `composicao-bom-${tramo}-${subkitRotulo.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-5xl" ariaLabel={`Composição do Kit ${tramo} ${subkitRotulo}`}>
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5" style={{ color: 'var(--brand)' }} />
          <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
            Composição do Kit segundo a BOM — {tramo} · {subkitRotulo}
          </h3>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
          Folhas da estrutura de engenharia que compõem este kit, com consumo por torre e cobertura pelo saldo atual.
        </p>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-4">
          {/* Cards de Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
              <p className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Autonomia Máxima</p>
              <p
                className="text-xl font-extrabold mt-0.5"
                style={{ color: autonomiaMaxima > 0 ? 'var(--abc-a)' : 'var(--abc-c)' }}
              >
                {formatInt(autonomiaMaxima)} kit(s)
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>cobertos pelo estoque</p>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
              <p className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Part Numbers</p>
              <p className="text-xl font-extrabold mt-0.5" style={{ color: 'var(--ink-primary)' }}>
                {formatInt(totalItens)}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>itens únicos no kit</p>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
              <p className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Peças / Torre</p>
              <p className="text-xl font-extrabold mt-0.5" style={{ color: 'var(--ink-primary)' }}>
                {formatQtd(totalPecasPorKit)}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>quantidade somada</p>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
              <p className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Item Gargalo</p>
              <p className="text-xs font-extrabold truncate mt-1 text-rose-600 dark:text-rose-400" title={gargalo?.descricao}>
                {gargalo?.partNumber ?? 'Nenhum'}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                {gargalo ? `saldo ${formatQtd(gargalo.saldoEstoque)} · precisa ${formatQtd(gargalo.qtdPorTorre)}/un` : '—'}
              </p>
            </div>
          </div>

          {/* Filtros e Busca */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por part number, SAP, descrição ou fornecedor..."
                className="w-full rounded-lg border py-2 pl-9 pr-3 text-xs focus:outline-2 focus:outline-offset-1"
                style={{
                  borderColor: 'var(--hairline)',
                  background: 'var(--surface-raised)',
                  color: 'var(--ink-primary)',
                  outlineColor: 'var(--brand)',
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setApenasGargalos(!apenasGargalos)}
                className="px-3 py-2 rounded-lg text-xs font-bold cursor-pointer border transition-colors"
                style={{
                  borderColor: apenasGargalos ? 'var(--abc-c)' : 'var(--hairline)',
                  background: apenasGargalos ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                  color: apenasGargalos ? 'var(--abc-c)' : 'var(--ink-muted)',
                }}
              >
                {apenasGargalos ? 'Mostrando gargalos' : 'Filtrar gargalos'}
              </button>

              <button
                onClick={exportarExcel}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer border hover:opacity-80"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              >
                <Download className="h-3.5 w-3.5" /> Exportar Excel
              </button>
            </div>
          </div>

          {/* Tabela de Itens */}
          <div className="rounded-xl border overflow-hidden max-h-[52vh] overflow-y-auto" style={{ borderColor: 'var(--hairline)' }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-raised)' }}>
                <tr className="border-b text-left" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                  <th className="px-3 py-2 font-bold">Item / Descrição</th>
                  <th className="px-2 py-2 font-bold">Cód. SAP</th>
                  <th className="px-2 py-2 font-bold">Fornecedor</th>
                  <th className="px-2 py-2 font-bold text-right">Qtd / Torre</th>
                  <th className="px-2 py-2 font-bold text-right">Saldo Estoque</th>
                  <th className="px-3 py-2 font-bold text-right">Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {itensFiltrados.map((item) => {
                  return (
                    <tr
                      key={item.partNumberNorm}
                      className="border-b transition-colors hover:bg-[var(--surface-sunken)]"
                      style={{
                        borderColor: 'var(--hairline)',
                        background: item.isGargalo ? 'rgba(239, 68, 68, 0.04)' : undefined,
                      }}
                    >
                      <td className="px-3 py-2 min-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          {item.isGargalo && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase shrink-0"
                              style={{ background: 'var(--abc-c)', color: '#fff' }}
                            >
                              Gargalo
                            </span>
                          )}
                          <span className="font-bold truncate" style={{ color: 'var(--ink-primary)' }}>
                            {item.partNumber}
                          </span>
                        </div>
                        <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--ink-muted)' }} title={item.descricao}>
                          {item.descricao || '—'}
                        </p>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums" style={{ color: 'var(--ink-secondary)' }}>
                        {item.codSap || '—'}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>
                        {item.fornecedor || '—'}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums font-bold" style={{ color: 'var(--ink-primary)' }}>
                        {formatQtd(item.qtdPorTorre)} {item.uom}
                      </td>
                      <td
                        className="px-2 py-2 text-right whitespace-nowrap tabular-nums font-bold"
                        style={{ color: item.saldoEstoque > 0 ? 'var(--abc-a)' : 'var(--abc-c)' }}
                      >
                        {formatQtd(item.saldoEstoque)}
                      </td>
                      <td
                        className="px-3 py-2 text-right whitespace-nowrap tabular-nums font-extrabold"
                        style={{
                          color:
                            item.kitsCobertos === 0
                              ? 'var(--abc-c)'
                              : item.isGargalo
                              ? 'var(--abc-b)'
                              : 'var(--abc-a)',
                        }}
                      >
                        {formatInt(item.kitsCobertos)} kit(s)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border hover:opacity-90"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        >
          Fechar
        </button>
      </ModalFooter>
    </Modal>
  );
}
