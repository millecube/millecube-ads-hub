import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const variants = {
  primary: [
    'bg-gradient-to-br from-[#32cd32] to-[#6bc71f]',
    'text-[#051c14] font-bold border-0',
    'shadow-[0_4px_15px_rgba(50,205,50,0.35)]',
    'hover:shadow-[0_8px_25px_rgba(50,205,50,0.55)] hover:brightness-105',
  ].join(' '),
  ghost: [
    'bg-white/[0.045] text-[var(--text)]',
    'border border-[rgba(50,205,50,0.18)]',
    'backdrop-blur-sm',
    'hover:bg-white/[0.08] hover:border-[#32cd32]',
  ].join(' '),
  danger: [
    'bg-[rgba(255,77,77,0.15)] text-[#ff4d4d]',
    'border border-[rgba(255,77,77,0.3)]',
    'hover:bg-[rgba(255,77,77,0.25)]',
  ].join(' '),
  outline: [
    'bg-transparent text-[#32cd32]',
    'border border-[#32cd32]',
    'hover:bg-[rgba(50,205,50,0.08)]',
  ].join(' '),
};

const sizes = {
  sm: 'px-3.5 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-5 py-2.5 text-[13px] gap-2 rounded-[8px]',
  lg: 'px-6 py-3 text-sm gap-2.5 rounded-[10px]',
};

export function Button({
  variant = 'ghost',
  size = 'md',
  className,
  children,
  disabled,
  loading,
  ...props
}) {
  return (
    <motion.button
      whileHover={disabled || loading ? {} : { scale: 1.03, y: -1 }}
      whileTap={disabled || loading ? {} : { scale: 0.96 }}
      transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold',
        'cursor-pointer transition-colors duration-150 select-none',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'font-[Montserrat,sans-serif]',
        variants[variant] || variants.ghost,
        sizes[size] || sizes.md,
        className
      )}
      {...props}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
      )}
      {children}
    </motion.button>
  );
}

export default Button;
