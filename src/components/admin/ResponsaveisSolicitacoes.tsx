/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin › Cadastros Gerais › E-mails — "Responsáveis pelas solicitações".
 * Escolhe, entre os usuários do SISTEN, quem recebe as solicitações de
 * Cadastro SAP (item e fornecedor) e de compra de Serviço. Grava no "Para" do
 * gatilho de e-mail correspondente (ver `lib/responsaveisSolicitacoes.ts`):
 * o mesmo endereço recebe o e-mail de abertura, vê a solicitação na Central e
 * pode avisar o solicitante quando finaliza.
 */

import React, { useId, useMemo, useState } from 'react';
import { Loader2, UserCheck, X } from 'lucide-react';
import type { ConfigEnvioEmail, Profile } from '../../types';
import { localDb } from '../../db/localDb';
import { atualizarConfigEmail, normalizarListaEmails } from '../../lib/emailConfigApi';
import { GATILHOS_RESPONSAVEIS, type GatilhoResponsavel } from '../../lib/responsaveisSolicitacoes';
import { useToast } from '../ui/Toast';

interface Props {
  configs: ConfigEnvioEmail[];
  /** Releitura da lista de gatilhos depois de salvar. */
  onSalvo: () => void;
}

export default function ResponsaveisSolicitacoes({ configs, onSalvo }: Props) {
  const usuarios = useMemo(
    () => localDb.getProfiles()
      .filter(p => p.status === 'ativo' && !p.login_sem_email && p.email && !p.email.toLowerCase().endsWith('@sisten.local'))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-2">
        <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Responsáveis pelas solicitações</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Quem recebe o e-mail de abertura, vê a solicitação na Central e avisa o solicitante ao finalizar.
            Pode haver mais de um por tipo.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {GATILHOS_RESPONSAVEIS.map(g => (
          <LinhaResponsavel
            key={g.chave}
            gatilho={g}
            config={configs.find(c => c.chave.toLowerCase() === g.chave) || null}
            usuarios={usuarios}
            onSalvo={onSalvo}
          />
        ))}
      </div>
    </section>
  );
}

function LinhaResponsavel({
  gatilho, config, usuarios, onSalvo,
}: {
  gatilho: GatilhoResponsavel;
  config: ConfigEnvioEmail | null;
  usuarios: Profile[];
  onSalvo: () => void;
}) {
  const toast = useToast();
  const idSelect = useId();
  const [salvando, setSalvando] = useState(false);

  const emails = normalizarListaEmails(config?.destinatarios);
  const porEmail = useMemo(
    () => new Map(usuarios.map(u => [u.email.toLowerCase(), u])),
    [usuarios],
  );
  const disponiveis = usuarios.filter(u => !emails.some(e => e.toLowerCase() === u.email.toLowerCase()));

  const salvar = async (novaLista: string[]) => {
    if (novaLista.length === 0) {
      toast.warning('Deixe ao menos um responsável. Para parar o envio, desative o gatilho na lista abaixo.');
      return;
    }
    setSalvando(true);
    try {
      await atualizarConfigEmail(config?.id || `padrao-${gatilho.chave.replace(/_/g, '-')}`, {
        chave: gatilho.chave,
        destinatarios: novaLista.join('; '),
      });
      toast.success(`Responsáveis de "${gatilho.rotulo}" atualizados.`);
      onSalvo();
    } catch (err: any) {
      toast.error('Não foi possível salvar: ' + (err?.message || 'erro desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  const adicionar = (email: string) => {
    if (!email) return;
    salvar([...emails, email]);
  };

  const remover = (email: string) => {
    salvar(emails.filter(e => e.toLowerCase() !== email.toLowerCase()));
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{gatilho.rotulo}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{gatilho.descricao}</p>
        </div>
        {salvando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" />}
        {!salvando && config && !config.ativo && (
          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
            E-mail desativado
          </span>
        )}
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {emails.length === 0 && (
          <li className="text-[11px] italic text-slate-500">Ninguém escolhido.</li>
        )}
        {emails.map(email => {
          const perfil = porEmail.get(email.toLowerCase());
          return (
            <li
              key={email}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-200 bg-white py-0.5 pl-2.5 pr-1 text-xs text-slate-800 dark:border-blue-900 dark:bg-slate-900 dark:text-slate-200"
              title={email}
            >
              <span className="truncate">
                {perfil ? perfil.name : email}
                {!perfil && <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400">(fora do cadastro)</span>}
              </span>
              <button
                type="button"
                onClick={() => remover(email)}
                disabled={salvando}
                aria-label={`Remover ${perfil ? perfil.name : email} dos responsáveis de ${gatilho.rotulo}`}
                className="rounded-full p-0.5 text-slate-500 hover:bg-rose-100 hover:text-rose-700 cursor-pointer disabled:opacity-50 dark:hover:bg-rose-950"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ul>

      <div>
        <label htmlFor={idSelect} className="sr-only">Adicionar responsável a {gatilho.rotulo}</label>
        <select
          id={idSelect}
          value=""
          disabled={salvando}
          onChange={e => adicionar(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">+ Adicionar usuário…</option>
          {disponiveis.map(u => (
            <option key={u.id} value={u.email}>{u.name} — {u.email}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
