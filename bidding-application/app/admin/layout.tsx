'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { useToast } from '@/app/components/Toast';
import Link from 'next/link';
import { 
  BarChart3, 
  Settings, 
  Menu, 
  ChevronLeft, 
  ChevronRight, 
  LogOut, 
  User
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const { toast } = useToast();
  
  const [authorized, setAuthorized] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/auth');
      } else if (user.role !== 'ADMIN') {
        toast('Access denied. Administrative privileges required.', 'error');
        router.push('/');
      } else {
        setAuthorized(true);
      }
    }
  }, [user, loading, router, toast]);

  if (loading || !authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#24392e] border-t-transparent"></div>
          <p className="text-sm font-medium text-[var(--foreground-muted)]">Verifying administrator privileges...</p>
        </div>
      </div>
    );
  }

  const menuItems = [
    { name: 'Analytics Dashboard', href: '/admin', icon: BarChart3 },
    { name: 'Operations Portal', href: '/admin/operations', icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] w-full">
      {/* Sidebar for Desktop */}
      <aside className={`hidden md:flex h-screen sticky top-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[#24392e] text-[#efebe3] transition-all duration-300 ease-in-out z-20 shrink-0 ${ collapsed ? 'w-20' : 'w-64' }`} >
        <div className="flex h-20 items-center justify-between px-6 border-b border-[#314c3e]">
          {!collapsed && (
            <Link href="/" className="font-serif text-lg font-bold tracking-wider text-white">
              Quick Fashion
            </Link>
          )}
          <button 
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-lg p-1.5 hover:bg-[#314c3e] transition-colors cursor-pointer text-white"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        
        <nav className="flex-1 space-y-1.5 px-4 py-6">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-200 group ${
                  active 
                    ? 'bg-[#efebe3] text-[#24392e] font-semibold' 
                    : 'text-[#c3cbbe] hover:bg-[#314c3e] hover:text-[#efebe3]'
                }`}
              >
                <Icon size={20} className={active ? 'text-[#24392e]' : 'text-[#c3cbbe] group-hover:text-[#efebe3]'} />
                {!collapsed && <span className="text-sm">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#314c3e] bg-[#1c3126]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#314c3e] text-white">
              <User size={18} />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate text-white">Admin Portal</p>
                <p className="text-[10px] text-[#c3cbbe] truncate">{user?.email}</p>
              </div>
            )}
            {!collapsed && (
              <button 
                onClick={logout}
                className="text-[#c3cbbe] hover:text-[#fb7185] transition-colors p-1 cursor-pointer"
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Drawer (Overlay) */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside 
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-[var(--border)] bg-[#24392e] text-[#efebe3] transform transition-transform duration-300 ease-in-out md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-20 items-center justify-between px-6 border-b border-[#314c3e]">
          <Link href="/" className="font-serif text-lg font-bold tracking-wider text-white">
            Quick Fashion
          </Link>
          <button 
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 hover:bg-[#314c3e] transition-colors text-white cursor-pointer"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
        
        <nav className="flex-1 space-y-1.5 px-4 py-6">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-200 group ${
                  active 
                    ? 'bg-[#efebe3] text-[#24392e] font-semibold' 
                    : 'text-[#c3cbbe] hover:bg-[#314c3e] hover:text-[#efebe3]'
                }`}
              >
                <Icon size={20} className={active ? 'text-[#24392e]' : 'text-[#c3cbbe] group-hover:text-[#efebe3]'} />
                <span className="text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-full p-4 border-t border-[#314c3e] bg-[#1c3126]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#314c3e] text-white">
              <User size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate text-white">Admin Portal</p>
              <p className="text-[10px] text-[#c3cbbe] truncate">{user?.email}</p>
            </div>
            <button 
              onClick={logout}
              className="text-[#c3cbbe] hover:text-[#fb7185] transition-colors p-1 cursor-pointer"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden w-full">
        {/* Mobile Header */}
        <header className="flex h-16 items-center justify-between border-b border-[var(--border)] bg-[#fbfaf7] px-6 md:hidden shrink-0">
          <Link href="/" className="font-serif text-lg font-bold tracking-wider text-[#1d231f]">
            Quick Fashion
          </Link>
          <button 
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-[#1d231f] hover:bg-[#efebe3] transition-colors cursor-pointer"
          >
            <Menu size={20} />
          </button>
        </header>

        {/* Dynamic page content */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8"> 
          {children}
        </main>
      </div>
    </div>
  );
}
