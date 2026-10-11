import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { AlertTriangle, Plus, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PLATFORMS } from '@shared/platforms';
import type { PlatformMeta } from '@shared/platforms';
import { PLATFORM_LOGOS } from '@/utils/platform-logos';
import { Image } from '@client/src/components/ui/image';
import type { AccountGroup, SocialAccount } from '@shared/api.interface';
import {
  createAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  getBrowserAuthStatus,
  listAccountGroups,
  listAccounts,
  renameAccountGroup,
  startBrowserAuth,
  verifyAccount,
} from '@client/src/api/social';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import GroupSidebar from '../social-materials/group-sidebar';
import AccountCard from './account-card';
import AccountFormDialog from './account-form-dialog';
import PlatformAuthDialog from './platform-auth-dialog';
import { extractErrorMessage } from './utils';

const SocialAccounts: FC = () => {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [allAccounts, setAllAccounts] = useState<SocialAccount[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [platformAuthOpen, setPlatformAuthOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SocialAccount | null>(
    null,
  );
  const [deletingAccount, setDeletingAccount] =
    useState<SocialAccount | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [refreshLoading, setRefreshLoading] = useState(false);

  const loadGroups = useCallback(async (): Promise<void> => {
    try {
      setGroups(await listAccountGroups());
    } catch (err: unknown) {
      toast.error(`加载分组失败：${extractErrorMessage(err)}`);
    }
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params: { platform?: string; group?: string } = {};
      if (platformFilter !== null) params.platform = platformFilter;
      if (activeGroup !== '') params.group = activeGroup;
      const [filtered, all, groupList] = await Promise.all([
        listAccounts(params),
        listAccounts(),
        listAccountGroups(),
      ]);
      setAccounts(filtered);
      setAllAccounts(all);
      setGroups(groupList);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [platformFilter, activeGroup]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  /** 单独校验单个账号在线状态（卡片级刷新按钮） */
  const handleVerifyOne = async (account: SocialAccount): Promise<void> => {
    setVerifyingId(account.id);
    try {
      const updated = await verifyAccount(account.id);
      setAccounts((prev) =>
        prev.map((item) => (item.id === account.id ? updated : item)),
      );
      setAllAccounts((prev) =>
        prev.map((item) => (item.id === account.id ? updated : item)),
      );
      toast.success(
        updated.online ? `「${updated.accountName}」在线` : `「${updated.accountName}」离线`,
      );
    } catch (err: unknown) {
      toast.error(`校验失败：${extractErrorMessage(err)}`);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleAuthAccount = (): void => {
    setPlatformAuthOpen(true);
  };

  /** 离线账号点创作中心：不弹选择框，直接拉起该平台授权窗口并轮询登录结果 */
  const handleQuickReAuth = async (account: SocialAccount): Promise<void> => {
    const platform = PLATFORMS.find(
      (p: PlatformMeta) => p.value === account.platform,
    );
    if (!platform) return;
    try {
      const result = await startBrowserAuth({
        platform: platform.value,
        accountId: account.id,
      });
      if (!result.ok) {
        toast.error(result.message ?? `「${platform.name}」授权启动失败`);
        return;
      }
      toast.info(result.message ?? '已打开登录窗口，请在弹出的窗口中完成登录');
    } catch (error: unknown) {
      toast.error(`发起授权失败：${extractErrorMessage(error)}`);
      return;
    }
    // 轮询等待登录完成，成功后账号自动落库
    try {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const state = await getBrowserAuthStatus();
        if (state.status === 'success') {
          toast.success(`${platform.name}账号「${state.accountName ?? ''}」授权成功`);
          await load();
          return;
        }
        if (state.status === 'failed') {
          toast.error(state.message ?? `${platform.name}授权失败`);
          await load();
          return;
        }
      }
      toast.error('授权超时：未检测到登录完成，请重新发起授权');
      await load();
    } catch (error: unknown) {
      toast.error(`检测授权结果失败：${extractErrorMessage(error)}`);
    }
  };

  /** 刷新校验：串行逐个校验每个已授权账号的登录态，轮到哪个卡片哪个进入 loading */
  const handleRefresh = async (): Promise<void> => {
    if (refreshLoading) return;
    const targets = accounts.filter(
      (item: SocialAccount) => item.platformUid,
    );
    if (targets.length === 0) {
      toast.info('暂无可校验的账号');
      return;
    }
    setRefreshLoading(true);
    try {
      for (const acct of targets) {
        setVerifyingId(acct.id);
        try {
          const updated = await verifyAccount(acct.id);
          setAccounts((prev) =>
            prev.map((item) => (item.id === acct.id ? updated : item)),
          );
          setAllAccounts((prev) =>
            prev.map((item) => (item.id === acct.id ? updated : item)),
          );
        } catch (err: unknown) {
          toast.error(
            `${acct.accountName} 校验失败：${extractErrorMessage(err)}`,
          );
        }
      }
      toast.success(`校验完成，共校验 ${targets.length} 个账号`);
    } finally {
      setVerifyingId(null);
      setRefreshLoading(false);
    }
  };

  const handleFormClose = (): void => {
    setFormOpen(false);
    setEditingAccount(null);
  };

  const handleFormSaved = (): void => {
    handleFormClose();
    void load();
  };

  const handlePlatformAuthorized = async (
    platform: PlatformMeta,
  ): Promise<void> => {
    // 浏览器授权（个人号）：轮询后端登录状态，成功后账号自动落库
    try {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const state = await getBrowserAuthStatus();
        if (state.status === 'success') {
          toast.success(`${platform.name}账号「${state.accountName ?? ''}」授权成功`);
          setPlatformAuthOpen(false);
          await load();
          return;
        }
        if (state.status === 'failed') {
          toast.error(state.message ?? `${platform.name}授权失败`);
          setPlatformAuthOpen(false);
          await load();
          return;
        }
      }
      toast.error('授权超时：未检测到登录完成，请重新发起授权');
      setPlatformAuthOpen(false);
      await load();
    } catch (error: unknown) {
      toast.error(`检测授权结果失败：${extractErrorMessage(error)}`);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deletingAccount) {
      return;
    }
    setDeleteLoading(true);
    try {
      await deleteAccount(deletingAccount.id);
      toast.success('账号已删除');
      setDeletingAccount(null);
      await load();
    } catch (err: unknown) {
      toast.error(`删除失败：${extractErrorMessage(err)}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  /** 分组：选择 / 新建 / 重命名 / 删除（与素材库交互一致） */
  const handleSelectGroup = (group: string): void => {
    setActiveGroup(group);
  };

  const handleCreateGroup = async (name: string): Promise<void> => {
    await createAccountGroup(name);
    await loadGroups();
  };

  const handleRenameGroup = async (
    oldName: string,
    newName: string,
  ): Promise<void> => {
    await renameAccountGroup(oldName, newName);
    await loadGroups();
    if (activeGroup === oldName) {
      setActiveGroup(newName);
    }
  };

  const handleDeleteGroup = async (name: string): Promise<void> => {
    await deleteAccountGroup(name);
    await loadGroups();
    if (activeGroup === name) {
      setActiveGroup('');
    }
  };

  /** 工作台同款筛选样式：实心蓝底、可再次点击取消（toggle） */
  const pillClass = (active: boolean): string =>
    cn(
      'flex items-center gap-1.5 rounded-none border px-3 py-1.5 text-sm font-medium transition-colors',
      active
        ? 'border-transparent bg-[#0033A0] text-white'
        : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-slate-50',
    );

  return (
    <div className="flex min-h-0">
      <GroupSidebar
        groups={groups}
        activeGroup={activeGroup}
        onSelectGroup={handleSelectGroup}
        onCreateGroup={handleCreateGroup}
        onRenameGroup={handleRenameGroup}
        onDeleteGroup={handleDeleteGroup}
      />
      <div className="min-w-0 flex-1">
        {/* 顶部：平台筛选 + 操作按钮 */}
        <div className="sticky top-14 z-10 border-b border-[#E2E8F0] bg-white px-8 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setPlatformFilter(null)}
                className={pillClass(platformFilter === null)}
              >
                全部平台
              </button>
              {PLATFORMS.map((meta) => (
                <button
                  key={meta.value}
                  type="button"
                  onClick={() =>
                    setPlatformFilter(
                      platformFilter === meta.value ? null : meta.value,
                    )
                  }
                  className={pillClass(platformFilter === meta.value)}
                >
                  <Image
                    src={PLATFORM_LOGOS[meta.value]}
                    alt=""
                    className="size-4 rounded-none"
                  />
                  {meta.name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => void handleRefresh()}
                variant="outline"
                disabled={refreshLoading}
                className="rounded-none border-[#E2E8F0] px-5 text-sm font-semibold text-[#0033A0] hover:bg-[#EFF4FF]"
              >
                <RefreshCw
                  className={`mr-1.5 h-4 w-4 ${refreshLoading ? 'animate-spin' : ''}`}
                />
                刷新校验
              </Button>
              <Button
                onClick={handleAuthAccount}
                className="rounded-none bg-[#0033A0] px-5 text-sm font-semibold text-white hover:bg-[#00267A]"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                授权账号
              </Button>
            </div>
          </div>
        </div>

        <div className="px-8 pb-20 pt-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((key: number) => (
                <Skeleton key={key} className="h-56 rounded-none" />
              ))}
            </div>
          ) : error !== null ? (
            <div className="flex flex-col items-center gap-4 rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-10 text-center">
              <AlertTriangle className="size-8 text-[#EF4444]" />
              <p className="text-[12px] font-medium text-slate-600">
                加载账号失败：{error}
              </p>
              <Button
                variant="outline"
                className="rounded-none"
                onClick={() => void load()}
              >
                <RefreshCw className="size-4" />
                重试
              </Button>
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-12 text-center">
              <Users className="size-10 text-[#94A3B8]" />
              <div>
                <p className="text-base font-bold tracking-tight text-[#1E293B]">
                  {activeGroup !== '' ? '该分组还没有账号' : '还没有账号'}
                </p>
                <p className="mt-2 text-[12px] font-medium text-slate-600">
                  {activeGroup !== ''
                    ? '可切换其他分组，或授权账号后移动到该分组'
                    : '授权你的第一个账号，开始管理抖音、小红书、B站等 7 个平台的矩阵'}
                </p>
              </div>
              <Button
                className="rounded-none bg-[#0033A0] font-bold text-white hover:bg-[#004B93]"
                onClick={handleAuthAccount}
              >
                <Plus className="size-4" />
                授权账号
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
              {accounts.map((account: SocialAccount) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onDelete={setDeletingAccount}
                  verifying={verifyingId === account.id}
                  onAuthRequest={() => void handleQuickReAuth(account)}
                  onVerify={() => void handleVerifyOne(account)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AccountFormDialog
        open={formOpen}
        account={editingAccount}
        groups={groups}
        onClose={handleFormClose}
        onSaved={handleFormSaved}
      />

      <PlatformAuthDialog
        open={platformAuthOpen}
        onClose={() => setPlatformAuthOpen(false)}
        onAuthorize={handlePlatformAuthorized}
      />

      <Dialog
        open={deletingAccount !== null}
        onOpenChange={(nextOpen: boolean) => {
          if (!nextOpen) {
            setDeletingAccount(null);
          }
        }}
      >
        <DialogContent className="rounded-none border border-[#E2E8F0] border-t-[3px] border-t-[#0033A0] p-6 sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold tracking-tight text-[#1E293B]">
              删除账号
            </DialogTitle>
            <DialogDescription className="text-[12px] font-medium text-slate-600">
              确定要删除账号「{deletingAccount?.accountName}」吗？删除后不可恢复。
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setDeletingAccount(null)}
              disabled={deleteLoading}
            >
              取消
            </Button>
            <Button
              className="rounded-none bg-[#EF4444] font-bold text-white hover:bg-[#EF4444]/90"
              onClick={() => void handleDelete()}
              disabled={deleteLoading}
            >
              删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SocialAccounts;
