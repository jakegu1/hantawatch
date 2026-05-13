'use client';

interface HpiGaugeProps {
  total: number;
  grade: string;
  color: string;
}

export function HpiGauge({ total, grade, color }: HpiGaugeProps) {
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-[200px]">
        {/* Background arc */}
        <path
          d="M 30 100 A 70 70 0 0 1 170 100"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="20"
          strokeLinecap="round"
        />
        {/* Colored arc — maps total(0-100) to angle(0-180 deg) */}
        <path
          d="M 30 100 A 70 70 0 0 1 170 100"
          fill="none"
          stroke={color}
          strokeWidth="20"
          strokeLinecap="round"
          strokeDasharray={`${(total / 100) * 220} 220`}
        />
        {/* Center text */}
        <text x="100" y="85" textAnchor="middle" className="text-3xl font-extrabold" fill={color}>
          {total}
        </text>
        <text x="100" y="108" textAnchor="middle" className="text-xs font-medium" fill={color}>
          {grade}
        </text>
      </svg>
    </div>
  );
}
