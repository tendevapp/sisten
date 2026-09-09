/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Pré-montagem — cadastro de itens desconsiderados na liberação de OS.
 *
 * Alguns itens da BOM (chapa/placa de aço, flange, cerca quadrada) vêm de
 * suprimento externo por peso/lote, não por peça — não fazem sentido no
 * romaneio de uma ordem de separação e nunca deveriam travar a liberação
 * por falta de saldo. `proj_itens.ignorar_premontagem` marca isso; esta
 * tela é o cadastro editável (os 4 grupos citados já vêm semeados no banco,
 * mas a lista não é fixa — quem usa o almoxarifado ajusta).
 */

import React, { useMemo, useState } from 'react';
import { Check, Loader2, Search, Settings2 } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { atualizarItensIgnorarPremontagem } from '../../lib/projetosApi';
import type { ProjItem } from '../../types';

interface Props {
  itens: ProjItem[];
  onSalvo: () => void;
}

export default function CadastroItensDesconsiderados({ itens, onSalvo }: Props) {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState('');
  const [alteracoes, setAlteracoes] = useState<Map<string, boolean>>(new Map());

  const marcadosOriginal = useMemo(() => itens.filter((i) => i.ignorar_premontagem).length, [itens]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return itens;
    return itens.filter(
      (i) =>
        i.part_number.toLowerCase().includes(termo) ||
        (i.cod_sap ?? '').toLowerCase().includes(termo) ||
        (i.descricao ?? '').toLowerCase().includes(termo) ||
        (i.description ?? '').toLowerCase().includes(termo),
    );
  }, [itens, busca]);

  const valorAtual = (item: ProjItem) => alteracoes.get(item.id) ?? item.ignorar_premontagem;

  const alternar = (item: ProjItem) => {
    setAlteracoes((m) => {
      const novo = new Map(m);
      const proximo = !valorAtual(item);
      if (proximo === item.ignorar_premontagem) novo.delete(item.id); // volta ao original, nada a salvar
      else novo.set(item.id, proximo);
      return novo;
    });
  };

  const fechar = () => {
    if (salvando) return;
    setAberto(false);
    setBusca('');
    setAlteracoes(new Map());
  };

  const salvar = async () => {
    if (!alteracoes.size) { fechar(); return; }
    setSalvando(true);
    try {
      await atualizarItensIgnorarPremontagem(
        Array.from(alteracoes.entries()).map(([id, ignorar_premontagem]) => ({ id, ignorar_premontagem })),
      );
      toast.success(`${alteracoes.size} item(ns) atualizado(s).`);
      fechar();
      onSalvo();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const totalMarcado = itens.filter((i) => valorAtual(i)).length;

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-sm border hover:opacity-90 active:scale-95"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
        title="Itens que ficam fora do romaneio de ordens de pré-montagem"
      >
        <Settings2 className="h-4 w-4" /> Itens desconsiderados ({marcadosOriginal})
      </button>

      {aberto && (
        <Modal onClose={fechar} maxWidth="max-w-2xl" ariaLabel="Itens desconsiderados na liberação de OS" disableOutsideClose>
          <ModalHeader onClose={fechar}>
            <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Itens desconsiderados na liberação de OS</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              Marcados aqui ficam fora do romaneio de toda nova ordem de separação — não entram no check de saldo nem no débito.
            </p>
          </ModalHeader>

          <ModalBody>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por part number, SAP ou descrição"
                  className="w-full rounded-lg border py-2 pl-9 pr-3 text-xs font-medium focus:outline-2 focus:outline-offset-1"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)', outlineColor: 'var(--brand)' }}
                  autoFocus
                />
              </div>

              <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                {totalMarcado} item(ns) desconsiderado(s) no total · mostrando {filtrados.length}
              </p>

              <div className="rounded-lg border max-h-96 overflow-y-auto" style={{ borderColor: 'var(--hairline)' }}>
                {filtrados.length === 0 ? (
                  <p className="text-xs text-center py-8" style={{ color: 'var(--ink-muted)' }}>Nenhum item encontrado.</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {filtrados.map((item) => {
                        const marcado = valorAtual(item);
                        const mudou = alteracoes.has(item.id);
                        return (
                          <tr key={item.id} className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                            <td className="px-3 py-2 w-10">
                              <button
                                onClick={() => alternar(item)}
                                className="h-5 w-5 rounded border flex items-center justify-center cursor-pointer transition-colors"
                                style={{
                                  borderColor: marcado ? 'var(--brand)' : 'var(--hairline)',
                                  background: marcado ? 'var(--brand)' : 'transparent',
                                }}
                                aria-label={marcado ? 'Desmarcar' : 'Marcar'}
                              >
                                {marcado && <Check className="h-3.5 w-3.5 text-white" />}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-bold" style={{ color: 'var(--ink-primary)' }}>{item.part_number}</p>
                              <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                                {item.descricao || item.description || '—'}{item.cod_sap ? ` · SAP ${item.cod_sap}` : ''}
                              </p>
                            </td>
                            {mudou && (
                              <td className="px-3 py-2 text-right">
                                <span className="text-[10px] font-bold" style={{ color: 'var(--abc-b)' }}>alterado</span>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            <button onClick={fechar} disabled={salvando} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
              Cancelar
            </button>
            <button
              onClick={() => void salvar()}
              disabled={salvando}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50"
              style={{ background: 'var(--brand)' }}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvar {alteracoes.size > 0 ? `(${alteracoes.size})` : ''}
            </button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
