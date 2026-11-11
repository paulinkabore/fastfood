import { BRAND_LOGO, BRAND_NAME } from '../lib/brand';

export function Logo({ className = 'h-24' }: { className?: string }) {
  return <img src={BRAND_LOGO} alt={BRAND_NAME} className={`w-auto select-none object-contain ${className}`} draggable={false} />;
}
