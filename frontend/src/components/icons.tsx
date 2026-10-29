type IconProps = { className?: string };

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
} as const;

export const PlusIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const MinusIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5 12h14" />
  </svg>
);

export const CloseIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const CheckIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5 12l5 5L20 7" />
  </svg>
);

export const BagIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5 8h14l-1 12H6L5 8Z" />
    <path d="M9 8V7a3 3 0 0 1 6 0v1" />
  </svg>
);