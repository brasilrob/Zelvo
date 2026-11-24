import React from 'react';

interface ZelvoLogoProps {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  iconOnly?: boolean;
}

export const ZelvoLogo: React.FC<ZelvoLogoProps> = ({
  variant = 'dark',
  size = 'md',
  showTagline = false,
  iconOnly = false,
}) => {
  const iconDimensions = size === 'sm' ? 28 : size === 'lg' ? 40 : 32;
  const wordmarkClass =
    size === 'sm' ? 'text-xl' : size === 'lg' ? 'text-3xl' : 'text-2xl';
  const textColor = variant === 'dark' ? 'text-white' : 'text-[#0F172A]';
  const subColor = variant === 'dark' ? 'text-slate-300' : 'text-[#475569]';

  return (
    <div className="inline-flex items-center gap-2.5 select-none shrink-0">
      <svg
        width={iconDimensions}
        height={iconDimensions}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="zelvoRouteGrad" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#14B8A6" />
          </linearGradient>
        </defs>
        {/* Route arc */}
        <circle
          cx="32"
          cy="32"
          r="25"
          stroke="url(#zelvoRouteGrad)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray="124 34"
          transform="rotate(-35 32 32)"
        />
        {/* Route destination node */}
        <circle cx="51" cy="15" r="3.4" fill="#14B8A6" />
        {/* Stylized leaf silhouette */}
        <path
          d="M19 34C19 23.5 27.5 16 40 16C40 29.5 32.5 38 22.5 38.5C20.5 38.6 19 36.6 19 34Z"
          fill="url(#zelvoRouteGrad)"
          fillOpacity="0.28"
        />
        {/* Crisp execution check mark */}
        <path
          d="M20.5 33.5L28.5 41.5L45 23.5"
          stroke="#10B981"
          strokeWidth="5.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {!iconOnly && (
        <div className="flex flex-col leading-none">
          <span
            className={`font-display font-extrabold tracking-tight lowercase ${wordmarkClass} ${textColor} inline-flex items-baseline`}
          >
            <span>zelv</span>
            <span className="relative inline-block">
              <span>o</span>
              <span
                aria-hidden="true"
                className="absolute -top-0.5 right-0 w-1.5 h-1.5 rounded-tl-full rounded-br-full bg-[#10B981]"
              />
            </span>
          </span>
          {showTagline && (
            <span className={`text-[11px] font-medium tracking-wide mt-0.5 ${subColor}`}>
              serviços no terreno
            </span>
          )}
        </div>
      )}
    </div>
  );
};
