/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Layout do almoxarifado para o Gemba (visão 3D). As coordenadas estão em px da
 * planta baixa (docs/almoxarifado/planta-baixa-almoxarifado.png, 1024×764) e viram
 * metros por `METROS_POR_PX`; alturas e profundidades já estão em metros.
 *
 * O que foi confirmado no galpão: Bloco 01 na ponta da Entrada (direita) e a
 * numeração cresce rumo ao Pórtico; Anexo 0004 = blocos 13 a 32 do depósito 0004;
 * andar 00 = chão do bloco; 102.ANEXO no Material de Apoio Manutenção.
 * O resto (larguras, alturas, ordem das estantes do anexo, grade de 30 apartamentos)
 * é valor padrão a CALIBRAR andando no galpão — todos os números ficam aqui.
 *
 * Eixos do mundo 3D: x = x da planta, z = y da planta (para baixo = sul), y = altura.
 */

import { doisDigitos, type Endereco } from './gembaEndereco';

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Retangulo = [number, number, number, number];

export interface Caixa {
  centro: Vec3;
  tamanho: Vec3;
}

/** Lado da estante voltado para o corredor (de onde se pega o material). */
export type Face = 'norte' | 'sul' | 'leste' | 'oeste';

export interface GradeApartamentos {
  andares: number[];
  colunas: number;
  /** Fileiras empilhadas dentro do andar; a 1ª é a de cima. */
  linhas: number;
}

export interface EstanteGemba {
  id: string;
  deposito: string;
  /** Caminho legível até a estante, ex.: ['Anexo 0004', 'Estante 1']. */
  trilha: string[];
  /** Linha das costas da estante na planta; o 1º bloco começa em `inicio`. */
  inicio: Vec2;
  fim: Vec2;
  face: Face;
  /** Números dos blocos na ordem a partir de `inicio`; vazio = estante sem endereçamento. */
  blocos: number[];
  larguraBlocoM: number;
  profundidadeM: number;
  /** Altura do andar 00 (chão do bloco). */
  alturaChaoM: number;
  /** Altura de cada andar a partir do 01. */
  alturasAndarM: number[];
  apartamentos?: GradeApartamentos;
  /**
   * Os vãos depois dos blocos numerados recebem, ilustrativo, o material do
   * depósito que não tem endereço (Ruas 03 e 05: projeto e kits).
   */
  semEnderecoNosVaosLivres?: boolean;
}

export interface ZonaGemba {
  id: string;
  rotulo: string;
  retangulos: Retangulo[];
  tipo: 'apoio' | 'operacao' | 'acesso';
}

export const PLANTA_LARGURA = 1024;
export const PLANTA_ALTURA = 764;
/** Escala tirada do vão de ~2,7 m: os 24 blocos da Rua 04 ocupam o comprimento da rua na planta. */
export const METROS_POR_PX = 0.115;

/** Paredes do galpão [x1, y1, x2, y2] em px. */
export const GALPAO: Retangulo = [42, 75, 990, 655];

const PORTA_PALETE = { larguraBlocoM: 2.7, profundidadeM: 1.2, alturaChaoM: 0.4 } as const;
const tresAndares = [1.6, 1.6, 1.6];
const intervalo = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => de + i);

/** Ponta da Entrada e ponta do Pórtico das ruas centrais. */
const RUA_X_ENTRADA = 725;
const RUA_X_PORTICO = 155;
/** Linha das costas dos pares 05/04 e 03/02. */
const COSTAS_05_04 = 320;
const COSTAS_03_02 = 476;

const ANEXO_COSTAS_X = [893, 918, 943, 968];
const ANEXO_Y_INICIO = 532;
const ANEXO_Y_FIM = 598;

export const ESTANTES: EstanteGemba[] = [
  {
    // Blocos 01–12 vêm do cadastro das peças da BOM (105.BBAAPP); quantos são de fato, a calibrar.
    id: 'rua_05', deposito: '0005', trilha: ['Rua 05'], face: 'norte', blocos: intervalo(1, 12),
    semEnderecoNosVaosLivres: true,
    inicio: [RUA_X_ENTRADA, COSTAS_05_04], fim: [RUA_X_PORTICO, COSTAS_05_04],
    ...PORTA_PALETE, alturasAndarM: tresAndares,
  },
  {
    id: 'rua_04', deposito: '0004', trilha: ['Rua 04'], face: 'sul',
    // Os blocos 13 a 32 do 0004 ficam no Anexo.
    blocos: [...intervalo(1, 12), ...intervalo(33, 44)],
    inicio: [RUA_X_ENTRADA, COSTAS_05_04], fim: [RUA_X_PORTICO, COSTAS_05_04],
    ...PORTA_PALETE, alturasAndarM: tresAndares,
  },
  {
    // Blocos 01–12 vêm do cadastro das peças da BOM (103.BBAAPP); quantos são de fato, a calibrar.
    id: 'rua_03', deposito: '0003', trilha: ['Rua 03'], face: 'norte', blocos: intervalo(1, 12),
    semEnderecoNosVaosLivres: true,
    inicio: [RUA_X_ENTRADA, COSTAS_03_02], fim: [RUA_X_PORTICO, COSTAS_03_02],
    ...PORTA_PALETE, alturasAndarM: tresAndares,
  },
  {
    id: 'rua_02', deposito: '0002', trilha: ['Rua 02'], face: 'sul', blocos: intervalo(1, 12),
    inicio: [RUA_X_ENTRADA, COSTAS_03_02], fim: [RUA_X_PORTICO, COSTAS_03_02],
    ...PORTA_PALETE, alturaChaoM: 0.3, alturasAndarM: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
  },
  {
    id: 'dep_0001', deposito: '0001', trilha: ['Depósito 0001'], face: 'norte', blocos: intervalo(1, 14),
    inicio: [808, 652], fim: [118, 652],
    ...PORTA_PALETE, alturasAndarM: tresAndares,
  },
  ...ANEXO_COSTAS_X.map((x, i): EstanteGemba => ({
    id: `anexo_${i + 1}`,
    deposito: '0004',
    trilha: ['Anexo 0004', `Estante ${i + 1}`],
    face: 'oeste',
    blocos: intervalo(13 + i * 5, 17 + i * 5),
    inicio: [x, ANEXO_Y_INICIO],
    fim: [x, ANEXO_Y_FIM],
    larguraBlocoM: 1.0,
    profundidadeM: 0.6,
    alturaChaoM: 0.15,
    alturasAndarM: [0.5, 0.45, 0.45],
    apartamentos: { andares: [2, 3], colunas: 10, linhas: 3 },
  })),
];

export const ZONAS: ZonaGemba[] = [
  { id: 'portico', rotulo: 'Estacionamento Pórtico', retangulos: [[85, 80, 200, 190]], tipo: 'operacao' },
  { id: 'apoio_producao', rotulo: 'Material Apoio Produção', retangulos: [[200, 80, 330, 140]], tipo: 'apoio' },
  { id: 'empilhadeiras', rotulo: 'Estacionamento Empilhadeiras', retangulos: [[390, 80, 500, 190]], tipo: 'operacao' },
  { id: 'montagem_kits', rotulo: 'Área de Montagem de Kits', retangulos: [[500, 80, 705, 190]], tipo: 'operacao' },
  { id: 'segregados', rotulo: 'Segregados e Expedição', retangulos: [[705, 80, 850, 190]], tipo: 'operacao' },
  { id: 'balcao', rotulo: 'Balcão de Atendimento', retangulos: [[850, 80, 988, 190]], tipo: 'acesso' },
  { id: 'entrada', rotulo: 'Entrada Principal', retangulos: [[935, 195, 988, 285]], tipo: 'acesso' },
  {
    id: 'apoio_manutencao', rotulo: 'Material Apoio Manutenção',
    retangulos: [[45, 135, 78, 368], [45, 378, 78, 640]], tipo: 'apoio',
  },
  { id: 'recebimento', rotulo: 'Recebimento · Depósito 1000', retangulos: [[810, 285, 988, 395]], tipo: 'operacao' },
  { id: 'compra_direta', rotulo: 'Compra Direta · 0050', retangulos: [[810, 395, 988, 455]], tipo: 'operacao' },
  { id: 'descompressao', rotulo: 'Área de Descompressão', retangulos: [[915, 458, 988, 505]], tipo: 'apoio' },
  { id: 'anexo', rotulo: 'Anexo 0004', retangulos: [[865, 510, 988, 605]], tipo: 'apoio' },
  { id: 'saida', rotulo: 'Saída', retangulos: [[848, 625, 890, 652]], tipo: 'acesso' },
];

/** Descrição de cada depósito como está escrita na planta baixa. */
export const DESCRICAO_DEPOSITO_PLANTA: Record<string, string> = {
  '0001': 'Armazenagem geral',
  '0002': 'EPIs, fardamentos, consumíveis e obsoletos',
  '0003': 'Projeto atual',
  '0004': 'Itens de manutenção',
  '0005': 'Materiais para kits e itens produtivos',
};

export interface Corredor {
  /** Eixo do corredor na planta (px), de uma ponta à outra. */
  de: Vec2;
  ate: Vec2;
  /** Largura entre as faixas amarelas (px). */
  largura: number;
}

/**
 * Corredores de tráfego (faixas amarelas e setas de mão dupla, como na planta):
 * três entre as ruas e dois verticais, um de cada lado das ruas.
 */
export const CORREDORES: Corredor[] = [
  { de: [140, 250], ate: [750, 250], largura: 84 },
  { de: [140, 398], ate: [750, 398], largura: 100 },
  { de: [140, 564], ate: [750, 564], largura: 120 },
  { de: [110, 205], ate: [110, 600], largura: 44 },
  { de: [772, 205], ate: [772, 600], largura: 44 },
];

/** Depósitos que são uma área, não uma estante. */
const DEPOSITO_ZONA: Record<string, string> = { '0050': 'compra_direta', '1000': 'recebimento' };

const NORMAL: Record<Face, Vec2> = { norte: [0, -1], sul: [0, 1], leste: [1, 0], oeste: [-1, 0] };

/** Direção (x, z) para onde a face da estante olha. */
export function normalDaFace(face: Face): Vec2 {
  return NORMAL[face];
}

export function pxParaM(p: Vec2): Vec2 {
  return [p[0] * METROS_POR_PX, p[1] * METROS_POR_PX];
}

function eixoDaEstante(e: EstanteGemba): { origem: Vec2; u: Vec2; n: Vec2; comprimentoM: number } {
  const origem = pxParaM(e.inicio);
  const fim = pxParaM(e.fim);
  const dx = fim[0] - origem[0];
  const dz = fim[1] - origem[1];
  const comprimentoM = Math.hypot(dx, dz);
  return { origem, u: [dx / comprimentoM, dz / comprimentoM], n: NORMAL[e.face], comprimentoM };
}

/** A estante corre ao longo do eixo x (ruas) ou do z (estantes do anexo). */
export function estanteAoLongoDeX(e: EstanteGemba): boolean {
  const { u } = eixoDaEstante(e);
  return Math.abs(u[0]) > Math.abs(u[1]);
}

export function alturaDaEstante(e: EstanteGemba): number {
  return e.alturaChaoM + e.alturasAndarM.reduce((s, h) => s + h, 0);
}

/** Vãos desenhados: os blocos endereçados e, depois deles, vãos sem número até o fim da linha. */
export function quantidadeVaos(e: EstanteGemba): number {
  const { comprimentoM } = eixoDaEstante(e);
  return Math.max(e.blocos.length, Math.floor(comprimentoM / e.larguraBlocoM + 1e-6));
}

/** Faixa de altura [de, ate] do andar; 0 = chão do bloco. */
export function faixaDoAndar(e: EstanteGemba, andar: number): [number, number] | null {
  if (andar === 0) return [0, e.alturaChaoM];
  if (andar < 1 || andar > e.alturasAndarM.length) return null;
  let de = e.alturaChaoM;
  for (let i = 1; i < andar; i++) de += e.alturasAndarM[i - 1];
  return [de, de + e.alturasAndarM[andar - 1]];
}

/**
 * Caixa de um trecho do vão `indice`: ao longo da estante de `ao[0]` a `ao[1]`
 * (fração do vão) e na altura `[de, ate]`.
 */
function caixaNoVao(e: EstanteGemba, indice: number, altura: [number, number], ao: Vec2 = [0, 1]): Caixa {
  const { origem, u, n } = eixoDaEstante(e);
  const s0 = (indice + ao[0]) * e.larguraBlocoM;
  const s1 = (indice + ao[1]) * e.larguraBlocoM;
  const meio = (s0 + s1) / 2;
  const x = origem[0] + u[0] * meio + n[0] * (e.profundidadeM / 2);
  const z = origem[1] + u[1] * meio + n[1] * (e.profundidadeM / 2);
  const comprimento = s1 - s0;
  const aoLongoDeX = Math.abs(u[0]) > Math.abs(u[1]);
  return {
    centro: [x, (altura[0] + altura[1]) / 2, z],
    tamanho: aoLongoDeX
      ? [comprimento, altura[1] - altura[0], e.profundidadeM]
      : [e.profundidadeM, altura[1] - altura[0], comprimento],
  };
}

export function caixaDoVao(e: EstanteGemba, indice: number): Caixa {
  return caixaNoVao(e, indice, [0, alturaDaEstante(e)]);
}

export function caixaDoAndar(e: EstanteGemba, indice: number, andar: number): Caixa | null {
  const faixa = faixaDoAndar(e, andar);
  return faixa ? caixaNoVao(e, indice, faixa) : null;
}

/** Apartamento numerado da esquerda para a direita (sentido da estante) e de cima para baixo. */
export function caixaDoApartamento(e: EstanteGemba, indice: number, andar: number, apartamento: number): Caixa | null {
  const grade = e.apartamentos;
  const faixa = faixaDoAndar(e, andar);
  if (!grade || !faixa || !grade.andares.includes(andar)) return null;
  const coluna = (apartamento - 1) % grade.colunas;
  const linha = Math.floor((apartamento - 1) / grade.colunas);
  if (apartamento < 1 || linha >= grade.linhas) return null;
  const alturaLinha = (faixa[1] - faixa[0]) / grade.linhas;
  const topo = faixa[1] - linha * alturaLinha;
  return caixaNoVao(e, indice, [topo - alturaLinha, topo], [coluna / grade.colunas, (coluna + 1) / grade.colunas]);
}

export function caixaDaEstante(e: EstanteGemba): Caixa {
  return uniaoDeCaixas(Array.from({ length: quantidadeVaos(e) }, (_, i) => caixaDoVao(e, i)));
}

/** Placa no chão de uma zona, com altura simbólica para aparecer no destaque. */
export function caixaDoRetangulo(r: Retangulo, altura = 0.1): Caixa {
  const [x1, z1] = pxParaM([r[0], r[1]]);
  const [x2, z2] = pxParaM([r[2], r[3]]);
  return { centro: [(x1 + x2) / 2, altura / 2, (z1 + z2) / 2], tamanho: [x2 - x1, altura, z2 - z1] };
}

export function uniaoDeCaixas(caixas: Caixa[]): Caixa {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const c of caixas) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], c.centro[k] - c.tamanho[k] / 2);
      max[k] = Math.max(max[k], c.centro[k] + c.tamanho[k] / 2);
    }
  }
  return {
    centro: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    tamanho: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

export function centroDoGalpao(): Vec3 {
  return caixaDoRetangulo(GALPAO, 0).centro;
}

export function chaveBloco(deposito: string, bloco: number): string {
  return `${deposito}.${doisDigitos(bloco)}`;
}

/** Estante e índice do vão onde o bloco do depósito está. */
export function acharBloco(deposito: string, bloco: number): { estante: EstanteGemba; indice: number } | null {
  for (const estante of ESTANTES) {
    if (estante.deposito !== deposito) continue;
    const indice = estante.blocos.indexOf(bloco);
    if (indice >= 0) return { estante, indice };
  }
  return null;
}

export interface Vista {
  camera: Vec3;
  alvo: Vec3;
  /** Largura × profundidade (m) que precisam caber na tela; a câmera recua conforme a proporção dela. */
  enquadrar?: Vec2;
}

/** Prateleira exata do endereço, para a vista 2D de frente. `andar` e `apartamento` só quando o mapa os acha. */
export interface AlvoPrateleira {
  estanteId: string;
  indice: number;
  andar?: number;
  apartamento?: number;
}

export interface Localizacao {
  caixas: Caixa[];
  /** Presente quando o endereço cai num bloco de uma estante. */
  alvo?: AlvoPrateleira;
  /** Ids das estantes ou zonas envolvidas. */
  estruturas: string[];
  trilha: string[];
  /** O endereço existe, mas o mapa só acha o bloco/andar (ou só o depósito). */
  aproximado: boolean;
  vista: Vista;
}

/** Câmera no corredor, de frente para a face da estante. */
function vistaDeFrente(caixa: Caixa, face: Face, distancia: number): Vista {
  const n = NORMAL[face];
  const [x, y, z] = caixa.centro;
  return { alvo: [x, y, z], camera: [x + n[0] * distancia, Math.max(1.7, y + distancia * 0.3), z + n[1] * distancia] };
}

/** Câmera alta, olhando de sul para norte, para áreas grandes. */
/**
 * Câmera dentro do corredor de uma estante leve (anexo): as estantes ficam a menos
 * de 3 m uma da outra, então recuar de frente põe a câmera atrás da vizinha. Fica
 * perto da face, um pouco acima, e recua ao longo do corredor para olhar na diagonal.
 */
function vistaNoCorredor(caixa: Caixa, e: EstanteGemba): Vista {
  const n = NORMAL[e.face];
  const { u } = eixoDaEstante(e);
  const [x, y, z] = caixa.centro;
  const afastamento = 1.7;
  const recuo = 3.2;
  return {
    alvo: [x, y, z],
    camera: [x + n[0] * afastamento - u[0] * recuo, y + 1.3, z + n[1] * afastamento - u[1] * recuo],
  };
}

function vistaDeCima(caixa: Caixa): Vista {
  const [x, y, z] = caixa.centro;
  const vao = Math.max(caixa.tamanho[0], caixa.tamanho[2], 8);
  return {
    alvo: [x, y, z],
    camera: [x, y + vao * 0.8, z + vao * 0.7],
    enquadrar: [Math.max(caixa.tamanho[0], 8), Math.max(caixa.tamanho[2], 8)],
  };
}

function localizarZona(id: string, trilha?: string[]): Localizacao | null {
  const zona = ZONAS.find(z => z.id === id);
  if (zona) {
    const caixas = zona.retangulos.map(r => caixaDoRetangulo(r, 0.3));
    return { caixas, estruturas: [zona.id], trilha: trilha ?? [zona.rotulo], aproximado: false, vista: vistaDeCima(uniaoDeCaixas(caixas)) };
  }
  const estante = ESTANTES.find(e => e.id === id);
  if (estante) {
    const caixa = caixaDaEstante(estante);
    return { caixas: [caixa], estruturas: [estante.id], trilha: trilha ?? estante.trilha, aproximado: false, vista: vistaDeCima(caixa) };
  }
  return null;
}

/** Todas as estantes do depósito (ou a área dele). */
export function localizarDeposito(deposito: string): Localizacao | null {
  const zona = DEPOSITO_ZONA[deposito];
  if (zona) return localizarZona(zona, [`Depósito ${deposito}`]);
  const estantes = ESTANTES.filter(e => e.deposito === deposito);
  if (estantes.length === 0) return null;
  const caixas = estantes.map(caixaDaEstante);
  const grupos = [...new Set(estantes.map(e => e.trilha[0]))];
  return {
    caixas,
    estruturas: estantes.map(e => e.id),
    trilha: [`Depósito ${deposito}`, grupos.join(' + ')],
    aproximado: true,
    vista: vistaDeCima(uniaoDeCaixas(caixas)),
  };
}

/** Onde o endereço fica no galpão; `null` quando não há lugar no mapa. */
export function localizar(endereco: Endereco): Localizacao | null {
  if (endereco.tipo === 'fora') return null;
  if (endereco.tipo === 'zona') return localizarZona(endereco.zona);
  if (endereco.tipo === 'deposito') return localizarDeposito(endereco.deposito);

  const achado = acharBloco(endereco.deposito, endereco.bloco);
  if (!achado) return localizarDeposito(endereco.deposito);
  const { estante, indice } = achado;
  const trilha = [...estante.trilha, `Bloco ${doisDigitos(endereco.bloco)}`];

  let caixa: Caixa | null = null;
  let aproximado = false;
  const alvo: AlvoPrateleira = { estanteId: estante.id, indice };
  const andar = caixaDoAndar(estante, indice, endereco.andar);
  if (andar) {
    trilha.push(endereco.andar === 0 ? 'Chão' : `Andar ${doisDigitos(endereco.andar)}`);
    caixa = andar;
    alvo.andar = endereco.andar;
    if (endereco.apartamento != null) {
      trilha.push(`Apto ${doisDigitos(endereco.apartamento)}`);
      const apto = caixaDoApartamento(estante, indice, endereco.andar, endereco.apartamento);
      if (apto) {
        caixa = apto;
        alvo.apartamento = endereco.apartamento;
      } else aproximado = true;
    }
  } else {
    trilha.push(`Andar ${doisDigitos(endereco.andar)}`);
    caixa = caixaDoVao(estante, indice);
    aproximado = true;
  }

  const vista = estante.apartamentos ? vistaNoCorredor(caixa, estante) : vistaDeFrente(caixa, estante.face, 10);
  return { caixas: [caixa], alvo, estruturas: [estante.id], trilha, aproximado, vista };
}

/** Retângulo [x1, y1, x2, y2] do vão na planta, em px. */
export function retanguloDoVaoPx(e: EstanteGemba, indice: number): Retangulo {
  const { u, n } = eixoDaEstante(e);
  const passo = e.larguraBlocoM / METROS_POR_PX;
  const profundidade = e.profundidadeM / METROS_POR_PX;
  const ax = e.inicio[0] + u[0] * passo * indice;
  const ay = e.inicio[1] + u[1] * passo * indice;
  const bx = ax + u[0] * passo;
  const by = ay + u[1] * passo;
  const xs = [ax, bx, ax + n[0] * profundidade, bx + n[0] * profundidade];
  const ys = [ay, by, ay + n[1] * profundidade, by + n[1] * profundidade];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Quem está de pé no corredor, de frente para a estante, vê a numeração dos blocos
 * crescer para a esquerda (a estante corre para a esquerda de quem olha)?
 */
export function numeracaoInvertidaDeFrente(e: EstanteGemba): boolean {
  const { u, n } = eixoDaEstante(e);
  // Quem olha para -n tem a mão direita em (n.z, -n.x) no plano da planta.
  return u[0] * n[1] - u[1] * n[0] < 0;
}

/**
 * Vãos que a vista de frente mostra: `quantidade` vãos com o `indice` no meio (a
 * janela desliza nas pontas), na ordem em que aparecem da esquerda para a direita.
 */
export function vaosDaVistaDeFrente(e: EstanteGemba, indice: number, quantidade = 3): number[] {
  const total = quantidadeVaos(e);
  const n = Math.min(quantidade, total);
  const inicio = Math.min(Math.max(indice - Math.floor(n / 2), 0), total - n);
  const lista = Array.from({ length: n }, (_, k) => inicio + k);
  return numeracaoInvertidaDeFrente(e) ? lista.reverse() : lista;
}

/** Câmera de frente para um vão clicado. */
export function vistaDoVao(e: EstanteGemba, indice: number): Vista {
  return e.apartamentos ? vistaNoCorredor(caixaDoVao(e, indice), e) : vistaDeFrente(caixaDoVao(e, indice), e.face, 11);
}

export interface VistaRapida {
  id: string;
  rotulo: string;
  vista: Vista;
}

/** Atalhos do "Ir para": cada rua vista do seu corredor, o Anexo de cima e o apoio. */
export function vistasRapidas(): VistaRapida[] {
  const lista: VistaRapida[] = [];
  for (const e of ESTANTES) {
    if (e.apartamentos) continue;
    const caixa = caixaDaEstante(e);
    const n = NORMAL[e.face];
    const [x, , z] = caixa.centro;
    const comprimento = Math.max(caixa.tamanho[0], caixa.tamanho[2]);
    lista.push({
      id: e.id,
      rotulo: e.trilha.join(' · '),
      vista: {
        alvo: [x, 1.2, z],
        camera: [x + n[0] * comprimento * 0.35, comprimento * 0.3, z + n[1] * comprimento * 0.35],
        enquadrar: [comprimento, 6],
      },
    });
  }
  // Anexo: de sul para norte, olhando dentro dos corredores entre as 4 estantes.
  const anexo = uniaoDeCaixas(ESTANTES.filter(e => e.apartamentos).map(caixaDaEstante));
  const [ax, , az] = anexo.centro;
  lista.push({
    id: 'anexo',
    rotulo: 'Anexo 0004',
    vista: { alvo: [ax, 0.8, az], camera: [ax - 3, 9, az + 13] },
  });
  const apoio = localizarZona('apoio_manutencao');
  if (apoio) lista.push({ id: 'apoio_manutencao', rotulo: 'Material Apoio Manutenção', vista: apoio.vista });
  return lista.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true }));
}

/** Vista do galpão inteiro. */
export function vistaGeral(): Vista {
  const [x, , z] = centroDoGalpao();
  const largura = (GALPAO[2] - GALPAO[0]) * METROS_POR_PX;
  const profundidade = (GALPAO[3] - GALPAO[1]) * METROS_POR_PX;
  return { alvo: [x, 0, z], camera: [x + largura * 0.08, largura * 0.55, z + largura * 0.62], enquadrar: [largura, profundidade] };
}

/** Planta vista de cima. */
export function vistaPlanta(): Vista {
  const [x, , z] = centroDoGalpao();
  const largura = (GALPAO[2] - GALPAO[0]) * METROS_POR_PX;
  const profundidade = (GALPAO[3] - GALPAO[1]) * METROS_POR_PX;
  return { alvo: [x, 0, z], camera: [x, largura * 1.05, z + 0.01], enquadrar: [largura, profundidade] };
}
