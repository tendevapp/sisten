/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Detalhe de um Kaizen: os quatro blocos com as fotos (abrem no Lightbox),
 * e o rodapé do Responsável pelo Setor — "pode ser aplicada em outros
 * setores?" — que marca o Kaizen como implantado (RPC plan_kaizen_validar).
 * Autor ou admin editam (o mesmo KaizenForm, preenchido), anexam fotos e excluem.
 */

import React, { useState } from 'react';
import { BadgeCheck, FileDown, Loader2, Pencil, Trash2 } from 'lucide-react';
import type { Profile } from '../../types';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useLightbox } from '../ui/Lightbox';
import { useToast } from '../ui/Toast';
import { canValidarKaizen } from '../../lib/pages';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import { formatarDataBR } from '../../lib/fichaEpi';
import {
  KAIZEN_IMPACTOS, KAIZEN_STATUS_ROTULO, adicionarFotosKaizen, excluirKaizen, validarKaizen,
  type Kaizen, type KaizenFotoTipo,
} from '../../lib/planKaizenApi';
import KaizenFotosCampo, { type FotoLocal } from './KaizenFotosCampo';
import KaizenForm from './KaizenForm';

interface Props {
  user: Profile;
  kaizen: Kaizen;
  onClose: () => void;
  onAlterado: () => void;
  onExportarPdf: () => void;
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function KaizenDetalheModal({ user, kaizen, onClose, onAlterado, onExportarPdf }: Props) {
  const toast = useToast();
  const lb = useLightbox();
  const [aplicavel, setAplicavel] = useState<boolean | null>(null);
  const [obs, setObs] = useState('');
  const [novasFotos, setNovasFotos] = useState<FotoLocal[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [editando, setEditando] = useState(false);

  const podeEditar = podeEditarFormulario(user, kaizen);
  const podeValidar = canValidarKaizen(user) && kaizen.status === 'REGISTRADO';

  const fotosDo = (tipo: KaizenFotoTipo) => (kaizen.fotos || []).filter(f => f.tipo === tipo && f.preview_url);

  const galeria = (tipo: KaizenFotoTipo) => {
    const fotos = fotosDo(tipo);
    if (fotos.length === 0) return null;
    const imagens = fotos.map(f => ({ url: f.preview_url!, legenda: f.name }));
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {fotos.map((f, i) => (
          <button
            key={f.id}
            type="button"
            onClick={() => lb.abrir(imagens, i)}
            className="h-20 w-20 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <img src={f.preview_url} alt={f.name} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    );
  };

  const bloco = (numero: number, titulo: string, texto: string | null, tipo?: KaizenFotoTipo) => (
    <section className="space-y-1">
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {numero}. {titulo}
      </h4>
      <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{texto || '—'}</p>
      {tipo && galeria(tipo)}
    </section>
  );

  const executar = async (acao: () => Promise<void>, sucesso: string) => {
    setOcupado(true);
    try {
      await acao();
      toast.success(sucesso);
      onAlterado();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setOcupado(false);
    }
  };

  const validar = () => {
    if (aplicavel === null) {
      toast.warning('Responda se a melhoria pode ser aplicada em outros setores.');
      return;
    }
    executar(() => validarKaizen(kaizen.id, aplicavel, obs), 'Kaizen validado como implantado.');
  };

  const anexar = () =>
    executar(async () => {
      await adicionarFotosKaizen(kaizen, novasFotos.map(f => ({ file: f.file, tipo: 'resultado' as const })));
      setNovasFotos([]);
    }, 'Fotos anexadas.');

  const impactos = KAIZEN_IMPACTOS.filter(i => kaizen.impactos?.includes(i.valor)).map(i => i.rotulo);

  if (editando) {
    return (
      <Modal onClose={() => setEditando(false)} maxWidth="max-w-3xl" ariaLabel="Editar Kaizen" disableOutsideClose>
        <ModalHeader onClose={() => setEditando(false)}>
          <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{kaizen.codigo || 'Aguardando sincronização'}</p>
          <h3 className="truncate text-base font-bold text-slate-900 dark:text-slate-50">Editar Kaizen</h3>
        </ModalHeader>
        <ModalBody className="bg-slate-50 dark:bg-slate-950/40">
          <KaizenForm
            user={user}
            kaizen={kaizen}
            onCancelar={() => setEditando(false)}
            onSalvo={() => {
              setEditando(false);
              onAlterado();
            }}
          />
        </ModalBody>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Detalhe do Kaizen">
      <ModalHeader onClose={onClose}>
        <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{kaizen.codigo || 'Aguardando sincronização'}</p>
        <h3 className="truncate text-base font-bold text-slate-900 dark:text-slate-50">Aqui TEN Melhoria! — Kaizen</h3>
      </ModalHeader>

      <ModalBody className="space-y-5">
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50 sm:grid-cols-3">
          <Info rotulo="Profissional" valor={kaizen.nome_profissional} />
          <Info rotulo="Matrícula" valor={kaizen.matricula} />
          <Info rotulo="Data" valor={formatarDataBR(kaizen.data_registro)} />
          <Info rotulo="Setor" valor={kaizen.setor} />
          <Info rotulo="Responsável pelo setor" valor={kaizen.responsavel_setor} />
          <Info rotulo="Situação" valor={KAIZEN_STATUS_ROTULO[kaizen.status]} />
          <div className="col-span-2 sm:col-span-3">
            <Info rotulo="Impactos" valor={impactos.join(' · ')} />
          </div>
        </div>

        {bloco(1, 'Desperdício / problema', kaizen.problema, 'problema')}
        {bloco(2, 'Por que está acontecendo (causa)', kaizen.causa)}
        {bloco(3, 'Melhoria / solução', kaizen.solucao, 'solucao')}
        {bloco(4, 'Resultado obtido', kaizen.resultado, 'resultado')}
        {kaizen.ganho_estimado != null && (
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Ganho estimado: {moeda(Number(kaizen.ganho_estimado))}</p>
        )}

        {podeEditar && (
          <section className="space-y-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
            <h4 className="text-xs font-bold text-slate-600 dark:text-slate-300">Anexar fotos do resultado</h4>
            <KaizenFotosCampo value={novasFotos} onChange={setNovasFotos} disabled={ocupado} />
            {novasFotos.length > 0 && (
              <button
                type="button"
                onClick={anexar}
                disabled={ocupado}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-60 dark:bg-slate-700"
              >
                Enviar {novasFotos.length} foto(s)
              </button>
            )}
          </section>
        )}

        {kaizen.status === 'IMPLANTADO' && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <p className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
              <BadgeCheck className="h-4 w-4" /> Implantado — validado por {kaizen.validado_por_nome || '—'}
              {kaizen.validado_em && ` em ${new Date(kaizen.validado_em).toLocaleDateString('pt-BR')}`}
            </p>
            <p className="mt-1 text-emerald-900 dark:text-emerald-200">
              Pode ser aplicada em outros setores: <strong>{kaizen.aplicavel_outros_setores ? 'Sim' : 'Não'}</strong>
            </p>
            {kaizen.validacao_obs && <p className="mt-1 whitespace-pre-wrap text-emerald-900 dark:text-emerald-200">{kaizen.validacao_obs}</p>}
          </section>
        )}

        {podeValidar && (
          <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <h4 className="text-xs font-bold text-blue-900 dark:text-blue-200">
              Responsável pelo setor — preencha somente quando o Kaizen estiver implantado
            </h4>
            <div>
              <p className="mb-1.5 text-sm text-slate-700 dark:text-slate-200">Esta melhoria pode ser aplicada em outros setores?</p>
              <div className="flex gap-2">
                {[true, false].map(v => (
                  <button
                    key={String(v)}
                    type="button"
                    aria-pressed={aplicavel === v}
                    onClick={() => setAplicavel(v)}
                    className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
                      aplicavel === v ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                    }`}
                  >
                    {v ? 'Sim' : 'Não'}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              rows={2}
              placeholder="Observação (opcional)"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </section>
        )}
      </ModalBody>

      <ModalFooter>
        {podeEditar && (
          <button
            type="button"
            onClick={() => setConfirmarExclusao(true)}
            disabled={ocupado}
            className="mr-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </button>
        )}
        {podeEditar && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Pencil className="h-4 w-4" /> Editar
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          Fechar
        </button>
        <button
          type="button"
          onClick={onExportarPdf}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <FileDown className="h-4 w-4" /> Exportar PDF
        </button>
        {podeValidar && (
          <button
            type="button"
            onClick={validar}
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
            Validar implantação
          </button>
        )}
      </ModalFooter>

      {confirmarExclusao && (
        <ConfirmDialog
          titulo="Excluir Kaizen?"
          mensagem={`O registro ${kaizen.codigo || ''} sai da lista. Um administrador pode recuperá-lo no banco.`}
          confirmarLabel="Excluir"
          variante="perigo"
          confirmando={ocupado}
          onCancelar={() => setConfirmarExclusao(false)}
          onConfirmar={() =>
            executar(async () => {
              await excluirKaizen(kaizen.id, user.id);
              setConfirmarExclusao(false);
              onClose();
            }, 'Kaizen excluído.')
          }
        />
      )}
      {lb.elemento}
    </Modal>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="truncate font-medium text-slate-800 dark:text-slate-100">{valor || '—'}</p>
    </div>
  );
}
