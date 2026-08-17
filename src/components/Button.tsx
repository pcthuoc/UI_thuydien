import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bambu-dark disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-bambu-green hover:bg-bambu-green-light text-white focus:ring-bambu-green',
    secondary:
      'bg-gray-100 hover:bg-gray-200 dark:bg-bambu-dark-tertiary dark:hover:bg-bambu-gray-dark text-gray-700 dark:text-white border border-gray-300/80 dark:border-transparent focus:ring-gray-400 dark:focus:ring-bambu-gray',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    ghost:
      'bg-transparent hover:bg-gray-100 dark:hover:bg-bambu-dark-tertiary text-gray-600 dark:text-bambu-gray-light hover:text-gray-900 dark:hover:text-white',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5 min-h-[44px] md:min-h-0',
    md: 'px-4 py-2 text-sm gap-2 min-h-[44px] md:min-h-0',
    lg: 'px-6 py-3 text-base gap-2 min-h-[48px] md:min-h-0',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
