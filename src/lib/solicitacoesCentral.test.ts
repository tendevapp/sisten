import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigEnvioEmail, Profile, Request, RequestComment, RequestStatusHistory } from '../types';
import * as emailConfigApi from './emailConfigApi';
import { tipoNaFila } from './tipoSolicitacao';

/** Armazenamento em memória no lugar do IndexedDB do localDb. */
const memoria = new Map<string, unknown>();

vi.mock('../db/localDb', () => ({
  localDb: {
    getStorageItem: <T,>(k: string, d: T): T => (memoria.has(k) ? (memoria.get(k) as T) : d),
    setStorageItem: <T,>(k: string, v: T): void => { memoria.set(k, v); },
    getRequestItems: () => [],
    getAttachments: () => [],
    getProfiles: () => [],
    getSectors: () => [],
  },
}));

const {
  podeVer, podeAprovar, ehOperador, pendencia, indexarConversas, indexarEventos,
  escoposDisponiveis, escopoPadrao, filtrarPorEscopo, indexarPendencias, universoVisivel,
  lerEstadoLeitura, marcarLida, novidade, montarResumo, faixaDe, ordenarFila,
} = await import('./solicitacoesCentral');

const { rotuloStatus } = await import('./solicitacoes');

function perfil(over: Partial<Profile> = {}): Profile {
  return {
    id: 'u-sol', name: 'Ana Solicitante', email: 'ana@ten.com', cargo: 'Analista',
    sector_id: 'sec-1', roles: ['requisitante'], status: 'ativo',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Profile;
}

function req(over: Partial<Request> = {}): Request {
  return {
    id: 'r1', number: '3000123', type: 'compra', status: 'pendente', criticality: 3,
    solicitante_id: 'u-sol', solicitante_name: 'Ana Solicitante', solicitante_sector_id: 'sec-1',
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
    ...over,
  } as Request;
}

function comentario(over: Partial<RequestComment> = {}): RequestComment {
  return {
    id: 'c1', request_id: 'r1', user_id: 'u-atend', user_name: 'Bruno Atendente',
    user_roles: ['atendente'], content: 'oi', is_internal: false,
    created_at: '2026-08-10T10:00:00Z',
    ...over,
  } as RequestComment;
}

function evento(over: Partial<RequestStatusHistory> = {}): RequestStatusHistory {
  return {
    id: 'h1', request_id: 'r1', from_status: 'pendente', to_status: 'aprovada',
    user_id: 'u-gestor', user_name: 'Carla Gestora',
    created_at: '2026-08-10T11:00:00Z',
    ...over,
  } as RequestStatusHistory;
}

const semConversa = indexarConversas([]);

beforeEach(() => memoria.clear());
afterEach(() => vi.restoreAllMocks());

describe('Precisa de mim por destinatário em Cadastros Gerais', () => {
  const operador = perfil({ id: 'lourivan', email: 'Lourivan@teste.invalid', roles: ['solicitante'], sector_id: 'outro' });
  const item = req({ id: 'item', type: 'cadastro_sap', registration_type: 'Item', status: 'aberto' });
  const fornecedor = req({ ...item, id: 'forn', registration_type: 'Fornecedor' });
  const servico = req({ id: 'serv', tipo_compra: 'Serviço', status: 'aprovada' });
  const config = (chave: string, destinatarios: string) => ({ chave, destinatarios } as ConfigEnvioEmail);
  function fila(registros: Request[], usuario = operador) {
    const universo = universoVisivel(registros, usuario);
    return filtrarPorEscopo(universo, usuario, 'acao', indexarPendencias(universo, usuario, semConversa)).map(r => r.id);
  }

  it('usa o Para de cada tipo, inclusive com vários usuários e após trocar os responsáveis', () => {
    const outra = perfil({ ...operador, id: 'ana', email: 'ana@teste.invalid' });
    const configs = vi.spyOn(emailConfigApi, 'configsEmailConhecidas').mockReturnValue([
      config('compra_servico', operador.email),
      config('cadastro_sap', 'externo@teste.invalid; LOURIVAN@teste.invalid'),
      config('cadastro_sap_fornecedor', outra.email),
    ]);
    const dados = [item, fornecedor, servico, req({ ...servico, id: 'rm', linked_rm_number: '123' })];
    expect(fila(dados)).toEqual(['item', 'serv']);
    expect(fila(dados, outra)).toEqual(['forn']);
    configs.mockReturnValue([config('cadastro_sap', outra.email), config('cadastro_sap_fornecedor', operador.email)]);
    expect(fila(dados)).toEqual(['forn']);
    expect(fila(dados, outra)).toEqual(['item']);
  });

  it('mantém o atendimento com quem assumiu e devolve a pendência de esclarecimento ao solicitante', () => {
    vi.spyOn(emailConfigApi, 'configsEmailConhecidas').mockReturnValue([config('cadastro_sap', operador.email)]);
    const dados = [
      req({ ...item, id: 'meu', status: 'em_atendimento', atendente_id: operador.id }),
      req({ ...item, id: 'outro', status: 'em_atendimento', atendente_id: 'colega' }),
      req({ ...item, id: 'aguarda', status: 'aguardando_solicitante', atendente_id: operador.id }),
      req({ ...item, id: 'resolvido', status: 'resolvido' }),
      req({ ...item, id: 'cancelado', status: 'cancelada' }),
      req({ ...item, id: 'rascunho', status: 'rascunho' }),
    ];
    expect(fila(dados)).toEqual(['meu']);
    expect(fila(dados, perfil({ roles: ['solicitante'] }))).toEqual(['aguarda']);
  });
});

describe('tipo na fila de solicitações', () => {
  it('separa serviços de compras diretas, de estoque e legadas pelo subtipo registrado', () => {
    const fila = [
      req({ number: '5001065', tipo_compra: 'Serviço' }),
      req({ tipo_compra: 'Direta', titulo: 'Material para serviço de recuperação' }),
      req({ tipo_compra: 'Estoque' }),
      req(),
      req({ type: 'cadastro_sap' }),
      req({ type: 'chamado' }),
    ];
    expect(fila.map(tipoNaFila)).toEqual(['servico', 'compra', 'compra', 'compra', 'cadastro_sap', 'chamado']);
  });
});

describe('visibilidade', () => {
  it('rascunho só aparece para quem o escreveu', () => {
    const rascunho = req({ status: 'rascunho' });
    expect(podeVer(rascunho, perfil())).toBe(true);
    expect(podeVer(rascunho, perfil({ id: 'outro', roles: ['admin'] }))).toBe(false);
  });

  it('gestor aprovador enxerga as solicitações dos setores que aprova', () => {
    const gestor = perfil({ id: 'u-gestor', roles: ['gestor'], sector_id: 'sec-9', aprovador_setores: ['sec-1'] });
    expect(podeVer(req(), gestor)).toBe(true);
    expect(podeVer(req({ solicitante_sector_id: 'sec-2' }), gestor)).toBe(false);
  });

  it('atendente só opera chamados do seu setor de destino', () => {
    const atendente = perfil({ id: 'u-at', roles: ['atendente'], sector_id: 'sec-ti' });
    const meu = req({ type: 'chamado', status: 'aberto', target_sector_id: 'sec-ti' });
    const alheio = req({ type: 'chamado', status: 'aberto', target_sector_id: 'sec-rh' });
    expect(ehOperador(meu, atendente)).toBe(true);
    expect(ehOperador(alheio, atendente)).toBe(false);
  });

  it('aprovação de compra segue a lista de setores do admin', () => {
    const aprovador = perfil({ id: 'u-ap', roles: ['gestor'], aprovador_setores: ['sec-1'] });
    expect(podeAprovar(req(), aprovador)).toBe(true);
    expect(podeAprovar(req({ type: 'chamado' }), aprovador)).toBe(false);
  });

  it('sem a página da fila coletiva, o universo são as próprias solicitações', () => {
    // `sol_todas` libera requisitante por padrão; aqui o admin tirou a página
    // desse usuário, e o universo encolhe para o que o envolve diretamente.
    const semFila = perfil({ page_access: { sol_todas: false } });
    const outras = [req(), req({ id: 'r2', solicitante_id: 'zzz', solicitante_sector_id: 'sec-8' })];
    expect(universoVisivel(outras, semFila).map(r => r.id)).toEqual(['r1']);
  });

  it('com a página da fila, o requisitante segue vendo a fila coletiva como antes', () => {
    const outras = [req(), req({ id: 'r2', solicitante_id: 'zzz', solicitante_sector_id: 'sec-8' })];
    expect(universoVisivel(outras, perfil()).map(r => r.id).sort()).toEqual(['r1', 'r2']);
  });
});

describe('pendências', () => {
  it('compra pendente é ação do aprovador, não do solicitante', () => {
    const compra = req({ status: 'pendente' });
    const aprovador = perfil({ id: 'u-ap', roles: ['gestor'], aprovador_setores: ['sec-1'] });

    expect(pendencia(compra, aprovador, semConversa)?.papel).toBe('aprovador');
    expect(pendencia(compra, perfil(), semConversa)).toBeNull();
  });

  it('devolvida para revisão volta a ser ação de quem abriu', () => {
    const p = pendencia(req({ status: 'em_revisao' }), perfil(), semConversa);
    expect(p?.rotulo).toBe('Ajustar e reenviar');
  });

  it('chamado resolvido sem nota pede avaliação do solicitante', () => {
    const chamado = req({ type: 'chamado', status: 'resolvido' });
    expect(pendencia(chamado, perfil(), semConversa)?.rotulo).toBe('Avaliar o atendimento');

    const avaliado = req({ type: 'chamado', status: 'resolvido', rating: 5 });
    expect(pendencia(avaliado, perfil(), semConversa)).toBeNull();
  });

  it('chamado em atendimento volta ao atendente quando o solicitante falou por último', () => {
    const chamado = req({ type: 'chamado', status: 'em_atendimento', target_sector_id: 'sec-ti' });
    const atendente = perfil({ id: 'u-at', roles: ['atendente'], sector_id: 'sec-ti' });

    const respondido = indexarConversas([comentario({ user_id: 'u-at' })]);
    expect(pendencia(chamado, atendente, respondido)).toBeNull();

    const aguardando = indexarConversas([comentario({ user_id: 'u-sol' })]);
    expect(pendencia(chamado, atendente, aguardando)?.rotulo).toBe('Responder o solicitante');
  });

  it('compra aprovada sem comprador é ação da fila de suprimentos', () => {
    const comprador = perfil({ id: 'u-cp', roles: ['comprador'] });
    expect(pendencia(req({ status: 'aprovada' }), comprador, semConversa)?.rotulo).toBe('Assumir a compra');
    expect(pendencia(req({ status: 'aprovada', comprador_id: 'outro' }), comprador, semConversa)).toBeNull();
  });

  it('serviço aprovado pede RM ao admin e a pendência termina ao vincular a RM', () => {
    const admin = perfil({ roles: ['admin'] });
    const servico = req({ tipo_compra: 'Serviço', status: 'aprovada' });
    expect(pendencia(servico, admin, semConversa)?.rotulo).toBe('Informar a RM aberta no SAP');
    expect(pendencia(servico, perfil({ roles: ['comprador'] }), semConversa)).toBeNull();
    expect(pendencia({ ...servico, linked_rm_number: '00123456' }, admin, semConversa)).toBeNull();
  });

  it('solicitação encerrada não gera pendência para ninguém', () => {
    const admin = perfil({ id: 'a', roles: ['admin'] });
    expect(pendencia(req({ status: 'cancelada' }), admin, semConversa)).toBeNull();
    expect(pendencia(req({ status: 'fechado', type: 'compra' }), admin, semConversa)).toBeNull();
  });
});

describe('novidades e leitura', () => {
  it('o primeiro acesso não transforma o histórico inteiro em novidade', () => {
    const estado = lerEstadoLeitura('u-sol');
    const ctx = indexarEventos([comentario({ created_at: '2026-01-01T00:00:00Z' })], []);
    expect(novidade(req(), perfil(), estado, ctx, rotuloStatus)).toBeNull();
  });

  it('mensagem de outra pessoa depois da leitura vira novidade', () => {
    lerEstadoLeitura('u-sol');
    const estado = marcarLida('u-sol', 'r1');
    const depois = new Date(Date.now() + 60_000).toISOString();

    const ctx = indexarEventos([comentario({ created_at: depois })], []);
    expect(novidade(req(), perfil(), estado, ctx, rotuloStatus)?.texto).toBe('Nova mensagem');
  });

  it('o próprio comentário do usuário nunca é novidade para ele', () => {
    lerEstadoLeitura('u-sol');
    const estado = marcarLida('u-sol', 'r1');
    const depois = new Date(Date.now() + 60_000).toISOString();

    const ctx = indexarEventos([comentario({ user_id: 'u-sol', created_at: depois })], []);
    expect(novidade(req(), perfil(), estado, ctx, rotuloStatus)).toBeNull();
  });

  it('nota interna não vira novidade para quem não pode lê-la', () => {
    lerEstadoLeitura('u-sol');
    const estado = marcarLida('u-sol', 'r1');
    const depois = new Date(Date.now() + 60_000).toISOString();
    const ctx = indexarEventos([comentario({ is_internal: true, created_at: depois })], []);

    expect(novidade(req(), perfil(), estado, ctx, rotuloStatus)).toBeNull();
    expect(novidade(req(), perfil({ roles: ['comprador'] }), estado, ctx, rotuloStatus)?.texto)
      .toBe('Nova nota interna');
  });

  it('mudança de status feita por outra pessoa é anunciada com o rótulo novo', () => {
    lerEstadoLeitura('u-sol');
    const estado = marcarLida('u-sol', 'r1');
    const depois = new Date(Date.now() + 60_000).toISOString();

    const ctx = indexarEventos([], [evento({ created_at: depois })]);
    expect(novidade(req(), perfil(), estado, ctx, rotuloStatus)?.texto).toBe('Status mudou para Aprovada');
  });
});

describe('escopos e faixas', () => {
  it('sem a página da fila coletiva, restam só as abas pessoais', () => {
    const semFila = perfil({ page_access: { sol_todas: false } });
    expect(escoposDisponiveis(semFila).map(e => e.id)).toEqual(['acao', 'minhas']);
  });

  it('"Precisa de mim" resiste mesmo quando todas as outras abas são tiradas', () => {
    const restrito = perfil({ page_access: { sol_todas: false, sol_minhas: false } });
    expect(escoposDisponiveis(restrito).map(e => e.id)).toEqual(['acao']);
  });

  it('"Do meu setor" do admin é o setor dele, não o sistema inteiro', () => {
    const admin = perfil({ id: 'adm', roles: ['admin'], sector_id: 'sec-1' });
    const lista = [req(), req({ id: 'r2', solicitante_sector_id: 'sec-8' })];
    const pendencias = indexarPendencias(lista, admin, semConversa);

    expect(filtrarPorEscopo(lista, admin, 'setor', pendencias).map(r => r.id)).toEqual(['r1']);
  });

  it('quem tem a fila coletiva ganha a aba "Todas", sem aba de setor', () => {
    expect(escoposDisponiveis(perfil()).map(e => e.id)).toEqual(['acao', 'minhas', 'todas']);
  });

  it('gestor aprovador ganha a aba do setor', () => {
    const gestor = perfil({ roles: ['gestor'], aprovador_setores: ['sec-1'] });
    expect(escoposDisponiveis(gestor).map(e => e.id)).toContain('setor');
  });

  it('a aba "Precisa de mim" lista só o que tem pendência', () => {
    const lista = [req(), req({ id: 'r2', status: 'em_revisao' })];
    const user = perfil();
    const pendencias = indexarPendencias(lista, user, semConversa);

    expect(filtrarPorEscopo(lista, user, 'acao', pendencias).map(r => r.id)).toEqual(['r2']);
  });

  it('pendência tem precedência sobre novidade na hora de agrupar', () => {
    expect(faixaDe(req(), true, true)).toBe('acao');
    expect(faixaDe(req(), false, true)).toBe('novidades');
    expect(faixaDe(req(), false, false)).toBe('andamento');
    expect(faixaDe(req({ status: 'fechado' }), false, false)).toBe('concluidas');
  });

  it('rascunho fica em andamento, não em concluídas', () => {
    expect(faixaDe(req({ status: 'rascunho' }), false, false)).toBe('andamento');
  });

  it('a fila ordena por criticidade e, no empate, por quem espera há mais tempo', () => {
    const lista = [
      req({ id: 'a', criticality: 3, created_at: '2026-08-05T00:00:00Z' }),
      req({ id: 'b', criticality: 5, created_at: '2026-08-09T00:00:00Z' }),
      req({ id: 'c', criticality: 3, created_at: '2026-08-01T00:00:00Z' }),
    ];
    expect(ordenarFila(lista).map(r => r.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('resumo de login', () => {
  it('separa o que exige ação do que é apenas aviso', () => {
    lerEstadoLeitura('u-sol');
    const estado = marcarLida('u-sol', 'r2');
    const depois = new Date(Date.now() + 60_000).toISOString();

    const universo = [req({ status: 'em_revisao' }), req({ id: 'r2', status: 'aprovada' })];
    const ctx = indexarEventos([comentario({ request_id: 'r2', created_at: depois })], []);

    const resumo = montarResumo(universo, perfil(), estado, ctx, 4, rotuloStatus);

    expect(resumo.pendentes.map(i => i.request.id)).toEqual(['r1']);
    expect(resumo.novidades.map(i => i.request.id)).toEqual(['r2']);
    expect(resumo.naoLidas).toBe(4);
  });

  it('sem pendência e sem novidade, o resumo fica vazio — e o modal não abre', () => {
    const estado = lerEstadoLeitura('u-sol');
    const resumo = montarResumo([req({ status: 'aprovada' })], perfil(), estado, indexarEventos([], []), 0, rotuloStatus);
    expect(resumo.pendentes).toHaveLength(0);
    expect(resumo.novidades).toHaveLength(0);
  });
});

describe('escopo padrão', () => {
  it('abre na aba todas para quem tem acesso a sol_todas', () => {
    const admin = perfil({ roles: ['admin'] });
    expect(escopoPadrao(admin)).toBe('todas');

    const usuarioComTodas = perfil({
      roles: ['visualizador'],
      page_access: { sol_todas: true },
    });
    expect(escopoPadrao(usuarioComTodas)).toBe('todas');
  });
});
