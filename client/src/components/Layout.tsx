import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Images,
  LayoutDashboard,
  Users,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '工作台', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: '账号矩阵', icon: Users },
  { to: '/contents', label: '内容中心', icon: FileText },
  { to: '/materials', label: '素材库', icon: Images },
  { to: '/analytics', label: '数据复盘', icon: BarChart3 },
];

const matchNavItem = (pathname: string): NavItem =>
  NAV_ITEMS.find((item) =>
    item.end ? pathname === '/' : pathname.startsWith(item.to),
  ) ?? NAV_ITEMS[0];

const Layout = () => {
  const [expanded, setExpanded] = useState(true);
  const location = useLocation();
  const current = matchNavItem(location.pathname);
  const CurrentIcon = current.icon;

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
        </header>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
