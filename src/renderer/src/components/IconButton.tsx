import type { ReactNode } from 'react';

interface IconButtonProps {
  onClick: () => void;
  title: string;
  active?: boolean;
  size?: 'sm' | 'lg';
  children: ReactNode;
}

export function IconButton({ onClick, title, active, size = 'sm', children }: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn-${size} ${active ? 'icon-btn-active' : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
      data-hitregion
    >
      {children}
    </button>
  );
}
