import { separarBilingue } from '../../lib/textoBilingue';

/**
 * Texto bilíngue dos formulários da Qualidade: português em destaque, inglês
 * sem negrito e em itálico. Aceita o texto "PT / EN" ou as partes separadas.
 */
export default function Bilingue({ texto, pt, en, ptClass = '', enClass = '', inline = false }: { texto?: string; pt?: string; en?: string; ptClass?: string; enClass?: string; inline?: boolean }) {
  const partes = texto !== undefined ? separarBilingue(texto) : { pt: pt || '', en: en || '' };
  if (inline) {
    return <span><span className={ptClass}>{partes.pt}</span>{partes.en && <span className={`font-normal italic text-slate-500 dark:text-slate-400 ${enClass}`}> / {partes.en}</span>}</span>;
  }
  return <>
    {partes.pt && <p className={ptClass}>{partes.pt}</p>}
    {partes.en && <p className={`font-normal italic text-slate-500 dark:text-slate-400 ${enClass}`}>{partes.en}</p>}
  </>;
}
