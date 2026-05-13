'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export interface TrendChartProps {
  /** Category labels on the x-axis. e.g. ['2020', '2021', ...] */
  categories: (string | number)[];
  /** Numeric values aligned with `categories`. */
  values: number[];
  /** Chart type: 'bar' | 'line'. Default 'bar'. */
  variant?: 'bar' | 'line';
  /** Color of the bars/line (hex). Default brand blue. */
  color?: string;
  /** Optional baseline value to draw as a dashed reference line (e.g. 5y mean). */
  baseline?: number;
  /** Tooltip formatter (e.g. show "病例" + 例数). Defaults to "{value} 例". */
  unit?: string;
  /** Container height in px. Default 200. */
  height?: number;
}

/**
 * Lightweight ECharts wrapper for HFRS yearly/monthly trend bars.
 * Mobile-friendly: auto-resizes, compact axis labels.
 */
export function TrendChart({
  categories,
  values,
  variant = 'bar',
  color = '#1e40af',
  baseline,
  unit = '例',
  height = 200,
}: TrendChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });

    const option: echarts.EChartsCoreOption = {
      grid: { left: 36, right: 8, top: 24, bottom: 24, containLabel: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: variant === 'bar' ? 'shadow' : 'line' },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          return `${p.axisValue}<br/><b>${p.value.toLocaleString('zh-CN')}</b> ${unit}`;
        },
        textStyle: { fontSize: 12 },
      },
      xAxis: {
        type: 'category',
        data: categories.map(String),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { color: '#9ca3af', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#f3f4f6' } },
        axisLabel: {
          color: '#9ca3af',
          fontSize: 10,
          formatter: (v: number) => (v >= 10000 ? `${v / 10000}万` : `${v}`),
        },
      },
      series: [
        {
          type: variant,
          data: values,
          itemStyle:
            variant === 'bar'
              ? {
                  color,
                  borderRadius: [4, 4, 0, 0],
                }
              : { color },
          lineStyle: variant === 'line' ? { color, width: 2 } : undefined,
          symbol: variant === 'line' ? 'circle' : undefined,
          symbolSize: variant === 'line' ? 6 : undefined,
          barMaxWidth: 36,
          markLine:
            baseline !== undefined
              ? {
                  silent: true,
                  symbol: 'none',
                  label: {
                    formatter: `基线 ${baseline.toLocaleString('zh-CN')}`,
                    color: '#9ca3af',
                    fontSize: 10,
                  },
                  lineStyle: { color: '#9ca3af', type: 'dashed', width: 1 },
                  data: [{ yAxis: baseline }],
                }
              : undefined,
        },
      ],
    };

    chart.setOption(option);

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [categories, values, variant, color, baseline, unit]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}
