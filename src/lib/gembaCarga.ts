/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * O que aparece nas prateleiras do Gemba. Só há carga onde a ZL0024 tem saldo:
 * prateleira vazia no mapa é prateleira vazia no galpão (o 5.5 manda checar
 * posições vazias antes de guardar material novo).
 *
 * O formato da carga vem da descrição do material (bobina para cabo, balde para
 * tinta, perfil para chapa...). É uma representação, não a foto do item: serve
 * para o olho separar "caixa" de "saco" de "bobina" ao andar pelo mapa.
 */

import type { ItemGemba, IndiceGemba } from './gembaIndice';
import {
  ESTANTES, ZONAS, acharBloco, caixaDoAndar, caixaDoApartamento, estanteAoLongoDeX, faixaDoAndar, pxParaM,
  quantidadeVaos, type Caixa, type EstanteGemba, type Vec3,
} from './gembaLayout';

export type TipoCarga = 'caixa' | 'epi' | 'saco' | 'fardo' | 'bobina' | 'balde' | 'perfil' | 'miudeza';

export const ROTULO_CARGA: Record<TipoCarga, string> = {
  caixa: 'Caixa',
  epi: 'EPI',
  saco: 'Saco',
  fardo: 'Fardo',
  bobina: 'Bobina',
  balde: 'Balde / lata',
  perfil: 'Perfil / chapa',
  miudeza: 'Miudeza (bins)',
};

/** Ordem importa: a 1ª regra que casar vence (ESTANHO SOLDA FIO é miudeza, não bobina). */
const REGRAS: Array<[TipoCarga, RegExp]> = [
  ['balde', /\b(TINTA|OLEO|GRAXA|SOLVENTE|THINNER|DILUENTE|VERNIZ|PRIMER|ADESIVO|COLA|DESENGRAXANTE|LUBRIFICANTE|RESINA|ESMALTE|SILICONE|CATALISADOR|ANTIRESPINGO|DESMOLDANTE)\b/],
  ['saco', /\b(CIMENTO|ARGAMASSA|CAL|GESSO|AREIA|SACO|SACOS|GRANALHA|ABSORVENTE|SERRAGEM|FLUXO)\b/],
  ['epi', /\b(LUVA|LUVAS|CAPACETE|BOTA|BOTINA|OCULOS|PROTETOR|MASCARA|RESPIRADOR|CINTO|TALABARTE|PERNEIRA|MANGOTE|EPI)\b/],
  ['fardo', /\b(FARDAMENTO|UNIFORME|CAMISA|CAMISETA|CALCA|JAQUETA|PANO|ESTOPA|LONA|FILME|STRETCH|MANTA|TOALHA|AVENTAL|CAPA|COBERTOR)\b/],
  ['miudeza', /\b(PARAFUSO|PORCA|ARRUELA|REBITE|ABRACADEIRA|TERMINAL|CONECTOR|PINO|BUCHA|BROCA|ELETRODO|DISCO|LIXA|FUSIVEL|RELE|LAMPADA|ROLAMENTO|ANEL|ORING|GRAMPO|ESTANHO|BATERIA|PILHA|BICO|PONTEIRA|INSERTO|MACHO|CHAVETA|ESPACADOR)\b/],
  ['bobina', /\b(CABO|CABOS|FIO|FIOS|MANGUEIRA|CORDA|CORRENTE|BOBINA|CORDOALHA|ARAME|CINTA|FITA)\b/],
  ['perfil', /\b(CHAPA|BARRA|TUBO|PERFIL|CANTONEIRA|VERGALHAO|VIGA|ELETRODUTO|TRILHO|METALON|VERGA|TELHA|CALHA|ESTRUTURA)\b/],
];

const UMB_PARA_TIPO: Record<string, TipoCarga> = {
  SC: 'saco', RL: 'bobina', BOB: 'bobina', GL: 'balde', LT: 'balde', L: 'balde', BD: 'balde', LA: 'balde', BR: 'perfil',
};

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

export function tipoDeCarga(descricao: string, umb = ''): TipoCarga {
  const d = normalizar(descricao);
  for (const [tipo, regra] of REGRAS) if (regra.test(d)) return tipo;
  return UMB_PARA_TIPO[normalizar(umb).trim()] ?? 'caixa';
}

/** Um material num andar (ou apartamento) de um vão. */
export interface CargaNoAndar {
  estanteId: string;
  indiceVao: number;
  andar: number;
  apartamento: number | null;
  tipo: TipoCarga;
  codigo: string;
  /** Sem endereço: o material está no depósito, mas o lugar no vão é ilustrativo. */
  semEndereco: boolean;
}

function temSaldo(item: ItemGemba, saldoLocal: number | null, origem: string): boolean {
  if (saldoLocal != null) return saldoLocal > 0;
  return origem === 'cadastro' && item.saldoTotal > 0;
}

/**
 * Cargas a desenhar: uma por material com saldo em cada posição endereçada; os
 * materiais sem endereço de ruas sem endereçamento (0003, 0005) ocupam os vãos
 * dessas ruas em sequência, só para mostrar quanto material há nelas.
 */
export function montarCargas(indice: IndiceGemba): { cargas: CargaNoAndar[]; porZona: Record<string, number> } {
  const cargas: CargaNoAndar[] = [];
  const porZona: Record<string, number> = {};
  const semEnderecoPorDeposito = new Map<string, ItemGemba[]>();

  for (const item of indice.itens) {
    const tipo = tipoDeCarga(item.descricao, item.umb);
    for (const local of item.locais) {
      const e = local.endereco;
      if (!e || !temSaldo(item, local.saldo, local.origem)) continue;
      if (e.tipo === 'zona') {
        porZona[e.zona] = (porZona[e.zona] ?? 0) + 1;
      } else if (e.tipo === 'deposito') {
        const lista = semEnderecoPorDeposito.get(e.deposito) ?? [];
        lista.push(item);
        semEnderecoPorDeposito.set(e.deposito, lista);
      } else if (e.tipo === 'prateleira') {
        const achado = acharBloco(e.deposito, e.bloco);
        if (!achado || !faixaDoAndar(achado.estante, e.andar)) continue;
        cargas.push({
          estanteId: achado.estante.id, indiceVao: achado.indice, andar: e.andar, apartamento: e.apartamento,
          tipo, codigo: item.codigo, semEndereco: false,
        });
      }
    }
  }

  for (const [deposito, itens] of semEnderecoPorDeposito) {
    const estante = ESTANTES.find(e => e.deposito === deposito && e.blocos.length === 0);
    if (!estante) continue;
    const vaos = quantidadeVaos(estante);
    const andares = estante.alturasAndarM.length + 1;
    itens.slice(0, vaos * andares * 2).forEach((item, n) => {
      const slot = Math.floor(n / 2);
      cargas.push({
        estanteId: estante.id, indiceVao: slot % vaos, andar: Math.floor(slot / vaos) % andares, apartamento: null,
        tipo: tipoDeCarga(item.descricao, item.umb), codigo: item.codigo, semEndereco: true,
      });
    });
  }
  return { cargas, porZona };
}

// ---------------------------------------------------------------------------
// Peças 3D (puras: posição, escala e giro; o componente só instancia)
// ---------------------------------------------------------------------------

export type FormaPeca = 'palete' | 'caixa' | 'saco' | 'bobina' | 'flange' | 'balde' | 'perfil' | 'bin';

export interface Peca {
  forma: FormaPeca;
  centro: Vec3;
  /** Escala local antes do giro (cilindros deitados têm o eixo em x). */
  escala: Vec3;
  giroY: number;
  cor: string;
}

export const COR_CARGA: Record<TipoCarga, string> = {
  caixa: '#b08956',
  epi: '#e3b33a',
  saco: '#e4ded0',
  fardo: '#8fb0c6',
  bobina: '#24272b',
  balde: '#6f8396',
  perfil: '#a7afb7',
  miudeza: '#2e6fb7',
};
const COR_PALETE = '#a87a42';
const COR_FLANGE = '#9c7a45';
const CORES_BIN = ['#c0392b', '#2e6fb7', '#e0a526', '#2f8f5b', '#7a5c4f'];
export const COR_BIN_VAZIO = '#cdd5de';

const LONGARINA = 0.12;

/** Gerador determinístico por material: a mesma carga sempre sai igual. */
function sementeDe(texto: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clareia ou escurece um pouco a cor, para pilhas não parecerem um bloco só. */
function variar(cor: string, rnd: () => number, amplitude = 0.12): string {
  const n = parseInt(cor.slice(1), 16);
  const k = 1 + (rnd() - 0.5) * 2 * amplitude;
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Base de um sub-vão: chão central, comprimento ao longo da estante, profundidade e altura úteis. */
interface Base {
  x: number;
  y: number;
  z: number;
  comprimento: number;
  profundidade: number;
  altura: number;
  aoX: boolean;
}

function colocar(
  b: Base, forma: FormaPeca, cor: string,
  ao: number, y: number, prof: number,
  sAo: number, sY: number, sProf: number, giroY = 0,
): Peca {
  return b.aoX
    ? { forma, cor, giroY, centro: [b.x + ao, b.y + y, b.z + prof], escala: [sAo, sY, sProf] }
    : { forma, cor, giroY, centro: [b.x + prof, b.y + y, b.z + ao], escala: [sProf, sY, sAo] };
}

function gerarCarga(tipo: TipoCarga, b: Base, rnd: () => number): Peca[] {
  const P: Peca[] = [];
  const W = b.comprimento * 0.9;
  const D = b.profundidade * 0.86;
  const H = b.altura;
  const cor = COR_CARGA[tipo];
  const jit = () => (rnd() - 0.5) * 0.12;

  switch (tipo) {
    case 'caixa':
    case 'epi': {
      const cols = W > 1.1 ? 2 : 1;
      const linhas = D > 0.55 ? 2 : 1;
      const alturaCaixa = Math.min(0.42, Math.max(0.12, H * 0.42));
      const camadas = Math.max(1, Math.min(3, Math.floor((H * (0.55 + rnd() * 0.4)) / alturaCaixa)));
      const w = W / cols, d = D / linhas;
      for (let c = 0; c < camadas; c++) {
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < linhas; j++) {
            if (c === camadas - 1 && c > 0 && rnd() < 0.3) continue;
            P.push(colocar(b, 'caixa', variar(cor, rnd), -W / 2 + (i + 0.5) * w, (c + 0.5) * alturaCaixa, -D / 2 + (j + 0.5) * d,
              w * 0.93, alturaCaixa * 0.96, d * 0.93, jit() * 0.6));
          }
        }
      }
      break;
    }
    case 'saco': {
      const h = Math.min(0.2, H / 3);
      const camadas = Math.max(1, Math.min(4, Math.floor((H * 0.8) / h)));
      for (let c = 0; c < camadas; c++) {
        const cruzado = c % 2 === 1;
        for (let i = 0; i < 2; i++) {
          const ao = cruzado ? 0 : -W / 4 + i * (W / 2);
          const prof = cruzado ? -D / 4 + i * (D / 2) : 0;
          P.push(colocar(b, 'saco', variar(cor, rnd, 0.06), ao, (c + 0.5) * h, prof,
            cruzado ? W * 0.9 : W * 0.46, h * 1.1, cruzado ? D * 0.46 : D * 0.9, jit()));
        }
      }
      break;
    }
    case 'fardo': {
      const h = Math.min(0.38, H / 2);
      const camadas = H > 0.8 && rnd() < 0.6 ? 2 : 1;
      for (let c = 0; c < camadas; c++) {
        const n = c === 0 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          P.push(colocar(b, 'saco', variar(cor, rnd, 0.08), -W / 2 + (i + 0.5) * (W / n), (c + 0.5) * h, jit() * D,
            (W / n) * 1.1, h * 1.05, D * 0.85, jit() * 3));
        }
      }
      break;
    }
    case 'bobina': {
      const dia = Math.min(H * 0.92, D, 1.0);
      const n = Math.max(1, Math.min(2, Math.floor(W / (dia * 1.08))));
      const comp = D * 0.9;
      // O eixo do cilindro é x; gira para ficar na profundidade da estante.
      const giro = b.aoX ? Math.PI / 2 : 0;
      for (let i = 0; i < n; i++) {
        const ao = -W / 2 + (i + 0.5) * (W / n);
        const corpo = colocar(b, 'bobina', variar(cor, rnd, 0.1), ao, dia / 2, 0, 0, 0, 0, giro);
        corpo.escala = [comp * 0.86, dia * 0.8, dia * 0.8];
        P.push(corpo);
        for (const lado of [-1, 1]) {
          const fl = colocar(b, 'flange', COR_FLANGE, ao, dia / 2, lado * comp * 0.45, 0, 0, 0, giro);
          fl.escala = [0.05, dia, dia];
          P.push(fl);
        }
      }
      break;
    }
    case 'balde': {
      const r = 0.17;
      const cols = Math.max(1, Math.min(4, Math.floor(W / (2 * r + 0.06))));
      const linhas = Math.max(1, Math.min(2, Math.floor(D / (2 * r + 0.06))));
      const camadas = H > 0.95 && rnd() < 0.5 ? 2 : 1;
      for (let c = 0; c < camadas; c++) {
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < linhas; j++) {
            P.push(colocar(b, 'balde', variar(cor, rnd, 0.1), -W / 2 + (i + 0.5) * (W / cols), c * 0.4 + 0.18,
              -D / 2 + (j + 0.5) * (D / linhas), 2 * r, 0.36, 2 * r));
          }
        }
      }
      break;
    }
    case 'perfil': {
      const e = 0.07;
      const camadas = Math.max(2, Math.min(6, Math.floor((H * 0.7) / e)));
      for (let c = 0; c < camadas; c++) {
        for (let j = 0; j < 2; j++) {
          P.push(colocar(b, 'perfil', variar(cor, rnd, 0.08), jit() * 0.3, (c + 0.5) * e, -D / 4 + j * (D / 2),
            W * 0.98, e * 0.9, D * 0.42));
        }
      }
      break;
    }
    case 'miudeza': {
      const w = 0.3, h = Math.min(0.18, H * 0.4), d = Math.min(0.4, D);
      const cols = Math.max(1, Math.min(6, Math.floor(W / (w + 0.03))));
      const camadas = H > 0.5 ? 2 : 1;
      for (let c = 0; c < camadas; c++) {
        for (let i = 0; i < cols; i++) {
          P.push(colocar(b, 'bin', CORES_BIN[Math.floor(rnd() * CORES_BIN.length)], -W / 2 + (i + 0.5) * (W / cols),
            (c + 0.5) * (h + 0.02), 0, (W / cols) * 0.9, h, d));
        }
      }
      break;
    }
  }
  return P;
}

/** Pallets só em porta-pallet de vão largo e andar alto. */
function usaPalete(e: EstanteGemba, altura: number, tipo: TipoCarga): boolean {
  return e.larguraBlocoM >= 2 && altura >= 0.75 && tipo !== 'miudeza';
}

const ALTURA_PALETE = 0.15;

/** Peças de carga de uma estante (inclui todos os bins do anexo, cheios ou vazios). */
export function pecasDaEstante(e: EstanteGemba, cargas: CargaNoAndar[]): Peca[] {
  const pecas: Peca[] = [];
  const aoX = estanteAoLongoDeX(e);
  const porSlot = new Map<string, CargaNoAndar[]>();
  const aptosCheios = new Map<string, CargaNoAndar>();

  for (const c of cargas) {
    if (c.estanteId !== e.id) continue;
    if (e.apartamentos?.andares.includes(c.andar) && c.apartamento != null) {
      aptosCheios.set(`${c.indiceVao}|${c.andar}|${c.apartamento}`, c);
      continue;
    }
    const chave = `${c.indiceVao}|${c.andar}`;
    const lista = porSlot.get(chave) ?? [];
    lista.push(c);
    porSlot.set(chave, lista);
  }

  for (const [chave, lista] of porSlot) {
    const [indiceVao, andar] = chave.split('|').map(Number);
    const slot = caixaDoAndar(e, indiceVao, andar);
    if (!slot) continue;
    const comprimentoVao = aoX ? slot.tamanho[0] : slot.tamanho[2];
    const alturaUtil = slot.tamanho[1] - (andar === 0 ? 0.05 : LONGARINA) - 0.06;
    const subs = Math.min(lista.length, e.larguraBlocoM >= 2 ? 3 : 2);
    const larguraSub = comprimentoVao / subs;
    const inicio = (aoX ? slot.centro[0] : slot.centro[2]) - comprimentoVao / 2;
    const chao = slot.centro[1] - slot.tamanho[1] / 2;

    for (let j = 0; j < subs; j++) {
      const carga = lista[j];
      const rnd = sementeDe(`${carga.codigo}|${chave}`);
      const meio = inicio + (j + 0.5) * larguraSub;
      let base: Base = {
        x: aoX ? meio : slot.centro[0],
        z: aoX ? slot.centro[2] : meio,
        y: chao,
        comprimento: larguraSub,
        profundidade: e.profundidadeM,
        altura: alturaUtil,
        aoX,
      };
      if (usaPalete(e, alturaUtil, carga.tipo)) {
        pecas.push(colocar(base, 'palete', COR_PALETE, 0, 0, 0, Math.min(1.2, larguraSub * 0.92), 1, Math.min(1.0, e.profundidadeM * 0.9)));
        base = { ...base, y: chao + ALTURA_PALETE, altura: alturaUtil - ALTURA_PALETE, comprimento: Math.min(1.2, larguraSub * 0.92) / 0.9 };
      }
      pecas.push(...gerarCarga(carga.tipo, base, rnd));
    }
  }

  if (e.apartamentos) {
    const total = e.apartamentos.colunas * e.apartamentos.linhas;
    for (let i = 0; i < Math.min(quantidadeVaos(e), e.blocos.length); i++) {
      for (const andar of e.apartamentos.andares) {
        for (let ap = 1; ap <= total; ap++) {
          const c = caixaDoApartamento(e, i, andar, ap);
          if (!c) continue;
          const cheio = aptosCheios.get(`${i}|${andar}|${ap}`);
          const [sx, sy, sz] = c.tamanho;
          pecas.push({
            forma: 'bin',
            centro: [c.centro[0], c.centro[1] - sy * 0.08, c.centro[2]],
            escala: [sx * 0.86, sy * 0.78, sz * 0.86],
            giroY: 0,
            cor: cheio ? CORES_BIN[Math.floor(sementeDe(cheio.codigo)() * CORES_BIN.length)] : COR_BIN_VAZIO,
          });
        }
      }
    }
  }
  return pecas;
}

/** Estante leve do Material de Apoio Manutenção, com uma caixa por item que está lá. */
export function pecasDoApoio(zonaId: string, quantidade: number): { estrutura: Caixa[]; pecas: Peca[] } {
  const zona = ZONAS.find(z => z.id === zonaId);
  const estrutura: Caixa[] = [];
  const pecas: Peca[] = [];
  if (!zona) return { estrutura, pecas };
  const niveis = [0.45, 0.95, 1.45, 1.95];
  const profundidade = 0.6;
  let restantes = quantidade;
  const rnd = sementeDe(zonaId);

  for (const r of zona.retangulos) {
    const [x1, z1] = pxParaM([r[0], r[1]]);
    const [, z2] = pxParaM([r[2], r[3]]);
    const x = x1 + 0.3 + profundidade / 2;
    const ini = z1 + 0.8;
    const comprimento = z2 - z1 - 1.6;
    const segmentos = Math.max(1, Math.round(comprimento / 2));
    const seg = comprimento / segmentos;
    for (let i = 0; i <= segmentos; i++) {
      for (const l of [-1, 1]) estrutura.push({ centro: [x + l * (profundidade / 2 - 0.03), 1.0, ini + i * seg], tamanho: [0.06, 2.0, 0.06] });
    }
    for (const y of niveis) estrutura.push({ centro: [x, y, ini + comprimento / 2], tamanho: [profundidade, 0.04, comprimento] });
    for (let i = 0; i < segmentos && restantes > 0; i++) {
      for (let n = 0; n < niveis.length - 1 && restantes > 0; n++) {
        for (let k = 0; k < 3 && restantes > 0; k++, restantes--) {
          const amarela = rnd() < 0.2;
          pecas.push({
            forma: 'caixa',
            centro: [x + (rnd() - 0.5) * 0.06, niveis[n] + 0.14, ini + i * seg + (k + 0.5) * (seg / 3)],
            escala: [0.42, 0.26, seg / 3 - 0.12],
            giroY: (rnd() - 0.5) * 0.15,
            cor: variar(amarela ? COR_CARGA.epi : COR_CARGA.caixa, rnd),
          });
        }
      }
    }
  }
  return { estrutura, pecas };
}
