'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { ReactNode } from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: ReactNode;
  size?: 'default' | 'large';
}

export function StatsCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  size = 'default',
}: StatsCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <div className="bg-white rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-neutral-400 mb-1">{title}</p>
          <p
            className={`font-semibold text-neutral-900 ${
              size === 'large' ? 'text-3xl' : 'text-2xl'
            }`}
          >
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {change !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              {isPositive ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span
                className={`text-sm font-medium ${
                  isPositive ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {isPositive ? '+' : ''}
                {change}%
              </span>
              {changeLabel && (
                <span className="text-sm text-neutral-400">{changeLabel}</span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-[#f8f8f8] flex items-center justify-center text-neutral-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
