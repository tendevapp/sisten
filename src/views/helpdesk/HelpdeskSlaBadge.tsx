/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Clock, AlertTriangle, CheckCircle2, Flame } from 'lucide-react';
import { Request } from '../../types';
import { getSlaInfo } from './helpdeskUtils';

interface HelpdeskSlaBadgeProps {
  ticket: Request;
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
}

export default function HelpdeskSlaBadge({ ticket, size = 'md', showProgress = false }: HelpdeskSlaBadgeProps) {
  const sla = getSlaInfo(ticket);
  const isFinished = ticket.status === 'resolvido' || ticket.status === 'fechado';

  const badgeStyles = {
    ok: isFinished 
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-emerald-50/80 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse',
    violated: 'bg-rose-50 text-rose-800 border-rose-300 font-bold'
  };

  const textSizes = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5'
  };

  const iconSizes = {
    sm: 'h-3 w-3 mr-1',
    md: 'h-3.5 w-3.5 mr-1.5',
    lg: 'h-4 w-4 mr-2'
  };

  const renderIcon = () => {
    if (isFinished) {
      return sla.isViolated 
        ? <AlertTriangle className={iconSizes[size]} /> 
        : <CheckCircle2 className={iconSizes[size]} />;
    }
    if (sla.status === 'violated') {
      return <Flame className={`${iconSizes[size]} text-rose-600 animate-bounce`} />;
    }
    if (sla.status === 'warning') {
      return <AlertTriangle className={`${iconSizes[size]} text-amber-600`} />;
    }
    return <Clock className={iconSizes[size]} />;
  };

  return (
    <div className="inline-flex flex-col">
      <div 
        className={`inline-flex items-center rounded-md border font-medium transition-colors ${badgeStyles[sla.status]} ${textSizes[size]}`}
        title={`Meta: ${sla.allowedHours}h | Tempo decorrido: ${sla.elapsedHours.toFixed(1)}h`}
      >
        {renderIcon()}
        <span>{sla.badgeText}</span>
      </div>

      {showProgress && !isFinished && (
        <div className="mt-1 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              sla.isViolated ? 'bg-rose-500' : sla.isWarning ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${sla.percentElapsed}%` }}
          />
        </div>
      )}
    </div>
  );
}
