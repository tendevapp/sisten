/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Diligenciamento — conteúdo da aba "Sem MIGO" da Central de Compras.
 *
 * Existia como página própria (`/suprimentos/diligenciamento`); virou parte
 * da Central de Compras porque "Sem MIGO" já É o recorte de pedidos emitidos
 * e ainda sem chegada — não fazia sentido ter dois lugares para a mesma
 * pergunta ("o que já comprei e ainda não chegou?"). O botão "Sem MIGO" em
 * `Compras.tsx` agora renderiza esta tabela no lugar da grade de cartões/
 * fornecedores (que serve a um problema diferente: achar fornecedor para
 * item ainda SEM pedido).
 *
 * Uma linha por item (RI), não por PO agrupado: no recorte típico de "Sem
 * MIGO" um PO tem poucos itens, e a tabela plana bate com o que o comprador
 * já está acostumado a ver nas outras visões desta mesma tela.
 *
 * `registros` já chega filtrado pela busca e pelos demais filtros da Central
 * de Compras (RM, comprador, alerta, grupo de mercadoria, prioridade,
 * promessa) — esta tabela não duplica esses controles, só acrescenta
 * transportadora, faturamento, previsão e o estado de chegada do Rastreio.
 *
 * Regras e cálculos em `lib/diligenciamento.ts`; leitura/escrita das tabelas
 * novas em `lib/diligenciamentoApi.ts`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, PackageCheck, Settings2, Truck, X } from 'lucide-react';
import { localDb } from '../../db/localDb';
import { AlmoxarifadoChegada, DiligenciamentoItem, EnrichedSAPRecord, PrazoTransporte, Profile } from '../../types';
import { useToast } from '../ui/Toast';
import { formatBRL, formatDateBR } from '../../lib/format';
import { TableBody, TableEmpty, TableHeadRow, TableShell, Td, Th, Tr } from '../ui/DataTable';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import {
  ItemDiligenciamento, dataValida, indexarCidadesPorCodigo, montarItens,
  normalizarChaveTransportadora, resolverPrazoDias, somarDiasCorridos, transportadorasConhecidas,
} from '../../lib/diligenciamento';
import {
  gravarPrevisaoNoRastreio, listarDiligenciamentoItens, listarPrazosTransporte,
  regiaoUfBrutaPorRi, salvarDiligenciamentoItens, salvarPrazoTransporte,
  excluirPrazoTransporte, trocarTransportadora,
} from '../../lib/diligenciamentoApi';

interface Props {
  registros: EnrichedSAPRecord[];
  chegadasMap: Map<string, AlmoxarifadoChegada>;
  user: Profile;
}

const campo: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
  outlineColor: 'var(--brand)',
};

export default function DiligenciamentoSemMigoTable({ registros, chegadasMap, user }: Props) {
  const toast = useToast();

  const [diligItensRaw, setDiligItensRaw] = useState<DiligenciamentoItem[]>([]);
  const [prazos, setPrazos] = useState<PrazoTransporte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [prazosAberto, setPrazosAberto] = useState(false);

  const cidades = useMemo(() => localDb.getCidadeForn(), []);
  const cidadesPorCodigo = useMemo(() => indexarCidadesPorCodigo(cidades), [cidades]);
  const regiaoUfMap = useMemo(() => regiaoUfBrutaPorRi(), []);
  const diligPorRi = useMemo(() => new Map(diligItensRaw.map(i => [i.ri, i])), [diligItensRaw]);

  const carregarDiligenciamento = async () => {
    try {
      const [itens, listaPrazos] = await Promise.all([listarDiligenciamentoItens(), listarPrazosTransporte()]);
      setDiligItensRaw(itens);
      setPrazos(listaPrazos);
    } catch (e) {
      console.error('Falha ao carregar diligenciamento:', e);
      toast.error('Não foi possível carregar transportadoras e prazos. Tente recarregar a página.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregarDiligenciamento(); }, []);

  const itens = useMemo(
    () => montarItens(registros, diligPorRi, chegadasMap, cidadesPorCodigo, regiaoUfMap, prazos),
    [registros, diligPorRi, chegadasMap, cidadesPorCodigo, regiaoUfMap, prazos],
  );

  const itensOrdenados = useMemo(() => [...itens].sort((a, b) => {
    if (a.previsaoEfetiva && b.previsaoEfetiva) return a.previsaoEfetiva < b.previsaoEfetiva ? -1 : 1;
    if (a.previsaoEfetiva) return -1;
    if (b.previsaoEfetiva) return 1;
    return a.docCompra.localeCompare(b.docCompra);
  }), [itens]);

  const transportadoras = useMemo(() => transportadorasConhecidas(diligItensRaw), [diligItensRaw]);
  const hojeISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  /* Ações ------------------------------------------------------------------- */

  const propagarPrevisaoParaRastreio = async (item: ItemDiligenciamento, novaTransportadora?: string, novaPrevisaoManual?: string) => {
    const transportadora = novaTransportadora ?? item.transportadora;
    let efetiva: string | null = novaPrevisaoManual !== undefined ? (novaPrevisaoManual || null) : (item.previsaoManual || null);

    if (!efetiva && item.dataRemessa) {
      const reg = registros.find(r => r.ri === item.ri);
      const uf = cidadesPorCodigo.get(reg?.fornecedor_code || '')?.estado_uf || regiaoUfMap.get(item.ri) || '';
      const dias = resolverPrazoDias(uf, transportadora, prazos);
      if (dias !== null) efetiva = somarDiasCorridos(item.dataRemessa, dias);
    }
    if (!efetiva || !dataValida(efetiva)) return;

    const { falhas } = await gravarPrevisaoNoRastreio([item.ri], efetiva);
    if (falhas.length > 0) toast.error('A previsão foi salva aqui, mas não foi possível atualizar o Rastreio Compras.');
  };

  const salvarTransportadora = async (item: ItemDiligenciamento, novoNome: string) => {
    try {
      await trocarTransportadora([item.ri], new Map([[item.ri, item.docCompra]]), novoNome, { id: user.id, nome: user.name });
      await propagarPrevisaoParaRastreio(item, novoNome, undefined);
      await carregarDiligenciamento();
    } catch (e) {
      console.error('Falha ao salvar transportadora:', e);
      toast.error('Não foi possível salvar a transportadora.');
    }
  };

  const salvarFaturamento = async (item: ItemDiligenciamento, data: string) => {
    try {
      await salvarDiligenciamentoItens(
        [item.ri], new Map([[item.ri, item.docCompra]]), { data_faturamento_transportadora: data || null },
        { id: user.id, nome: user.name },
      );
      await carregarDiligenciamento();
    } catch (e) {
      console.error('Falha ao salvar faturamento:', e);
      toast.error('Não foi possível salvar a data de faturamento.');
    }
  };

  const salvarPrevisaoManual = async (item: ItemDiligenciamento, data: string) => {
    try {
      await salvarDiligenciamentoItens(
        [item.ri], new Map([[item.ri, item.docCompra]]), { previsao_manual: data || null },
        { id: user.id, nome: user.name },
      );
      await propagarPrevisaoParaRastreio(item, undefined, data);
      await carregarDiligenciamento();
      toast.success('Previsão atualizada — já refletida no Rastreio Compras.');
    } catch (e) {
      console.error('Falha ao salvar previsão manual:', e);
      toast.error('Não foi possível salvar a previsão.');
    }
  };

  /* Desenho ------------------------------------------------------------------- */

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border p-10 text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
        Carregando diligenciamento…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          Previsão = remessa do pedido + prazo de trânsito por UF/transportadora. Editar aqui atualiza o Rastreio Compras.
        </p>
        <button
          type="button"
          onClick={() => setPrazosAberto(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
        >
          <Settings2 className="h-3.5 w-3.5" /> Prazos de trânsito
        </button>
      </div>

      {itensOrdenados.length === 0 ? (
        <TableEmpty icon={Truck} title="Nenhum item sem MIGO neste recorte" hint="Ajuste a busca ou os filtros acima." />
      ) : (
        <TableShell maxHeight="72vh">
          <table className="w-full text-left text-xs border-collapse">
            <TableHeadRow>
              <Th label="PO" />
              <Th label="Código" />
              <Th label="Material" />
              <Th label="Fornecedor" />
              <Th label="Pedido / Valor" />
              <Th label="Remessa & Previsão" />
              <Th label="Fat. Transportadora" />
              <Th label="Transportadora" />
              <Th label="Chegada (Rastreio)" />
            </TableHeadRow>
            <TableBody>
              {itensOrdenados.map(item => {
                const vencido = !item.chegou && !!item.previsaoEfetiva && item.previsaoEfetiva < hojeISO;
                const reg = registros.find(r => r.ri === item.ri);

                return (
                  <Tr key={item.ri}>
                    <Td strong mono>
                      {item.docCompra}
                      <span className="mt-0.5 block text-[10px] font-normal" style={{ color: 'var(--ink-muted)' }}>
                        RM {reg?.requisicao_de_compra} · item {reg?.item_reqc}
                      </span>
                    </Td>
                    <Td mono>{item.material}</Td>
                    <Td truncate title={item.descricao}>{item.descricao}</Td>
                    <Td truncate title={reg?.fornecedor_name}>
                      {reg?.fornecedor_name || '—'}
                      {reg?.fornecedor_code && (
                        <span className="ml-1 text-[10px]" style={{ color: 'var(--ink-muted)' }}>({reg.fornecedor_code})</span>
                      )}
                    </Td>
                    <Td numeric>
                      {reg?.data_pedido ? formatDateBR(reg.data_pedido) : '—'}
                      <span className="mt-0.5 block font-bold" style={{ color: 'var(--ink-primary)' }}>{formatBRL(item.valor)}</span>
                    </Td>
                    <Td>
                      <span className="block" style={{ color: 'var(--ink-muted)' }}>
                        Remessa: {item.dataRemessa ? formatDateBR(item.dataRemessa) : '—'}
                      </span>
                      {item.previsaoEfetiva ? (
                        <span
                          className="mt-0.5 inline-flex items-center gap-1 font-bold"
                          style={{ color: vencido ? 'var(--status-critical)' : 'var(--brand-strong)' }}
                          title={item.previsaoManual ? 'Previsão editada manualmente' : 'Previsão calculada (remessa + prazo)'}
                        >
                          Prev.: {formatDateBR(item.previsaoEfetiva)}
                          {vencido && <AlertTriangle className="h-3 w-3" />}
                        </span>
                      ) : (
                        <span className="mt-0.5 flex items-center gap-1 font-semibold" style={{ color: 'var(--status-warning)' }}>
                          <AlertTriangle className="h-3 w-3" />
                          {item.motivoSemPrevisao === 'sem_remessa' ? 'Sem remessa' : 'Sem prazo p/ UF'}
                        </span>
                      )}
                      <input
                        type="date"
                        defaultValue={item.previsaoEfetiva || ''}
                        disabled={item.chegou}
                        onBlur={e => salvarPrevisaoManual(item, e.target.value)}
                        className="mt-1 w-full rounded border px-1.5 py-1 text-[11px]"
                        style={{ ...campo, borderColor: item.previsaoManual ? 'var(--brand)' : campo.borderColor }}
                      />
                    </Td>
                    <Td>
                      <input
                        type="date"
                        defaultValue={item.faturamentoTransportadora || ''}
                        disabled={item.chegou}
                        onBlur={e => salvarFaturamento(item, e.target.value)}
                        className="w-full rounded border px-1.5 py-1 text-[11px]"
                        style={campo}
                      />
                    </Td>
                    <Td>
                      <CampoTransportadora
                        valor={item.transportadora}
                        opcoes={transportadoras}
                        desabilitado={item.chegou}
                        onSalvar={nome => salvarTransportadora(item, nome)}
                      />
                    </Td>
                    <Td>
                      {item.chegou ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={{ background: 'color-mix(in srgb, var(--status-good) 15%, transparent)', color: 'var(--status-good)' }}
                        >
                          <PackageCheck className="h-3 w-3" /> {formatDateBR(item.dataChegada)}
                        </span>
                      ) : (
                        <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Pendente</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TableBody>
          </table>
        </TableShell>
      )}

      {prazosAberto && (
        <PrazosModal
          prazos={prazos}
          onClose={() => setPrazosAberto(false)}
          onSalvar={async (uf, transp, dias) => { await salvarPrazoTransporte(uf, transp, dias); await carregarDiligenciamento(); }}
          onExcluir={async id => { await excluirPrazoTransporte(id); await carregarDiligenciamento(); }}
        />
      )}
    </div>
  );
}

/* Peças ------------------------------------------------------------------- */

/**
 * Campo de transportadora: texto livre com sugestão das já digitadas
 * (`<datalist>` nativo — sem tela de cadastro própria) e salvamento ao sair
 * do campo, só quando o valor de fato mudou.
 */
function CampoTransportadora({
  valor, opcoes, desabilitado, onSalvar,
}: { valor: string; opcoes: string[]; desabilitado: boolean; onSalvar: (nome: string) => void }) {
  const [rascunho, setRascunho] = useState(valor);
  const listId = useMemo(() => `transportadoras-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => setRascunho(valor), [valor]);

  return (
    <>
      <input
        type="text"
        list={listId}
        value={rascunho}
        disabled={desabilitado}
        placeholder="Digite ou escolha…"
        onChange={e => setRascunho(e.target.value)}
        onBlur={() => {
          if (normalizarChaveTransportadora(rascunho) !== normalizarChaveTransportadora(valor)) onSalvar(rascunho.trim());
        }}
        className="w-full rounded border px-1.5 py-1 text-[11px]"
        style={campo}
      />
      <datalist id={listId}>
        {opcoes.map(o => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}

function PrazosModal({
  prazos, onClose, onSalvar, onExcluir,
}: {
  prazos: PrazoTransporte[];
  onClose: () => void;
  onSalvar: (uf: string, transportadora: string, dias: number) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}) {
  const toast = useToast();
  const [uf, setUf] = useState('');
  const [transportadora, setTransportadora] = useState('');
  const [dias, setDias] = useState('');
  const [salvando, setSalvando] = useState(false);

  const linhas = [...prazos].sort((a, b) => (a.uf + a.transportadora).localeCompare(b.uf + b.transportadora));

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const diasNum = Number(dias);
    if (uf && !/^[A-Za-z]{2}$/.test(uf)) {
      toast.error('UF deve ter 2 letras, ou fique em branco para o padrão global.');
      return;
    }
    if (!Number.isFinite(diasNum) || diasNum < 0) {
      toast.error('Informe um número de dias válido.');
      return;
    }
    setSalvando(true);
    try {
      await onSalvar(uf.trim(), transportadora.trim(), diasNum);
      setUf(''); setTransportadora(''); setDias('');
      toast.success('Prazo salvo.');
    } catch (err) {
      console.error('Falha ao salvar prazo de trânsito:', err);
      toast.error('Não foi possível salvar. Verifique se essa combinação de UF/transportadora já existe.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel="Prazos de trânsito">
      <ModalHeader onClose={onClose}>
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>Prazos de trânsito</h3>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
          Dias corridos somados à remessa, por UF de origem e transportadora.
        </p>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <form onSubmit={salvar} className="grid grid-cols-3 gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>UF</label>
            <input
              value={uf} onChange={e => setUf(e.target.value.toUpperCase())} maxLength={2}
              placeholder="Global" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" style={campo}
            />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>Transportadora</label>
            <input
              value={transportadora} onChange={e => setTransportadora(e.target.value)}
              placeholder="Padrão da UF" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" style={campo}
            />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>Dias corridos</label>
            <input
              type="number" min={0} value={dias} onChange={e => setDias(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm" style={campo}
            />
          </div>
          <button
            type="submit" disabled={salvando}
            className="col-span-3 mt-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--brand)' }}
          >
            {salvando ? 'Salvando…' : 'Adicionar / atualizar'}
          </button>
        </form>

        <ul className="space-y-1.5">
          {linhas.length === 0 && (
            <p className="text-xs italic" style={{ color: 'var(--ink-muted)' }}>Nenhum prazo cadastrado ainda.</p>
          )}
          {linhas.map(p => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--hairline)' }}
            >
              <span>
                <strong>{p.uf || 'Qualquer UF'}</strong>
                {' · '}
                {p.transportadora || 'padrão da UF'}
                {' — '}
                <strong>{p.dias_corridos}</strong> dia(s)
              </span>
              <button
                type="button"
                onClick={() => onExcluir(p.id)}
                aria-label="Excluir prazo"
                className="cursor-pointer rounded p-1 hover:opacity-70"
                style={{ color: 'var(--status-critical)' }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </ModalBody>
      <ModalFooter>
        <button
          type="button" onClick={onClose}
          className="rounded-lg px-3.5 py-2 text-xs font-bold cursor-pointer"
          style={{ color: 'var(--ink-muted)' }}
        >
          Fechar
        </button>
      </ModalFooter>
    </Modal>
  );
}
