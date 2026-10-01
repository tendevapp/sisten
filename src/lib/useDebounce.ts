/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Devolve `value` só depois de ficar `delay` ms sem mudar — para não consultar
 * a cada tecla.
 */

import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
