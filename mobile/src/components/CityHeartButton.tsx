import { useState } from 'react';
import { Icon } from './Icon';
import './city-heart-button.css';

export function CityHeartButton({ saved, onToggle, label, className = '' }: {
  saved: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
}) {
  const [pulse, setPulse] = useState(0);
  return <button type="button" className={`city-heart-button${pulse ? ' is-celebrating' : ''}${className ? ` ${className}` : ''}`}
    aria-label={label} aria-pressed={saved} onClick={() => {
      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!saved && !reduced) setPulse(value => value + 1);
      else setPulse(0);
      onToggle();
    }}>
    <span key={pulse} className="city-heart-glyph" onAnimationEnd={() => setPulse(0)}><Icon name="heart" size={21}/></span>
  </button>;
}
