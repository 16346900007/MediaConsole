import { useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarDays } from 'lucide-react';
import type { MetricInput, SocialAccount } from '@shared/api.interface';
import { PLATFORM_MAP } from '@shared/platforms';
import { createMetric } from '@client/src/api/social';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
import { resolveErrorMessage } from './helpers';

const NON_NEGATIVE_STRING = z
  .string()
  .refine(
    (value: string) => value === '' || /^\d+$/.test(value),
    '必须为非负整数',
  );

const metricFormSchema = z.object({
  accountId: z.string().min(1, '请选择账号'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请选择日期'),
  views: NON_NEGATIVE_STRING,
  likes: NON_NEGATIVE_STRING,
  comments: NON_NEGATIVE_STRING,
  shares: NON_NEGATIVE_STRING,
  followersDelta: NON_NEGATIVE_STRING,
});

type MetricFormData = z.infer<typeof metricFormSchema>;

const DEFAULT_VALUES: MetricFormData = {
  accountId: '',
  date: '',
  views: '0',
  likes: '0',
  comments: '0',
  shares: '0',
  followersDelta: '0',
};

function toCount(value: string): number {
  return value === '' ? 0 : Number(value);
}

interface MetricInputDialogProps {
  open: boolean;
  accounts: SocialAccount[];
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const NUMERIC_FIELDS: { name: 'views' | 'likes' | 'comments' | 'shares' | 'followersDelta'; label: string }[] = [
  { name: 'views', label: '播放' },
  { name: 'likes', label: '点赞' },
  { name: 'comments', label: '评论' },
  { name: 'shares', label: '分享' },
  { name: 'followersDelta', label: '涨粉' },
];

/** 手工录入 Dialog：账号 + 日期 + 五项数值，同账号同日覆盖更新 */
const MetricInputDialog: React.FC<MetricInputDialogProps> = ({
  open,
  accounts,
  onOpenChange,
  onCreated,
}) => {
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [calendarOpen, setCalendarOpen] = useState<boolean>(false);
  const form = useForm<MetricFormData>({
    resolver: zodResolver(metricFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const handleSubmit = form.handleSubmit(async (data: MetricFormData) => {
    setSubmitting(true);
    try {
      const request: MetricInput = {
        accountId: data.accountId,
        date: data.date,
        views: toCount(data.views),
        likes: toCount(data.likes),
        comments: toCount(data.comments),
        shares: toCount(data.shares),
        followersDelta: toCount(data.followersDelta),
      };
      await createMetric(request);
      toast.success('录入成功，看板已更新');
      form.reset(DEFAULT_VALUES);
      onCreated();
      onOpenChange(false);
    } catch (error) {
      toast.error('录入失败', { description: resolveErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-bold tracking-tight text-[rgb(26_26_26)]">
            手工录入数据
          </DialogTitle>
          <DialogDescription className="text-[12px] font-medium text-slate-600">
            选择账号与日期填写当日数据；同一账号同一天重复录入将覆盖更新。
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      账号 <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-none">
                          <SelectValue placeholder="选择账号" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((account: SocialAccount) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.accountName} ·{' '}
                            {PLATFORM_MAP[account.platform].name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {accounts.length === 0 && (
                      <p className="text-[12px] font-medium text-[#94A3B8]">
                        暂无账号，请先在账号矩阵中添加
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      日期 <span className="text-destructive">*</span>
                    </FormLabel>
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <FormControl>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start rounded-none font-normal"
                          >
                            <CalendarDays className="size-4 text-[#94A3B8]" />
                            {field.value || '选择日期'}
                          </Button>
                        </PopoverTrigger>
                      </FormControl>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            field.value ? dayjs(field.value).toDate() : undefined
                          }
                          onSelect={(date: Date | undefined) => {
                            if (date) {
                              field.onChange(dayjs(date).format('YYYY-MM-DD'));
                              setCalendarOpen(false);
                            }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {NUMERIC_FIELDS.map((config) => (
                <FormField
                  key={config.name}
                  control={form.control}
                  name={config.name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{config.label}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          className="rounded-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={submitting}
                className="rounded-none bg-[#0033A0] text-white hover:bg-[#004B93]"
              >
                {submitting ? '保存中…' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default MetricInputDialog;
