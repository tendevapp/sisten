/**
 * Roda do mouse sobre um `<input type="number">` focado muda o valor em
 * silêncio: a pessoa rola a página para conferir a lista e a quantidade que
 * acabou de digitar vira outra. Em estoque e inventário, o erro só aparece na
 * contagem seguinte.
 *
 * Os 68 campos numéricos do app não tinham proteção. Em vez de um `onWheel` em
 * cada um, um listener único: rolou sobre o campo numérico focado, ele perde o
 * foco e a rolagem segue para a página, que é o que a pessoa queria.
 */
export function instalarProtecaoCampoNumerico(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener(
    'wheel',
    ev => {
      const alvo = ev.target;
      if (
        alvo instanceof HTMLInputElement &&
        alvo.type === 'number' &&
        alvo === document.activeElement
      ) {
        alvo.blur();
      }
    },
    // passive: não chama preventDefault, então não atrasa a rolagem.
    { passive: true, capture: true },
  );
}
