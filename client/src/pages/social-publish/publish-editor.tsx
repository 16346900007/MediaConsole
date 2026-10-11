import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import {
  ArrowLeft,
  CalendarClock,
  ImagePlus,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  AccountGroup,
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
  listAccountGroups,
  listAccounts,
  submitPublishTask,
  updatePublishTask,
  uploadPublishFile,
} from '@client/src/api/social';
import { PLATFORM_LOGOS } from '@/utils/platform-logos';
import VideoThumbnail from '@/components/VideoThumbnail';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  /** 弹窗预览：类型 + 当前索引 */
  const [preview, setPreview] = useState<{ kind: 'video' | 'image' | 'cover'; index: number } | null>(null);
  /** 选账号弹窗 */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [groups, setGroups] = useState<AccountGroup[]>([]);

  /* 加载账号分组（弹窗分组筛选用） */
  const loadGroups = useCallback(async () => {
    try {
      setGroups(await listAccountGroups());
    } catch {
      /* 分组加载失败不阻塞 */
    }
  }, []);

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
    void loadGroups();
  }, [load, loadAccounts, loadGroups]);

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
  const pickerAccounts = useMemo(
    () => accounts.filter((a) => supportedPlatforms.includes(a.platform)),
    [accounts, supportedPlatforms],
  );

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
  const handleFiles = async (files: File[] | null, kind: 'media' | 'cover') => {
    if (!files?.length) return;
    let list = Array.from(files);
    // 视频最多 5 个：超出部分忽略并提示
    if (kind === 'media' && publishType === 'video') {
      const room = Math.max(0, 5 - mediaFileKeys.length);
      if (list.length > room) {
        setError(`视频最多上传 5 个，已忽略多余文件`);
        list = list.slice(0, room);
      }
      if (list.length === 0) return;
    }
    // 类型校验（drop 不受 input accept 约束，需手动校验）
    const allowed =
      kind === 'cover'
        ? IMAGE_ACCEPT
        : publishType === 'image'
          ? IMAGE_ACCEPT
          : VIDEO_ACCEPT;
    const bad = list.find((f) => {
      const ext = f.name.toLowerCase().split('.').pop() ?? '';
      return !allowed.includes(`.${ext}`) && !allowed.split(',').includes(f.type);
    });
    if (bad) {
      setError(`不支持的文件类型：${bad.name}`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      if (kind === 'cover') {
        const r = await uploadPublishFile(list[0]);
        setCoverFileKey(r.fileKey);
      } else {
        const keys: string[] = [];
        const names: string[] = [];
        for (const f of list) {
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

  /* 三个上传框的 react-dropzone 实例（内部处理 dragenter/dragleave 状态，isDragActive 即悬停提示） */
  const videoDrop = useDropzone({
    accept: { 'video/*': ['.mp4', '.webm', '.mov'] },
    multiple: true,
    onDrop: (files) => void handleFiles(files, 'media'),
  });
  const imageDrop = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'] },
    multiple: true,
    onDrop: (files) => void handleFiles(files, 'media'),
  });
  const coverDrop = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'] },
    multiple: false,
    onDrop: (files) => void handleFiles(files, 'cover'),
  });

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
      <div className="px-8 pt-8 pb-20 space-y-8">
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
    <div className="px-8 pt-8 pb-20 space-y-8">
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
          <div
            {...videoDrop.getRootProps({
              className: cn(
                'relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-none border bg-[#F8FAFC] transition-colors',
                videoDrop.isDragActive
                  ? 'border-2 border-[#0033A0] bg-[#EFF4FF]'
                  : 'border border-dashed border-[#E2E8F0] hover:border-[#0033A0]',
              ),
            })}
          >
            {mediaFileKeys.length > 0 ? (
              <div className="flex w-full flex-col gap-1.5 p-4">
                {mediaFileKeys.map((key, i) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-none border border-[#E2E8F0] bg-white px-3 py-2"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreview({ kind: 'video', index: i });
                      }}
                      title="点击预览"
                    >
                      <VideoThumbnail
                        src={`/api/social/files/${key}`}
                        className="size-14"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-[#1A1A1A]">
                          {i + 1}. {mediaNames[i] ?? key}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="flex size-6 shrink-0 items-center justify-center rounded-none bg-[#FEF2F2] text-[#EF4444] transition-colors hover:bg-[#EF4444] hover:text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMediaFileKeys((prev) => prev.filter((_, idx) => idx !== i));
                        setMediaNames((prev) => prev.filter((_, idx) => idx !== i));
                      }}
                      title="移除视频"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                <p className="mt-1 text-[10px] font-medium text-[#94A3B8]">
                  {mediaFileKeys.length}/5 · 可继续点击或拖拽添加（MP4/WebM/MOV），点击视频可弹窗预览
                </p>
              </div>
            ) : (
              <>
                {uploading ? (
                  <Upload className="size-8 animate-pulse text-[#0033A0]" />
                ) : videoDrop.isDragActive ? (
                  <Upload className="size-8 text-[#0033A0]" />
                ) : (
                  <Upload className="size-8 text-[#94A3B8]" />
                )}
                <span
                  className={cn(
                    'text-[12px] font-bold',
                    videoDrop.isDragActive ? 'text-[#0033A0]' : 'text-[#475569]',
                  )}
                >
                  {uploading
                    ? '上传中…'
                    : videoDrop.isDragActive
                      ? '松开即上传'
                      : '点击或拖拽视频文件到此处（最多 5 个，MP4/WebM/MOV）'}
                </span>
              </>
            )}
            <input {...videoDrop.getInputProps()} className="hidden" />
          </div>
        )}
        {publishType === 'image' && (
          <div
            {...imageDrop.getRootProps({
              className: cn(
                'relative flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-none border bg-[#F8FAFC] transition-colors',
                imageDrop.isDragActive
                  ? 'border-2 border-[#0033A0] bg-[#EFF4FF]'
                  : 'border border-dashed border-[#E2E8F0] hover:border-[#0033A0]',
              ),
            })}
          >
            {mediaFileKeys.length > 0 ? (
              <div className="flex w-full flex-wrap items-center gap-3 p-4">
                {mediaFileKeys.map((key, i) => (
                  <div key={key} className="group relative">
                    <button
                      type="button"
                      className="block"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreview({ kind: 'image', index: i });
                      }}
                      title="点击预览"
                    >
                      <img
                        src={`/api/social/files/${key}`}
                        alt=""
                        className="size-20 rounded-none border border-[#E2E8F0] object-cover transition-opacity group-hover:opacity-90"
                      />
                    </button>
                    <button
                      type="button"
                      className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-[#EF4444] text-white shadow-sm transition-transform hover:scale-110"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMediaFileKeys((prev) => prev.filter((k) => k !== key));
                        setMediaNames((prev) => prev.filter((_, idx) => idx !== i));
                      }}
                      title="移除图片"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="flex size-20 flex-col items-center justify-center gap-1 rounded-none border border-dashed border-[#94A3B8] text-[#94A3B8] transition-colors hover:border-[#0033A0] hover:text-[#0033A0]">
                  <ImagePlus className="size-5" />
                  <span className="text-[10px] font-bold">{uploading ? '上传中…' : '继续添加'}</span>
                </div>
              </div>
            ) : (
              <>
                {uploading ? (
                  <Upload className="size-7 animate-pulse text-[#0033A0]" />
                ) : imageDrop.isDragActive ? (
                  <Upload className="size-7 text-[#0033A0]" />
                ) : (
                  <Upload className="size-7 text-[#94A3B8]" />
                )}
                <span
                  className={cn(
                    'text-[12px] font-bold',
                    imageDrop.isDragActive ? 'text-[#0033A0]' : 'text-[#475569]',
                  )}
                >
                  {uploading
                    ? '上传中…'
                    : imageDrop.isDragActive
                      ? '松开即上传'
                      : '点击或拖拽图片到此处（可多选，JPG/PNG/WebP/GIF）'}
                </span>
              </>
            )}
            <input {...imageDrop.getInputProps()} className="hidden" />
          </div>
        )}

        {/* 封面 */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
          <div
            {...coverDrop.getRootProps({
              className: cn(
                'relative flex h-[100px] cursor-pointer items-center justify-center rounded-none border bg-[#F8FAFC] transition-colors',
                coverDrop.isDragActive
                  ? 'border-2 border-[#0033A0] bg-[#EFF4FF]'
                  : 'border border-dashed border-[#E2E8F0] hover:border-[#0033A0]',
              ),
            })}
          >
            {coverFileKey ? (
              <>
                <button
                  type="button"
                  className="absolute inset-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreview({ kind: 'cover', index: 0 });
                  }}
                  title="点击预览封面"
                />
                <img
                  src={`/api/social/files/${coverFileKey}`}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-[#EF4444] text-white shadow-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCoverFileKey(null);
                  }}
                  title="移除封面"
                >
                  ✕
                </button>
              </>
            ) : (
              <>
                {coverDrop.isDragActive ? (
                  <Upload className="size-5 text-[#0033A0]" />
                ) : (
                  <Upload className="size-5 text-[#94A3B8]" />
                )}
                <span
                  className={cn(
                    'text-[10px] font-bold',
                    coverDrop.isDragActive ? 'text-[#0033A0]' : 'text-[#94A3B8]',
                  )}
                >
                  {coverDrop.isDragActive ? '松开即上传' : '封面（点击或拖拽）'}
                </span>
              </>
            )}
            <input {...coverDrop.getInputProps()} className="hidden" />
          </div>
          <div className="flex flex-col justify-center gap-1">
            <p className="text-[12px] font-bold text-[#1A1A1A]">设置封面</p>
            <p className="text-[10px] font-medium text-[#94A3B8]">
              不设置则平台自动截帧；{unsupportedOf('cover') || '抖音/B站/快手/YouTube 支持自定义封面'}
            </p>
          </div>
        </div>
      </section>

      {/* 02 发布账号 */}
      <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
              02. 发布账号 · 已选 {targets.length} 个
            </p>
            <p className="text-[10px] font-medium text-[#94A3B8]">
              TARGETS · 点击「添加账号」在弹窗中按分组筛选勾选
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="shrink-0 rounded-none bg-[#0033A0] px-5 text-sm font-semibold hover:bg-[#002680]"
          >
            <Plus className="mr-1.5 size-4" />
            添加账号
          </Button>
        </div>
        {targets.length === 0 ? (
          <p className="text-[12px] font-medium text-[#94A3B8]">
            尚未选择账号，点击右上角「添加账号」选择发布目标
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {targets.map((t) => {
              const acct = accounts.find((a) => a.id === t.accountId);
              if (!acct) return null;
              const meta = PLATFORM_MAP[acct.platform as keyof typeof PLATFORM_MAP];
              return (
                <div
                  key={t.accountId}
                  className="flex items-center gap-3 rounded-none border border-[#E2E8F0] bg-white px-3 py-2.5 transition-colors hover:bg-slate-50"
                >
                  <img
                    src={PLATFORM_LOGOS[acct.platform]}
                    alt=""
                    className="size-4 shrink-0 rounded-none"
                  />
                  {acct.avatar ? (
                    <img
                      src={`/avatar-proxy?url=${encodeURIComponent(acct.avatar)}`}
                      referrerPolicy="no-referrer"
                      alt=""
                      className="size-7 shrink-0 rounded-none object-cover"
                    />
                  ) : (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-none bg-[#F1F5F9] text-[10px] font-black text-[#475569]">
                      {acct.accountName.slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-[#1A1A1A]">
                      {acct.accountName}
                    </p>
                    <p className="truncate text-[10px] font-medium text-[#94A3B8]">
                      {meta?.name ?? acct.platform}
                      {acct.groupName ? ` · ${acct.groupName}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleAccount(acct.id)}
                    className="rounded-sm p-1 text-[#94A3B8] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                    aria-label={`移除 ${acct.accountName}`}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 03 基本信息 */}
      <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
        <div className="mb-6">
          <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
            03. 基本信息
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
          <div className="mt-3 max-w-[360px]">
            <p className="mb-2 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">
              定时发布时间
            </p>
            <ScheduleDateTimePicker
              value={scheduleAt}
              onChange={setScheduleAt}
            />
          </div>
        )}
        <p className="mt-4 text-[10px] font-medium text-[#94A3B8]">
          发布完成后临时文件自动清除，不占用系统存储；失败的平台账号保留文件可重试。
        </p>
      </section>

      {/* 小窗预览（视频/图片/封面） */}
      <MediaPreview
        preview={preview}
        keys={
          preview?.kind === 'cover'
            ? coverFileKey
              ? [coverFileKey]
              : []
            : mediaFileKeys
        }
        names={mediaNames}
        onClose={() => setPreview(null)}
        onPrev={() =>
          setPreview((p) => (p ? { ...p, index: Math.max(0, p.index - 1) } : p))
        }
        onNext={(len) =>
          setPreview((p) => (p ? { ...p, index: Math.min(len - 1, p.index + 1) } : p))
        }
      />

      {/* 选账号弹窗 */}
      <AccountPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        accounts={pickerAccounts}
        groups={groups}
        targets={targets}
        onConfirm={(next) => setTargets(next)}
      />

      {/* 底部固定操作栏 */}
      <div className="sticky bottom-0 z-30 -mx-8 flex items-center justify-end gap-2 border-t border-[#E2E8F0] bg-white px-8 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
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

/** 小窗预览弹窗：视频/图片/封面统一，固定宽度居中，不占满屏 */
function MediaPreview({
  preview,
  keys,
  names,
  onClose,
  onPrev,
  onNext,
}: {
  preview: { kind: 'video' | 'image' | 'cover'; index: number } | null;
  keys: string[];
  names: string[];
  onClose: () => void;
  onPrev: () => void;
  onNext: (len: number) => void;
}) {
  if (!preview || keys.length === 0) return null;
  const idx = Math.min(preview.index, keys.length - 1);
  const src = `/api/social/files/${keys[idx]}`;
  const isVideo = preview.kind === 'video';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="w-[720px] max-w-[92vw] rounded-none border border-[#E2E8F0] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-4 py-2.5">
          <p className="truncate text-[12px] font-bold text-[#1A1A1A]">
            {names[idx] ?? keys[idx]}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {keys.length > 1 && (
              <span className="text-[10px] font-bold text-[#94A3B8]">
                {idx + 1}/{keys.length}
              </span>
            )}
            <button
              type="button"
              className="flex size-6 items-center justify-center text-[#475569] transition-colors hover:bg-slate-100"
              onClick={onClose}
              title="关闭"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 p-3">
          {keys.length > 1 && (
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-none border border-[#E2E8F0] text-[#0033A0] transition-colors hover:bg-[#EFF4FF] disabled:opacity-30"
              disabled={idx === 0}
              onClick={onPrev}
              title="上一个"
            >
              ‹
            </button>
          )}
          <div className="min-w-0 flex-1">
            {isVideo ? (
              <video
                key={src}
                src={src}
                controls
                autoPlay
                className="aspect-video w-full rounded-none bg-black object-contain"
              />
            ) : (
              <img
                key={src}
                src={src}
                alt=""
                className="mx-auto max-h-[60vh] w-auto max-w-full rounded-none object-contain"
              />
            )}
          </div>
          {keys.length > 1 && (
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-none border border-[#E2E8F0] text-[#0033A0] transition-colors hover:bg-[#EFF4FF] disabled:opacity-30"
              disabled={idx >= keys.length - 1}
              onClick={() => onNext(keys.length)}
              title="下一个"
            >
              ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 定时发布时间选择：日历（react-day-picker，跟随项目主色/零圆角）+ 时/分下拉 + 清除/今天 */
function ScheduleDateTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const current = value ? new Date(value) : null;

  const toValue = (d: Date): string =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const update = (partial: { date?: Date; hour?: number; minute?: number }): void => {
    const base = current ?? new Date();
    const d = new Date(
      (partial.date ?? base).getFullYear(),
      (partial.date ?? base).getMonth(),
      (partial.date ?? base).getDate(),
      partial.hour ?? base.getHours(),
      partial.minute ?? base.getMinutes(),
      0,
      0,
    );
    onChange(toValue(d));
  };

  const display = current
    ? `${current.getFullYear()}/${pad(current.getMonth() + 1)}/${pad(current.getDate())} ${pad(current.getHours())}:${pad(current.getMinutes())}`
    : '选择时间';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-left text-sm outline-none transition-colors hover:border-[#0033A0] focus:border-[#0033A0]"
        >
          <span className={current ? 'text-[#1A1A1A]' : 'text-[#94A3B8]'}>
            {display}
          </span>
          <CalendarClock className="size-4 shrink-0 text-[#94A3B8]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[300px] rounded-none border-[#E2E8F0] p-0 shadow-md"
      >
        <Calendar
          mode="single"
          required={false}
          selected={current ?? undefined}
          defaultMonth={current ?? undefined}
          onSelect={(d) => d && update({ date: d })}
          className="p-3"
        />
        <div className="space-y-3 border-t border-[#E2E8F0] p-3">
          <div className="flex items-center gap-2">
            <Select
              value={current ? String(current.getHours()) : '12'}
              onValueChange={(v) => update({ hour: Number(v) })}
            >
              <SelectTrigger className="h-8 w-full rounded-none border-[#E2E8F0] text-sm">
                <SelectValue placeholder="时" />
              </SelectTrigger>
              <SelectContent className="max-h-[180px] rounded-none">
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={String(i)} className="text-sm">
                    {pad(i)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm font-bold text-[#94A3B8]">:</span>
            <Select
              value={current ? String(current.getMinutes()) : '00'}
              onValueChange={(v) => update({ minute: Number(v) })}
            >
              <SelectTrigger className="h-8 w-full rounded-none border-[#E2E8F0] text-sm">
                <SelectValue placeholder="分" />
              </SelectTrigger>
              <SelectContent className="max-h-[180px] rounded-none">
                {Array.from({ length: 60 }, (_, i) => (
                  <SelectItem key={i} value={String(i)} className="text-sm">
                    {pad(i)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange('')}
              className="h-8 rounded-none border-[#E2E8F0] text-[#475569] hover:bg-slate-50"
            >
              清除
            </Button>
            <Button
              type="button"
              onClick={() => {
                const now = new Date();
                update({ date: now, hour: now.getHours(), minute: now.getMinutes() });
              }}
              className="h-8 rounded-none bg-[#0033A0] hover:bg-[#002680]"
            >
              今天
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 选账号弹窗：平台筛选 pill + 分组筛选 + 勾选列表 + 已选计数，确认后写回 targets */
function AccountPickerDialog({
  open,
  onOpenChange,
  accounts,
  groups,
  targets,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: SocialAccount[];
  groups: AccountGroup[];
  targets: { platform: string; accountId: string }[];
  onConfirm: (next: { platform: string; accountId: string }[]) => void;
}) {
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);

  /* 打开时以当前 targets 初始化勾选 */
  useEffect(() => {
    if (open) {
      setDraft(targets.map((t) => t.accountId));
      setPlatformFilter(null);
      setGroupFilter(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const a of accounts) set.add(a.platform);
    return [...set];
  }, [accounts]);

  const filtered = useMemo(() => {
    let list = accounts;
    if (platformFilter) list = list.filter((a) => a.platform === platformFilter);
    if (groupFilter) list = list.filter((a) => a.groupName === groupFilter);
    return list;
  }, [accounts, platformFilter, groupFilter]);

  const byPlatform = useMemo(() => {
    const map = new Map<string, SocialAccount[]>();
    for (const a of filtered) {
      const arr = map.get(a.platform) ?? [];
      arr.push(a);
      map.set(a.platform, arr);
    }
    return map;
  }, [filtered]);

  const pillClass = (active: boolean): string =>
    cn(
      'flex items-center gap-1.5 rounded-none border px-3 py-1.5 text-sm font-medium transition-colors',
      active
        ? 'border-transparent bg-[#0033A0] text-white'
        : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-slate-50',
    );

  const toggle = (id: string) => {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleConfirm = (): void => {
    const acctMap = new Map(accounts.map((a) => [a.id, a]));
    onConfirm(
      draft.map((id) => ({
        platform: acctMap.get(id)?.platform ?? '',
        accountId: id,
      })),
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-none border-[#E2E8F0] p-0 shadow-md">
        <DialogHeader className="border-b border-[#E2E8F0] p-6 pb-4">
          <DialogTitle className="text-base font-black text-[#1A1A1A]">
            选择账号
          </DialogTitle>
          <p className="text-[10px] font-medium text-[#94A3B8]">
            支持按平台、分组筛选；可勾选多个平台多个账号
          </p>
        </DialogHeader>

        {/* 平台筛选 */}
        <div className="flex flex-wrap gap-2.5 border-b border-[#E2E8F0] px-6 py-3">
          <button
            type="button"
            onClick={() => setPlatformFilter(null)}
            className={pillClass(platformFilter === null)}
          >
            全部平台
          </button>
          {platforms.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() =>
                setPlatformFilter(platformFilter === p ? null : p)
              }
              className={pillClass(platformFilter === p)}
            >
              <img
                src={PLATFORM_LOGOS[p]}
                alt=""
                className="size-4 rounded-none"
              />
              {PLATFORM_MAP[p as keyof typeof PLATFORM_MAP]?.name ?? p}
            </button>
          ))}
        </div>

        {/* 分组筛选 */}
        {groups.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 border-b border-[#E2E8F0] px-6 py-3">
            <span className="text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">
              分组
            </span>
            <button
              type="button"
              onClick={() => setGroupFilter(null)}
              className={pillClass(groupFilter === null)}
            >
              全部分组
            </button>
            {groups.map((g) => (
              <button
                key={g.name}
                type="button"
                onClick={() => setGroupFilter(groupFilter === g.name ? null : g.name)}
                className={pillClass(groupFilter === g.name)}
              >
                {g.name}
                {g.count !== undefined && (
                  <span className="text-[10px] font-bold opacity-70">
                    {g.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* 账号勾选列表 */}
        <div className="max-h-[52vh] min-h-[260px] overflow-y-auto px-6 py-4">
          {byPlatform.size === 0 ? (
            <p className="py-8 text-center text-[12px] font-medium text-[#94A3B8]">
              无符合条件的账号
            </p>
          ) : (
            [...byPlatform.entries()].map(([platform, list]) => (
              <div key={platform} className="mb-5 last:mb-0">
                <p className="mb-2.5 flex items-center gap-2 text-[12px] font-black uppercase tracking-tight text-[#0033A0]">
                  <img
                    src={PLATFORM_LOGOS[platform]}
                    alt=""
                    className="size-4 rounded-none"
                  />
                  {PLATFORM_MAP[platform as keyof typeof PLATFORM_MAP]?.name ?? platform}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {list.map((acct) => {
                    const checked = draft.includes(acct.id);
                    return (
                      <label
                        key={acct.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-none border px-3 py-2 transition-colors',
                          checked
                            ? 'border-[#0033A0] bg-[#EFF4FF]'
                            : 'border-[#E2E8F0] hover:bg-slate-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(acct.id)}
                          className="size-4 accent-[#0033A0]"
                        />
                        {acct.avatar ? (
                          <img
                            src={`/avatar-proxy?url=${encodeURIComponent(acct.avatar)}`}
                            referrerPolicy="no-referrer"
                            alt=""
                            className="size-7 shrink-0 rounded-none object-cover"
                          />
                        ) : (
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-none bg-[#F1F5F9] text-[10px] font-black text-[#475569]">
                            {acct.accountName.slice(0, 1)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#1A1A1A]">
                          {acct.accountName}
                        </span>
                        {acct.groupName && (
                          <span className="shrink-0 rounded-sm bg-[#EFF4FF] px-1.5 py-0.5 text-[10px] font-bold text-[#0033A0]">
                            {acct.groupName}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 底部：已选计数 + 取消/确认 */}
        <div className="flex items-center justify-between border-t border-[#E2E8F0] px-6 py-4">
          <p className="text-[12px] font-bold text-[#1A1A1A]">
            已选择 <span className="font-mono text-[#0033A0]">{draft.length}</span> 个账号
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-none border-[#E2E8F0] text-[#475569] hover:bg-slate-50"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              className="rounded-none bg-[#0033A0] px-6 hover:bg-[#002680]"
            >
              确认添加
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
