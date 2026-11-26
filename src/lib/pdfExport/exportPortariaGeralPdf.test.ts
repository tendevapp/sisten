import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PdfTextWriter } from './core';
import {
  gerarRelatorioGeralPortariaPdf,
  resumirAlcoolemiaSemExporPessoas,
} from './exportPortariaGeralPdf';
import { gerarEquipamentoPdf } from './exportPortariaPdf';
import type { PortAlcoolemiaTeste, PortControleEquipamento } from '../../types';

// PNG 1x1 valido para testar assinatura digital embutida no PDF sem rede.
const PNG_1X1_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

vi.mock('./core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core')>();
  return {
    ...actual,
    createDoc: async () => {
      const doc = await PDFDocument.create();
      const { StandardFonts } = await import('pdf-lib');
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      return { doc, font, fontBold, logo: null };
    },
  };
});

describe('Portaria — PDF Geral Consolidado e Comprovante de Equipamentos', () => {
  it('agrega testes de alcoolemia apenas por quantidades, ignorando excluidos', () => {
    const testes = [
      { id: '1', data: '2026-11-24', resultado: 'NEGATIVO', tipo_vinculo: 'TEN', nome: 'PESSOA SECRETA UM', matricula: '999001' },
      { id: '2', data: '2026-11-24', resultado: 'POSITIVO', tipo_vinculo: 'PJ', nome: 'PESSOA SECRETA DOIS', matricula: '999002' },
      { id: '3', data: '2026-11-25', resultado: 'RECUSA', tipo_vinculo: 'TEN', nome: 'PESSOA SECRETA TRES', matricula: '999003' },
      { id: '4', data: '2026-11-25', resultado: 'PENDENTE', tipo_vinculo: 'PJ', nome: 'PESSOA SECRETA QUATRO', matricula: '999004' },
      { id: '5', data: '2026-11-25', resultado: 'NEGATIVO', tipo_vinculo: 'TEN', nome: 'EXCLUIDO', excluido_em: '2026-11-25T10:00:00Z' },
    ] as PortAlcoolemiaTeste[];

    const resumo = resumirAlcoolemiaSemExporPessoas(testes);
    expect(resumo).toEqual({
      total: 4,
      negativos: 1,
      positivos: 1,
      recusas: 1,
      pendentes: 1,
      ten: 2,
      terceirosPj: 2,
      porDia: [
        { data: '2026-11-24', total: 2, negativos: 1, positivos: 1, recusas: 0, pendentes: 0, ten: 1, terceirosPj: 1 },
        { data: '2026-11-25', total: 2, negativos: 0, positivos: 0, recusas: 1, pendentes: 1, ten: 1, terceirosPj: 1 },
      ],
    });
    expect(JSON.stringify(resumo)).not.toContain('PESSOA SECRETA');
    expect(JSON.stringify(resumo)).not.toContain('999001');
  });

  it('gera PDF geral consolidado sem vazar nomes ou matriculas da alcoolemia', async () => {
    const pdf = await gerarRelatorioGeralPortariaPdf({
      inicioISO: '2026-11-24',
      fimISO: '2026-11-25',
      relatorios: [
        {
          id: 'rel-1',
          codigo_formulario: 'FRM.SGP-0010',
          numero_protocolo: 'REL-251126-DIU',
          data: '2026-11-25',
          turno: 'MANHA',
          vigilante_principal: 'CARLOS',
          status: 'EM_ANDAMENTO',
          ocorrencias: [
            {
              id: 'oc-1',
              relatorio_id: 'rel-1',
              horario: '08:30',
              tipo_registro: 'ENTRADA_VEICULO',
              local_setor: 'PORTARIA PRINCIPAL',
              descricao: 'ENTREGA DE PEÇAS',
              severidade: 'INFO',
              vigilante: 'CARLOS',
              empresa: 'TRANSPORTES XYZ',
              entrega_material: true,
              nf_verificada: true,
              fotos: [
                {
                  id: 'f-oc-1',
                  path: 'oc-1/foto-1.png',
                  name: 'foto.png',
                  size: 100,
                  mime_type: 'image/png',
                  created_at: '2026-11-25T08:30:00Z',
                  preview_url: PNG_1X1_DATA_URL,
                },
              ],
              created_at: '2026-11-25T08:30:00Z',
            },
          ],
          created_at: '2026-11-25T07:00:00Z',
          updated_at: '2026-11-25T08:30:00Z',
        } as any,
      ],
      passagens: [],
      transportes: [],
      equipamentos: [
        {
          id: 'eq-1',
          codigo_formulario: 'FRM.SGP-0011',
          numero_protocolo: 'EQP-251126-ABCD',
          data_entrada: '2026-11-25',
          data_saida: null,
          hora_entrada: '09:00',
          hora_saida: null,
          nome_empresa: 'ELETRO SERVICOS',
          funcionario: 'JOAO PORTADOR',
          descricao_materiais: '1X FURADEIRA BOSCH',
          responsavel: 'MARIA TEN',
          vigilante_entrada: 'CARLOS',
          vigilante_saida: null,
          status: 'NO_PATIO',
          observacoes: null,
          fotos: [
            {
              id: 'f-eq-1',
              path: 'eq-1/foto-1.png',
              name: 'furadeira.png',
              size: 100,
              mime_type: 'image/png',
              created_at: '2026-11-25T09:00:00Z',
              preview_url: PNG_1X1_DATA_URL,
            },
          ],
          assinatura_responsavel: PNG_1X1_DATA_URL,
          assinatura_responsavel_em: '2026-11-25T09:01:00Z',
          criado_por: 'u-1',
          created_at: '2026-11-25T09:00:00Z',
          updated_at: '2026-11-25T09:00:00Z',
        },
      ],
      carretas: [],
      briefings: [],
      alcoolemia: [
        {
          id: 'alc-1',
          codigo_formulario: 'ALC-251126-01',
          data: '2026-11-25',
          horario: '07:15',
          nome: 'IDENTIDADE_CONFIDENCIAL_ALCOOLEMIA',
          matricula: 'MATRICULA_SECRETA_777',
          resultado: 'NEGATIVO',
          tipo_vinculo: 'TEN',
          valor_medido: 0,
        } as PortAlcoolemiaTeste,
      ],
    });

    expect(pdf.nomeArquivo).toBe('portaria-relatorio-geral-2026-11-24-a-2026-11-25.pdf');
    expect(pdf.bytes.length).toBeGreaterThan(1000);
    const loaded = await PDFDocument.load(pdf.bytes);
    // Deve conter mais de 1 pagina por incluir detalhes completos + anexos fotograficos.
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(2);
    const header = new TextDecoder('latin1').decode(pdf.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
    // Mesmo nos streams brutos (sem compressao de texto extra ou com), nunca inclui o nome confidencial.
    const textoPdf = new TextDecoder('latin1').decode(pdf.bytes);
    expect(textoPdf).not.toContain('IDENTIDADE_CONFIDENCIAL_ALCOOLEMIA');
    expect(textoPdf).not.toContain('MATRICULA_SECRETA_777');
  });

  it('gera PDF FRM.SGP-0011 com assinatura digital do responsavel embutida', async () => {
    const item: PortControleEquipamento = {
      id: 'eq-2',
      codigo_formulario: 'FRM.SGP-0011',
      numero_protocolo: 'EQP-251126-9999',
      data_entrada: '2026-11-25',
      data_saida: null,
      hora_entrada: '10:00',
      hora_saida: null,
      nome_empresa: 'TERCEIRIZADA LTDA',
      funcionario: 'JOSE TECNICO',
      descricao_materiais: '1X MULTIMETRO FLUKE',
      responsavel: 'ANA ENGENHARIA',
      vigilante_entrada: 'VIGILANTE UM',
      vigilante_saida: null,
      status: 'NO_PATIO',
      observacoes: 'AUTORIZADO',
      fotos: [],
      assinatura_responsavel: PNG_1X1_DATA_URL,
      assinatura_responsavel_em: '2026-11-25T10:01:00Z',
      criado_por: 'u-1',
      created_at: '2026-11-25T10:00:00Z',
      updated_at: '2026-11-25T10:00:00Z',
    };

    const pdf = await gerarEquipamentoPdf(item);
    expect(pdf.nomeArquivo).toBe('portaria-equipamentos-EQP-251126-9999.pdf');
    expect(pdf.bytes.length).toBeGreaterThan(1000);
    const loaded = await PDFDocument.load(pdf.bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('nao sobrepoe data/hora, setor, vigilante e badge no cabecalho de drawOccurrenceCard', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const writer = new PdfTextWriter(doc, font, fontBold, null);
    const page = writer.getPage();

    const chamadas: { text: string; x: number; endX: number }[] = [];
    const origDrawText = page.drawText.bind(page);
    vi.spyOn(page, 'drawText').mockImplementation((text, opts) => {
      const f = opts?.font ?? font;
      const size = opts?.size ?? 8;
      const x = opts?.x ?? 0;
      chamadas.push({ text, x, endX: x + f.widthOfTextAtSize(text, size) });
      return origDrawText(text, opts);
    });

    writer.drawOccurrenceCard({
      index: 1,
      time: '25/11/2026 05:52:00',
      sector: 'PORTARIA',
      severity: 'INFO',
      vigilante: 'RICARDO ANDRE DOS SANTOS SOUZA',
      description: 'Registro de teste',
    });

    const tagHora = chamadas.find((c) => c.text === '[25/11/2026 05:52:00]')!;
    const tagSetor = chamadas.find((c) => c.text === '[PORTARIA]')!;
    const tagVig = chamadas.find((c) => c.text.startsWith('Vigilante:'))!;
    const tagSev = chamadas.find((c) => c.text === 'INFO')!;

    expect(tagHora).toBeDefined();
    expect(tagSetor).toBeDefined();
    expect(tagVig).toBeDefined();
    expect(tagSev).toBeDefined();
    expect(tagSetor.x).toBeGreaterThan(tagHora.endX);
    expect(tagVig.x).toBeGreaterThan(tagSetor.endX);
    expect(tagSev.x).toBeGreaterThan(tagVig.endX);

    chamadas.length = 0;
    writer.drawOccurrenceCard({
      index: 2,
      time: '25/11/2026 06:17:00',
      sector: 'TRP-251126-ABCD - CAMINHAO ARTICULADO DE TRANSPORTE PESADO PLACA ABC1D23',
      severity: 'ALERTA',
      vigilante: 'NOME EXTREMAMENTE LONGO DE VIGILANTE DE PLANTAO NOTURNO PORTARIA PRINCIPAL',
      description: 'Teste de truncamento sem colisao',
    });

    const hora2 = chamadas.find((c) => c.text === '[25/11/2026 06:17:00]')!;
    const setor2 = chamadas.find((c) => c.text.startsWith('[TRP-'))!;
    const vig2 = chamadas.find((c) => c.text.startsWith('Vigilante:'))!;
    const sev2 = chamadas.find((c) => c.text === 'ALERTA')!;

    expect(setor2.x).toBeGreaterThan(hora2.endX);
    expect(vig2.x).toBeGreaterThan(setor2.endX);
    expect(sev2.x).toBeGreaterThan(vig2.endX);
  });
});
