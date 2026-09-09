/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Sobressalentes / Refugo (F5).
 *
 * Reposição de peça quebrada, deformada ou extraviada. Debita o almoxarifado
 * SEM avançar kit nenhum — é exatamente por isso que o refugo é o que derruba
 * a autonomia do subprojeto: a peça sai do estoque e nenhuma torre anda.
 */

import React, { useMemo, useState } from 'react';
import { Camera, Loader2, PackageX, Plus, Search, Trash2, X } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { TableEmpty } from '../ui/DataTable';
import { useToast } from '../ui/Toast';
import { Campo, inputCls } from './campos';
import { formatDateBR, formatQtd } from '../../lib/format';
import { MOTIVOS_SOBRESSALENTE, PREFIXO, ROTULO_MOTIVO, TRAMOS, hojeISO, type MotivoSobressalente } from '../../lib/projetos';
import { ACCEPT_ANEXO, AnexoInvalidoError, MAX_ANEXOS, prepareAttachment, type PreparedAttachment } from '../../lib/imageCompression';
import { estornarDocumento, proximoCodigo, registrarSobressalente, subirEvidencia, ProjSaldoInsuficienteError } from '../../lib/projetosApi';
import type { Profile, ProjEvidencia } from '../../types';
import type { DadosProjetos } from '../../views/projetos/useDadosProjetos';

interface Props { dados: DadosProjetos; user: Profile; podeLancar: boolean }

interface ItemEscolhido { itemId: string; partNumber: string; descricao: string; quantidade: string; saldo: number }

export default function PainelSobressalentes({ dados, user, podeLancar }: Props) {
  const toast = useToast();
  const { saldos, sobressalentes, tramosDoSubprojeto, subprojetoAtivo, loading, recarregar } = dados;

  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [data, setData] = useState(hojeISO());
  const [motivo, setMotivo] = useState<MotivoSobressalente>('quebra_montagem');
  const [motivoDetalhe, setMotivoDetalhe] = useState('');
  const [tramo, setTramo] = useState('');
  const [tramoUnidade, setTramoUnidade] = useState('');
  const [aprovador, setAprovador] = useState('');
  const [observacao, setObservacao] = useState('');
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState<ItemEscolhido[]>([]);
  const [arquivos, setArquivos] = useState<PreparedAttachment[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [faltantes, setFaltantes] = useState<ProjSaldoInsuficienteError['faltantes']>([]);

  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (termo.length < 2) return [];
    return saldos
      .filter((s) =>
        s.part_number.toLowerCase().includes(termo) ||
        (s.cod_sap ?? '').toLowerCase().includes(termo) ||
        (s.descricao ?? '').toLowerCase().includes(termo))
      .filter((s) => !itens.some((i) => i.itemId === s.item_id))
      .slice(0, 20);
  }, [saldos, busca, itens]);

  const unidades = useMemo(
    () => tramosDoSubprojeto.filter((t) => !tramo || t.tramo === tramo),
    [tramosDoSubprojeto, tramo],
  );

  const limpar = () => {
    setData(hojeISO()); setMotivo('quebra_montagem'); setMotivoDetalhe('');
    setTramo(''); setTramoUnidade(''); setAprovador(''); setObservacao('');
    setBusca(''); setItens([]);
    arquivos.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setArquivos([]); setErros({}); setFaltantes([]);
  };

  /** Regra 1 do CLAUDE.md: valida e comprime antes de qualquer coisa. */
  const anexar = async (lista: FileList | null) => {
    if (!lista?.length) return;
    const restante = MAX_ANEXOS - arquivos.length;
    if (restante <= 0) { toast.error(`Máximo de ${MAX_ANEXOS} evidências.`); return; }

    for (const file of Array.from(lista).slice(0, restante)) {
      try {
        const preparado = await prepareAttachment(file);
        setArquivos((a) => [...a, preparado]);
      } catch (err) {
        toast.error(err instanceof AnexoInvalidoError ? err.message : 'Não foi possível anexar o arquivo.');
      }
    }
  };

  const salvar = async () => {
    const novos: Record<string, string> = {};
    if (!data) novos.data = 'Informe a data.';
    if (!aprovador.trim()) novos.aprovador = 'Informe o aprovador técnico / qualidade.';
    if (motivo === 'outros' && !motivoDetalhe.trim()) novos.motivo = 'Descreva o motivo.';
    if (!itens.length) novos.itens = 'Adicione ao menos um item.';
    if (itens.some((i) => !(Number(i.quantidade.replace(',', '.')) > 0))) novos.itens = 'Toda quantidade deve ser maior que zero.';
    setErros(novos);
    const primeiro = Object.values(novos)[0];
    if (primeiro) { toast.error(primeiro); return; }

    setSalvando(true);
    setFaltantes([]);
    try {
      const codigo = await proximoCodigo(PREFIXO.sobressalente, data);

      const evidencias: ProjEvidencia[] = [];
      for (const a of arquivos) evidencias.push(await subirEvidencia(a, codigo));

      await registrarSobressalente({
        codigo,
        data,
        subprojeto_id: subprojetoAtivo?.id ?? null,
        tramo: tramo || null,
        tramo_unidade_id: tramoUnidade || null,
        motivo,
        motivo_detalhe: motivoDetalhe.trim() || null,
        aprovador_nome: aprovador.trim(),
        evidencias,
        observacao: observacao.trim() || null,
        criado_por_id: user.id,
        criado_por_nome: user.name,
        itens: itens.map((i) => ({ item_id: i.itemId, quantidade: Number(i.quantidade.replace(',', '.')) })),
      });

      toast.success(`Sobressalente ${codigo} registrado — estoque debitado.`);
      toast.warning('A autonomia do subprojeto foi recalculada; confira a aba Painéis.');
      setAberto(false);
      limpar();
      await recarregar(true);
    } catch (err: any) {
      if (err instanceof ProjSaldoInsuficienteError) {
        setFaltantes(err.faltantes);
        toast.error(`Sem saldo para atender: ${err.faltantes.length} item(ns).`);
      } else {
        console.error(err);
        toast.error(err?.message || 'Não foi possível registrar o sobressalente.');
      }
    } finally {
      setSalvando(false);
    }
  };

  const estornar = async (id: string, codigo: string) => {
    if (!window.confirm(`Estornar ${codigo}? As peças voltam ao estoque.`)) return;
    try {
      await estornarDocumento('proj_sobressalentes', id, user.id);
      toast.success(`${codigo} estornado.`);
      await recarregar(true);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível estornar.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          {sobressalentes.length} solicitação(ões) registrada(s).
        </p>
        {podeLancar ? (
          <button
            onClick={() => { limpar(); setAberto(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white shadow-sm hover:opacity-90 active:scale-95"
            style={{ background: 'var(--brand)' }}
          >
            <Plus className="h-4 w-4" /> Nova solicitação
          </button>
        ) : (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            Consulta apenas. Solicitar exige a permissão “Projetos: solicitar sobressalente / refugo”.
          </p>
        )}
      </div>

      {loading && <div className="h-40 rounded-xl animate-pulse" style={{ background: 'var(--hairline)' }} />}

      {!loading && !sobressalentes.length && (
        <TableEmpty
          icon={PackageX}
          title="Nenhum sobressalente solicitado"
          hint="Toda peça reposta aqui sai do estoque sem avançar torre — é o que consome a folga do pedido."
        />
      )}

      {!loading && sobressalentes.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: 'var(--surface-raised)' }}>
                <tr className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                  {['Código', 'Data', 'Motivo', 'Aplicação', 'Itens', 'Peças', 'Aprovador', ''].map((h, i) => (
                    <th key={h || i} className={`px-3 py-2 font-bold whitespace-nowrap ${i === 4 || i === 5 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--ink-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sobressalentes.map((s) => {
                  const pecas = (s.itens ?? []).reduce((t, i) => t + Number(i.quantidade), 0);
                  return (
                    <tr key={s.id} className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                      <td className="px-3 py-2 font-bold whitespace-nowrap" style={{ color: 'var(--ink-primary)' }}>
                        {s.codigo}
                        {(s.evidencias?.length ?? 0) > 0 && <Camera className="inline ml-1.5 h-3 w-3" style={{ color: 'var(--ink-muted)' }} />}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>{formatDateBR(s.data)}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }} title={s.motivo_detalhe ?? ''}>
                        {ROTULO_MOTIVO[s.motivo]}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>{s.tramo_unidade_id || s.tramo || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-secondary)' }}>{(s.itens ?? []).length}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: 'var(--abc-c)' }}>{formatQtd(pecas)}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>{s.aprovador_nome}</td>
                      <td className="px-3 py-2 text-right">
                        {podeLancar && (
                          <button onClick={() => void estornar(s.id, s.codigo)} className="inline-flex items-center gap-1 text-[11px] font-bold cursor-pointer hover:underline" style={{ color: 'var(--abc-c)' }}>
                            <Trash2 className="h-3 w-3" /> Estornar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aberto && (
        <Modal onClose={() => !salvando && setAberto(false)} maxWidth="max-w-3xl" ariaLabel="Nova solicitação de sobressalente" disableOutsideClose>
          <ModalHeader onClose={() => !salvando && setAberto(false)}>
            <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Solicitação de sobressalente / refugo</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              Debita o almoxarifado sem avançar kit — a autonomia do pedido cai na mesma medida.
            </p>
          </ModalHeader>

          <ModalBody>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo rotulo="Data" erro={erros.data}>
                  <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls(erros.data)} />
                </Campo>
                <Campo rotulo="Tramo (opcional)">
                  <select value={tramo} onChange={(e) => { setTramo(e.target.value); setTramoUnidade(''); }} className={inputCls()}>
                    <option value="">—</option>
                    {TRAMOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Torre / rastreio (opcional)">
                  <select value={tramoUnidade} onChange={(e) => setTramoUnidade(e.target.value)} className={inputCls()}>
                    <option value="">—</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>{u.id} — Torre {String(u.torre_numero).padStart(2, '0')}</option>
                    ))}
                  </select>
                </Campo>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Motivo" erro={erros.motivo}>
                  <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoSobressalente)} className={inputCls(erros.motivo)}>
                    {MOTIVOS_SOBRESSALENTE.map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Aprovador técnico / qualidade" erro={erros.aprovador}>
                  <input value={aprovador} onChange={(e) => setAprovador(e.target.value)} className={inputCls(erros.aprovador)} placeholder="Quem autorizou a reposição" />
                </Campo>
              </div>

              <Campo rotulo={motivo === 'outros' ? 'Descreva o motivo' : 'Detalhe do motivo (opcional)'}>
                <input value={motivoDetalhe} onChange={(e) => setMotivoDetalhe(e.target.value)} className={inputCls(erros.motivo)} />
              </Campo>

              <Campo rotulo="Itens solicitados" erro={erros.itens}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Busque o part number a repor"
                    className={`${inputCls()} pl-9`}
                  />
                  {candidatos.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border shadow-lg" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                      {candidatos.map((c) => (
                        <li key={c.item_id}>
                          <button
                            onClick={() => {
                              setItens((a) => [...a, {
                                itemId: c.item_id, partNumber: c.part_number,
                                descricao: c.descricao || c.description || '', quantidade: '1', saldo: Number(c.saldo) || 0,
                              }]);
                              setBusca('');
                            }}
                            className="w-full text-left px-3 py-2 text-xs cursor-pointer hover:bg-[rgba(127,127,127,0.08)]"
                          >
                            <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>{c.part_number}</span>
                            <span className="ml-2" style={{ color: 'var(--ink-muted)' }}>{c.descricao} · saldo {formatQtd(Number(c.saldo))}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {itens.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {itens.map((i, idx) => {
                      const qtd = Number(i.quantidade.replace(',', '.'));
                      const excede = Number.isFinite(qtd) && qtd > i.saldo;
                      return (
                        <li key={i.itemId} className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: excede ? 'var(--abc-c)' : 'var(--hairline)' }}>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{i.partNumber}</p>
                            <p className="text-[11px] truncate" style={{ color: 'var(--ink-muted)' }}>{i.descricao} · saldo {formatQtd(i.saldo)}</p>
                          </div>
                          <input
                            value={i.quantidade}
                            onChange={(e) => setItens((a) => a.map((x, j) => (j === idx ? { ...x, quantidade: e.target.value } : x)))}
                            inputMode="decimal"
                            className="w-20 rounded border px-2 py-1 text-xs text-right tabular-nums font-bold focus:outline-2"
                            style={{ borderColor: excede ? 'var(--abc-c)' : 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)', outlineColor: 'var(--brand)' }}
                          />
                          <button onClick={() => setItens((a) => a.filter((_, j) => j !== idx))} className="cursor-pointer shrink-0" aria-label="Remover item">
                            <X className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Campo>

              {faltantes.length > 0 && (
                <div className="rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-3 text-[11px] text-rose-800 dark:text-rose-300">
                  <p className="font-extrabold mb-1">Sem saldo para atender:</p>
                  <ul>
                    {faltantes.map((f) => (
                      <li key={f.item_id}>
                        {f.part_number} — precisa {formatQtd(Number(f.necessario))}, tem {formatQtd(Number(f.saldo))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Campo rotulo={`Evidência da avaria (opcional, até ${MAX_ANEXOS})`}>
                <div className="flex flex-wrap items-center gap-2">
                  {arquivos.map((a, i) => (
                    <div key={i} className="relative">
                      <img src={a.previewUrl} alt={a.name} className="h-16 w-16 object-cover rounded-lg border" style={{ borderColor: 'var(--hairline)' }} />
                      <button
                        onClick={() => { URL.revokeObjectURL(a.previewUrl); setArquivos((x) => x.filter((_, j) => j !== i)); }}
                        className="absolute -top-1.5 -right-1.5 rounded-full p-0.5 bg-rose-500 text-white cursor-pointer"
                        aria-label="Remover evidência"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {arquivos.length < MAX_ANEXOS && (
                    <label className="h-16 w-16 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer hover:opacity-70" style={{ borderColor: 'var(--hairline)' }}>
                      <Camera className="h-5 w-5" style={{ color: 'var(--ink-muted)' }} />
                      <input type="file" accept={ACCEPT_ANEXO} multiple hidden onChange={(e) => { void anexar(e.target.files); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
              </Campo>

              <Campo rotulo="Observação (opcional)">
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} className={inputCls()} />
              </Campo>
            </div>
          </ModalBody>

          <ModalFooter>
            <button onClick={() => setAberto(false)} disabled={salvando} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
              Cancelar
            </button>
            <button
              onClick={() => void salvar()}
              disabled={salvando}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50"
              style={{ background: 'var(--brand)' }}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageX className="h-4 w-4" />}
              Registrar e debitar
            </button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
