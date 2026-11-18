import { cpfValido } from './cnpjLookup';
import {
  documentoParaTeste,
  formatarDocMotorista,
  type TipoDocMotorista,
} from './documentoMotorista';
import type { PortRegistroTransporte } from '../types';

export interface MotoristaSalvoPortaria {
  nome: string;
  docTipo: TipoDocMotorista | null;
  docNumero: string;
  docCompleto: string;
  empresa: string;
  cargo: string;
  setor: string;
  ultimaData: string;
  origem: 'TRANSPORTE' | 'ALCOOLEMIA';
}

export interface RegistroTransporteMotoristaRow {
  motorista: string | null;
  motorista_doc_tipo?: TipoDocMotorista | null;
  motorista_documento?: string | null;
  empresa?: string | null;
  data?: string | null;
  created_at?: string | null;
}

export interface RegistroAlcoolemiaMotoristaRow {
  nome: string | null;
  documento?: string | null;
  empresa?: string | null;
  cargo_funcao?: string | null;
  setor_area?: string | null;
  data?: string | null;
  created_at?: string | null;
}

const apenasDigitos = (valor: string) => valor.replace(/\D/g, '');

const normalizarBusca = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

export function interpretarDocumentoAlcoolemia(raw: string | null | undefined): {
  docTipo: TipoDocMotorista | null;
  docNumero: string;
  docCompleto: string;
} {
  const texto = (raw || '').trim();
  if (!texto) {
    return { docTipo: null, docNumero: '', docCompleto: '' };
  }

  const maiusculo = texto.toUpperCase();
  const dig = apenasDigitos(texto);

  if (maiusculo.startsWith('CNH') && dig.length === 11) {
    const docNumero = formatarDocMotorista('CNH', dig);
    return { docTipo: 'CNH', docNumero, docCompleto: `CNH ${docNumero}` };
  }

  if (maiusculo.startsWith('CPF') && dig.length === 11) {
    const docNumero = formatarDocMotorista('CPF', dig);
    return { docTipo: 'CPF', docNumero, docCompleto: `CPF ${docNumero}` };
  }

  if (dig.length === 11 && !maiusculo.startsWith('RG')) {
    const pareceCpf = /[.-]/.test(texto) || cpfValido(dig);
    const docTipo: TipoDocMotorista = pareceCpf ? 'CPF' : 'CNH';
    const docNumero = formatarDocMotorista(docTipo, dig);
    return { docTipo, docNumero, docCompleto: texto };
  }

  return { docTipo: null, docNumero: '', docCompleto: texto };
}

function interpretarDocumentoTransporte(
  tipo: TipoDocMotorista | null | undefined,
  numero: string | null | undefined,
): {
  docTipo: TipoDocMotorista | null;
  docNumero: string;
  docCompleto: string;
} {
  const texto = (numero || '').trim();
  const dig = apenasDigitos(texto);
  if (!dig) {
    return { docTipo: null, docNumero: '', docCompleto: '' };
  }

  const docTipo: TipoDocMotorista = tipo || (cpfValido(dig) ? 'CPF' : 'CNH');
  const docNumero = formatarDocMotorista(docTipo, texto);
  const docCompleto = documentoParaTeste(docTipo, docNumero) || '';
  return { docTipo, docNumero, docCompleto };
}

type EntradaConsolidacao = MotoristaSalvoPortaria & { ordem: string };

export function consolidarMotoristasPortaria(
  transportes: RegistroTransporteMotoristaRow[],
  alcoolemia: RegistroAlcoolemiaMotoristaRow[],
): MotoristaSalvoPortaria[] {
  const entradas: EntradaConsolidacao[] = [];

  for (const r of transportes) {
    const nome = (r.motorista || '').trim().toUpperCase();
    if (!nome) continue;
    const doc = interpretarDocumentoTransporte(r.motorista_doc_tipo, r.motorista_documento);
    entradas.push({
      nome,
      docTipo: doc.docTipo,
      docNumero: doc.docNumero,
      docCompleto: doc.docCompleto,
      empresa: (r.empresa || '').trim().toUpperCase(),
      cargo: '',
      setor: '',
      ultimaData: r.data || '',
      origem: 'TRANSPORTE',
      ordem: r.created_at || r.data || '',
    });
  }

  for (const r of alcoolemia) {
    const nome = (r.nome || '').trim().toUpperCase();
    if (!nome) continue;
    const doc = interpretarDocumentoAlcoolemia(r.documento);
    entradas.push({
      nome,
      docTipo: doc.docTipo,
      docNumero: doc.docNumero,
      docCompleto: doc.docCompleto,
      empresa: (r.empresa || '').trim().toUpperCase(),
      cargo: (r.cargo_funcao || '').trim().toUpperCase(),
      setor: (r.setor_area || '').trim().toUpperCase(),
      ultimaData: r.data || '',
      origem: 'ALCOOLEMIA',
      ordem: r.created_at || r.data || '',
    });
  }

  entradas.sort((a, b) => b.ordem.localeCompare(a.ordem));

  const porNome = new Map<string, MotoristaSalvoPortaria>();
  for (const item of entradas) {
    const chave = normalizarBusca(item.nome);
    const existente = porNome.get(chave);
    if (!existente) {
      porNome.set(chave, {
        nome: item.nome,
        docTipo: item.docTipo,
        docNumero: item.docNumero,
        docCompleto: item.docCompleto,
        empresa: item.empresa,
        cargo: item.cargo,
        setor: item.setor,
        ultimaData: item.ultimaData,
        origem: item.origem,
      });
      continue;
    }

    // Preenche lacunas com o registro mais recente que tenha o dado
    if (!existente.docNumero && item.docNumero) {
      existente.docTipo = item.docTipo;
      existente.docNumero = item.docNumero;
    }
    if (!existente.docCompleto && item.docCompleto) {
      existente.docCompleto = item.docCompleto;
    }
    if (!existente.empresa && item.empresa) existente.empresa = item.empresa;
    if (!existente.cargo && item.cargo) existente.cargo = item.cargo;
    if (!existente.setor && item.setor) existente.setor = item.setor;
  }

  return Array.from(porNome.values());
}

export function filtrarMotoristasPortaria(
  lista: MotoristaSalvoPortaria[],
  termo: string,
  limite = 10,
): MotoristaSalvoPortaria[] {
  const busca = normalizarBusca(termo);
  if (!busca) return lista.slice(0, limite);

  const buscaDigitos = apenasDigitos(termo);
  const filtrados: MotoristaSalvoPortaria[] = [];

  for (const item of lista) {
    const bateTexto =
      normalizarBusca(item.nome).includes(busca) ||
      normalizarBusca(item.empresa).includes(busca) ||
      normalizarBusca(item.docCompleto).includes(busca);

    const bateDigitos =
      buscaDigitos.length >= 2 &&
      (apenasDigitos(item.docNumero).includes(buscaDigitos) ||
        apenasDigitos(item.docCompleto).includes(buscaDigitos));

    if (bateTexto || bateDigitos) {
      filtrados.push(item);
      if (filtrados.length >= limite) break;
    }
  }

  return filtrados;
}

export function encontrarMotoristaPorNome(
  lista: MotoristaSalvoPortaria[],
  nome: string,
): MotoristaSalvoPortaria | undefined {
  const chave = normalizarBusca(nome);
  if (!chave) return undefined;
  return lista.find((m) => normalizarBusca(m.nome) === chave);
}

export function enriquecerDocsTransportesAnteriores(
  todos: PortRegistroTransporte[],
  unicos: PortRegistroTransporte[],
): PortRegistroTransporte[] {
  const docPorMotorista = new Map<
    string,
    { tipo: TipoDocMotorista | null; numero: string }
  >();

  for (const r of todos) {
    const chave = normalizarBusca(r.motorista || '');
    const numero = (r.motorista_documento || '').trim();
    if (!chave || !numero || docPorMotorista.has(chave)) continue;
    docPorMotorista.set(chave, {
      tipo: (r.motorista_doc_tipo as TipoDocMotorista | null) || null,
      numero,
    });
  }

  return unicos.map((r) => {
    if ((r.motorista_documento || '').trim()) return r;
    const doc = docPorMotorista.get(normalizarBusca(r.motorista || ''));
    if (!doc) return r;
    return {
      ...r,
      motorista_doc_tipo: doc.tipo,
      motorista_documento: doc.numero,
    };
  });
}

