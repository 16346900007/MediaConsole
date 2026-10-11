import {
  useCallback,
  useEffect,
  useState,
  type FC,
  type MouseEvent,
} from 'react';
import dayjs from 'dayjs';
import {
  FileText,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  Table,
  type TableColumnsType,
} from '@lark-apaas/client-toolkit/antd-table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@client/src/components/ui/alert-dialog';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import * as socialApi from '@client/src/api/social';
import type { SocialContent } from '@shared/api.interface';
import ContentFormDialog from './content-form-dialog';
import ContentVariantsDialog from './content-variants-dialog';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-slate-100 text-[#94A3B8]' },
  ready: { label: '待发布', cls: 'bg-[#ECFDF5] text-[#10B981]' },
  archived: { label: '已归档', cls: 'bg-slate-100 text-[#94A3B8]' },
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'ready', label: '待发布' },
  { value: 'archived', label: '已归档' },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '全部类型' },
  { value: 'article', label: '图文' },
  { value: 'video', label: '视频' },
];

const SocialContents: FC = () => {
  const [items, setItems] = useState<SocialContent[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [appliedStatus, setAppliedStatus] = useState<string>('all');
  const [appliedType, setAppliedType] = useState<string>('all');
  const [keywordInput, setKeywordInput] = useState<string>('');
  const [keyword, setKeyword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<SocialContent | null>(null);
  const [variantsId, setVariantsId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SocialContent | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await socialApi.listContents({
        status: appliedStatus === 'all' ? undefined : appliedStatus,
        contentType: appliedType === 'all' ? undefined : appliedType,
        keyword: keyword === '' ? undefined : keyword,
        page,
        pageSize,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (err) {
      logger.error('获取内容列表失败', err);
      setError('内容列表加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [appliedStatus, appliedType, keyword, page, pageSize]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const handleDelete = async () => {
    if (deleting === null) return;
    setDeleteLoading(true);
    try {
      await socialApi.deleteContent(deleting.id);
      toast.success('内容已删除');
      setDeleting(null);
      if (items.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        void fetchList();
      }
    } catch (err) {
      logger.error('删除内容失败', err);
      toast.error('删除失败，请稍后重试');
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns: TableColumnsType<SocialContent> = [
    {
      title: '标题',
      dataIndex: 'title',
      width: 280,
      render: (_: string, record: SocialContent) => (
        <button
          type="button"
          onClick={() => {
            setVariantsId(record.id);
          }}
          className="max-w-full truncate text-left text-sm font-bold text-[#0033A0] transition-colors hover:underline"
          title={record.title}
        >
          {record.title}
        </button>
      ),
    },
    {
      title: '类型',
      dataIndex: 'contentType',
      width: 100,
      render: (value: string) =>
        value === 'video' ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
            <Video className="h-3.5 w-3.5 text-[#0033A0]" />
            视频
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
            <FileText className="h-3.5 w-3.5 text-[#94A3B8]" />
            图文
          </span>
        ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 200,
      render: (value: string[]) => {
        const tags: string[] = value ?? [];
        if (tags.length === 0) {
          return <span className="text-[12px] text-[#94A3B8]">—</span>;
        }
        const visible = tags.slice(0, 3);
        const rest = tags.length - visible.length;
        return (
          <div className="flex flex-wrap gap-1">
            {visible.map((tag: string) => (
              <span
                key={tag}
                className="rounded-none border border-[#E2E8F0] bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#94A3B8]"
              >
                {tag}
              </span>
            ))}
            {rest > 0 ? (
              <span className="text-[12px] text-[#94A3B8]">+{rest}</span>
            ) : null}
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: string) => {
        const meta = STATUS_META[value] ?? STATUS_META.draft;
        return (
          <span
            className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[12px] font-bold ${meta.cls}`}
          >
            {meta.label}
          </span>
        );
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 160,
      render: (value: string) => (
        <span className="text-[12px] font-mono font-bold tracking-tight text-[#94A3B8]">
          {dayjs(value).format('YYYY-MM-DD HH:mm')}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: string, record: SocialContent) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-sm text-[#64748B] hover:text-[#0033A0]"
            onClick={() => {
              setEditing(record);
              setFormOpen(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-sm text-[#64748B] hover:text-[#0033A0]"
            onClick={() => {
              setVariantsId(record.id);
            }}
          >
            <Layers className="h-3.5 w-3.5" />
            适配
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-sm text-[#6B7280] hover:text-[#EF4444]"
            onClick={() => {
              setDeleting(record);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </Button>
        </div>
      ),
    },
  ];

  const applySearch = () => {
    setKeyword(keywordInput.trim());
    setAppliedType(typeFilter);
    setAppliedStatus(statusFilter);
    setPage(1);
  };

  const resetFilters = () => {
    setKeywordInput('');
    setTypeFilter('all');
    setStatusFilter('all');
    setKeyword('');
    setAppliedType('all');
    setAppliedStatus('all');
    setPage(1);
  };

  return (
    <div>
      <div className="px-8 pt-8 pb-20 space-y-8">
        <div>
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
                01. 内容中心
              </p>
              <p className="mt-1 text-[10px] font-medium text-[#94A3B8]">
                CONTENT LIBRARY
              </p>
            </div>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="rounded-none bg-[#0033A0] px-5 text-sm font-semibold text-white hover:bg-[#00267A]"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              新建内容
            </Button>
          </div>
          <div className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={keywordInput}
            onChange={(event) => {
              setKeywordInput(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                applySearch();
              }
            }}
            placeholder="搜索标题关键词"
            className="h-9 w-44 rounded-none border-[#E2E8F0] text-sm"
          />
          <Select
            value={typeFilter}
            onValueChange={(value: string) => {
              setTypeFilter(value);
            }}
          >
            <SelectTrigger className="h-9 w-28 rounded-none border-[#E2E8F0] text-sm text-[#1E293B]">
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value: string) => {
              setStatusFilter(value);
            }}
          >
            <SelectTrigger className="h-9 w-28 rounded-none border-[#E2E8F0] text-sm text-[#1E293B]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="default"
            size="sm"
            className="h-9 gap-1 rounded-none border border-[#0033A0] bg-[#0033A0] px-3 text-sm text-white hover:bg-[#00267A]"
            onClick={() => {
              applySearch();
            }}
          >
            <Search className="h-3.5 w-3.5" />
            搜索
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1 rounded-none border border-[#E2E8F0] px-3 text-sm text-[#1E293B] hover:border-[#0033A0] hover:text-[#0033A0]"
            onClick={() => {
              resetFilters();
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重置
          </Button>
        </div>

        <div className="mt-6">
          {error !== null ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-[12px] font-medium text-[#EF4444]">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void fetchList();
                }}
                className="gap-1.5 rounded-none text-sm text-[#64748B]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重试
              </Button>
            </div>
          ) : !loading && items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-[12px] font-medium text-slate-600">暂无内容。</p>
              <p className="max-w-md text-center text-[12px] font-medium text-slate-600">
                新建一篇图文或视频内容后，可为
                7 个平台分别生成适配版本（标题/正文按平台风格与字数调整）。
              </p>
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="mt-1 rounded-none bg-[#0033A0] px-5 text-base font-semibold text-white hover:bg-[#0033A0]/90"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                新建内容
              </Button>
            </div>
          ) : (
            <Table
              columns={columns}
              dataSource={items}
              loading={loading}
              rowKey="id"
              scroll={{ x: 1000, y: 500 }}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50],
                onChange: (nextPage: number, nextSize: number) => {
                  setPage(nextPage);
                  if (nextSize !== pageSize) setPageSize(nextSize);
                },
              }}
             />
          )}
        </div>
          </div>
        </div>
      </div>

      <ContentFormDialog
        open={formOpen}
        content={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setFormOpen(false);
          setEditing(null);
          void fetchList();
        }}
      />

      <ContentVariantsDialog
        open={variantsId !== null}
        contentId={variantsId}
        onClose={() => {
          setVariantsId(null);
        }}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(value: boolean) => {
          if (!value) setDeleting(null);
        }}
      >
        <AlertDialogContent className="rounded-none border-t-[3px] border-t-[#0033A0] p-6 shadow-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold tracking-tight text-[#1E293B]">
              确认删除这篇内容？
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] font-medium text-slate-600">
              将删除「{deleting?.title}」及其全部平台适配变体，删除后不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3">
            <AlertDialogCancel className="rounded-none text-[12px] font-medium text-slate-600">
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteLoading}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                void handleDelete();
              }}
              className="rounded-none bg-[#EF4444] px-6 text-base font-semibold text-white hover:bg-[#EF4444]/90"
            >
              {deleteLoading ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SocialContents;
