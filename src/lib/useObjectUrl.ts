/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Endereço `blob:` para mostrar um arquivo que ainda está só na memória do
 * navegador (pré-visualização de PDF/imagem antes de subir ao Storage).
 *
 * Cria e revoga o endereço dentro do MESMO efeito. O jeito antigo —
 * `useMemo(() => URL.createObjectURL(file))` + revogar na limpeza de um
 * `useEffect` — quebra no `<StrictMode>`: o React roda o efeito, limpa
 * (revoga) e roda de novo, mas o `useMemo` devolve o mesmo endereço já
 * revogado, e a imagem/o PDF aparecem quebrados.
 */

import { useEffect, useState } from 'react';

export function useObjectUrl(arquivo: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!arquivo) {
      setUrl(null);
      return;
    }
    const criado = URL.createObjectURL(arquivo);
    setUrl(criado);
    return () => URL.revokeObjectURL(criado);
  }, [arquivo]);

  return url;
}
