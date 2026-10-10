import {
  useCallback,
  useEffect,
  useState,
  type FC,
} from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Button } from '@client/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import * as socialApi from '@client/src/api/social';
import type {
  ContentVariant,
  SocialContentDetail,
  SocialPlatform,
  VariantInput,
} from '@shared/api.interface';
import { PLATFORMS, type PlatformMeta } from '@shared/platforms';

interface VariantValue {
  title: string;
  body: string;
}

type VariantValues = Record<SocialPlatform, VariantValue>;

function buildInitialValues(detail: SocialContentDetail): VariantValues {
  const values: VariantValues = {
    douyin: { title: '', body: '' },
    xiaohongshu: { title: '', body: '' },
    bilibili: { title: '', body: '' },
    shipinhao: { title: '', body: '' },
    weibo: { title: '', body: '' },
    kuaishou: { title: '', body: '' },
    youtube: { title: '', body: '' },
  };
  for (const platform of PLATFORMS) {
    const existing: ContentVariant | undefined = detail.variants.find(
      (variant: ContentVariant) => variant.platform === platform.value,
    );
    values[platform.value] = {
      title: existing?.adaptedTitle ?? detail.title,
      body: existing?.adaptedBody ?? detail.body ?? '',
    };
  }
  return values;
}

interface ContentVariantsDialogProps {
  open: boolean;
  contentId: string | null;
  onClose: () => void;
}

const ContentVariantsDialog: FC<ContentVariantsDialogProps> = ({
  open,
  contentId,
  onClose,
}) => {
  const [detail, setDetail] = useState<SocialContentDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [values, setValues] = useState<VariantValues | null>(null);
  const [dirtyPlatforms, setDirtyPlatforms] = useState<Set<string>>(
    new Set<string>(),
  );

  const applyDetail = useCallback((detailData: SocialContentDetail) => {
    setDetail(detailData);
    setValues(buildInitialValues(detailData));
    setDirtyPlatforms(new Set<string>());
  }, []);

  useEffect(() => {
    if (!open || contentId === null) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const detailData = await socialApi.getContent(contentId);
        if (cancelled) return;
        applyDetail(detailData);
      } catch (err) {
        if (cancelled) return;
        logger.error('获取内容详情失败', err);
        setError('内容详情加载失败，请稍后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, contentId, applyDetail]);

  const updateVariant = (
    platform: SocialPlatform,
    field: 'title' | 'body',
    value: string,
  ) => {
    setValues((prev: VariantValues | null) => {
      if (prev === null) return prev;
      return {
        ...prev,
        [platform]: { ...prev[platform], [field]: value },
      };
    });
    setDirtyPlatforms((prev: Set<string>) => {
      if (prev.has(platform)) return prev;
      const next = new Set<string>(prev);
      next.add(platform);
      return next;
    });
  };

  const handleSave = async () => {
    if (contentId === null || values === null) return;
    const changed: SocialPlatform[] = PLATFORMS.filter((platform: PlatformMeta) =>
      dirtyPlatforms.has(platform.value),
    ).map((platform: PlatformMeta) => platform.value);
    if (changed.length === 0) {
      toast.info('没有修改需要保存');
      return;
    }
    const variants: VariantInput[] = changed.map(
      (platform: SocialPlatform) => ({
        platform,
        adaptedTitle:
          values[platform].title.trim() === '' ? null : values[platform].title,
        adaptedBody:
          values[platform].body.trim() === '' ? null : values[platform].body,
      }),
    );
    setSaving(true);
    try {
      await socialApi.saveVariants(contentId, { variants });
      toast.success(`已保存 ${variants.length} 个平台的适配`);
      const fresh = await socialApi.getContent(contentId);
      applyDetail(fresh);
    } catch (err) {
      logger.error('保存适配失败', err);
      toast.error('保存适配失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    if (contentId === null) return;
    socialApi
      .getContent(contentId)
      .then((detailData: SocialContentDetail) => {
        applyDetail(detailData);
      })
      .catch((err: unknown) => {
        logger.error('获取内容详情失败', err);
        setError('内容详情加载失败，请稍后重试');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#94A3B8]" />
          <span className="ml-2 text-[12px] font-medium text-slate-600">加载适配数据...</span>
        </div>
      );
    }
    if (error !== null) {
      return (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-[12px] font-medium text-[#EF4444]">{error}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRetry}
            className="gap-1.5 rounded-none text-sm text-[#64748B]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重试
          </Button>
        </div>
      );
    }
    if (detail === null || values === null) {
      return null;
    }
    return (
      <div className="max-h-[58vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {PLATFORMS.map((platform: PlatformMeta) => {
            const variantValue = values[platform.value];
            const titleLength = [...variantValue.title].length;
            const overLimit = titleLength > platform.titleLimit;
            const dirty = dirtyPlatforms.has(platform.value);
            return (
              <div
                key={platform.value}
                data-ai-section-type="card-menu"
                className="rounded-none border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-[#0033A0]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: platform.color }}
                    />
                    <span className="text-sm font-bold text-[#0033A0]">
                      {platform.name}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#94A3B8]">
                      {platform.value}
                    </span>
                  </div>
                  {dirty ? (
                    <span className="rounded-sm bg-[#FFFBEB] px-1.5 py-0.5 text-[12px] font-bold text-[#F59E0B]">
                      已修改
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-[12px] font-medium text-slate-600">
                  {platform.adaptTip}
                </p>
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#94A3B8]">
                      标题
                    </span>
                    <span
                      className={`font-mono text-sm ${
                        overLimit ? 'font-bold text-[#EF4444]' : 'text-[#94A3B8]'
                      }`}
                    >
                      {titleLength}/{platform.titleLimit}
                    </span>
                  </div>
                  <Input
                    value={variantValue.title}
                    onChange={(event) => {
                      updateVariant(platform.value, 'title', event.target.value);
                    }}
                    className={`mt-1 h-9 rounded-none text-base ${
                      overLimit
                        ? 'border-[#EF4444] focus-visible:ring-[#EF4444]'
                        : 'border-[#E2E8F0]'
                    }`}
                  />
                </div>
                <div className="mt-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#94A3B8]">
                    正文
                  </span>
                  <Textarea
                    rows={4}
                    value={variantValue.body}
                    onChange={(event) => {
                      updateVariant(platform.value, 'body', event.target.value);
                    }}
                    className="mt-1 rounded-none border-[#E2E8F0] text-base text-[#1E293B]"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value: boolean) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto rounded-none border-t-[3px] border-t-[#0033A0] p-6 shadow-md">
        <DialogHeader>
          <DialogTitle className="font-bold tracking-tight text-[#1E293B]">
            多平台适配
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#94A3B8]">
              Platform Variants
            </span>
            {detail !== null ? (
              <span className="text-[12px] font-medium text-slate-600">
                {detail.title} · 已适配 {detail.variants.length}/7
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {renderBody()}

        <DialogFooter className="pt-4">
          <Button
            variant="ghost"
            onClick={onClose}
            className="rounded-none text-base text-[#6B7280]"
          >
            关闭
          </Button>
          <Button
            onClick={() => {
              void handleSave();
            }}
            disabled={saving || loading || detail === null}
            className="rounded-none bg-[#0033A0] px-6 text-base font-semibold text-white hover:bg-[#0033A0]/90"
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            {saving
              ? '保存中...'
              : dirtyPlatforms.size > 0
                ? `保存全部适配（${dirtyPlatforms.size}）`
                : '保存全部适配'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ContentVariantsDialog;
