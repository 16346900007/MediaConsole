import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ChevronsLeft,
  ChevronsRight,
  Eraser,
  FileText,
  FolderOpen,
  Images,
  LayoutDashboard,
  MoreVertical,
  Send,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  clearAppCache,
  getCacheInfo,
  openCacheDir,
} from '@client/src/api/social';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '工作台', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: '账号', icon: Users },
  { to: '/publish', label: '发布', icon: Send },
  { to: '/materials', label: '素材库', icon: Images },
];

const matchNavItem = (pathname: string): NavItem =>
  NAV_ITEMS.find((item) =>
    item.end ? pathname === '/' : pathname.startsWith(item.to),
  ) ?? NAV_ITEMS[0];

const Layout = () => {
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cacheMB, setCacheMB] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const current = matchNavItem(location.pathname);
  const CurrentIcon = current.icon;

  // 点击菜单以外的任意位置关闭菜单
  useEffect(() => {
    const handleDocClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  const refreshCacheInfo = async () => {
    try {
      const info = await getCacheInfo();
      setCacheMB(info.sizeMB);
    } catch {
      /* 缓存信息获取失败静默（web 端无此接口时菜单仍可用） */
    }
  };

  const handleClearCache = async () => {
    setClearing(true);
    try {
      const result = await clearAppCache();
      setMenuOpen(false);
      toast.success(`已清理 ${result.clearedMB} MB 缓存`, {
        description:
          result.failedItems > 0
            ? `${result.failedItems} 项被进程占用，将在下次启动时清除`
            : undefined,
      });
      // 清缓存后重新加载页面，让新前端立即生效
      setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      toast.error('清理缓存失败', { description: (error as Error).message });
      setClearing(false);
      setMenuOpen(false);
    }
  };

  const handleOpenCacheDir = async () => {
    try {
      await openCacheDir();
      toast.success('已打开缓存目录');
    } catch (error) {
      toast.error('打开缓存目录失败', { description: (error as Error).message });
    }
    setMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-[#F4F7F9]">
      <aside
        className={`sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r border-[#E2E8F0] bg-white py-4 transition-[width] duration-200 ${
          expanded ? 'w-60 px-3' : 'w-16 px-2'
        }`}
      >
        <div
          className={`flex items-center ${
            expanded ? 'px-3' : 'justify-center px-0'
          }`}
        >
          {expanded ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-[#0033A0] text-xs font-black text-white">
                S
              </span>
              <span className="min-w-0 truncate text-sm font-semibold text-[#1A1A1A]">
                Solo Media Hub
              </span>
            </div>
          ) : (
            <span className="flex h-7 w-7 items-center justify-center bg-[#0033A0] text-xs font-black text-white">
              S
            </span>
          )}
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.label}
              className={({ isActive }) =>
                `flex items-center rounded-md text-sm transition-colors ${
                  expanded ? 'gap-3 px-3' : 'justify-center px-0'
                 } min-w-0 ${
                  isActive
                    ? 'bg-[#EFF4FF] font-semibold text-[#0033A0]'
                    : 'font-medium text-[#475569] hover:bg-slate-100'
                } py-2.5`
              }
            >
               <item.icon className="h-4 w-4 shrink-0" />
              {expanded && <span className="min-w-0 truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[#E2E8F0] bg-white px-6">
          <button
            type="button"
            aria-label={expanded ? '收起侧边栏' : '展开侧边栏'}
            onClick={() => setExpanded((prev) => !prev)}
            className="-ml-2 flex h-9 w-9 items-center justify-center rounded-md text-[#475569] transition-colors hover:bg-slate-100"
          >
            {expanded ? (
              <ChevronsLeft className="h-4 w-4" />
            ) : (
              <ChevronsRight className="h-4 w-4" />
            )}
          </button>
          <CurrentIcon className="h-[18px] w-[18px] shrink-0 text-[#0033A0]" />
          <span className="h-4 w-px bg-[#E2E8F0]" aria-hidden />
          <h1 className="text-base font-semibold text-[#1A1A1A]">
            {current.label}
          </h1>
          <div ref={menuRef} className="relative ml-auto">
            <button
              type="button"
              aria-label="应用菜单"
              onClick={() => {
                setMenuOpen((prev) => {
                  if (!prev) void refreshCacheInfo();
                  return !prev;
                });
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-slate-100 ${
                menuOpen ? 'bg-slate-100 text-[#0033A0]' : 'text-[#475569]'
              }`}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 z-30 w-56 rounded-none border-t-[3px] border-t-[#0033A0] bg-white py-1.5 shadow-md">
                <button
                  type="button"
                  onClick={handleClearCache}
                  disabled={clearing}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  <Eraser className="h-4 w-4 shrink-0 text-[#0033A0]" />
                  <span>{clearing ? '清理中…' : '清理缓存'}</span>
                  {cacheMB !== null && !clearing && (
                    <span className="ml-auto font-mono text-xs text-[#94A3B8]">
                      {cacheMB} MB
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleOpenCacheDir}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-slate-50"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-[#0033A0]" />
                  <span>打开缓存目录</span>
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
