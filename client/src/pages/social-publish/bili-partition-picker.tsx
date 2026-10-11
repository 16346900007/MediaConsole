/**
 * B站投稿分区选择（单选下拉）：
 * B站投稿页「分区」只有一个下拉，选项来自创作中心接口
 * member.bilibili.com/x/vupre/web/archive/human/type2/list（33 个分类，无二级），
 * 由后端无头模式带登录态获取（10 分钟缓存，先返回旧缓存后台刷新）。
 */
import { useEffect, useMemo, useState } from 'react';
import type { BiliPartition } from '@shared/api.interface';
import { fetchBilibiliPartitions } from '@client/src/api/social';

export interface BiliPartitionValue {
  tid: number;
  partitionName: string;
  subPartitionName: string;
}

interface Props {
  value?: BiliPartitionValue;
  onChange: (v: BiliPartitionValue | null) => void;
}

export default function BiliPartitionPicker({ value, onChange }: Props) {
  const [partitions, setPartitions] = useState<BiliPartition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBilibiliPartitions()
      .then((data) => {
        if (!cancelled) setPartitions(data);
      })
      .catch(() => {
        if (!cancelled) setError('分区加载失败，请重试');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 候选：33 个投稿分类（后端返回 children 为空数组，单选） */
  const candidates = useMemo(() => (partitions ?? []).filter((p) => p.tid && p.name), [partitions]);

  const selectCls =
    'w-full rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#0033A0] disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]';

  /* 加载中/失败：保留 select 框形态（禁用），避免表单区塌陷 */
  if (error) {
    return (
      <div className="w-full">
        <select disabled className={selectCls}>
          <option value="">分区加载失败，请重试</option>
        </select>
        <p className="mt-1 text-[10px] font-medium text-[#EF4444]">{error}</p>
      </div>
    );
  }
  if (!partitions) {
    return (
      <select disabled className={selectCls}>
        <option value="">分区加载中（无头模式实时获取）…</option>
      </select>
    );
  }

  return (
    <select
      value={value?.tid ? String(value.tid) : ''}
      onChange={(e) => {
        const p = candidates.find((x) => x.tid === Number(e.target.value));
        if (!p) return;
        onChange({ tid: p.tid, partitionName: p.name, subPartitionName: p.name });
      }}
      className={selectCls}
    >
      <option value="">请选择分区</option>
      {candidates.map((p) => (
        <option key={p.tid} value={String(p.tid)}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
