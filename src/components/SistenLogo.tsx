import React from 'react';

interface SistenLogoProps {
  className?: string;
  iconOnly?: boolean;
}

export default function SistenLogo({ className = '', iconOnly = false }: SistenLogoProps) {
  if (iconOnly) {
    return (
      <svg
        viewBox="0 0 160 160"
        className={`h-9 w-9 shrink-0 ${className}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="groundGradIcon" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f5821f" />
            <stop offset="100%" stopColor="#ffcc00" />
          </linearGradient>
          <clipPath id="circleClipIcon">
            <circle cx="80" cy="80" r="48" />
          </clipPath>
        </defs>

        {/* Orbit / Outer ring */}
        <path
          d="M 80 22 A 58 58 0 1 0 138 80"
          stroke="#e2e8f0"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.4"
        />
        <path
          d="M 134 98 A 58 58 0 0 0 118 128"
          stroke="#e2e8f0"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.3"
        />

        {/* Floating Squares */}
        <rect x="112" y="38" width="8" height="8" rx="1.5" stroke="#94a3b8" strokeWidth="1.2" strokeOpacity="0.6" fill="none" />
        <rect x="124" y="28" width="11" height="11" rx="1.5" stroke="#94a3b8" strokeWidth="1.2" strokeOpacity="0.6" fill="none" />
        <rect x="120" y="47" width="8" height="8" rx="1.5" stroke="#94a3b8" strokeWidth="1.2" strokeOpacity="0.6" fill="none" />
        <rect x="134" y="38" width="8" height="8" rx="1.5" stroke="#94a3b8" strokeWidth="1.2" strokeOpacity="0.6" fill="none" />

        {/* Main Badge inside Clip Path */}
        <g clipPath="url(#circleClipIcon)">
          {/* Top Half: Blue Sky */}
          <rect x="30" y="30" width="100" height="50" fill="#0a83e6" />
          
          {/* Bottom Half: Orange/Yellow Ground */}
          <path d="M 32 80 A 48 48 0 0 0 128 80 Z" fill="url(#groundGradIcon)" />

          {/* Perspective Lines in Ground */}
          <path d="M 32 85 Q 60 100 128 81" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.9" fill="none" />
          <path d="M 35 100 Q 70 115 125 83" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.9" fill="none" />
          <path d="M 45 115 Q 85 130 115 85" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.9" fill="none" />
          
          {/* Wind Turbine */}
          {/* Tower */}
          <path d="M 78.5 80 L 79.5 50 L 80.5 50 L 81.5 80 Z" fill="#ffffff" />
          {/* Hub */}
          <circle cx="80" cy="50" r="2.5" fill="#ffffff" />
          {/* Blades */}
          {/* Blade 1 - Up */}
          <path d="M 80 50 L 80 25" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
          {/* Blade 2 - Down Left */}
          <path d="M 80 50 L 59 62" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
          {/* Blade 3 - Down Right */}
          <path d="M 80 50 L 101 62" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 540 180"
      className={`h-11 w-auto ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="groundGradFull" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5821f" />
          <stop offset="100%" stopColor="#ffcc00" />
        </linearGradient>
        <clipPath id="circleClipFull">
          <circle cx="80" cy="90" r="48" />
        </clipPath>
      </defs>

      {/* Orbit / Outer ring */}
      <path
        d="M 80 32 A 58 58 0 1 0 138 90"
        stroke="#e2e8f0"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.4"
      />
      <path
        d="M 134 108 A 58 58 0 0 0 118 138"
        stroke="#e2e8f0"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.3"
      />

      {/* Floating Squares */}
      <rect x="112" y="48" width="8" height="8" rx="1.5" stroke="#94a3b8" strokeWidth="1.2" strokeOpacity="0.6" fill="none" />
      <rect x="124" y="38" width="11" height="11" rx="1.5" stroke="#94a3b8" strokeWidth="1.2" strokeOpacity="0.6" fill="none" />
      <rect x="120" y="57" width="8" height="8" rx="1.5" stroke="#94a3b8" strokeWidth="1.2" strokeOpacity="0.6" fill="none" />
      <rect x="134" y="48" width="8" height="8" rx="1.5" stroke="#94a3b8" strokeWidth="1.2" strokeOpacity="0.6" fill="none" />

      {/* Main Badge inside Clip Path */}
      <g clipPath="url(#circleClipFull)">
        {/* Top Half: Blue Sky */}
        <rect x="30" y="40" width="100" height="50" fill="#0a83e6" />
        
        {/* Bottom Half: Orange/Yellow Ground */}
        <path d="M 32 90 A 48 48 0 0 0 128 90 Z" fill="url(#groundGradFull)" />

        {/* Perspective Lines in Ground */}
        <path d="M 32 95 Q 60 110 128 91" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.9" fill="none" />
        <path d="M 35 110 Q 70 125 125 93" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.9" fill="none" />
        <path d="M 45 125 Q 85 140 115 95" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.9" fill="none" />
        
        {/* Wind Turbine */}
        {/* Tower */}
        <path d="M 78.5 90 L 79.5 60 L 80.5 60 L 81.5 90 Z" fill="#ffffff" />
        {/* Hub */}
        <circle cx="80" cy="60" r="2.5" fill="#ffffff" />
        {/* Blades */}
        {/* Blade 1 - Up */}
        <path d="M 80 60 L 80 35" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        {/* Blade 2 - Down Left */}
        <path d="M 80 60 L 59 72" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        {/* Blade 3 - Down Right */}
        <path d="M 80 60 L 101 72" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
      </g>

      {/* Branding Texts */}
      {/* "SISTEN" - High quality outline font styled exactly like user upload */}
      <text
        x="165"
        y="98"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.8"
        fontSize="56"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="2.5"
      >
        SISTEN
      </text>

      {/* "SISTEMA DE INFORMAÇÃO" */}
      <text
        x="166"
        y="126"
        fill="#94a3b8"
        fontSize="12.5"
        fontWeight="600"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="4.2"
      >
        SISTEMA DE INFORMAÇÃO
      </text>

      {/* "TEN" centered with design lines */}
      {/* Left line */}
      <line x1="166" y1="148" x2="250" y2="148" stroke="#94a3b8" strokeWidth="1" strokeOpacity="0.5" />
      
      {/* "TEN" outline */}
      <text
        x="264"
        y="155"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1"
        fontSize="20"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="1.5"
      >
        TEN
      </text>

      {/* Right line */}
      <line x1="334" y1="148" x2="418" y2="148" stroke="#94a3b8" strokeWidth="1" strokeOpacity="0.5" />
    </svg>
  );
}
