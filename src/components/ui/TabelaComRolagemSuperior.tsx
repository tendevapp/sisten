import { useRef, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  larguraMinima: number;
  ariaLabel: string;
}

export default function TabelaComRolagemSuperior({ children, larguraMinima, ariaLabel }: Props) {
  const rolagemSuperior = useRef<HTMLDivElement>(null);
  const rolagemTabela = useRef<HTMLDivElement>(null);
  const sincronizar = (origem: HTMLDivElement, destino: HTMLDivElement | null) => {
    if (destino && Math.abs(destino.scrollLeft - origem.scrollLeft) > 1) destino.scrollLeft = origem.scrollLeft;
  };
  return <>
    <div ref={rolagemSuperior} onScroll={e => sincronizar(e.currentTarget, rolagemTabela.current)} className="h-4 overflow-x-auto overflow-y-hidden rounded-t-xl border border-slate-200 bg-slate-50" aria-label={`Rolagem horizontal superior da ${ariaLabel}`}><div style={{ width: larguraMinima, height: 1 }} /></div>
    <div ref={rolagemTabela} onScroll={e => sincronizar(e.currentTarget, rolagemSuperior.current)} className="max-h-[62vh] overflow-auto rounded-b-xl border-x border-b border-slate-200">{children}</div>
  </>;
}
