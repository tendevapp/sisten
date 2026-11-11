/**
 * Teste de alcoolemia: onde a aferição foi feita e com qual etilômetro.
 *
 * A Portaria afere com o ETIL-02 e o SSMA (ambulatório) com o ETIL-01 — o
 * aparelho sai do local, não é digitado. O local fica em
 * `port_alcoolemia_testes.local_afericao` (nulo enquanto pendente).
 *
 * Também monta o teste pendente que os formulários de entrada da Portaria
 * (Relatório de Ocorrências, Chegada de Transporte, Carretas, Equipamentos)
 * cadastram quando marcam "Fará teste de bafômetro?".
 */
import type { PortAlcoolemiaTeste, PortAlcoolemiaVinculo } from '../types';

export type LocalAfericaoAlcoolemia = 'PORTARIA' | 'SSMA';

export const ETILOMETRO_DO_LOCAL: Record<LocalAfericaoAlcoolemia, string> = {
  PORTARIA: 'ETIL-02',
  SSMA: 'ETIL-01',
};

export const ROTULO_LOCAL_AFERICAO: Record<LocalAfericaoAlcoolemia, string> = {
  PORTARIA: 'Portaria',
  SSMA: 'SSMA',
};

type ComLocal = Pick<PortAlcoolemiaTeste, 'resultado' | 'vigilante' | 'local_afericao'>;

/**
 * Onde o teste foi aferido. Pendente não tem local. Sem a coluna preenchida
 * (cópia antiga no aparelho), cai na regra de antes: vigilante = Portaria.
 */
export function localDaAfericao(teste: ComLocal | null | undefined): LocalAfericaoAlcoolemia | null {
  if (!teste || teste.resultado === 'PENDENTE') return null;
  if (teste.local_afericao === 'PORTARIA' || teste.local_afericao === 'SSMA') return teste.local_afericao;
  return (teste.vigilante || '').trim() ? 'PORTARIA' : 'SSMA';
}

/**
 * Local a gravar quando uma tela registra (ou corrige) o resultado: teste
 * já aferido mantém o local de origem — o SSMA completando o termo de um
 * teste feito na portaria não muda o aparelho usado. Pendente leva o local
 * da tela.
 */
export function localAoRegistrar(
  teste: ComLocal | null | undefined,
  localDaTela: LocalAfericaoAlcoolemia,
): LocalAfericaoAlcoolemia {
  return localDaAfericao(teste) ?? localDaTela;
}

/**
 * Etilômetro a gravar junto: o do local. Teste já aferido que tem o aparelho
 * gravado mantém o dele (o histórico de antes da regra usava ETIL-01 nos dois).
 */
export function etilometroAoRegistrar(
  teste: (ComLocal & Pick<PortAlcoolemiaTeste, 'etilometro_codigo'>) | null | undefined,
  localDaTela: LocalAfericaoAlcoolemia,
): string {
  if (teste && teste.resultado !== 'PENDENTE' && (teste.etilometro_codigo || '').trim()) return teste.etilometro_codigo!.trim();
  return ETILOMETRO_DO_LOCAL[localAoRegistrar(teste, localDaTela)];
}

/** Pessoa que entrou na fábrica e foi marcada para o bafômetro. */
export interface PessoaParaBafometro {
  nome: string;
  /** Matrícula do RH (colaborador TEN). */
  matricula?: string | null;
  /** CPF / documento (terceiro). */
  documento?: string | null;
  pessoa_id?: string | null;
  empresa?: string | null;
  cargo_funcao?: string | null;
}

const ehTen = (empresa?: string | null) => /^TEN\b/i.test((empresa || '').trim());

/**
 * Teste pendente para o livro de alcoolemia, a partir de um formulário de
 * entrada da Portaria. Colaborador TEN (matrícula, id do RH ou empresa TEN)
 * entra como TEN; o resto como terceiro/PJ com a empresa e o documento.
 */
export function montarTesteBafometroPortaria(
  pessoa: PessoaParaBafometro,
  contexto: { data: string; horario?: string | null; origem: string; criadoPor: { id: string; name: string } },
): Partial<PortAlcoolemiaTeste> {
  const vinculo: PortAlcoolemiaVinculo =
    pessoa.pessoa_id || (pessoa.matricula || '').trim() || ehTen(pessoa.empresa) ? 'TEN' : 'PJ';
  const empresa = (pessoa.empresa || '').trim().toUpperCase();
  return {
    data: contexto.data,
    ...(contexto.horario ? { horario: contexto.horario.slice(0, 5) } : {}),
    tipo_vinculo: vinculo,
    pessoa_id: pessoa.pessoa_id || null,
    matricula: vinculo === 'TEN' ? (pessoa.matricula || '').trim() || null : null,
    nome: pessoa.nome.trim().toUpperCase(),
    empresa: vinculo === 'TEN' ? 'TEN' : empresa,
    cargo_funcao: (pessoa.cargo_funcao || '').trim().toUpperCase() || null,
    documento: vinculo === 'PJ' ? (pessoa.documento || '').trim() || null : null,
    resultado: 'PENDENTE',
    valor_medido: 0,
    razao_teste: 'ALEATORIO',
    observacoes: `CADASTRADO NA PORTARIA — ${contexto.origem.toUpperCase()}`,
    criado_por: contexto.criadoPor.id,
    criado_por_nome: contexto.criadoPor.name,
  };
}
