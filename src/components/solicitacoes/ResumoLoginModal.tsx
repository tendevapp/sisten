/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Resumo do dia — a janela que abre no login.
 *
 * O sino do cabeçalho é passivo: só avisa quem já resolveu olhar. Uma
 * solicitação devolvida para revisão na sexta podia ficar semanas parada sem
 * ninguém notar. Este resumo inverte isso e leva a pendência até a pessoa.
 *
 * Duas regras o mantêm útil em vez de virar um clique automático:
 *
 * 1. Só abre quando existe alguma coisa — pendência ou novidade. Um modal que
 *    aparece todo dia dizendo "nada de novo" ensina a fechar sem ler, e aí ele
 *    também é fechado sem ler no dia em que importa.
 * 2. Abre no máximo uma vez por dia por usuário.
 *
 * Quem monta o conteúdo é `montarResumo` em `lib/solicitacoesCentral.ts`.
 */

import { ArrowRight, Bell, CheckCircle2, Sparkles } from 'lucide-react';
import { localDb } from '../../db/localDb';
import { Profile } from '../../types';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { formatDateTimeBR } from '../../lib/format';
import { rotuloStatus, rotuloTipo } from '../../lib/solicitacoes';
import { ItemResumo, ResumoUsuario } from '../../lib/solicitacoesCentral';

const chaveExibicao = (userId: string) => `sisten_sol_resumo_visto_${userId}`;

const hoje = () => new Date().toISOString().slice(0, 10);

/** Já mostramos o resumo para este usuário hoje? */
export const resumoJaVistoHoje = (userId: string): boolean =>
  localDb.getStorageItem<string>(chaveExibicao(userId), '') === hoje();

export const marcarResumoVisto = (userId: string): void =>
  localDb.setStorageItem(chaveExibicao(userId), hoje());

interface Props {
  user: Profile;
  resumo: ResumoUsuario;
  onNavigate: (path: string) => void;
  onClose: () => void;
}

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function ResumoLoginModal({ user, resumo, onNavigate, onClose }: Props) {
  const primeiroNome = user.name.split(' ')[0];

  const ir = (path: string) => {
    marcarResumoVisto(user.id);
    onClose();
    onNavigate(path);
  };

  const fechar = () => {
    marcarResumoVisto(user.id);
    onClose();
  };

  return (
    <Modal onClose={fechar} maxWidth="max-w-lg" ariaLabel="Resumo das suas solicitações">
      <ModalHeader onClose={fechar}>
        <h3 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>
          {saudacao()}, {primeiroNome}
        </h3>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--ink-muted)' }}>
          {resumo.desde
            ? `O que mudou desde ${formatDateTimeBR(resumo.desde)}.`
            : 'O que está esperando por você.'}
        </p>
      </ModalHeader>

      <ModalBody className="space-y-5">
        {resumo.pendentes.length > 0 && (
          <Bloco
            icone={<CheckCircle2 className="h-4 w-4" style={{ color: 'var(--brand)' }} />}
            titulo={resumo.pendentes.length === 1
              ? '1 solicitação aguarda uma ação sua'
              : `${resumo.pendentes.length} solicitações aguardam uma ação sua`}
          >
            {resumo.pendentes.slice(0, 5).map(item => (
              <LinhaResumo
                key={item.request.id}
                item={item}
                destaque={item.pendencia!.rotulo}
                onClick={() => ir(`/solicitacoes?escopo=acao&id=${item.request.id}`)}
              />
            ))}
            {resumo.pendentes.length > 5 && (
              <Restante quantidade={resumo.pendentes.length - 5} />
            )}
          </Bloco>
        )}

        {resumo.novidades.length > 0 && (
          <Bloco
            icone={<Sparkles className="h-4 w-4" style={{ color: 'var(--brand)' }} />}
            titulo={resumo.novidades.length === 1 ? '1 novidade' : `${resumo.novidades.length} novidades`}
          >
            {resumo.novidades.slice(0, 5).map(item => (
              <LinhaResumo
                key={item.request.id}
                item={item}
                destaque={`${item.novidade!.texto} · ${item.novidade!.autor}`}
                onClick={() => ir(`/solicitacoes?id=${item.request.id}`)}
              />
            ))}
            {resumo.novidades.length > 5 && (
              <Restante quantidade={resumo.novidades.length - 5} />
            )}
          </Bloco>
        )}

        {resumo.naoLidas > 0 && (
          <p className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--ink-muted)' }}>
            <Bell className="h-4 w-4" />
            Você também tem {resumo.naoLidas} notificação(ões) não lida(s) no sino.
          </p>
        )}
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={fechar}
          className="rounded-lg px-3.5 py-2 text-sm font-bold cursor-pointer"
          style={{ color: 'var(--ink-muted)' }}
        >
          Depois
        </button>
        <button
          type="button"
          onClick={() => ir(resumo.pendentes.length > 0 ? '/solicitacoes?escopo=acao' : '/solicitacoes')}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold text-white cursor-pointer"
          style={{ background: 'var(--brand)' }}
        >
          Ver solicitações <ArrowRight className="h-4 w-4" />
        </button>
      </ModalFooter>
    </Modal>
  );
}

/* Peças ------------------------------------------------------------------- */

function Bloco({
  icone, titulo, children,
}: { icone: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
        {icone} {titulo}
      </h4>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}

function LinhaResumo({
  item, destaque, onClick,
}: { item: ItemResumo; destaque: string; onClick: () => void }) {
  const r = item.request;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left cursor-pointer transition-colors"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              #{r.number}
            </span>
            <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
              {rotuloTipo(r.type)} · {rotuloStatus(r)}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[13px] font-semibold" style={{ color: 'var(--brand-strong)' }}>
            {destaque}
          </span>
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: 'var(--ink-muted)' }}
        />
      </button>
    </li>
  );
}

function Restante({ quantidade }: { quantidade: number }) {
  return (
    <li className="px-1 text-[13px]" style={{ color: 'var(--ink-muted)' }}>
      e mais {quantidade}…
    </li>
  );
}
