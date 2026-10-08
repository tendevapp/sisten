/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin → Cadastros Gerais → Suprimentos → Abertura de RM.
 * Comprador (EKGRP) dos itens de EPI e uniformes na planilha de RM; os demais itens
 * seguem o comprador cadastrado por setor.
 */

import React, { useEffect, useState } from 'react';
import { Save, UserCheck } from 'lucide-react';
import type { Profile } from '../../types';
import { obterRmConfig, salvarRmConfig, RM_CONFIG_PADRAO, type RmConfig } from '../../lib/rmConfigApi';
import { useToast } from '../ui/Toast';

interface Props {
  user: Profile;
}

export default function ConfigAberturaRm({ user }: Props) {
  const toast = useToast();
  const [config, setConfig] = useState<RmConfig>(RM_CONFIG_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    obterRmConfig().then(setConfig).finally(() => setCarregando(false));
  }, []);

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarRmConfig(config, user.id);
      toast.success('Configuração da abertura de RM salva.');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível salvar a configuração.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <UserCheck className="h-4 w-4 text-blue-600" /> Comprador de EPI e uniformes na abertura de RM
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Com a regra ligada, os itens de <strong>EPI e uniformes profissionais</strong> (pelo grupo de
          mercadorias do material) saem em Abrir RM com este código de comprador (EKGRP).
          Todos os outros itens seguem o comprador cadastrado por setor.
          Desligada, EPI também segue o setor.
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          checked={config.comprador_fixo_ativo}
          disabled={carregando}
          onChange={(e) => setConfig(c => ({ ...c, comprador_fixo_ativo: e.target.checked }))}
        />
        Usar comprador específico para EPI e uniformes
      </label>

      <div className="max-w-xs space-y-1.5">
        <label className="text-[10px] font-bold uppercase text-slate-500">Código do comprador (EKGRP)</label>
        <input
          type="text"
          value={config.comprador_fixo_codigo}
          disabled={carregando || !config.comprador_fixo_ativo}
          onChange={(e) => setConfig(c => ({ ...c, comprador_fixo_codigo: e.target.value }))}
          placeholder="358"
          className="w-full rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-xs focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <button
        type="button"
        onClick={salvar}
        disabled={carregando || salvando}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        <Save className="h-4 w-4" /> {salvando ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  );
}
