import { useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { PLATFORMS } from '@shared/platforms';
import type { PlatformMeta } from '@shared/platforms';
import type {
  AccountStatus,
  CreateAccountRequest,
  SocialAccount,
  SocialPlatform,
  UpdateAccountRequest,
} from '@shared/api.interface';
import { createAccount, updateAccount } from '@client/src/api/social';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { extractErrorMessage } from './utils';

const accountFormSchema = z.object({
  platform: z.string().min(1, '请选择平台'),
  accountName: z.string().trim().min(1, '账号名不能为空').max(100),
  homeUrl: z
    .string()
    .trim()
    .refine(
      (value: string) => value === '' || /^https?:\/\/\S+$/u.test(value),
      '请输入以 http(s):// 开头的有效链接',
    ),
  followersCount: z
    .number({ error: '粉丝数需为数字' })
    .int('粉丝数需为整数')
    .min(0, '粉丝数不能为负数'),
  groupName: z.string().trim().max(100),
  status: z.string().min(1, '请选择状态'),
  note: z.string(),
});

type AccountFormData = z.infer<typeof accountFormSchema>;

const STATUS_OPTIONS: { value: AccountStatus; label: string }[] = [
  { value: 'active', label: '运营中' },
  { value: 'paused', label: '已暂停' },
];

function toPlatform(value: string): SocialPlatform {
  const found: PlatformMeta | undefined = PLATFORMS.find(
    (item: PlatformMeta) => item.value === value,
  );
  if (!found) {
    throw new Error('无效的平台');
  }
  return found.value;
}

function toStatus(value: string): AccountStatus {
  if (value === 'active' || value === 'paused') {
    return value;
  }
  throw new Error('无效的状态');
}

function emptyStringToNull(value: string): string | null {
  const trimmed: string = value.trim();
  return trimmed === '' ? null : trimmed;
}

interface AccountFormDialogProps {
  open: boolean;
  account: SocialAccount | null;
  onClose: () => void;
  onSaved: () => void;
  children?: ReactNode;
}

const AccountFormDialog: FC<AccountFormDialogProps> = ({
  open,
  account,
  onClose,
  onSaved,
}) => {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<AccountFormData>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      platform: '',
      accountName: '',
      homeUrl: '',
      followersCount: 0,
      groupName: '',
      status: 'active',
      note: '',
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    if (account) {
      form.reset({
        platform: account.platform,
        accountName: account.accountName,
        homeUrl: account.homeUrl ?? '',
        followersCount: account.followersCount,
        groupName: account.groupName ?? '',
        status: account.status,
        note: account.note ?? '',
      });
    } else {
      form.reset({
        platform: '',
        accountName: '',
        homeUrl: '',
        followersCount: 0,
        groupName: '',
        status: 'active',
        note: '',
      });
    }
  }, [open, account, form]);

  const handleSubmit = async (data: AccountFormData): Promise<void> => {
    setSubmitting(true);
    try {
      if (account) {
        const request: UpdateAccountRequest = {
          accountName: data.accountName.trim(),
          homeUrl: emptyStringToNull(data.homeUrl),
          followersCount: data.followersCount,
          groupName: emptyStringToNull(data.groupName),
          status: toStatus(data.status),
          note: emptyStringToNull(data.note),
        };
        await updateAccount(account.id, request);
        toast.success('账号已更新');
      } else {
        const request: CreateAccountRequest = {
          platform: toPlatform(data.platform),
          accountName: data.accountName.trim(),
          homeUrl: emptyStringToNull(data.homeUrl),
          followersCount: data.followersCount,
          groupName: emptyStringToNull(data.groupName),
          status: toStatus(data.status),
          note: emptyStringToNull(data.note),
        };
        await createAccount(request);
        toast.success('账号创建成功');
      }
      onSaved();
    } catch (error: unknown) {
      toast.error(`保存失败：${extractErrorMessage(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="rounded-none border border-[#E2E8F0] border-t-[3px] border-t-[#0033A0] p-6 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold tracking-tight text-[#1E293B]">
            {account ? '编辑账号' : '新建账号'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data: AccountFormData) => {
              void handleSubmit(data);
            })}
            className="space-y-4"
          >
            <div className="flex flex-wrap gap-4">
              <FormField
                control={form.control}
                name="platform"
                render={({ field }) => (
                  <FormItem className="flex-1 basis-2/5">
                    <FormLabel className="text-[12px] font-bold text-[#94A3B8]">
                      平台 <span className="text-[#EF4444]">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={account !== null}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full rounded-none border-[#E2E8F0] text-sm">
                          <SelectValue placeholder="请选择平台" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PLATFORMS.map((item: PlatformMeta) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="flex-1 basis-2/5">
                    <FormLabel className="text-[12px] font-bold text-[#94A3B8]">状态</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full rounded-none border-[#E2E8F0] text-sm">
                          <SelectValue placeholder="请选择状态" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUS_OPTIONS.map(
                          (item: { value: AccountStatus; label: string }) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <FormField
                control={form.control}
                name="accountName"
                render={({ field }) => (
                  <FormItem className="flex-1 basis-2/5">
                    <FormLabel className="text-[12px] font-bold text-[#94A3B8]">
                      账号名 <span className="text-[#EF4444]">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="如：我的抖音主号" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="followersCount"
                render={({ field }) => (
                  <FormItem className="flex-1 basis-2/5">
                    <FormLabel className="text-[12px] font-bold text-[#94A3B8]">粉丝数</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        value={field.value}
                        onChange={(
                          event: React.ChangeEvent<HTMLInputElement>,
                        ) => {
                          const raw: string = event.target.value;
                          field.onChange(raw === '' ? 0 : Number(raw));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <FormField
                control={form.control}
                name="homeUrl"
                render={({ field }) => (
                  <FormItem className="flex-1 basis-2/5">
                    <FormLabel className="text-[12px] font-bold text-[#94A3B8]">主页链接</FormLabel>
                    <FormControl>
                      <Input placeholder="https://（可选）" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="groupName"
                render={({ field }) => (
                  <FormItem className="flex-1 basis-2/5">
                    <FormLabel className="text-[12px] font-bold text-[#94A3B8]">分组</FormLabel>
                    <FormControl>
                      <Input placeholder="如：主矩阵（可选）" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[12px] font-bold text-[#94A3B8]">备注</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="账号定位、运营说明等（可选）"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-none"
                onClick={onClose}
                disabled={submitting}
              >
                取消
              </Button>
              <Button
                type="submit"
                className="rounded-none bg-[#0033A0] font-bold text-white hover:bg-[#004B93]"
                disabled={submitting}
              >
                {submitting && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {account ? '保存修改' : '创建账号'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AccountFormDialog;
