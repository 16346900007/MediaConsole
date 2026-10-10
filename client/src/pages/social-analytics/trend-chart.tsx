import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { MetricsDailyPoint } from '@shared/api.interface';

interface TrendChartProps {
  daily: MetricsDailyPoint[];
}

/** 按日趋势折线图：主序列播放为深蓝，点赞/涨粉为辅助蓝阶 */
const TrendChart: React.FC<TrendChartProps> = ({ daily }) => {
  const option: EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        borderWidth: 1,
        padding: 12,
        textStyle: {
          color: 'rgb(26, 26, 26)',
          fontSize: 12,
          fontWeight: 700,
        },
      },
      legend: {
        bottom: 0,
        icon: 'rect',
        itemWidth: 10,
        itemHeight: 6,
        itemGap: 12,
        textStyle: { color: '#94A3B8', fontSize: 10, fontWeight: 700 },
      },
      grid: { left: 0, right: 0, top: 20, bottom: 16, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: daily.map((point: MetricsDailyPoint) => point.date),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#94A3B8',
          fontSize: 10,
          fontWeight: 700,
          formatter: (value: string) => value.slice(5),
        },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: '#E2E8F0' } },
      },
      series: [
        {
          name: '播放',
          type: 'line',
          smooth: false,
          data: daily.map((point: MetricsDailyPoint) => point.views),
          lineStyle: { width: 2, color: '#0033A0' },
          itemStyle: { color: '#0033A0' },
          symbol: 'circle',
          symbolSize: 6,
        },
        {
          name: '点赞',
          type: 'line',
          smooth: false,
          data: daily.map((point: MetricsDailyPoint) => point.likes),
          lineStyle: { width: 2, color: '#0066FF' },
          itemStyle: { color: '#0066FF' },
          symbol: 'circle',
          symbolSize: 6,
        },
        {
          name: '涨粉',
          type: 'line',
          smooth: false,
          data: daily.map((point: MetricsDailyPoint) => point.followersDelta),
          lineStyle: { width: 2, color: '#4D94FF' },
          itemStyle: { color: '#4D94FF' },
          symbol: 'circle',
          symbolSize: 6,
        },
      ],
    }),
    [daily],
  );

  return <ReactECharts option={option} theme="ud" className="h-[300px] w-full" />;
};

export default TrendChart;
