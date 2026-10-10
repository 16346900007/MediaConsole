import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { MetricsPlatformPoint } from '@shared/api.interface';
import { PLATFORM_MAP } from '@shared/platforms';

const PIE_COLORS: string[] = [
  '#0033A0',
  '#0066FF',
  '#4D94FF',
  '#99C2FF',
  '#CCE0FF',
];
const REST_COLOR = '#CCE0FF';

interface PlatformPieProps {
  points: MetricsPlatformPoint[];
}

/** 平台分布环形图：最多展示 4 个平台，其余合并为「其他」（单图 ≤5 类别） */
const PlatformPie: React.FC<PlatformPieProps> = ({ points }) => {
  const option: EChartsOption = useMemo(() => {
    const sorted = [...points].sort(
      (a: MetricsPlatformPoint, b: MetricsPlatformPoint) => b.views - a.views,
    );
    const top = sorted.slice(0, 4);
    const restViews = sorted
      .slice(4)
      .reduce((total: number, item: MetricsPlatformPoint) => total + item.views, 0);

    const data = top.map((item: MetricsPlatformPoint, index: number) => ({
      name: PLATFORM_MAP[item.platform].name,
      value: item.views,
      itemStyle: { color: PIE_COLORS[index] ?? '#CCE0FF' },
    }));
    if (restViews > 0) {
      data.push({ name: '其他', value: restViews, itemStyle: { color: REST_COLOR } });
    }

    return {
      tooltip: {
        trigger: 'item',
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
      series: [
        {
          type: 'pie',
          radius: ['40%', '60%'],
          center: ['50%', '45%'],
          padAngle: 2,
          borderWidth: 0,
          label: { show: false },
          emphasis: { label: { show: false } },
          data,
        },
      ],
    };
  }, [points]);

  return <ReactECharts option={option} theme="ud" className="h-[300px] w-full" />;
};

export default PlatformPie;
