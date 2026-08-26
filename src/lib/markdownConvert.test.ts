import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  detectarFormato, estimarTokens, workbookParaMarkdown, jsonParaMarkdown,
  xmlParaMarkdown, consolidarMarkdown,
} from './markdownConvert';

describe('detectarFormato', () => {
  it('reconhece os formatos suportados pela extensão, sem depender do case', () => {
    expect(detectarFormato('cotacao.XLSX')).toBe('xlsx');
    expect(detectarFormato('lista.csv')).toBe('csv');
    expect(detectarFormato('pedido.json')).toBe('json');
    expect(detectarFormato('nota.xml')).toBe('xml');
  });

  it('reconhece formatos ainda não implementados como tal, não como desconhecidos', () => {
    expect(detectarFormato('proposta.pdf')).toBe('pdf');
    expect(detectarFormato('foto.jpg')).toBe('imagem');
    expect(detectarFormato('call.mp3')).toBe('audio');
  });

  it('cai em desconhecido para extensão fora da lista', () => {
    expect(detectarFormato('arquivo.exe')).toBe('desconhecido');
    expect(detectarFormato('sem-extensao')).toBe('desconhecido');
  });
});

describe('estimarTokens', () => {
  it('usa a heurística de ~4 caracteres por token', () => {
    expect(estimarTokens('a'.repeat(400))).toBe(100);
    expect(estimarTokens('')).toBe(0);
  });
});

describe('workbookParaMarkdown', () => {
  it('converte uma única aba em tabela GFM sem cabeçalho de seção', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['Material', 'Qtd'], ['Parafuso M8', '100'], ['Porca M8', '200']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const md = workbookParaMarkdown(wb);
    expect(md).not.toContain('## Sheet1');
    expect(md).toContain('| Material | Qtd |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| Parafuso M8 | 100 |');
    expect(md).toContain('| Porca M8 | 200 |');
  });

  it('cria uma seção por aba quando há mais de uma', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['A'], ['1']]), 'Itens');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['B'], ['2']]), 'Totais');

    const md = workbookParaMarkdown(wb);
    expect(md).toContain('## Itens');
    expect(md).toContain('## Totais');
  });

  it('preserva linhas com colunas faltando em vez de descartá-las', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['A', 'B', 'C'], ['1', '2', '3'], ['4']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const md = workbookParaMarkdown(wb);
    expect(md).toContain('| 4 |  |  |');
  });

  it('escapa pipe e quebra de linha dentro de célula', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['Obs'], ['linha1\nlinha2 | com pipe']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const md = workbookParaMarkdown(wb);
    expect(md).toContain('linha1<br>linha2 \\| com pipe');
  });

  it('avisa quando a planilha está vazia em vez de gerar tabela quebrada', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Sheet1');
    expect(workbookParaMarkdown(wb)).toContain('_(planilha vazia)_');
  });

  it('lê CSV via XLSX.read type: string, no mesmo formato usado pelo conversor', () => {
    const wb = XLSX.read('Nome,Qtd\nParafuso,10\n', { type: 'string' });
    const md = workbookParaMarkdown(wb);
    expect(md).toContain('| Nome | Qtd |');
    expect(md).toContain('| Parafuso | 10 |');
  });
});

describe('jsonParaMarkdown', () => {
  it('renderiza array de objetos planos como tabela GFM', () => {
    const md = jsonParaMarkdown(JSON.stringify([
      { codigo: 'A1', preco: 10 },
      { codigo: 'A2', preco: 20 },
    ]));
    expect(md).toContain('| codigo | preco |');
    expect(md).toContain('| A1 | 10 |');
    expect(md).toContain('| A2 | 20 |');
  });

  it('usa a união das chaves quando os objetos do array têm campos diferentes', () => {
    const md = jsonParaMarkdown(JSON.stringify([{ a: 1 }, { b: 2 }]));
    expect(md).toContain('| a | b |');
    expect(md).toContain('| 1 | null |');
    expect(md).toContain('| null | 2 |');
  });

  it('renderiza objeto aninhado com headings por chave e bullets para campos primitivos', () => {
    const md = jsonParaMarkdown(JSON.stringify({
      fornecedor: { nome: 'ACME', cnpj: '123' },
      total: 99.5,
    }));
    expect(md).toContain('- **total**: 99.5');
    expect(md).toContain('## fornecedor');
    expect(md).toContain('- **nome**: ACME');
    expect(md).toContain('- **cnpj**: 123');
  });

  it('nunca omite um campo por ser null — preserva como texto "null"', () => {
    const md = jsonParaMarkdown(JSON.stringify({ observacao: null }));
    expect(md).toContain('- **observacao**: null');
  });

  it('lista vazia e objeto vazio ficam marcados explicitamente, não somem', () => {
    expect(jsonParaMarkdown('[]')).toContain('_(lista vazia)_');
    expect(jsonParaMarkdown('{}')).toContain('_(objeto vazio)_');
  });
});

describe('xmlParaMarkdown', () => {
  it('converte elementos repetidos e planos (mesma tag, sem filhos) em tabela GFM', () => {
    const xml = `<?xml version="1.0"?><pedido><item codigo="A1" qtd="10"/><item codigo="A2" qtd="20"/></pedido>`;
    const md = xmlParaMarkdown(xml);
    expect(md).toContain('| codigo | qtd |');
    expect(md).toContain('| A1 | 10 |');
    expect(md).toContain('| A2 | 20 |');
  });

  it('preserva atributos como bullets e texto do elemento', () => {
    const xml = `<nota numero="123"><cliente>ACME LTDA</cliente></nota>`;
    const md = xmlParaMarkdown(xml);
    expect(md).toContain('- **@numero**: 123');
    expect(md).toContain('## <cliente>');
    expect(md).toContain('ACME LTDA');
  });

  it('decodifica entidades XML padrão', () => {
    const xml = `<obs>A &amp; B &lt;teste&gt; &quot;x&quot;</obs>`;
    expect(xmlParaMarkdown(xml)).toContain('A & B <teste> "x"');
  });

  it('preserva conteúdo de CDATA sem escapar', () => {
    const xml = `<script><![CDATA[if (a < b) { return true; }]]></script>`;
    expect(xmlParaMarkdown(xml)).toContain('if (a < b) { return true; }');
  });

  it('mantém hierarquia profunda com headings crescentes', () => {
    const xml = `<a><b><c><d>fim</d></c></b></a>`;
    const md = xmlParaMarkdown(xml);
    expect(md).toContain('# <a>');
    expect(md).toContain('## <b>');
    expect(md).toContain('### <c>');
    expect(md).toContain('#### <d>');
  });
});

describe('consolidarMarkdown', () => {
  it('une múltiplos arquivos com separador e título por arquivo', () => {
    const consolidado = consolidarMarkdown([
      { nome: 'a.csv', markdown: '| x |\n| --- |\n| 1 |\n' },
      { nome: 'b.json', markdown: '- **y**: 2\n' },
    ]);
    expect(consolidado).toContain('# a.csv');
    expect(consolidado).toContain('# b.json');
    expect(consolidado).toContain('---');
    expect(consolidado.indexOf('a.csv')).toBeLessThan(consolidado.indexOf('b.json'));
  });
});
