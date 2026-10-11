import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { MapPin, X } from 'lucide-react';
import { toast } from 'sonner';
import { searchGeoPlaces } from '@client/src/api/social';
import type { GeoPlace } from '@shared/api.interface';
import { resolveErrorMessage } from '../social-analytics/helpers';

interface LocationInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

/**
 * 位置联想输入：输入关键词（防抖 300ms）调高德接口，
 * 下拉展示候选地址，点击选中；也可手动输入（不改值）。
 */
const LocationInput: FC<LocationInputProps> = ({
  value,
  onChange,
  placeholder,
}) => {
  const [keyword, setKeyword] = useState(value);
  const [options, setOptions] = useState<GeoPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    setKeyword(value);
  }, [value]);

  // 点击外部关闭下拉
  useEffect(() => {
    const onDocClick = (e: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const doSearch = async (kw: string): Promise<void> => {
    if (!kw.trim()) {
      setOptions([]);
      setOpen(false);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const list = await searchGeoPlaces(kw);
      if (seq !== seqRef.current) return; // 过期响应丢弃
      setOptions(list);
      setOpen(true);
    } catch (e) {
      if (seq === seqRef.current) {
        setOptions([]);
        setOpen(false);
        toast.error(resolveErrorMessage(e));
      }
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };

  const onInput = (raw: string): void => {
    setKeyword(raw);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void doSearch(raw);
    }, 300);
  };

  const pick = (p: GeoPlace): void => {
    onChange(p.name);
    setKeyword(p.name);
    setOpen(false);
  };

  const clear = (): void => {
    onChange('');
    setKeyword('');
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-1.5 rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-sm transition-colors focus-within:border-[#0033A0]">
        <MapPin className="size-4 shrink-0 text-[#94A3B8]" />
        <input
          value={keyword}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => {
            setFocused(true);
            if (keyword.trim()) void doSearch(keyword);
          }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder ?? '输入关键词搜索地址，如：深圳湾公园'}
          className="w-full border-none bg-transparent text-sm outline-none placeholder:text-[#94A3B8]"
        />
        {keyword && (
          <button
            type="button"
            onClick={clear}
            className="flex shrink-0 items-center justify-center text-[#94A3B8] transition-colors hover:text-[#475569]"
            aria-label="清空位置"
          >
            <X className="size-4" />
          </button>
        )}
        {loading && <span className="shrink-0 text-[11px] font-medium text-[#94A3B8]">搜索中…</span>}
      </div>

      {open && options.length > 0 && focused !== false && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[260px] overflow-y-auto rounded-none border border-[#E2E8F0] bg-white shadow-md">
          {options.map((p, i) => (
            <button
              key={`${p.name}-${i}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-[#EFF4FF]"
            >
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-[#0033A0]" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[#1A1A1A]">
                  {p.name}
                </span>
                {p.address && (
                  <span className="block truncate text-[12px] font-medium text-[#94A3B8]">
                    {p.address}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && options.length === 0 && !loading && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-[12px] font-medium text-[#94A3B8] shadow-md">
          未找到相关地址，可直接手动输入
        </div>
      )}
    </div>
  );
};

export default LocationInput;
