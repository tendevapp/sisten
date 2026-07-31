/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { HelpCircle } from 'lucide-react';

interface HelpButtonProps {
  onClick: () => void;
  /** Enquanto o usuário nunca viu o tour desta página, o botão pulsa para chamar atenção. */
  pulse: boolean;
}

/** Botão flutuante que reabre o tour guiado da página a qualquer momento. */
export default function HelpButton({ onClick, pulse }: HelpButtonProps) {
  return (
    <div className="fixed bottom-6 right-6 z-[90]">
      {pulse && (
        <motion.span
          className="absolute inset-0 rounded-full bg-emerald-500"
          animate={{ scale: [1, 1.6], opacity: [0.55, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label="Ajuda: abrir tour guiado desta página"
        title="Ajuda"
        className="relative flex items-center justify-center h-12 w-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 transition-colors active:scale-95"
      >
        <HelpCircle className="h-5.5 w-5.5" />
      </button>
    </div>
  );
}
