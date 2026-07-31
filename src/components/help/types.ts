/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LucideIcon } from 'lucide-react';

export interface TourStep {
  /** Casa com o atributo data-tour="<target>" do elemento a destacar. Ausente = passo centralizado, sem spotlight. */
  target?: string;
  title: string;
  description: string;
  icon: LucideIcon;
}
