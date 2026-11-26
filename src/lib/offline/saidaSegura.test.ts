import { describe, expect, it } from 'vitest';
import { decidirSaida, mensagemSaidaComPendencias } from './saidaSegura';

describe('logoff com registros ainda no aparelho', () => {
  it('fila vazia: sai', () => {
    expect(decidirSaida(0, 'manual')).toBe('sair');
    expect(decidirSaida(0, 'virada-do-dia')).toBe('sair');
  });
  it('logoff automático da meia-noite espera a fila esvaziar', () => {
    expect(decidirSaida(3, 'virada-do-dia')).toBe('adiar');
  });
  it('"Sair" com fila pede confirmação', () => {
    expect(decidirSaida(1, 'manual')).toBe('confirmar');
  });
  it('a mensagem diz quantos e que só sobem com o mesmo usuário', () => {
    expect(mensagemSaidaComPendencias(1)).toMatch(/1 registro /);
    expect(mensagemSaidaComPendencias(4)).toMatch(/4 registros /);
    expect(mensagemSaidaComPendencias(4)).toMatch(/entrar de novo neste aparelho/);
  });
});
