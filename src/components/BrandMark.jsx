import { Link } from 'react-router-dom';

const LOGO_URL =
  'https://media.base44.com/images/public/6ae4cccbb6925c84bcf4bab6/f946508b0_logo.png';

export default function BrandMark({ compact = false }) {
  return (
    <Link to="/" className="group flex items-center gap-3">
      <img
        src={LOGO_URL}
        alt=""
        className="h-7 w-7 object-contain transition-opacity duration-300 group-hover:opacity-80"
      />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[15px] font-semibold tracking-tight">
          PrivacyShield
        </span>
        {!compact && (
          <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] opacity-50">
            Exposure removal
          </span>
        )}
      </span>
    </Link>
  );
}