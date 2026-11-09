/**
 * Liga cada `<label>` solto ao campo que vem logo depois dele.
 *
 * A auditoria de 08/11 achou ~390 campos cujo rótulo não estava ligado ao
 * campo: um `<label>` irmão sem `htmlFor`, padrão comum nas telas. Visualmente
 * parece certo, mas tocar no rótulo não foca o campo (no celular o alvo útil
 * encolhe para a caixa) e o leitor de tela anuncia só "editar texto".
 *
 * Mesmo caminho do `responsiveTableObserver`: um observador no <body> que só
 * acrescenta atributos (`id` no campo, `for` no rótulo). O React não remove
 * atributo que ele não controla, então a ligação sobrevive às re-renderizações.
 *
 * Só liga quando não há ambiguidade:
 * - o rótulo não tem `for` nem campo dentro dele;
 * - o irmão seguinte É o campo, ou contém exatamente UM campo;
 * - o campo não é checkbox/radio (aí o rótulo costuma ser de grupo) e ainda
 *   não tem nome acessível (`aria-label`/`aria-labelledby`).
 *
 * Tela nova deve ligar o rótulo direto no JSX (`useId` + `htmlFor`); isto é a
 * rede para as telas existentes.
 */

const SELETOR_CAMPO = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), select, textarea';
const MARCA = 'data-rotulo-auto';
let contador = 0;

function campoDoIrmao(irmao: Element | null): HTMLElement | null {
  if (!irmao) return null;
  if (irmao.matches(SELETOR_CAMPO)) return irmao as HTMLElement;
  const campos = irmao.querySelectorAll<HTMLElement>(SELETOR_CAMPO);
  // Dois campos (ex.: "Período" com início e fim) = ambíguo; não liga.
  if (campos.length !== 1) return null;
  // Rótulo de grupo de opções logo antes de um bloco de checkboxes não conta:
  // o seletor já exclui checkbox/radio, e aqui garantimos que o bloco não é
  // um grupo misto.
  if (irmao.querySelector('input[type="checkbox"], input[type="radio"]')) return null;
  return campos[0];
}

/** Uma passada sobre a raiz. Exportada para teste. */
export function associarRotulos(raiz: ParentNode = document): number {
  let ligados = 0;
  raiz.querySelectorAll<HTMLLabelElement>('label:not([for])').forEach(rotulo => {
    if (rotulo.querySelector('input, select, textarea, button')) return;
    if (!rotulo.textContent?.trim()) return;
    const campo = campoDoIrmao(rotulo.nextElementSibling);
    if (!campo) return;
    if (campo.hasAttribute('aria-label') || campo.hasAttribute('aria-labelledby')) return;
    // Campo já ligado a outro rótulo: não rouba.
    if (campo.id && document.querySelector(`label[for="${CSS.escape(campo.id)}"]`)) return;
    if (!campo.id) {
      campo.id = `campo-auto-${++contador}`;
      campo.setAttribute(MARCA, '');
    }
    rotulo.htmlFor = campo.id;
    ligados++;
  });
  return ligados;
}

export function initAssociarRotulos(): () => void {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  let agendado: number | null = null;
  const agendar = () => {
    if (agendado !== null) return;
    agendado = window.setTimeout(() => { agendado = null; associarRotulos(); }, 50);
  };
  const observer = new MutationObserver(agendar);
  observer.observe(document.body, { childList: true, subtree: true });
  agendar();
  return () => {
    if (agendado !== null) window.clearTimeout(agendado);
    observer.disconnect();
  };
}
