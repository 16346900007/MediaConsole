import { useEffect, useState } from 'react';
import { Check, ExternalLink, Folder, FolderOpen, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import type { FC, ReactNode } from 'react';
import { PLATFORM_MAP } from '@shared/platforms';
import type { SocialAccount } from '@shared/api.interface';
import { PLATFORM_LOGOS } from '@/utils/platform-logos';
import { Image } from '@client/src/components/ui/image';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

interface AccountCardProps {
  account: SocialAccount;
  onDelete: (account: SocialAccount) => void;
  /** 是否正在校验该账号（轮询轮到它时进入 loading） */
  verifying?: boolean;
  /** 离线账号点创作中心时触发重新授权 */
  onAuthRequest?: () => void;
  /** 单独刷新该卡片在线状态 */
  onVerify?: () => void;
  /** 批量模式：卡片可勾选 */
  batchMode?: boolean;
  /** 是否已勾选 */
  selected?: boolean;
  /** 勾选/取消勾选 */
  onToggleSelect?: () => void;
}

/** 打开外部链接：带账号登录态由后端拉起 Edge 窗口，无登录态回退系统浏览器 */
function openCreatorCenter(account: SocialAccount, url: string): void {
  axiosForBackend({
    url: '/api/social/open-external',
    method: 'GET',
    params: { url, accountId: account.id },
  })
    .then((r) => {
      if (r.data?.ok) {
        console.log('[open] ok', url, 'windowed=', r.data.windowed === true);
      } else {
        console.error('[open] rejected', r.data);
      }
    })
    .catch((err: unknown) => console.error('[open] failed', err));
}

/** 账号状态小徽章（inline，置于账号名旁） */
function StatusBadge({
  online,
  verifying,
}: {
  online: boolean | null;
  verifying: boolean;
}) {
  let label = '未校验';
  let cls = 'bg-[#F8FAFC] text-[#94A3B8]';
  let icon: ReactNode = null;
  if (verifying) {
    label = '校验中';
    cls = 'bg-[#EFF4FF] text-[#0033A0]';
    icon = <Loader2 className="size-2.5 animate-spin" />;
  } else if (online === true) {
    label = '在线';
    cls = 'bg-[#ECFDF5] text-[#10B981]';
  } else if (online === false) {
    label = '离线';
    cls = 'bg-[#FEF2F2] text-[#EF4444]';
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${cls}`}
    >
      {icon}
      {label}
    </span>
  );
}

const AccountCard: FC<AccountCardProps> = ({
  account,
  onDelete,
  verifying = false,
  onAuthRequest,
  onVerify,
  batchMode = false,
  selected = false,
  onToggleSelect,
}) => {
  const platform = PLATFORM_MAP[account.platform];
  const avatar = account.avatar;
  // 各平台头像 CDN 有 Referer 防盗链（hdslb/sinaimg 拒绝 127.0.0.1 引用），
  // 外部头像统一走后端代理（按域名带正确 Referer 拉取），本地/相对地址原样使用
  const avatarSrc =
    avatar && /^https:\/\//.test(avatar)
      ? `/avatar-proxy?url=${encodeURIComponent(avatar)}`
      : avatar;
  // 头像加载失败时回退平台 logo（避免显示难看的 alt 文本裁剪）
  const [avatarError, setAvatarError] = useState(false);
  useEffect(() => {
    setAvatarError(false);
  }, [account.avatar]);

  /** 打开创作中心：离线账号走重新授权，其余走后端带登录态打开。
   *  优先平台配置的 homeUrl（登录后可直达的后台，如微博创作平台 creator.weibo.com），
   *  其次账号自定义 homeUrl，最后回退 creatorUrl（授权/登录入口）。 */
  const handleOpenCreator = (): void => {
    if (account.online === false) {
      onAuthRequest?.();
      return;
    }
    const target =
      platform.homeUrl || account.homeUrl || platform.creatorUrl;
    openCreatorCenter(account, target);
  };

  return (
    <div
      className={`relative flex items-start gap-4 rounded-none border-t-[3px] border-t-[#0033A0] bg-white p-6 shadow-md transition-colors ${
        batchMode ? 'cursor-pointer hover:border-[#0033A0]' : 'hover:bg-slate-50'
      } ${
        selected
          ? 'border-l-[3px] border-l-[#0033A0]'
          : 'border-l-[3px] border-l-transparent'
      }`}
      onClick={batchMode ? onToggleSelect : undefined}
    >
      {/* 批量模式勾选框 */}
      {batchMode && (
        <span
          className={`absolute left-2 top-2 z-10 flex size-5 items-center justify-center rounded-none border transition-colors ${
            selected
              ? 'border-[#0033A0] bg-[#0033A0] text-white'
              : 'border-[#94A3B8] bg-white/80 text-transparent'
          }`}
        >
          <Check className="size-3.5" />
        </span>
      )}

      {/* 头像：优先平台头像，无头像或加载失败时用平台 logo 兜底 */}
      <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F8FAFC] ring-1 ring-[#E2E8F0]">
        {avatar && !avatarError ? (
          <Image
            src={avatarSrc}
            alt={account.accountName}
            loading="eager"
            decoding="sync"
            referrerPolicy="no-referrer"
            className="size-14 object-cover"
            onError={() => setAvatarError(true)}
          />
        ) : (
          <Image
            src={PLATFORM_LOGOS[platform.value]}
            alt={platform.name}
            className="size-10 object-contain"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight text-[#1A1A1A]">
            {account.accountName}
          </h3>
          <StatusBadge online={account.online ?? null} verifying={verifying} />
        </div>

        {/* 平台标志：logo + 平台名 + 分组 */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <Image
            src={PLATFORM_LOGOS[platform.value]}
            alt={platform.name}
            className="size-4 object-contain"
          />
          <span className="text-[12px] font-bold text-[#94A3B8]">
            {platform.name}
          </span>
        </div>

        {/* 分组徽章：有分组蓝色底，未分组灰色底（min-w-0+truncate 避免被挤压溢出） */}
        <div className="mt-1.5 min-w-0">
          {account.groupName ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-sm bg-[#EFF4FF] px-1.5 py-0.5 text-[10px] font-bold text-[#0033A0]">
              <Folder className="size-3 shrink-0" />
              <span className="truncate">{account.groupName}</span>
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-[#94A3B8]">
              <FolderOpen className="size-3" />
              未分组
            </span>
          )}
        </div>

        {account.note && (
          <p className="mt-2 line-clamp-2 text-[11px] font-medium leading-4 text-[#94A3B8]">
            {account.note}
          </p>
        )}
      </div>

      {!batchMode && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleOpenCreator}
            className="inline-flex size-8 items-center justify-center rounded-none text-[#94A3B8] transition-colors hover:bg-slate-50 hover:text-[#0033A0]"
            aria-label="打开创作中心"
            title={account.online === false ? '登录态已失效，点击重新授权' : '打开创作中心'}
          >
            <ExternalLink className="size-3.5" />
          </button>
          {/* 单独刷新该卡片在线状态 */}
          <button
            type="button"
            onClick={onVerify}
            disabled={verifying}
            className="inline-flex size-8 items-center justify-center rounded-none text-[#94A3B8] transition-colors hover:bg-slate-50 hover:text-[#0033A0] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="刷新校验"
            title="刷新校验该账号在线状态"
          >
            <RefreshCw className={`size-3.5 ${verifying ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(account)}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-none text-[#94A3B8] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
            aria-label="删除账号"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default AccountCard;
