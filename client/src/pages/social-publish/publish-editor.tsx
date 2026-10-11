import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Save, Send, Trash2, Upload } from 'lucide-react';
import type {
  PublishTask,
  PublishTaskInput,
  SocialAccount,
} from '@shared/api.interface';
import {
  PLATFORM_MAP,
  PUBLISH_FIELD_SUPPORT,
  PUBLISH_TYPE_LABELS,
  PUBLISH_TYPE_PLATFORMS,
  type PublishType,
} from '@shared/platforms';
import {
  createPublishTask,
  getPublishTask,
  listAccounts,
  submitPublishTask,
  updatePublishTask,
  uploadPublishFile,
} from '@client/src/api/social';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { resolveErrorMessage } from '../social-analytics/helpers';
import PublishTypeDialog from './publish-type-dialog';

/** 平台特有字段定义（编辑页按选中平台展示，存 platformFields） */
interface ExtraField {
  key: string;
  label: string;
  type: 'text' | 'select';
  options?: { value: string; label: string }[];
}

const PLATFORM_EXTRA_FIELDS: Record<string, ExtraField[]> = {
  bilibili: [
    { key: 'tid', label: '分区ID', type: 'text' },
    { key: 'tag', label: '标签（逗号分隔）', type: 'text' },
    {
      key: 'copyright',
      label: '自制/转载',
      type: 'select',
      options: [
        { value: '1', label: '原创' },
        { value: '2', label: '转载' },
      ],
    },
  ],
  youtube: [
    {
      key: 'madeForKids',
      label: '儿童内容声明',
      type: 'select',
      options: [
        { value: 'false', label: '不是儿童内容' },
        { value: 'true', label: '是儿童内容' },
      ],
    },
    {
      key: 'privacy',
      label: 'YouTube 可见性',
      type: 'select',
      options: [
        { value: 'public', label: '公开' },
        { value: 'unlisted', label: '不公开列出' },
        { value: 'private', label: '私密' },
      ],
    },
  ],
  kuaishou: [{ key: 'category', label: '分类', type: 'text' }],
  shipinhao: [{ key: 'shortTitle', label: '短标题（封面显示 6-16 字）', type: 'text' }],
};

const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov';
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';

export default function PublishEditor() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') as PublishType | null;
  const navigate = useNavigate();

  const [publishType, setPublishType] = useState<PublishType | null>(initialType);
  const [loading, setLoading] = useState<boolean>(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [coverFileKey, setCoverFileKey] = useState<string | null>(null);
  const [mediaFileKeys, setMediaFileKeys] = useState<string[]>([]);
  const [mediaNames, setMediaNames] = useState<string[]>([]);
  const [platformFields, setPlatformFields] = useState<Record<string, Record<string, unknown>>>({});
  const [targets, setTargets] = useState<{ platform: string; accountId: string }[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [scheduleAt, setScheduleAt] = useState<string>('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [uploading, setUploading] = useState(false);

  /* 加载已有发布单 */
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const task = await getPublishTask(id);
      setPublishType(task.publishType);
      setTitle(task.title);
      setBody(task.body ?? '');
      setTopic(task.topic ?? '');
      setLocation(task.location ?? '');
      setVisibility(task.visibility);
      setCoverFileKey(task.coverFileKey);
      setMediaFileKeys(task.mediaFileKeys);
      setPlatformFields(task.platformFields ?? {});
      setTargets(task.targets.map((t) => ({ platform: t.platform, accountId: t.accountId })));
      if (task.status === 'scheduled' && task.scheduledAt) {
        setScheduleEnabled(true);
        setScheduleAt(task.scheduledAt.slice(0, 16));
      }
    } catch (e) {
      setError(resolveErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await listAccounts({ status: 'active' }));
    } catch {
      /* 账号加载失败不阻塞 */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadAccounts();
  }, [load, loadAccounts]);

  /* 平台特有字段变更 */
  const patchPlatformField = (platform: string, key: string, value: unknown) => {
    setPlatformFields((prev) => ({
      ...prev,
      [platform]: { ...(prev[platform] ?? {}), [key]: value },
    }));
  };

  const platformExtraValue = (platform: string, key: string): string => {
    const v = platformFields[platform]?.[key];
    return v === undefined || v === null ? '' : String(v);
  };

  /* 账号选择（按发布类型支持的平台过滤） */
  const supportedPlatforms = useMemo(
    () => (publishType ? PUBLISH_TYPE_PLATFORMS[publishType] : []),
    [publishType],
  );
  const accountsByPlatform = useMemo(() => {
    const map = new Map<string, SocialAccount[]>();
    for (const a of accounts) {
      if (!supportedPlatforms.includes(a.platform)) continue;
      const arr = map.get(a.platform) ?? [];
      arr.push(a);
      map.set(a.platform, arr);
    }
    return map;
  }, [accounts, supportedPlatforms]);

  const toggleAccount = (accountId: string) => {
    setTargets((prev) =>
      prev.some((t) => t.accountId === accountId)
        ? prev.filter((t) => t.accountId !== accountId)
        : [...prev, { platform: accounts.find((a) => a.id === accountId)?.platform ?? '', accountId }],
    );
  };

  /* 字段不支持标注：当前选中平台中不支持该字段的平台 */
  const unsupportedOf = (field: string): string => {
    const support = PUBLISH_FIELD_SUPPORT[field];
    if (!support) return '';
    const selectedPlatforms = new Set(targets.map((t) => t.platform));
    const unsupported = support.platforms.filter((p) => !selectedPlatforms.has(p));
    const unselected = [...selectedPlatforms].filter((p) => !support.platforms.includes(p));
    return [...unselected].length ? `该字段不支持：${unselected.map((p) => PLATFORM_MAP[p]?.name ?? p).join('、')}` : '';
  };

  /* 文件上传 */
  const handleFiles = async (files: FileList | null, kind: 'media' | 'cover') => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      if (kind === 'cover') {
        const r = await uploadPublishFile(files[0]);
        setCoverFileKey(r.fileKey);
      } else {
        const keys: string[] = [];
        const names: string[] = [];
        for (const f of Array.from(files)) {
          const r = await uploadPublishFile(f);
          keys.push(r.fileKey);
          names.push(f.name);
        }
        setMediaFileKeys((prev) => [...prev, ...keys]);
        setMediaNames((prev) => [...prev, ...names]);
      }
    } catch (e) {
      setError(`上传失败：${resolveErrorMessage(e)}`);
    } finally {
      setUploading(false);
    }
  };

  /* 保存/提交 */
  const buildInput = (): PublishTaskInput => {
    if (!publishType) throw new Error('缺少发布类型');
    return {
      publishType,
      title,
      body,
      topic,
      location,
      coverFileKey,
      mediaFileKeys,
      platformFields,
      visibility,
      targets,
    };
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setError(null);
    try {
      const input = buildInput();
      const task = id
        ? await updatePublishTask(id, { ...input, asDraft: true })
        : await createPublishTask({ ...input, asDraft: true });
      navigate(`/publish/${task.id}`);
    } catch (e) {
      setError(resolveErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePublishNow = async () => {
    setSaving(true);
    setError(null);
    try {
      const input = buildInput();
      const task = id
        ? await updatePublishTask(id, input)
        : await createPublishTask(input);
      await submitPublishTask(task.id, { asDraft: false });
      navigate('/publish');
    } catch (e) {
      setError(resolveErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleAt) {
      setError('请先选择定时发布时间');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = buildInput();
      const task = id
        ? await updatePublishTask(id, input)
        : await createPublishTask(input);
      const iso = new Date(scheduleAt).toISOString();
      await submitPublishTask(task.id, { scheduledAt: iso });
      navigate('/publish');
    } catch (e) {
      setError(resolveErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-8 pt-8 pb-20 space-y-8">
        <Skeleton className="h-[72px] w-full rounded-none" />
        <Skeleton className="h-[400px] w-full rounded-none" />
      </div>
    );
  }

  if (!publishType) {
    return (
      <PublishTypeDialog
        onSelect={(type) => {
          navigate(`/publish/new?type=${type}`);
        }}
        onClose={() => navigate('/publish')}
      />
    );
  }

  const extraFields = PLATFORM_EXTRA_FIELDS;
  const selectedPlatforms = [...new Set(targets.map((t) => t.platform))];

  return (
    <div className="max-w-7xl mx-auto px-8 pt-8 pb-20 space-y-8">
      <button
        type="button"
        onClick={() => navigate('/publish')}
        className="mb-4 flex items-center gap-1.5 text-[12px] font-medium text-[#94A3B8] transition-colors hover:text-[#0033A0]"
      >
        <ArrowLeft className="size-3.5" />
        返回发布列表
      </button>

      {error && (
        <div className="rounded-none border border-[#EF4444] bg-[#FEF2F2] px-4 py-3 text-[12px] font-medium text-[#EF4444]">
          {error}
        </div>
      )}

      {/* 01 发布内容 */}
      <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
        <div className="mb-6">
          <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
            01. 发布内容 · {PUBLISH_TYPE_LABELS[publishType]}
          </p>
          <p className="text-[10px] font-medium text-[#94A3B8]">
            PUBLISH CONTENT · 文件仅发布流程临时使用，发布完成后自动清除
          </p>
        </div>

        {publishType === 'video' && (
          <label className="flex h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-none border border-dashed border-[#E2E8F0] bg-[#F8FAFC] transition-colors hover:border-[#0033A0]">
            <Upload className="size-8 text-[#94A3B8]" />
            <span className="text-[12px] font-bold text-[#475569]">
              {uploading ? '上传中…' : '点击选择视频文件（MP4/WebM/MOV）'}
            </span>
            <input
              type="file"
              accept={VIDEO_ACCEPT}
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files, 'media')}
            />
          </label>
        )}
        {publishType === 'image' && (
          <label className="flex h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-none border border-dashed border-[#E2E8F0] bg-[#F8FAFC] transition-colors hover:border-[#0033A0]">
            <Upload className="size-7 text-[#94A3B8]" />
            <span className="text-[12px] font-bold text-[#475569]">
              {uploading ? '上传中…' : '点击选择图片（可多选，JPG/PNG/WebP/GIF）'}
            </span>
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files, 'media')}
            />
          </label>
        )}

        {/* 已选主体文件 */}
        {mediaFileKeys.length > 0 && (
          <div className="mt-4">
            {publishType === 'image' ? (
              <div className="flex flex-wrap gap-3">
                {mediaFileKeys.map((key, i) => (
                  <div key={key} className="group relative">
                    <img
                      src={`/api/social/files/${key}`}
                      alt=""
                      className="size-20 rounded-none object-cover"
                    />
                    <button
                      type="button"
                      className="absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full bg-[#EF4444] text-white group-hover:flex"
                      onClick={() => {
                        setMediaFileKeys((prev) => prev.filter((k) => k !== key));
                        setMediaNames((prev) => prev.filter((_, idx) => idx !== i));
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-none border border-[#E2E8F0] px-4 py-3">
                <span className="text-[12px] font-medium text-[#475569]">
                  {mediaNames[0] ?? mediaFileKeys[0]}
                </span>
                <button
                  type="button"
                  className="text-[12px] font-bold text-[#EF4444] hover:underline"
                  onClick={() => {
                    setMediaFileKeys([]);
                    setMediaNames([]);
                  }}
                >
                  移除
                </button>
              </div>
            )}
          </div>
        )}

        {/* 封面 */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
          <label className="flex h-[100px] cursor-pointer flex-col items-center justify-center gap-1 rounded-none border border-dashed border-[#E2E8F0] bg-[#F8FAFC] transition-colors hover:border-[#0033A0]">
            {coverFileKey ? (
              <img src={`/api/social/files/${coverFileKey}`} alt="" className="h-full w-full object-cover" />
            ) : (
              <>
                <Upload className="size-5 text-[#94A3B8]" />
                <span className="text-[10px] font-bold text-[#94A3B8]">封面</span>
              </>
            )}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files, 'cover')}
            />
          </label>
          <div className="flex flex-col justify-center gap-1">
            <p className="text-[12px] font-bold text-[#1A1A1A]">设置封面</p>
            <p className="text-[10px] font-medium text-[#94A3B8]">
              不设置则平台自动截帧；{unsupportedOf('cover') || '抖音/B站/快手/YouTube 支持自定义封面'}
            </p>
          </div>
        </div>
      </section>

      {/* 02 基本信息 */}
      <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
        <div className="mb-6">
          <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
            02. 基本信息
          </p>
          <p className="text-[10px] font-medium text-[#94A3B8]">
            BASIC INFO · 非通用字段标注「不支持哪些平台」
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field label="标题" unsupported={unsupportedOf('title')}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="各平台标题（微博发博无标题字段，自动省略）"
              className="w-full rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#0033A0]"
            />
          </Field>
          <Field label="话题" unsupported={unsupportedOf('topic')}>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="#话题1 #话题2（逗号或空格分隔）"
              className="w-full rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#0033A0]"
            />
          </Field>
          <Field label="位置" unsupported={unsupportedOf('location')}>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="可选，如：广东惠州"
              className="w-full rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#0033A0]"
            />
          </Field>
          <Field label="谁可以看" unsupported={unsupportedOf('visibility')}>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
              className="w-full rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#0033A0]"
            >
              <option value="public">公开</option>
              <option value="private">私密</option>
            </select>
          </Field>
        </div>

        <div className="mt-4">
          <Field label={publishType === 'article' ? '文章正文' : '正文/描述'} unsupported={unsupportedOf('body')}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={publishType === 'article' ? 14 : 6}
              placeholder={publishType === 'article' ? '文章正文（抖音长图文 / 微博头条文章）' : '正文内容，话题可用 # 内嵌'}
              className="w-full resize-y rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#0033A0]"
            />
          </Field>
        </div>

        {/* 平台特有字段 */}
        {selectedPlatforms.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {selectedPlatforms.map((platform) =>
              (extraFields[platform] ?? []).map((f) => (
                <Field key={`${platform}-${f.key}`} label={`${f.label}（${PLATFORM_MAP[platform]?.name ?? platform}）`}>
                  {f.type === 'select' ? (
                    <select
                      value={platformExtraValue(platform, f.key)}
                      onChange={(e) => patchPlatformField(platform, f.key, e.target.value)}
                      className="w-full rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#0033A0]"
                    >
                      <option value="">未设置</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={platformExtraValue(platform, f.key)}
                      onChange={(e) => patchPlatformField(platform, f.key, e.target.value)}
                      className="w-full rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#0033A0]"
                    />
                  )}
                </Field>
              )),
            )}
          </div>
        )}
      </section>

      {/* 03 发布账号 */}
      <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
        <div className="mb-6">
          <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
            03. 发布账号 · 已选 {targets.length} 个
          </p>
          <p className="text-[10px] font-medium text-[#94A3B8]">
            TARGETS · 可勾选多个平台多个账号批量发布
          </p>
        </div>
        {accountsByPlatform.size === 0 ? (
          <p className="text-[12px] font-medium text-[#94A3B8]">
            当前发布类型无可选账号，请先在账号矩阵完成授权
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[...accountsByPlatform.entries()].map(([platform, list]) => (
              <div key={platform} className="rounded-none border border-[#E2E8F0] p-4">
                <p className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-tight text-[#0033A0]">
                  {PLATFORM_MAP[platform as keyof typeof PLATFORM_MAP]?.name ?? platform}
                </p>
                <div className="space-y-2">
                  {list.map((acct) => {
                    const checked = targets.some((t) => t.accountId === acct.id);
                    return (
                      <label
                        key={acct.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-none border px-3 py-2 transition-colors',
                          checked ? 'border-[#0033A0] bg-[#EFF4FF]' : 'border-[#E2E8F0] hover:bg-slate-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAccount(acct.id)}
                          className="size-4 accent-[#0033A0]"
                        />
                        {acct.avatar ? (
                          <img
                            src={`/avatar-proxy?url=${encodeURIComponent(acct.avatar)}`}
                            referrerPolicy="no-referrer"
                            alt=""
                            className="size-7 rounded-none object-cover"
                          />
                        ) : (
                          <span className="flex size-7 items-center justify-center rounded-none bg-[#F1F5F9] text-[10px] font-black text-[#475569]">
                            {acct.accountName.slice(0, 1)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#1A1A1A]">
                          {acct.accountName}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 04 发布设置 */}
      <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
        <div className="mb-6">
          <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
            04. 发布设置
          </p>
          <p className="text-[10px] font-medium text-[#94A3B8]">
            SCHEDULE · 定时为本地到点触发（需后端服务运行）
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          {/* 定时发布：勾选即生效 */}
          <div className="min-w-[320px] flex-1">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="size-4 accent-[#0033A0]"
              />
              <span className="text-sm font-bold text-[#1A1A1A]">定时发布</span>
              <span className="text-[10px] font-medium text-[#94A3B8]">
                勾选后设置时间，到点自动发布
              </span>
            </label>
            {scheduleEnabled && (
              <div className="mt-3">
                <p className="mb-2 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">
                  定时发布时间
                </p>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="w-full rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#0033A0]"
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-none border-[#94A3B8] text-[#475569] hover:bg-slate-100"
              disabled={saving || uploading}
              onClick={() => void handleSaveDraft()}
            >
              <Save className="size-4" />
              保存草稿
            </Button>
            <Button
              type="button"
              className={cn(
                'rounded-none text-white',
                scheduleEnabled ? 'bg-[#F59E0B] hover:bg-[#D97706]' : 'bg-[#0033A0] hover:bg-[#00236E]',
              )}
              disabled={saving || uploading}
              onClick={() => void (scheduleEnabled ? handleSchedule() : handlePublishNow())}
            >
              {scheduleEnabled ? (
                <>
                  <CalendarClock className="size-4" />
                  定时发布
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  立即发布
                </>
              )}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[10px] font-medium text-[#94A3B8]">
          发布完成后临时文件自动清除，不占用系统存储；失败的平台账号保留文件可重试。
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  unsupported,
  children,
}: {
  label: string;
  unsupported?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">
        {label}
      </p>
      {children}
      {unsupported ? (
        <p className="mt-1 text-[10px] font-medium text-[#EF4444]">{unsupported}</p>
      ) : null}
    </div>
  );
}
