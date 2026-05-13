'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export interface SparklineProps {
  /** Data points (most recent last). */
  values: number[];
  /** Optional category labels matching values length (e.g. dates). */
  labels?: string[];
  /** Stroke + fill base color. */
  color?: string;
  /** Container height in px. Default 48. */
  height?: number;
  /** Whether to show area fill. Default true. */
  area?: boolean;
  /** Whether to display tooltip on hover. Default true. */
  tooltip?: boolean;
}

/**
 * Tiny inline trend sparkline. Designed for HPI / cluster distance / case count
 * quick-glance change indicators. No axis, minimal chrome.
 */
export function Sparkline({
  values,
  labels,
  color = '#0891b2',
  height = 48,
  area = true,
  tooltip = true,
}: SparklineProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const cats = labels ?? values.map((_, i) => String(i));

    chart.setOption({
      grid: { left: 0, right: 0, top: 4, bottom: 4 },
      xAxis: { type: 'category', data: cats, show: false, boundaryGap: false },
      yAxis: { type: 'value', show: false, scale: true },
      tooltip: tooltip
        ? {
            trigger: 'axis',
            formatter: (params: any) => {
              const p = Array.isArray(params) ? params[0] : params;
              return `${p.axisValue}<br/><b>${p.value}</b>`;
            },
            textStyle: { fontSize: 11 },
            axisPointer: { type: 'line', lineStyle: { color: color, width: 1, type: 'dashed' } },
          }
        : { show: false },
      series: [
        {
          type: 'line',
          data: values,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          showSymbol: false,
          lineStyle: { color, width: 2 },
          areaStyle: area
            ? {
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: `${color}55` },
                    { offset: 1, color: `${color}00` },
                  ],
                },
              }
            : undefined,
          emphasis: { focus: 'series' },
        },
      ],
    });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [values, labels, color, area, tooltip]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}
