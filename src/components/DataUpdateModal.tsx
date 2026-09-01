import { useEffect, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import Modal, { ModalBody, ModalFooter } from './ui/Modal';
import { localDb } from '../db/localDb';

/**
 * Popup bloqueante exibido quando uma sincronização automática (polling de 5 min
 * ou retorno de foco à aba) descobre que um administrador reimportou uma base
 * SAP depois que este navegador baixou os dados. A tela aberta pode estar
 * mostrando números velhos — inclusive telas onde o usuário está trabalhando, que
 * não remontam sozinhas no sync. O botão recarrega a página; o cache local já foi
 * atualizado pelo próprio sync, então a tela volta direto com os dados novos.
 *
 * Montado uma vez no App, sempre que houver usuário logado.
 *
 * O aviso só aparece quando a tela ATUAL consome uma das bases atualizadas
 * (ver DATASET_CONSUMER_PATHS). Ex.: uma reimportação da ME5A avisa na Central
 * Compras, mas não no Rastreio de Compras nem em telas de outro módulo. Se o
 * usuário navegar para uma tela afetada depois, o aviso aparece lá.
 */

// Rotas que de fato usam cada base. Curado de propósito: o Rastreio de Compras
// lê as mesmas requisições da Central Compras, mas não entra aqui porque não é
// uma tela de conferência de números pós-importação. Comparação por prefixo:
// '/almoxarifado/movimentacoes' cobre '/almoxarifado/movimentacoes/giro' etc.
const DATASET_CONSUMER_PATHS: Record<string, string[]> = {
  requisicoes: ['/suprimentos/compras', '/suprimentos/demandas', '/suprimentos/dashboards'],
  pedidos: ['/suprimentos/compras', '/suprimentos/historico', '/suprimentos/dashboards', '/financeiro/reconciliacao-pedidos'],
  pedidosforn: ['/suprimentos/historico', '/financeiro/reconciliacao-pedidos'],
  historico_pedidos: ['/suprimentos/historico'],
  estoque: ['/almoxarifado/estoque', '/almoxarifado/dashboards'],
  fbl1n_c_pagar: ['/financeiro/contas-pagar', '/financeiro/reconciliacao-pedidos'],
  zl0170_miro: ['/financeiro/reconciliacao-pedidos'],
  mb51_mov_estoque: ['/almoxarifado/movimentacoes', '/almoxarifado/consumo-semanal', '/almoxarifado/dashboards'],
  contratos: ['/suprimentos/contratos'],
  tabela_frete: ['/suprimentos/frete'],
  materials: ['/materiais/busca', '/suprimentos/cadastros-sap'],
  contatos: ['/suprimentos/fornecedores'],
  cidadeforn: ['/suprimentos/fornecedores'],
};

function pathMatches(currentPath: string, prefixes: string[]): boolean {
  return prefixes.some(p => currentPath === p || currentPath.startsWith(p + '/'));
}

// Dos datasets atualizados, só os que a tela atual realmente consome.
function relevantDatasets(datasets: string[], currentPath: string): string[] {
  return datasets.filter(d => {
    const paths = DATASET_CONSUMER_PATHS[d];
    return paths ? pathMatches(currentPath, paths) : false;
  });
}

// Alguns datasets diferentes se referem à mesma "planilha" para o usuário
// (pedidos vem de três views). O rótulo é o que a pessoa reconhece na tela.
const DATASET_LABELS: Record<string, string> = {
  requisicoes: 'Requisições (ME5A)',
  pedidos: 'Pedidos',
  pedidosforn: 'Pedidos',
  historico_pedidos: 'Pedidos',
  estoque: 'Estoque (ZL0024)',
  fbl1n_c_pagar: 'Contas a Pagar (FBL1N)',
  zl0170_miro: 'MIRO (ZL0170)',
  mb51_mov_estoque: 'Movimentações de Estoque (MB51)',
  contratos: 'Contratos (ME3N/ME3M)',
  tabela_frete: 'Tabela de Frete',
  materials: 'Catálogo de Materiais',
  contatos: 'Contatos de Fornecedores',
  cidadeforn: 'Endereços de Fornecedores',
};

function uniqueLabels(datasets: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of datasets) {
    const label = DATASET_LABELS[d] || d;
    if (!seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

interface DataUpdateModalProps {
  /** Rota atual (hash sem o '#'), para decidir se a tela usa a base atualizada. */
  currentPath: string;
}

export default function DataUpdateModal({ currentPath }: DataUpdateModalProps) {
  const [datasets, setDatasets] = useState<string[] | null>(null);

  useEffect(() => {
    const unsubscribe = localDb.subscribeDataUpdate(changed => {
      setDatasets(prev => Array.from(new Set([...(prev ?? []), ...changed])));
    });
    return () => { unsubscribe(); };
  }, []);

  const relevant = relevantDatasets(datasets ?? [], currentPath);
  if (relevant.length === 0) return null;

  const labels = uniqueLabels(relevant);

  return (
    <Modal onClose={() => {}} maxWidth="max-w-md" ariaLabel="Dados atualizados" disableOutsideClose zIndexClassName="z-[120]">
      <div className="flex items-start gap-3 px-4 sm:px-6 pt-5 pb-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
          <Database className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Dados atualizados
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            Um administrador importou novos dados no sistema. Recarregue a página para trabalhar com a versão mais recente.
          </p>
        </div>
      </div>

      <ModalBody className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Bases atualizadas</p>
        <ul className="space-y-1.5">
          {labels.map(label => (
            <li key={label} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              {label}
            </li>
          ))}
        </ul>
      </ModalBody>

      <ModalFooter className="justify-between">
        <button
          type="button"
          onClick={() => setDatasets(null)}
          className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
        >
          Agora não
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white transition-colors cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
          Recarregar agora
        </button>
      </ModalFooter>
    </Modal>
  );
}
