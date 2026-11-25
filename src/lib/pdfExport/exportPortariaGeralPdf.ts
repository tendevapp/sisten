/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatorio PDF Geral Consolidado da Portaria & Seguranca Patrimonial.
 *
 * Reune em um unico documento, para um dia ou periodo, TODAS as informacoes
 * completas (sem resumir/truncar), assinaturas e fotos de todos os formularios
 * do modulo (Ocorrencias + NFs, Passagem de Plantao, Transportes, Equipamentos
 * de Terceiros + assinatura + fotos, Carretas de Chapas e Briefings +
 * participantes assinados).
 *
 * REGRA DE PRIVACIDADE (Teste de Alcoolemia): nunca expoe nomes, matriculas,
 * CPFs, empresas individuais, fotos ou observacoes pessoais — apenas
 * quantidades consolidadas (totais gerais e resumo numerico por dia).
 */

import { createDoc, PdfTextWriter, docToPdfGerado, type PdfGerado } from './core';
import { contarFotosOcorrencia, fotosDaOcorrencia } from '../portariaFotosOcorrencia';
import type {
  PortAlcoolemiaTeste,
  PortBriefingSessao,
  PortControleCarreta,
  PortControleEquipamento,
  PortPassagemPlantao,
  PortRegistroTransporte,
  PortRelatorioOcorrencia,
  PortRelatorioPortaria,
} from '../../types';

export interface DadosRelatorioGeralPortaria {
  inicioISO: string;
  fimISO: string;
  relatorios: PortRelatorioPortaria[];
  passagens: PortPassagemPlantao[];
  transportes: PortRegistroTransporte[];
  equipamentos: PortControleEquipamento[];
  carretas: PortControleCarreta[];
  briefings: PortBriefingSessao[];
  alcoolemia: PortAlcoolemiaTeste[];
  /** Secoes habilitadas para o perfil atual (por padrao todas). */
  secoes?: {
    relatorio?: boolean;
    passagem?: boolean;
    transportes?: boolean;
    equipamentos?: boolean;
    carretas?: boolean;
    briefing?: boolean;
    alcoolemia?: boolean;
  };
}

export interface ResumoDiaAlcoolemia {
  data: string;
  total: number;
  negativos: number;
  positivos: number;
  recusas: number;
  pendentes: number;
  ten: number;
  terceirosPj: number;
}

export interface ResumoAlcoolemiaAnonimo {
  total: number;
  negativos: number;
  positivos: number;
  recusas: number;
  pendentes: number;
  ten: number;
  terceirosPj: number;
  porDia: ResumoDiaAlcoolemia[];
}

function formatDataBR(iso?: string | null): string {
  if (!iso) return '-';
  const limpo = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpo)) return iso;
  const [y, m, d] = limpo.split('-');
  return `${d}/${m}/${y}`;
}

const ROTULO_TIPO_OCORRENCIA: Record<string, string> = {
  ENTRADA_VEICULO: 'Entrada de Veículo',
  ENTRADA_VISITANTE: 'Entrada de Visitante',
  VEICULO_LEVE: 'Veículo Leve',
  ENTRADA_COLABORADOR: 'Entrada de Colaborador',
  RONDA: 'Ronda',
  OCORRENCIA: 'Ocorrência',
  OUTRO_REGISTRO: 'Outro Registro',
};

/**
 * Agrega os testes de alcoolemia em quantidades puras (geral e por dia),
 * descartando completamente qualquer identificacao individual das pessoas.
 */
export function resumirAlcoolemiaSemExporPessoas(
  testes: PortAlcoolemiaTeste[],
): ResumoAlcoolemiaAnonimo {
  const porDiaMap = new Map<string, ResumoDiaAlcoolemia>();
  const resumo: ResumoAlcoolemiaAnonimo = {
    total: 0,
    negativos: 0,
    positivos: 0,
    recusas: 0,
    pendentes: 0,
    ten: 0,
    terceirosPj: 0,
    porDia: [],
  };

  for (const t of testes) {
    if (t.excluido_em) continue;
    const dia = (t.data || '').slice(0, 10) || 'SEM-DATA';
    let item = porDiaMap.get(dia);
    if (!item) {
      item = { data: dia, total: 0, negativos: 0, positivos: 0, recusas: 0, pendentes: 0, ten: 0, terceirosPj: 0 };
      porDiaMap.set(dia, item);
    }

    resumo.total += 1;
    item.total += 1;

    if (t.resultado === 'NEGATIVO') { resumo.negativos += 1; item.negativos += 1; }
    else if (t.resultado === 'POSITIVO') { resumo.positivos += 1; item.positivos += 1; }
    else if (t.resultado === 'RECUSA') { resumo.recusas += 1; item.recusas += 1; }
    else { resumo.pendentes += 1; item.pendentes += 1; }

    if (t.tipo_vinculo === 'PJ') { resumo.terceirosPj += 1; item.terceirosPj += 1; }
    else { resumo.ten += 1; item.ten += 1; }
  }

  resumo.porDia = Array.from(porDiaMap.values()).sort((a, b) => a.data.localeCompare(b.data));
  return resumo;
}

function textoCompletoOcorrencia(oc: PortRelatorioOcorrencia, indiceLivro: number, protocoloLivro: string): string {
  const linhas: string[] = [];
  const tipo = ROTULO_TIPO_OCORRENCIA[oc.tipo_registro || ''] || oc.tipo_registro || '';
  const identificacao = [
    tipo ? `Tipo: ${tipo}` : '',
    oc.empresa ? `Empresa: ${oc.empresa}` : '',
    oc.nome_pessoa ? `Pessoa: ${oc.nome_pessoa}` : '',
    oc.documento_cpf ? `CPF/Matr.: ${oc.documento_cpf}` : '',
    oc.documento_cnh ? `CNH: ${oc.documento_cnh}` : '',
    oc.placa ? `Placa: ${oc.placa}` : '',
    oc.veiculo_leve_modelo ? `Veículo: ${oc.veiculo_leve_modelo}` : '',
    oc.autorizado_por ? `Autorizado por: ${oc.autorizado_por}` : '',
  ].filter(Boolean);
  if (identificacao.length) linhas.push(identificacao.join(' · '));

  if (oc.pessoas && oc.pessoas.length > 0) {
    const listaPessoas = oc.pessoas
      .map((p) => {
        const docInfo = [p.cpf ? `CPF ${p.cpf}` : '', p.cnh ? `CNH ${p.cnh}` : '', p.funcao || ''].filter(Boolean).join(' · ');
        return [p.nome, docInfo ? `(${docInfo})` : ''].filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join(', ');
    if (listaPessoas) linhas.push(`Pessoas vinculadas: ${listaPessoas}`);
  }

  if (oc.descricao) linhas.push(oc.descricao);
  if (oc.motivo_observacao && oc.motivo_observacao !== oc.descricao) {
    linhas.push(`Observação/Motivo: ${oc.motivo_observacao}`);
  }

  const detalhesFinais: string[] = [];
  if (oc.hora_saida) {
    detalhesFinais.push(`Saída às ${oc.hora_saida}${oc.vigilante_saida ? ` (Vig. ${oc.vigilante_saida})` : ''}`);
  }
  if (oc.entrega_material) {
    const almox = oc.vai_almoxarifado === true ? ' · Vai p/ Almoxarifado' : oc.vai_almoxarifado === false ? ' · Não vai p/ Almoxarifado' : '';
    detalhesFinais.push(`Entrega de material: ${oc.nf_verificada ? 'NF verificada' : 'NF não verificada'}${almox}`);
  }
  const nFotos = contarFotosOcorrencia(oc);
  if (nFotos.total > 0) {
    detalhesFinais.push(
      `Fotos anexas: ${nFotos.registro}${nFotos.nf ? ` + ${nFotos.nf} NF` : ''} (ver anexos — ${protocoloLivro} #${indiceLivro})`,
    );
  }
  if (detalhesFinais.length) linhas.push(detalhesFinais.join(' · '));

  return linhas.join('\n') || '-';
}

export async function gerarRelatorioGeralPortariaPdf(
  dados: DadosRelatorioGeralPortaria,
): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  const secoes = {
    relatorio: true,
    passagem: true,
    transportes: true,
    equipamentos: true,
    carretas: true,
    briefing: true,
    alcoolemia: true,
    ...dados.secoes,
  };

  const umDia = dados.inicioISO === dados.fimISO;
  const periodoBR = umDia
    ? formatDataBR(dados.inicioISO)
    : `${formatDataBR(dados.inicioISO)} a ${formatDataBR(dados.fimISO)}`;

  const relatorios = [...(dados.relatorios || [])]
    .filter((r) => !r.excluido_em)
    .map((r) => ({
      ...r,
      ocorrencias: (r.ocorrencias || [])
        .filter((o) => !o.excluido_em)
        .sort((a, b) => (a.horario || '').localeCompare(b.horario || '')),
    }))
    .sort((a, b) => a.data.localeCompare(b.data) || (a.horario_inicio || '').localeCompare(b.horario_inicio || ''));

  const totalOcorrencias = relatorios.reduce((acc, r) => acc + (r.ocorrencias?.length || 0), 0);

  const passagens = [...(dados.passagens || [])]
    .filter((p) => !p.excluido_em)
    .sort((a, b) => a.data.localeCompare(b.data) || a.turno.localeCompare(b.turno));

  const transportes = [...(dados.transportes || [])]
    .filter((t) => !t.excluido_em)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.hora_chegada || '').localeCompare(b.hora_chegada || ''));

  const equipamentos = [...(dados.equipamentos || [])]
    .filter((e) => !e.excluido_em)
    .sort((a, b) => a.data_entrada.localeCompare(b.data_entrada) || (a.hora_entrada || '').localeCompare(b.hora_entrada || ''));

  const carretas = [...(dados.carretas || [])]
    .filter((c) => !c.excluido_em)
    .sort((a, b) => a.data_entrada.localeCompare(b.data_entrada) || (a.hora_entrada || '').localeCompare(b.hora_entrada || ''));

  const briefings = [...(dados.briefings || [])]
    .filter((b) => !b.excluido_em)
    .sort((a, b) => a.data.localeCompare(b.data));

  const totalParticipantesBriefing = briefings.reduce((acc, b) => acc + (b.participantes?.length || 0), 0);
  const resumoAlc = resumirAlcoolemiaSemExporPessoas(dados.alcoolemia || []);

  const totalGeral =
    (secoes.relatorio ? totalOcorrencias : 0)
    + (secoes.passagem ? passagens.length : 0)
    + (secoes.transportes ? transportes.length : 0)
    + (secoes.equipamentos ? equipamentos.length : 0)
    + (secoes.carretas ? carretas.length : 0)
    + (secoes.briefing ? briefings.length : 0)
    + (secoes.alcoolemia ? resumoAlc.total : 0);

  const protocolo = umDia
    ? `PORT-${dados.inicioISO.replace(/-/g, '')}`
    : `PORT-${dados.inicioISO.replace(/-/g, '')}-${dados.fimISO.replace(/-/g, '')}`;

  writer.drawDocumentHeader({
    title: 'Relatório Geral Consolidado — Portaria',
    formCode: 'PORTARIA · CONSOLIDADO',
    protocol: protocolo,
    statusBadge: `${totalGeral} REGISTRO(S)`,
    statusColor: 'blue',
  });

  const kpisGrid: { label: string; value: string }[] = [
    { label: umDia ? 'Data de Referência' : 'Período de Referência', value: periodoBR },
  ];
  if (secoes.relatorio) kpisGrid.push({ label: 'Ocorrências & Rondas', value: `${totalOcorrencias} lançamento(s) em ${relatorios.length} livro(s)` });
  if (secoes.passagem) kpisGrid.push({ label: 'Passagens de Plantão', value: `${passagens.length} plantão(ões)` });
  if (secoes.transportes) kpisGrid.push({ label: 'Chegadas de Transportes', value: `${transportes.length} veículo(s)` });
  if (secoes.equipamentos) kpisGrid.push({ label: 'Equipamentos de Terceiros', value: `${equipamentos.length} entrada(s)` });
  if (secoes.carretas) kpisGrid.push({ label: 'Carretas de Chapas', value: `${carretas.length} carreta(s)` });
  if (secoes.briefing) kpisGrid.push({ label: 'Briefings de Segurança', value: `${briefings.length} sessão(ões) · ${totalParticipantesBriefing} pessoa(s)` });
  if (secoes.alcoolemia) {
    kpisGrid.push({
      label: 'Alcoolemia (Quantitativo)',
      value: `${resumoAlc.total} teste(s) · ${resumoAlc.negativos} neg / ${resumoAlc.positivos} pos / ${resumoAlc.recusas} rec / ${resumoAlc.pendentes} pend`,
    });
  }
  writer.drawInfoGrid(kpisGrid, 2);

  // Coletor de anexos fotograficos de Ocorrencias, Notas Fiscais e Equipamentos.
  const fotosAnexas: {
    title: string;
    reference: string;
    description?: string;
    timestamp?: string;
    source: string;
  }[] = [];

  // -------------------------------------------------------------------
  // 1. Relatorio de Ocorrencias (FRM.SGP-0010) — Completo + Fotos
  // -------------------------------------------------------------------
  if (secoes.relatorio) {
    writer.drawSectionHeader('1. Relatório de Ocorrências (FRM.SGP-0010)', totalOcorrencias);
    if (relatorios.length === 0) {
      writer.drawCallout('Sem registros', 'Nenhum livro de ocorrências registrado no período selecionado.');
    } else {
      for (const rel of relatorios) {
        const ocs = rel.ocorrencias || [];
        writer.drawInfoGrid([
          { label: 'Livro / Protocolo', value: rel.numero_protocolo },
          { label: 'Data / Turno', value: `${formatDataBR(rel.data)} · ${rel.turno} (${rel.horario_inicio} às ${rel.horario_fim})` },
          {
            label: 'Status do Livro',
            value: rel.status === 'CONCLUIDO' ? 'CONCLUÍDO' : 'EM ANDAMENTO',
            statusBadge: rel.status === 'CONCLUIDO' ? 'CONCLUÍDO' : 'EM ANDAMENTO',
            statusColor: rel.status === 'CONCLUIDO' ? 'green' : 'blue',
          },
          { label: 'Vigilante Portaria', value: rel.vigilante_principal || '-' },
          { label: 'Vigilante Ronda 01', value: rel.vigilante_ronda01 || 'Não escalado' },
          { label: 'Vigilante Ronda 02', value: rel.vigilante_ronda02 || 'Não escalado' },
        ], 3);

        if (ocs.length === 0) {
          writer.drawCallout('Sem Alterações', 'Nenhuma ocorrência lançada neste livro.');
        } else {
          ocs.forEach((oc, idx) => {
            writer.drawOccurrenceCard({
              index: idx + 1,
              time: `${formatDataBR(rel.data)} ${oc.horario || '-'}`,
              sector: oc.local_setor || '-',
              severity: oc.severidade || 'INFO',
              vigilante: oc.vigilante || rel.vigilante_principal || '-',
              description: textoCompletoOcorrencia(oc, idx + 1, rel.numero_protocolo),
            });

            fotosDaOcorrencia(oc)
              .filter((f) => !!f.url)
              .forEach((f) => {
                fotosAnexas.push({
                  title: `Ocorrência ${rel.numero_protocolo} #${idx + 1} — [${oc.horario}] ${f.tipo === 'nf' ? 'NOTA FISCAL' : 'FOTO'} (${f.legenda})`,
                  reference: `Vigilante: ${oc.vigilante || rel.vigilante_principal} · Local: ${oc.local_setor || '-'}${oc.empresa ? ` · Empresa: ${oc.empresa}` : ''}`,
                  description: oc.descricao,
                  timestamp: `${formatDataBR(rel.data)} às ${oc.horario || '-'}`,
                  source: f.url,
                });
              });
          });
        }

        if (rel.observacoes_gerais) {
          writer.drawCallout(`Observações Gerais (${rel.numero_protocolo})`, rel.observacoes_gerais);
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // 2. Passagem de Plantao & Custodia (FRM.SGP-0010) — Completo
  // -------------------------------------------------------------------
  if (secoes.passagem) {
    writer.drawSectionHeader('2. Passagem de Plantão & Custódia (FRM.SGP-0010)', passagens.length);
    if (passagens.length === 0) {
      writer.drawCallout('Sem registros', 'Nenhuma passagem de plantão registrada no período selecionado.');
    } else {
      passagens.forEach((p, idx) => {
        const isConcluido = p.status === 'CONCLUIDO';
        const anteriores = [p.vigilante_anterior01, p.vigilante_anterior02].filter(Boolean).join(', ') || '-';
        writer.drawInfoGrid([
          { label: `Plantão #${idx + 1} · Protocolo`, value: p.numero_protocolo },
          { label: 'Data / Turno / Horário', value: `${formatDataBR(p.data)} · ${p.turno} (${p.horario_inicio} às ${p.horario_fim})` },
          {
            label: 'Status',
            value: isConcluido ? 'CONCLUÍDO' : 'EM ANDAMENTO',
            statusBadge: isConcluido ? 'CONCLUÍDO' : 'EM ANDAMENTO',
            statusColor: isConcluido ? 'green' : 'blue',
          },
          { label: 'Vigilante Portaria', value: p.vigilante_portaria || '-' },
          { label: 'Vigilante Ronda 01 / 02', value: [p.vigilante_ronda01, p.vigilante_ronda02].filter(Boolean).join(' / ') || 'Não escalado' },
          { label: 'Plantão Anterior (Entrega)', value: anteriores },
        ], 3);

        if (p.texto_declaracao) {
          writer.drawCallout('Termo Declaratório de Recebimento do Posto', p.texto_declaracao, true);
        }

        const itens = p.itens_conferidos || [];
        if (itens.length > 0) {
          writer.drawTable(
            [
              { label: 'MATERIAL / EQUIPAMENTO', width: 220, align: 'left' },
              { label: 'QUANTIDADE', width: 90, align: 'center' },
              { label: 'CONFERÊNCIA', width: 85, align: 'center' },
              { label: 'OBSERVAÇÃO', width: 120, align: 'left' },
            ],
            itens.map((it) => [
              it.nome,
              `${it.quantidade_conferida ?? it.quantidade_esperada} / ${it.quantidade_esperada} ${it.unidade || 'UN'}`,
              it.conferido ? 'CONFORME [OK]' : 'DIVERGENTE',
              it.observacao || '-',
            ]),
          );
        }

        if (p.observacoes) {
          writer.drawCallout(`Observações do Plantão (${p.numero_protocolo})`, p.observacoes);
        }
        if (isConcluido && (p.encerrado_em || p.observacoes_encerramento)) {
          const quando = p.encerrado_em
            ? new Date(p.encerrado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
            : '';
          const titulo = ['Encerramento', quando && `em ${quando}`, p.encerrado_por && `por ${p.encerrado_por}`].filter(Boolean).join(' ');
          writer.drawCallout(titulo, p.observacoes_encerramento || 'Sem observações de encerramento.');
        }
      });
    }
  }

  // -------------------------------------------------------------------
  // 3. Registro de Chegada de Transportes (FRM.SGP-0009) — Completo
  // -------------------------------------------------------------------
  if (secoes.transportes) {
    writer.drawSectionHeader('3. Registro de Chegada de Transportes (FRM.SGP-0009)', transportes.length);
    if (transportes.length === 0) {
      writer.drawCallout('Sem registros', 'Nenhum transporte registrado no período selecionado.');
    } else {
      transportes.forEach((t, idx) => {
        const linhas = [
          `Veículo: ${t.veiculo} · Placa: ${t.placa} · Empresa: ${t.empresa || '-'}`,
          `Motorista: ${t.motorista || '-'}${t.motorista_documento ? ` · ${t.motorista_doc_tipo || 'Doc.'}: ${t.motorista_documento}` : ''}${t.ocupacao ? ` · Ocupação: ${t.ocupacao}` : ''}`,
          `Chegada: ${t.hora_chegada || '-'} · Saída: ${t.hora_saida || 'No Pátio'} · Turno: ${t.turno} · Status: ${t.status}`,
          t.rota ? `Rota / Destino: ${t.rota}` : '',
          t.observacoes ? `Observações: ${t.observacoes}` : '',
        ].filter(Boolean);

        writer.drawOccurrenceCard({
          index: idx + 1,
          time: `${formatDataBR(t.data)} ${t.hora_chegada || '-'}`,
          sector: `${t.numero_protocolo} · ${t.veiculo} ${t.placa}`,
          severity: 'INFO',
          vigilante: t.vigilante || '-',
          description: linhas.join('\n'),
        });
      });
    }
  }

  // -------------------------------------------------------------------
  // 4. Equipamentos e Ferramentas de Terceiros (FRM.SGP-0011) — Completo + Assinatura + Fotos
  // -------------------------------------------------------------------
  if (secoes.equipamentos) {
    writer.drawSectionHeader('4. Equipamentos e Ferramentas de Terceiros (FRM.SGP-0011)', equipamentos.length);
    if (equipamentos.length === 0) {
      writer.drawCallout('Sem registros', 'Nenhuma entrada de equipamento de terceiros no período selecionado.');
    } else {
      for (let i = 0; i < equipamentos.length; i++) {
        const e = equipamentos[i];
        const isBaixado = e.status === 'DEVOLVIDO' || !!e.data_saida;
        writer.drawInfoGrid([
          { label: `Equipamento #${i + 1} · Protocolo`, value: e.numero_protocolo },
          {
            label: 'Status',
            value: isBaixado ? 'DEVOLVIDO' : e.status,
            statusBadge: isBaixado ? 'SAÍDA CONCLUÍDA' : 'NO PÁTIO',
            statusColor: isBaixado ? 'green' : 'amber',
          },
          { label: 'Empresa Terceirizada', value: e.nome_empresa },
          { label: 'Funcionário / Portador', value: e.funcionario },
          { label: 'Entrada Registrada', value: `${formatDataBR(e.data_entrada)}${e.hora_entrada ? ` às ${e.hora_entrada}` : ''}` },
          {
            label: 'Saída Registrada',
            value: e.data_saida ? `${formatDataBR(e.data_saida)}${e.hora_saida ? ` às ${e.hora_saida}` : ''}` : 'Em Aberto (No Pátio)',
          },
          { label: 'Vigilante Entrada / Saída', value: `${e.vigilante_entrada || '-'}${e.vigilante_saida ? ` / ${e.vigilante_saida}` : ''}` },
          { label: 'Responsável / Acompanhante TEN', value: e.responsavel || '-' },
        ], 2);

        writer.drawCallout(`Relação Completa de Materiais (${e.numero_protocolo})`, e.descricao_materiais || '-');

        if (e.observacoes) {
          writer.drawCallout(`Observações (${e.numero_protocolo})`, e.observacoes);
        }

        if (e.assinatura_responsavel) {
          await writer.drawSignaturesWithImages([
            { role: 'Vigilante da Portaria', name: e.vigilante_entrada },
            { role: 'Responsável / Terceiro', name: e.responsavel || e.funcionario, signature: e.assinatura_responsavel },
          ]);
        }

        (e.fotos || [])
          .filter((f) => !!f.preview_url)
          .forEach((f, idxFoto, todas) => {
            fotosAnexas.push({
              title: `Equipamento ${e.numero_protocolo} — Foto ${idxFoto + 1} de ${todas.length}`,
              reference: `Empresa: ${e.nome_empresa} · Portador: ${e.funcionario}${e.responsavel ? ` · Resp. TEN: ${e.responsavel}` : ''}`,
              description: e.descricao_materiais,
              timestamp: `${formatDataBR(e.data_entrada)}${e.hora_entrada ? ` às ${e.hora_entrada}` : ''}`,
              source: f.preview_url || '',
            });
          });
      }
    }
  }

  // -------------------------------------------------------------------
  // 5. Controle de Carretas de Chapas (FRM.SGP-0020) — Completo
  // -------------------------------------------------------------------
  if (secoes.carretas) {
    writer.drawSectionHeader('5. Controle de Carretas de Chapas (FRM.SGP-0020)', carretas.length);
    if (carretas.length === 0) {
      writer.drawCallout('Sem registros', 'Nenhuma carreta de chapas registrada no período selecionado.');
    } else {
      carretas.forEach((c, idx) => {
        const liberado = c.status === 'LIBERADO' || c.status === 'FINALIZADO';
        writer.drawInfoGrid([
          { label: `Carreta #${idx + 1} · Protocolo`, value: c.numero_protocolo },
          {
            label: 'Status',
            value: liberado ? 'LIBERADO' : 'NO PÁTIO',
            statusBadge: liberado ? 'LIBERADO' : 'NO PÁTIO',
            statusColor: liberado ? 'green' : 'amber',
          },
          { label: 'Empresa / Transportadora', value: c.empresa },
          { label: 'Motorista / CPF', value: `${c.nome_motorista}${c.cpf_motorista ? ` (${c.cpf_motorista})` : ''}` },
          { label: 'Placa Cavalo / Carreta', value: `Cav: ${c.placa_cavalo || '-'} · Car: ${c.placa_carreta || '-'}` },
          { label: 'Nota Fiscal / Peso Bruto', value: `NF: ${c.numero_nf || '-'}${c.peso_bruto ? ` · ${c.peso_bruto} kg` : ''}` },
          { label: 'Entrada', value: `${formatDataBR(c.data_entrada)}${c.hora_entrada ? ` às ${c.hora_entrada}` : ''} (${c.vigilante_entrada || '-'})` },
          { label: 'Saída', value: c.data_saida ? `${formatDataBR(c.data_saida)}${c.hora_saida ? ` às ${c.hora_saida}` : ''} (${c.vigilante_saida || '-'})` : 'No Pátio' },
        ], 2);

        if (c.observacoes) {
          writer.drawCallout(`Observações (${c.numero_protocolo})`, c.observacoes);
        }
      });
    }
  }

  // -------------------------------------------------------------------
  // 6. Lista de Presenca — Briefing de Seguranca (FRM.SGP-0013) — Completo + Assinaturas
  // -------------------------------------------------------------------
  if (secoes.briefing) {
    writer.drawSectionHeader('6. Lista de Presença — Briefing de Segurança (FRM.SGP-0013)', briefings.length);
    if (briefings.length === 0) {
      writer.drawCallout('Sem registros', 'Nenhum briefing de segurança registrado no período selecionado.');
    } else {
      for (let i = 0; i < briefings.length; i++) {
        const b = briefings[i];
        const participantes = b.participantes || [];
        const assinados = participantes.filter((p) => !!p.assinatura_digital).length;
        const statusLabel = b.status === 'CONCLUIDA' ? 'CONCLUÍDA' : b.status === 'CANCELADA' ? 'CANCELADA' : 'ABERTA';

        writer.drawInfoGrid([
          { label: `Sessão #${i + 1} · Protocolo`, value: b.numero_protocolo },
          { label: 'Data / Tipo', value: `${formatDataBR(b.data)} · ${b.tipo === 'EXTERNO' ? 'Externo (Visitantes/Terceiros)' : 'Interno (Colaboradores)'}` },
          { label: 'Tema do Treinamento', value: b.tema_treinamento },
          { label: 'Instrutor / Responsável', value: `${b.instrutor_responsavel || '-'} · ${assinados}/${participantes.length} assin. (${statusLabel})` },
        ], 2);

        if (b.conteudo_programatico) {
          writer.drawCallout(`Conteúdo Programático (${b.numero_protocolo})`, b.conteudo_programatico);
        }
        if (b.observacoes) {
          writer.drawCallout(`Observações (${b.numero_protocolo})`, b.observacoes);
        }
        if (participantes.length > 0) {
          await writer.drawAttendanceTableWithSignatures(participantes);
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // 7. Teste de Alcoolemia (EXCLUSIVAMENTE QUANTIDADES — SEM EXPOR PESSOAS)
  // -------------------------------------------------------------------
  if (secoes.alcoolemia) {
    writer.drawSectionHeader('7. Teste de Alcoolemia — Quantitativo Consolidado (FRM.SGP-0015)', resumoAlc.total);
    writer.drawCallout(
      'Sigilo e Proteção de Dados',
      'Por privacidade, este relatório geral apresenta exclusivamente as quantidades consolidadas dos testes de alcoolemia, sem expor nomes, matrículas, fotos ou dados individuais.',
    );

    writer.drawInfoGrid(
      [
        { label: 'Total de Sorteados / Testes', value: `${resumoAlc.total}` },
        { label: 'Negativos (Aptos)', value: `${resumoAlc.negativos}` },
        { label: 'Positivos', value: `${resumoAlc.positivos}` },
        { label: 'Recusas', value: `${resumoAlc.recusas}` },
        { label: 'Pendentes', value: `${resumoAlc.pendentes}` },
        { label: 'Vínculo (TEN / Terceiros PJ)', value: `${resumoAlc.ten} TEN · ${resumoAlc.terceirosPj} PJ` },
      ],
      3,
    );

    if (resumoAlc.porDia.length > 0) {
      writer.drawTable(
        [
          { label: 'DATA', width: 75, align: 'center' },
          { label: 'SORTEADOS', width: 65, align: 'center' },
          { label: 'NEGATIVOS', width: 65, align: 'center' },
          { label: 'POSITIVOS', width: 65, align: 'center' },
          { label: 'RECUSAS', width: 60, align: 'center' },
          { label: 'PENDENTES', width: 65, align: 'center' },
          { label: 'TEN', width: 60, align: 'center' },
          { label: 'TERC. PJ', width: 60, align: 'center' },
        ],
        resumoAlc.porDia.map((d) => [
          formatDataBR(d.data),
          String(d.total),
          String(d.negativos),
          String(d.positivos),
          String(d.recusas),
          String(d.pendentes),
          String(d.ten),
          String(d.terceirosPj),
        ]),
      );
    }
  }

  // Assinaturas finais do consolidado
  writer.drawSignatures([
    { role: 'Vigilante / Operador da Portaria' },
    { role: 'Supervisão de Segurança Patrimonial' },
  ]);

  // Anexos fotograficos completos (Ocorrencias, Notas Fiscais e Equipamentos de Terceiros).
  // Fotos de testes de alcoolemia NUNCA entram neste relatorio geral.
  if (fotosAnexas.length > 0) {
    await writer.drawPhotoAttachments(fotosAnexas);
  }

  writer.finalizeDoc('PORTARIA-GERAL');
  const nomeArquivo = umDia
    ? `portaria-relatorio-geral-${dados.inicioISO}.pdf`
    : `portaria-relatorio-geral-${dados.inicioISO}-a-${dados.fimISO}.pdf`;
  const titulo = `Relatório Geral da Portaria — ${periodoBR}`;
  return docToPdfGerado(doc, nomeArquivo, titulo);
}
