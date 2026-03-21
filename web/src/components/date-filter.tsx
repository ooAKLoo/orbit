'use client';

import { motion } from 'framer-motion';

type DateRange = '7d' | '14d' | '30d' | 'custom';

interface DateFilterProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
}

export function DateFilter({ value, onChange }: DateFilterProps) {
  const options: { value: DateRange; label: string }[] = [
    { value: '7d', label: '7 天' },
    { value: '14d', label: '14 天' },
    { value: '30d', label: '30 天' },
  ];

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center bg-white rounded-xl p-1 relative">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className="relative px-4 py-2 text-sm font-medium rounded-lg z-[1]"
          >
            {value === option.value && (
              <motion.div
                layoutId="date-filter-indicator"
                className="absolute inset-0 bg-[#f8f8f8] rounded-lg"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span
              className={`relative z-[1] transition-colors duration-200 ${
                value === option.value ? 'text-neutral-900' : 'text-neutral-500'
              }`}
            >
              {option.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
