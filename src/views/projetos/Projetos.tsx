/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Projetos — fabricação de torres (GW Jacobina).
 *
 * Substitui a planilha de três abas que controlava as 69 torres. Cada aba
 * responde uma pergunta do chão de fábrica; o subtítulo diz qual.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, ArrowDownToLine, BarChart3, Boxes, Factory, GitBranch,
  HardHat, LayoutGrid, PackageCheck, RefreshCw, Wrench,
} from 'lucide-react';
import { Profile } from '../../types';
import { canAccessPage } from '../../lib/pages';
import { useDadosProjetos } from './useDadosProjetos';
import PainelVisaoGeral from '../../components/projetos/PainelVisaoGeral';
import PainelBom from '../../components/projetos/PainelBom';
import PainelPosicao from '../../components/projetos/PainelPosicao';
import PainelRecebimento from '../../components/projetos/PainelRecebimento';
import PainelPremontagem from '../../components/projetos/PainelPremontagem';
import PainelProducao from '../../components/projetos/PainelProducao';
import PainelSobressalentes from '../../components/projetos/PainelSobressalentes';
import PainelAnalises from '../../components/projetos/PainelAnalises';

export type AbaProjetos =
  | 'visao'
  | 'bom'
  | 'posicao'
  | 'recebimento'
  | 'premontagem'
  | 'producao'
  | 'sobressalentes'
  | 'paineis';

const ABAS: { id: AbaProjetos; rotulo: string; icone: typeof Boxes; pergunta: string; rota: string }[] = [
  { id: 'visao', rotulo: 'Visão Geral', icone: LayoutGrid, pergunta: 'Onde está cada torre e o que trava a próxima?', rota: '/almoxarifado/projetos' },
  { id: 'bom', rotulo: 'Estrutura (BOM)', icone: GitBranch, pergunta: 'Do que é feita uma torre, peça por peça?', rota: '/almoxarifado/projetos/bom' },
  { id: 'posicao', rotulo: 'Posição & Autonomia', icone: Boxes, pergunta: 'O que tem no almoxarifado e para quantos kits dá?', rota: '/almoxarifado/projetos/posicao' },
  { id: 'recebimento', rotulo: 'Recebimento', icone: ArrowDownToLine, pergunta: 'O que chegou do fornecedor e entrou no estoque?', rota: '/almoxarifado/projetos/recebimento' },
  { id: 'premontagem', rotulo: 'Pré-montagem', icone: Wrench, pergunta: 'Que romaneio foi separado e que kit já está pronto?', rota: '/almoxarifado/projetos/premontagem' },
  { id: 'producao', rotulo: 'Produção', icone: HardHat, pergunta: 'Que kit foi entregue à linha e como anda cada torre?', rota: '/almoxarifado/projetos/producao' },
  { id: 'sobressalentes', rotulo: 'Sobressalentes', icone: PackageCheck, pergunta: 'O que quebrou, quem aprovou a reposição e quanto custou de estoque?', rota: '/almoxarifado/projetos/sobressalentes' },
  { id: 'paineis', rotulo: 'Painéis', icone: BarChart3, pergunta: 'Onde estão os riscos de ruptura e o refugo se concentra?', rota: '/almoxarifado/projetos/paineis' },
];

interface Props {
  user: Profile;
  onNavigate?: (path: string) => void;
  abaInicial?: AbaProjetos;
}

export default function Projetos({ user, onNavigate, abaInicial = 'visao' }: Props) {
  const [aba, setAba] = useState<AbaProjetos>(abaInicial);
  const dados = useDadosProjetos();

  useEffect(() => { setAba(abaInicial); }, [abaInicial]);

  // Troca de aba mexe na URL para o deep-link continuar valendo (mandar "abre
  // a Pré-montagem" por mensagem), sem recarregar os dados já em memória.
  const trocarAba = useCallback((nova: AbaProjetos) => {
    setAba(nova);
    const rota = ABAS.find((a) => a.id === nova)?.rota;
    if (rota && typeof window !== 'undefined') window.history.replaceState(null, '', rota);
  }, []);

  const permissoes = {
    lancarEntrada: canAccessPage(user, 'proj_lancar_entrada'),
    lancarPremontagem: canAccessPage(user, 'proj_lancar_premontagem'),
    lancarProducao: canAccessPage(user, 'proj_lancar_producao'),
    lancarSobressalente: canAccessPage(user, 'proj_lancar_sobressalente'),
  };

  const abaAtual = ABAS.find((a) => a.id === aba);

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 reveal" style={{ borderColor: 'var(--hairline)' }}>
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold flex items-center gap-2.5" style={{ color: 'var(--ink-primary)' }}>
            <Factory className="h-7 w-7" style={{ color: 'var(--brand)' }} />
            Projetos — Fabricação de Torres
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-secondary)' }}>{abaAtual?.pergunta}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {dados.subprojetos.length > 1 && (
            <select
              value={dados.subprojetoAtivo?.id ?? ''}
              onChange={(e) => dados.setSubprojetoAtivo(e.target.value)}
              className="rounded-lg border py-2 px-3 text-xs font-bold cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1 border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-secondary)] focus:outline-[var(--brand)]"
              aria-label="Subprojeto"
            >
              {dados.subprojetos.map((s) => (
                <option key={s.id} value={s.id}>{s.nome} — {s.torres_previstas} torres</option>
              ))}
            </select>
          )}
          <button
            onClick={() => void dados.recarregar()}
            disabled={dados.loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer border hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
          >
            <RefreshCw className={`h-4 w-4 ${dados.loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--hairline)' }} role="tablist" aria-label="Áreas do módulo Projetos">
        {ABAS.map((a) => {
          const Icone = a.icone;
          const ativa = a.id === aba;
          return (
            <button
              key={a.id}
              role="tab"
              aria-selected={ativa}
              onClick={() => trocarAba(a.id)}
              title={a.pergunta}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 rounded-t cursor-pointer"
              style={{
                borderColor: ativa ? 'var(--brand)' : 'transparent',
                color: ativa ? 'var(--brand)' : 'var(--ink-muted)',
                outlineColor: 'var(--brand)',
              }}
            >
              <Icone className="h-4 w-4" aria-hidden="true" />
              {a.rotulo}
            </button>
          );
        })}
      </div>

      {dados.erro && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900/50 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <span className="text-sm font-medium">{dados.erro}</span>
        </div>
      )}

      {aba === 'visao' && <PainelVisaoGeral dados={dados} onIrPara={trocarAba} />}
      {aba === 'bom' && <PainelBom dados={dados} />}
      {aba === 'posicao' && <PainelPosicao dados={dados} />}
      {aba === 'recebimento' && <PainelRecebimento dados={dados} user={user} podeLancar={permissoes.lancarEntrada} />}
      {aba === 'premontagem' && <PainelPremontagem dados={dados} user={user} podeLancar={permissoes.lancarPremontagem} />}
      {aba === 'producao' && <PainelProducao dados={dados} user={user} podeLancar={permissoes.lancarProducao} />}
      {aba === 'sobressalentes' && <PainelSobressalentes dados={dados} user={user} podeLancar={permissoes.lancarSobressalente} />}
      {aba === 'paineis' && <PainelAnalises dados={dados} />}

      {onNavigate && (
        <div className="pt-2">
          <button
            onClick={() => onNavigate('/almoxarifado')}
            className="text-xs font-bold cursor-pointer hover:underline"
            style={{ color: 'var(--ink-muted)' }}
          >
            ← Voltar para o Almoxarifado
          </button>
        </div>
      )}
    </div>
  );
}
