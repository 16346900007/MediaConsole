import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FC,
} from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { getDataloom } from '@lark-apaas/client-toolkit/dataloom';
import { getDefaultBucketId } from '@lark-apaas/client-toolkit/tools/storage';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { FileText, ImagePlus, Loader2, Video, X } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@client/src/components/ui/form';
import { Input } from '@client/src/components/ui/input';
import { Image } from '@client/src/components/ui/image';
import {
  RadioGroup,
  RadioGroupItem,
} from '@client/src/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Textarea } from '@client/src/components/ui/textarea';
import * as socialApi from '@client/src/api/social';
import type {
  CreateContentRequest,
  SocialContent,
  UpdateContentRequest,
} from '@shared/api.interface';

const contentFormSchema = z.object({
  contentType: z.enum(['article', 'video']),
  title: z.string().min(1, '标题不能为空').max(200, '标题不能超过 200 字'),
  body: z.string(),
  tags: z.string(),
  coverUrl: z.string().nullable(),
  status: z.enum(['draft', 'ready', 'archived']),
});

type ContentFormValues = z.infer<typeof contentFormSchema>;

const STATUS_OPTIONS: { value: ContentFormValues['status']; label: string }[] = [
  { value: 'draft', label: '草稿' },
  { value: 'ready', label: '待发布' },
  { value: 'archived', label: '已归档' },
];

const TYPE_OPTIONS: {
  value: ContentFormValues['contentType'];
  label: string;
}[] = [
  { value: 'article', label: '图文' },
  { value: 'video', label: '视频' },
];

interface ContentFormDialogProps {
  open: boolean;
  content: SocialContent | null;
  onClose: () => void;
  onSaved: () => void;
}

const ContentFormDialog: FC<ContentFormDialogProps> = ({
  open,
  content,
  onClose,
  onSaved,
}) => {
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tagInput, setTagInput] = useState<string>('');
  const [tagList, setTagList] = useState<string[]>([]);

  const form = useForm<ContentFormValues>({
    resolver: zodResolver(contentFormSchema),
    defaultValues: {
      contentType: 'video',
      title: '',
      body: '',
      tags: '',
      coverUrl: null,
      status: 'draft',
    },
  });

  useEffect(() => {
    if (!open) return;
    const initialTags = content?.tags ?? [];
    setTagList(initialTags);
    setTagInput('');
    form.reset({
      contentType: content?.contentType ?? 'video',
      title: content?.title ?? '',
      body: content?.body ?? '',
      tags: initialTags.join(', '),
      coverUrl: content?.coverUrl ?? null,
      status: content?.status ?? 'draft',
    });
  }, [open, content, form]);

  const addTag = (raw: string) => {
    const value = raw.trim();
    if (value === '') return;
    if (tagList.includes(value)) return;
    const next = [...tagList, value];
    setTagList(next);
    form.setValue('tags', next.join(', '), { shouldValidate: true });
  };

  const removeTag = (index: number) => {
    const next = tagList.filter((_: string, i: number) => i !== index);
    setTagList(next);
    form.setValue('tags', next.join(', '), { shouldValidate: true });
  };

  const handleTagKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag(tagInput);
      setTagInput('');
    } else if (event.key === 'Backspace' && tagInput === '' && tagList.length > 0) {
      removeTag(tagList.length - 1);
    }
  };

  const handleCoverUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setUploading(true);
    try {
      const dataloom = await getDataloom();
      const { data, error } = await dataloom
        .storage
        .from(getDefaultBucketId())
        .uploadFile(file);
      if (error !== null || data === null) {
        const message =
          error === null
            ? '未知错误'
            : 'error_msg' in error
              ? error.error_msg
              : error.message;
        toast.error(`封面上传失败：${message}`);
        return;
      }
      form.setValue('coverUrl', data.download_url, { shouldValidate: true });
      toast.success('封面上传成功');
    } catch (err) {
      logger.error('封面上传失败', err);
      toast.error('封面上传失败，请重试');
    } finally {
      setUploading(false);
      if (fileInputRef.current !== null) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = form.handleSubmit(async (data: ContentFormValues) => {
    setSubmitting(true);
    try {
      const tags: string[] = data.tags
        .split(/[,，]/u)
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag.length > 0);
      const body: string | null = data.body.trim() === '' ? null : data.body;
      if (content !== null) {
        const request: UpdateContentRequest = {
          title: data.title,
          contentType: data.contentType,
          body,
          tags,
          coverUrl: data.coverUrl,
          status: data.status,
        };
        await socialApi.updateContent(content.id, request);
        toast.success('内容已更新');
      } else {
        const request: CreateContentRequest = {
          title: data.title,
          contentType: data.contentType,
          body,
          tags,
          coverUrl: data.coverUrl,
          status: data.status,
        };
        await socialApi.createContent(request);
        toast.success('内容已创建');
      }
      onSaved();
    } catch (err) {
      logger.error('保存内容失败', err);
      toast.error('保存失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value: boolean) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-none border-t-[3px] border-t-[#0033A0] p-6 shadow-md">
        <DialogHeader>
          <DialogTitle className="font-bold tracking-tight text-[#1E293B]">
            {content !== null ? '编辑内容' : '新建内容'}
          </DialogTitle>
          <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
            Content Form
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormField
              control={form.control}
              name="contentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
                    内容类型
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex gap-3"
                    >
                      {TYPE_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          htmlFor={`content-type-${option.value}`}
                          className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-none border p-3 transition-colors ${
                             field.value === option.value
                               ? 'border-[#0033A0] bg-[#0033A0]/5'
                               : 'border-[#E2E8F0] hover:border-[#0033A0]'
                          }`}
                        >
                          <RadioGroupItem
                            value={option.value}
                            id={`content-type-${option.value}`}
                          />
                          {option.value === 'video' ? (
                            <Video className="h-4 w-4 text-[#0033A0]" />
                          ) : (
                            <FileText className="h-4 w-4 text-[#64748B]" />
                          )}
                          <span className="text-sm font-bold text-[#1E293B]">
                            {option.label}
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
                    标题 <span className="text-[#EF4444]">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="给内容起一个标题"
                      className="h-10 rounded-none border-[#E2E8F0] text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
                    正文 / 脚本
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={6}
                      placeholder="输入正文或视频脚本"
                      className="rounded-none border-[#E2E8F0] text-sm text-[#1E293B]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-wrap gap-4">
              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
                      标签
                    </FormLabel>
                    <FormControl>
                      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-none border border-[#E2E8F0] px-2 py-1.5 text-sm focus-within:border-[#0033A0] focus-within:ring-1 focus-within:ring-[#0033A0]">
                        {tagList.map((tag: string, index: number) => (
                          <span
                            key={`${tag}-${index}`}
                            className="inline-flex items-center gap-1 rounded-sm bg-[#0033A0]/10 px-2 py-0.5 text-xs font-medium text-[#0033A0]"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => {
                                removeTag(index);
                              }}
                              className="hover:text-[#00267A]"
                              aria-label={`删除标签 ${tag}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          value={tagInput}
                          onKeyDown={handleTagKeyDown}
                          placeholder={tagList.length === 0 ? '输入标签，回车添加' : ''}
                          className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-[#94A3B8]"
                          onChange={(event) => {
                            setTagInput(event.target.value);
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
                      状态
                    </FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10 w-full rounded-none border-[#E2E8F0] text-sm">
                          <SelectValue placeholder="选择状态" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="coverUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
                    封面
                  </FormLabel>
                  <div className="flex items-center gap-3">
                    {field.value !== null ? (
                      <div className="relative">
                        <Image
                          src={field.value}
                          alt="封面"
                          width={80}
                          height={80}
                          className="h-20 w-20 rounded-none border border-[#E2E8F0] object-cover"
                        />
                        <button
                          type="button"
                          aria-label="移除封面"
                          onClick={() => {
                            field.onChange(null);
                          }}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-none bg-[#EF4444] text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => {
                          fileInputRef.current?.click();
                        }}
                        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-none border border-dashed border-[#E2E8F0] text-[#9CA3AF] transition-colors hover:border-[#0033A0] hover:text-[#64748B]"
                      >
                        {uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="h-4 w-4" />
                        )}
                        <span className="text-[12px] font-semibold">
                          {uploading ? '上传中' : '上传封面'}
                        </span>
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        void handleCoverUpload(event);
                      }}
                    />
                    {field.value !== null ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={uploading}
                        className="rounded-none text-sm text-[#64748B]"
                        onClick={() => {
                          fileInputRef.current?.click();
                        }}
                      >
                        {uploading ? '上传中...' : '更换封面'}
                      </Button>
                    ) : null}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="rounded-none text-base text-[#6B7280]"
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="rounded-none bg-[#0033A0] px-6 text-base font-semibold text-white hover:bg-[#0033A0]/90"
              >
                {submitting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                {content !== null ? '保存修改' : '创建内容'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ContentFormDialog;
