import React from 'react';
import { ExternalLink, Pencil, Layers3, PackageOpen, ReceiptText, Sigma, Warehouse } from 'lucide-react';
import type { ControleEstoqueAnalise } from '../../../lib/controleEstoque';
import { formatBRL, formatDeposito, formatQtd } from '../../../lib/almoxarifado';
import { formatDateBR, formatDateTimeBR } from '../../../lib/format';
import Modal, { ModalBody, ModalHeader } from '../../ui/Modal';

interface Props {
  /** Abre a edição de parâmetros/exceção do material; ausente para quem só consulta. */
  onEditar?: () => void;
  linha: ControleEstoqueAnalise;
  onClose: () => void;
}

const Valor = ({ rotulo, valor, destaque }: { rotulo: string; valor: React.ReactNode; destaque?: boolean }) => (
  <div className="rounded-lg border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
    <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{rotulo}</p>
    <p className="mt-1 text-sm font-black tabular" style={{ color: destaque ? 'var(--brand)' : 'var(--ink-primary)' }}>{valor}</p>
  </div>
);

const Secao = ({ titulo, icone: Icon, children }: { titulo: string; icone: typeof Sigma; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider" style={{ color: 'var(--ink-primary)' }}><Icon className="h-4 w-4" /> {titulo}</h3>
    {children}
  </section>
);

export default function ControleEstoqueDetalhe({ linha, onClose, onEditar }: Props) {
  const { item, faixa } = linha;
  return (
    <Modal onClose={onClose} ariaLabel={`Controle do material ${item.material}`} maxWidth="max-w-6xl">
      <ModalHeader onClose={onClose}>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--brand)' }}>Memória auditável do cálculo</p>
          <h2 className="font-mono text-lg font-black truncate" style={{ color: 'var(--ink-primary)' }}>{item.material}</h2>
          <p className="text-xs truncate" style={{ color: 'var(--ink-muted)' }}>{item.descricao || 'Sem descrição'} · Centro {item.centro}</p>
        </div>
        {onEditar && (
          <button type="button" onClick={onEditar} className="ml-auto mr-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer hover:bg-[var(--surface-raised)]" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Parâmetros do material
          </button>
        )}
      </ModalHeader>
      <ModalBody className="space-y-6">
        <Secao titulo="Faixa operacional da planilha" icone={Sigma}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Valor rotulo="Consumo total" valor={formatQtd(item.consumo_total)} />
            <Valor rotulo="Dias úteis" valor={item.dias_uteis ?? '—'} />
            <Valor rotulo="Consumo/dia" valor={faixa.consumoDia === null ? '—' : formatQtd(faixa.consumoDia)} />
            <Valor rotulo="Lead + intervalo" valor={item.lead_time_dias === null || item.intervalo_compra_dias === null ? '—' : `${item.lead_time_dias + item.intervalo_compra_dias} d`} />
            <Valor rotulo="Mínimo" valor={faixa.estoqueMinimo === null ? '—' : formatQtd(faixa.estoqueMinimo)} destaque />
            <Valor rotulo="Máximo" valor={faixa.estoqueMaximo === null ? '—' : formatQtd(faixa.estoqueMaximo)} />
            <Valor rotulo="Comprar" valor={faixa.quantidadeComprar === null ? '—' : formatQtd(faixa.quantidadeComprar)} destaque />
            <Valor rotulo="Valor" valor={faixa.valorComprar === null ? '—' : formatBRL(faixa.valorComprar)} />
          </div>
          <div className="rounded-lg border p-3 text-xs leading-relaxed" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-secondary)' }}>
            <p><strong>Consumo/dia</strong> = ({formatQtd(item.baixa_direta_quantidade)} baixa direta + {formatQtd(item.producao_quantidade)} produção) ÷ {item.dias_uteis ?? '—'} dias úteis.</p>
            <p><strong>Mínimo</strong> = teto(consumo/dia × ({item.lead_time_dias ?? '—'} dias de lead + {item.intervalo_compra_dias ?? '—'} dias de intervalo)). Origem: {faixa.origemMinimo === 'OVERRIDE' ? 'override manual' : 'cálculo'}.</p>
            <p><strong>Máximo</strong> = piso(mínimo + consumo/dia × lead + intervalo). Origem: {faixa.origemMaximo === 'OVERRIDE' ? 'override manual' : 'cálculo'}.</p>
            {item.tem_override && <p className="mt-2 font-semibold" style={{ color: 'var(--brand)' }}>Override: {item.override_justificativa} · {item.override_updated_by || 'usuário não identificado'} · {formatDateTimeBR(item.override_updated_at)}</p>}
          </div>
        </Secao>

        <Secao titulo="Parâmetros e autonomia" icone={Layers3}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Valor rotulo="Janela" valor={`${formatDateBR(item.janela_inicio)} a ${formatDateBR(item.janela_fim)}`} />
            <Valor rotulo="Cobertura" valor={faixa.coberturaDias === null ? '—' : `${faixa.coberturaDias} dias`} />
            <Valor rotulo="Quantidade/torre" valor={item.quantidade_por_torre === null ? 'Ambígua ou não cadastrada' : formatQtd(item.quantidade_por_torre)} />
            <Valor rotulo="Autonomia" valor={faixa.autonomiaTorres === null ? '—' : `${formatQtd(faixa.autonomiaTorres)} torres`} />
          </div>
          {item.opcoes_quantidade_por_torre.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.opcoes_quantidade_por_torre.map(opcao => <span key={`${opcao.projeto}-${opcao.quantidade_por_torre}`} className="rounded-full border px-2.5 py-1 text-[10px] font-semibold" style={{ borderColor: 'var(--hairline)' }}>{opcao.projeto || 'Projeto'}: {formatQtd(opcao.quantidade_por_torre)}/torre</span>)}
            </div>
          )}
        </Secao>

        <Secao titulo={`Depósitos (${item.quantidade_depositos})`} icone={Warehouse}>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
            <table className="w-full text-xs"><thead style={{ background: 'var(--surface-raised)' }}><tr><th className="p-2 text-left">Depósito</th><th className="p-2 text-right">Saldo</th><th className="p-2 text-right">PMM SAP</th><th className="p-2 text-right">Valor</th><th className="p-2 text-left">Situação</th></tr></thead><tbody>
              {item.depositos.map(deposito => <tr key={deposito.deposito ?? 'sem'} className="border-t" style={{ borderColor: 'var(--hairline)' }}><td className="p-2 font-mono font-bold" title={formatDeposito(deposito.deposito)}>{formatDeposito(deposito.deposito)}</td><td className="p-2 text-right tabular">{formatQtd(deposito.saldo)}</td><td className="p-2 text-right tabular">{deposito.preco_medio_sap === null ? '—' : formatBRL(deposito.preco_medio_sap)}</td><td className="p-2 text-right tabular">{formatBRL(deposito.valor)}</td><td className="p-2">{deposito.inativo ? 'Inativo — mantido no histórico' : 'Ativo'}</td></tr>)}
            </tbody></table>
          </div>
        </Secao>

        <Secao titulo={`Requisições abertas (${item.rms_abertas})`} icone={ReceiptText}>
          {item.rms.length === 0 ? <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Nenhuma RM aberta para este material.</p> : (
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--hairline)' }}><table className="min-w-[760px] w-full text-xs"><thead style={{ background: 'var(--surface-raised)' }}><tr><th className="p-2 text-left">RM</th><th className="p-2 text-left">Data</th><th className="p-2 text-left">Requisitante</th><th className="p-2 text-right">Quantidade</th><th className="p-2 text-left">Pedido</th><th className="p-2 text-left">Depósito</th></tr></thead><tbody>
              {item.rms.map((rm, indice) => <tr key={`${rm.ri}-${indice}`} className="border-t" style={{ borderColor: 'var(--hairline)' }}><td className="p-2 font-mono">{rm.requisicao || rm.ri || '—'}</td><td className="p-2">{formatDateBR(rm.data)}</td><td className="p-2">{rm.requisitante || '—'}</td><td className="p-2 text-right tabular">{rm.quantidade === null ? '—' : formatQtd(rm.quantidade)}</td><td className="p-2 font-mono">{rm.pedido || '—'}</td><td className="p-2" title={formatDeposito(rm.deposito)}>{formatDeposito(rm.deposito, '—')}</td></tr>)}
            </tbody></table></div>
          )}
        </Secao>

        <Secao titulo={`Pedidos e recebimentos (${item.pedidos.length})`} icone={PackageOpen}>
          {item.pedidos.length === 0 ? <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Nenhum pedido localizado para este material.</p> : (
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--hairline)' }}><table className="min-w-[980px] w-full text-xs"><thead style={{ background: 'var(--surface-raised)' }}><tr><th className="p-2 text-left">PO</th><th className="p-2 text-left">Fornecedor</th><th className="p-2 text-left">Data</th><th className="p-2 text-right">Pedido</th><th className="p-2 text-right">Fornecido</th><th className="p-2 text-right">Pendente</th><th className="p-2 text-right">Recebido MB51</th><th className="p-2 text-left">Última entrada</th></tr></thead><tbody>
              {item.pedidos.map((pedido, indice) => <tr key={`${pedido.pedido}-${pedido.item}-${indice}`} className="border-t" style={{ borderColor: 'var(--hairline)' }}><td className="p-2 font-mono">{pedido.pedido || '—'}</td><td className="p-2">{pedido.fornecedor || '—'}</td><td className="p-2">{formatDateBR(pedido.data)}</td><td className="p-2 text-right tabular">{pedido.quantidade_pedida === null ? '—' : formatQtd(pedido.quantidade_pedida)}</td><td className="p-2 text-right tabular">{pedido.quantidade_fornecida === null ? '—' : formatQtd(pedido.quantidade_fornecida)}</td><td className="p-2 text-right tabular font-bold">{formatQtd(pedido.quantidade_pendente)}</td><td className="p-2 text-right tabular">{pedido.quantidade_recebida_mb51 === null ? '—' : formatQtd(pedido.quantidade_recebida_mb51)}</td><td className="p-2">{formatDateBR(pedido.ultima_data_recebimento)}</td></tr>)}
            </tbody></table></div>
          )}
          <div className="flex flex-wrap gap-2">
            <a href="/almoxarifado/movimentacoes" className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--brand)' }}>Abrir movimentações <ExternalLink className="h-3.5 w-3.5" /></a>
            <a href="/suprimentos/compras" className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--brand)' }}>Abrir Central de Compras <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
        </Secao>
      </ModalBody>
    </Modal>
  );
}
