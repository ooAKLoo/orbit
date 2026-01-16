'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';

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
      <div className="flex items-center bg-white rounded-xl p-1">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              value === option.value
                ? 'bg-[#f8f8f8] text-neutral-900'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
