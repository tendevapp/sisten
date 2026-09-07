/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Painel Administrativo > Usuários > Novo usuário (sem e-mail).
 *
 * Parte do efetivo de campo não tem caixa de e-mail e não consegue usar o
 * auto-cadastro, que depende de e-mail corporativo e de link de confirmação.
 * Aqui o administrador cria o acesso na mão: identificador `nome.sobrenome`
 * gerado a partir do nome, senha provisória e as definições de papel e setor.
 *
 * O identificador é sugerido, mas editável — dois "José Pereira" no efetivo
 * precisam de um desempate, e quem conhece o time é o admin.
 *
 * O usuário nasce ativo e obrigado a trocar a senha no primeiro login: a
 * senha provisória passa pelo admin, então não pode continuar valendo.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { UserPlus, Loader2, AlertCircle, KeyRound, RefreshCw, Copy, Check, ShieldCheck } from 'lucide-react';
import Modal, { ModalBody, ModalFooter } from '../ui/Modal';
import { localDb } from '../../db/localDb';
import { gerarUsuarioLogin, usuarioLoginValido, DOMINIO_LOGIN_INTERNO } from '../../lib/loginSemEmail';
import type { Profile, Role, Sector } from '../../types';

interface Props {
  sectors: Sector[];
  onClose: () => void;
  /** Recebe o perfil criado para o painel atualizar a lista e abrir as permissões. */
  onCreated: (profile: Profile) => void;
}

const PAPEIS: { valor: Role; rotulo: string; ajuda: string }[] = [
  { valor: 'visualizador', rotulo: 'Visualizador', ajuda: 'Só consulta. É o ponto de partida seguro.' },
  { valor: 'solicitante', rotulo: 'Solicitante', ajuda: 'Abre solicitações e acompanha as próprias.' },
  { valor: 'requisitante', rotulo: 'Requisitante', ajuda: 'Opera a fila coletiva, não só as próprias solicitações.' },
  { valor: 'atendente', rotulo: 'Atendente', ajuda: 'Responde chamados do helpdesk.' },
  { valor: 'gestor', rotulo: 'Gestor', ajuda: 'Aprova solicitações do setor.' },
  { valor: 'comprador', rotulo: 'Comprador', ajuda: 'Suprimentos: cotações, pedidos e fornecedores.' },
];

/**
 * Senha provisória padrão da casa. Fácil de ditar por telefone e de digitar no
 * celular em campo — e vale só até o primeiro login, que já obriga a troca.
 * Continua editável para o admin que quiser uma senha própria.
 */
const SENHA_PROVISORIA_PADRAO = 'ten123';

/** Alternativa aleatória, sem caractere ambíguo (O/0, l/1), a um clique. */
function gerarSenhaProvisoria(): string {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const numeros = '23456789';
  const sorteia = (fonte: string, n: number) =>
    Array.from({ length: n }, () => fonte[Math.floor(Math.random() * fonte.length)]).join('');
  return `Ten${sorteia(letras, 3)}${sorteia(numeros, 3)}`;
}

export default function NovoUsuarioSemEmailModal({ sectors, onClose, onCreated }: Props) {
  const [nome, setNome] = useState('');
  const [usuario, setUsuario] = useState('');
  const [usuarioEditado, setUsuarioEditado] = useState(false);
  const [cargo, setCargo] = useState('');
  const [sectorId, setSectorId] = useState<string>('');
  const [role, setRole] = useState<Role>('visualizador');
  const [senha, setSenha] = useState(SENHA_PROVISORIA_PADRAO);
  const [copiado, setCopiado] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // O identificador acompanha o nome enquanto o admin não o editar à mão.
  useEffect(() => {
    if (!usuarioEditado) setUsuario(gerarUsuarioLogin(nome));
  }, [nome, usuarioEditado]);

  const usuarioOk = useMemo(() => usuarioLoginValido(usuario), [usuario]);
  const podeSalvar = nome.trim().length >= 3 && usuarioOk && senha.length >= 6 && !salvando;

  const copiarCredenciais = async () => {
    try {
      await navigator.clipboard.writeText(`Usuário: ${usuario}\nSenha provisória: ${senha}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não foi possível copiar. Anote as credenciais manualmente.');
    }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setSalvando(true);

    const resultado = await localDb.criarUsuarioSemEmail({
      nome,
      usuario,
      senha,
      cargo,
      sectorId: sectorId || null,
      role,
    });

    setSalvando(false);
    if (resultado.profile) {
      onCreated(resultado.profile);
      return;
    }
    setErro(resultado.erro || 'Não foi possível criar o usuário.');
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl" ariaLabel="Novo usuário sem e-mail">
      <div className="flex items-start gap-3 border-b border-slate-100 px-4 pb-3.5 pt-5 sm:px-6 dark:border-slate-800">
        <div className="shrink-0 rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
          <UserPlus className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Novo usuário sem e-mail
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Para quem não tem caixa corporativa. O acesso é pelo identificador <strong>nome.sobrenome</strong>,
            com senha provisória trocada obrigatoriamente no primeiro login.
          </p>
        </div>
      </div>

      <form onSubmit={salvar}>
        <ModalBody className="space-y-4 p-4 sm:p-6">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
              Nome completo <span className="text-rose-500">*</span>
            </label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              autoFocus
              placeholder="Ex.: José da Silva Pereira"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
              Identificador de acesso <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                value={usuario}
                onChange={e => { setUsuario(e.target.value.toLowerCase()); setUsuarioEditado(true); }}
                placeholder="nome.sobrenome"
                className={`w-full rounded-xl border bg-white px-3 py-2 font-mono text-sm dark:bg-slate-800 dark:text-slate-100 ${
                  usuario && !usuarioOk
                    ? 'border-rose-300 text-rose-700 dark:border-rose-800'
                    : 'border-slate-200 text-slate-900 dark:border-slate-700'
                }`}
              />
              {usuarioEditado && (
                <button
                  type="button"
                  onClick={() => { setUsuarioEditado(false); setUsuario(gerarUsuarioLogin(nome)); }}
                  title="Voltar a sugerir a partir do nome"
                  className="shrink-0 rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-emerald-600 dark:border-slate-700 cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {usuario && !usuarioOk
                ? 'Use apenas letras minúsculas, números e ponto — sem acento, espaço ou ponto nas pontas.'
                : <>É o que a pessoa digita no login. Internamente vira <span className="font-mono">{usuario || 'nome.sobrenome'}@{DOMINIO_LOGIN_INTERNO}</span>, um endereço técnico que não recebe mensagens.</>}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Cargo</label>
              <input
                value={cargo}
                onChange={e => setCargo(e.target.value)}
                placeholder="Ex.: Soldador"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Setor</label>
              <select
                value={sectorId}
                onChange={e => setSectorId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Sem setor</option>
                {sectors.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Papel inicial</label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {PAPEIS.map(p => (
                <button
                  key={p.valor}
                  type="button"
                  onClick={() => setRole(p.valor)}
                  className={`rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                    role === p.valor
                      ? 'border-emerald-400 bg-emerald-50/70 dark:border-emerald-600 dark:bg-emerald-950/30'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">{p.rotulo}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{p.ajuda}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Ao salvar, a tela de permissões por módulo abre para este usuário.
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
              <KeyRound className="h-3.5 w-3.5" />
              Senha provisória <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                value={senha}
                onChange={e => setSenha(e.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-amber-900/60 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => setSenha(senha === SENHA_PROVISORIA_PADRAO ? gerarSenhaProvisoria() : SENHA_PROVISORIA_PADRAO)}
                title={senha === SENHA_PROVISORIA_PADRAO ? 'Gerar uma senha aleatória' : `Voltar para a padrão (${SENHA_PROVISORIA_PADRAO})`}
                className="shrink-0 rounded-lg border border-amber-200 p-2 text-amber-700 hover:bg-amber-100 dark:border-amber-900/60 dark:text-amber-300 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={copiarCredenciais}
                title="Copiar usuário e senha"
                className="shrink-0 rounded-lg border border-amber-200 p-2 text-amber-700 hover:bg-amber-100 dark:border-amber-900/60 dark:text-amber-300 cursor-pointer"
              >
                {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-amber-800 dark:text-amber-300/90">
              Padrão <span className="font-mono font-bold">{SENHA_PROVISORIA_PADRAO}</span> — entregue à pessoa junto do
              usuário. Sem e-mail não existe "esqueci minha senha": a redefinição volta para o administrador. No
              primeiro login o sistema exige a troca.
            </p>
          </div>

          {erro && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <div className="flex w-full items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!podeSalvar}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
            >
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Criar usuário
            </button>
          </div>
        </ModalFooter>
      </form>
    </Modal>
  );
}
