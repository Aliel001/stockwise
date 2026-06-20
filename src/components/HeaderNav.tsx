import { useState } from 'react';
import { Page } from '../types';
import { logOut, auth } from '../firebase';
import { 
  LayoutDashboard, 
  Package, 
  PlusCircle, 
  ShoppingBag, 
  Bell, 
  History, 
  LogOut, 
  Menu, 
  X,
  Store,
  UserCheck,
  ChevronDown,
  Wifi,
  WifiOff,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HeaderNavProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  unreadCount: number;
  networkHealthy: boolean | null;
}

export default function HeaderNav({ currentPage, setCurrentPage, unreadCount, networkHealthy }: HeaderNavProps) {
  const currentUser = auth.currentUser;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  let menuItems = [
    { page: Page.Dashboard, label: 'Dashboard', icon: LayoutDashboard },
    { page: Page.Products, label: 'Products', icon: Package },
    { page: Page.StockIn, label: 'Stock In', icon: PlusCircle },
    { page: Page.Sales, label: 'Sales', icon: ShoppingBag },
    { page: Page.AIAssistant, label: 'AI Assistant', icon: Sparkles },
    { page: Page.Notifications, label: 'Alerts', icon: Bell, badge: unreadCount },
    { page: Page.ActivityLogs, label: 'Logs', icon: History },
  ];

  if (currentUser?.role === 'SUPER_ADMIN') {
    // filter out Products, Stock In, and Sales views for Super Admin role
    menuItems = menuItems.filter(item => 
      item.page !== Page.Products && 
      item.page !== Page.StockIn && 
      item.page !== Page.Sales
    );
    menuItems.push({ page: Page.SuperAdmin, label: 'Access System', icon: UserCheck });
  }

  const handleSignOut = () => {
    logOut();
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-900 text-slate-100 border-b border-slate-800 shadow-md">
      {/* Top Main Navigation Row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo and Title */}
          <div className="flex items-center space-x-3 cursor-pointer select-none" onClick={() => setCurrentPage(Page.Dashboard)}>
            <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-sm">
              <Store className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-extrabold tracking-tight font-sans leading-none">StockWise</span>
              <span className="text-[9px] text-slate-400 mt-0.5 font-medium tracking-wide uppercase">Inventory Hub</span>
            </div>
          </div>

          {/* Desktop Navigation Link Tabs */}
          <nav className="hidden lg:flex items-center space-x-1 select-none">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.page;
              return (
                <button
                  key={item.page}
                  onClick={() => setCurrentPage(item.page)}
                  className={`relative flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all group cursor-pointer ${
                    isActive 
                      ? 'bg-slate-800 text-white shadow-inner' 
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 ? (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] text-white bg-rose-650 rounded-full font-bold ml-1 animate-pulse">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          {/* User Profile Summary & Operations Panel */}
          <div className="flex items-center space-x-3">
            {/* Realtime database status bar indicator */}
            <div className="hidden sm:block select-none">
              {networkHealthy === false ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-red-950/40 text-red-400 border border-red-900/30 text-[9px] font-bold">
                  <WifiOff className="w-3 h-3" />
                  <span>Offline</span>
                </span>
              ) : networkHealthy === true ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 text-[9px] font-bold">
                  <Wifi className="w-3 h-3" />
                  <span>Live Sync</span>
                </span>
              ) : null}
            </div>

            {/* Notification Bell Shortcut (Mobile/Tablet helper) */}
            <button
              onClick={() => setCurrentPage(Page.Notifications)}
              className="relative lg:hidden p-1.5 text-slate-450 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <Bell className="w-4.5 h-4.5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-slate-900 animate-pulse" />
              )}
            </button>

            {/* Main Interactive/Dropdown User Avatar */}
            {currentUser && (
              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center space-x-2 p-1.5 hover:bg-slate-800 rounded-xl transition-all cursor-pointer text-left select-none border border-transparent hover:border-slate-700/60"
                >
                  {currentUser.photoURL ? (
                    <img 
                      src={currentUser.photoURL} 
                      alt={currentUser.displayName || 'User'} 
                      className="w-7 h-7 rounded-full border border-indigo-500/30"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-900 flex items-center justify-center text-indigo-250 font-bold text-xs">
                      {currentUser.displayName ? currentUser.displayName[0] : (currentUser.email ? currentUser.email[0].toUpperCase() : 'A')}
                    </div>
                  )}
                  <span className="hidden md:inline text-xs font-semibold text-slate-200 max-w-[100px] truncate">
                    {currentUser.displayName || currentUser.email?.split('@')[0] || 'Admin'}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400 hidden md:block" />
                </button>

                {/* Profile dropdown micro-menu */}
                <AnimatePresence>
                  {profileDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setProfileDropdownOpen(false)} 
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-56 bg-slate-850 border border-slate-750 rounded-xl shadow-xl z-50 py-2.5 overflow-hidden text-slate-200"
                      >
                        <div className="px-4 py-2 border-b border-slate-750 bg-slate-900/40">
                          <p className="text-xs font-bold text-white truncate">
                            {currentUser.displayName || 'Shop Administrator'}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {currentUser.email}
                          </p>
                          <div className="flex items-center space-x-1 mt-1.5 text-[9px] text-emerald-400 font-bold bg-emerald-950/30 px-1.5 py-0.5 rounded w-max">
                            <UserCheck className="w-3 h-3" />
                            <span>Administrator</span>
                          </div>
                        </div>

                        <div className="px-1.5 pt-1.5">
                          <button
                            onClick={() => {
                              setProfileDropdownOpen(false);
                              handleSignOut();
                            }}
                            className="w-full flex items-center space-x-2.5 px-3 py-2 text-rose-300 hover:text-white hover:bg-rose-950/40 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-left"
                          >
                            <LogOut className="w-4 h-4 text-rose-450" />
                            <span>Sign Out Manager</span>
                          </button>
                        </div>

                        <div className="mt-2.5 px-4 pt-2 border-t border-slate-755 text-[8px] text-slate-500 text-center select-none font-medium">
                          StockWise v1.0.0 &bull; Secure ABAC Mode
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Mobile Hamburger toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
              aria-label="Toggle Navigation Drawer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile/Tablet Side Drawer Sheet */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 top-0 bg-slate-950/70 backdrop-blur-xs z-50 lg:hidden"
            />
            
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 left-0 max-w-xs w-full bg-slate-900 border-r border-slate-800 shadow-2xl z-55 flex flex-col justify-between overflow-y-auto lg:hidden"
            >
              <div>
                {/* Drawer Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
                  <div className="flex items-center space-x-3 select-none">
                    <div className="p-2 bg-indigo-600 rounded-lg text-white">
                      <Store className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-base font-extrabold tracking-tight">StockWise</span>
                      <span className="text-[9px] text-slate-400 font-medium tracking-wide uppercase">Admin Drawer</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Drawer Navigation items */}
                <div className="px-3.5 py-4 space-y-1.5">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest px-3 mb-2">Menu Sections</p>
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.page;
                    return (
                      <button
                        key={item.page}
                        onClick={() => {
                          setCurrentPage(item.page);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          isActive 
                            ? 'bg-indigo-600 text-white shadow' 
                            : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </div>
                        
                        {item.badge !== undefined && item.badge > 0 ? (
                          <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] text-white bg-rose-650 rounded-full font-bold">
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Drawer Footer info & logout */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/20">
                <div className="flex items-center space-x-2 px-3 py-2 bg-slate-850/50 rounded-xl mb-3 border border-slate-800/30">
                  {currentUser && (
                    <div className="w-8 h-8 rounded-full bg-indigo-900 border border-indigo-505 flex items-center justify-center text-white text-xs font-bold font-sans">
                      {currentUser.displayName ? currentUser.displayName[0] : (currentUser.email ? currentUser.email[0].toUpperCase() : 'A')}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-200 truncate">{currentUser?.displayName || 'Active Admin'}</p>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{currentUser?.email}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between px-3 py-2 text-[10px] text-slate-450">
                  <span>Database Tally:</span>
                  {networkHealthy === false ? (
                    <span className="text-red-400 font-bold bg-red-950/20 px-1.5 py-0.5 rounded">Offline</span>
                  ) : (
                    <span className="text-emerald-400 font-bold bg-emerald-950/20 px-1.5 py-0.5 rounded">Live Sync</span>
                  )}
                </div>
                
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  className="w-full mt-3 flex items-center justify-center space-x-2 px-3.5 py-3 text-rose-300 hover:text-white bg-rose-950/10 hover:bg-rose-950/30 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-rose-950/30"
                >
                  <LogOut className="w-4 h-4 text-rose-450" />
                  <span>Sohoka / Log Out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MOBILE PERSISTENT BOTTOM NAVIGATION BAR (PWA Native App Experience) */}
      <div id="pwa-bottom-nav" className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-800/80 backdrop-blur-md flex justify-around items-center h-16 pb-safe lg:hidden shadow-2xl">
        {menuItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.page;
          return (
            <button
              key={item.page}
              onClick={() => setCurrentPage(item.page)}
              className={`flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all relative ${
                isActive ? 'text-indigo-400 scale-105' : 'text-slate-400 active:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] font-bold tracking-tight truncate max-w-[56px]">
                {item.label}
              </span>
              
              {/* Dynamic Notification badge */}
              {item.badge !== undefined && item.badge > 0 ? (
                <span className="absolute -top-1 -right-1.5 inline-flex items-center justify-center w-4 h-4 text-[9px] text-white bg-rose-600 rounded-full font-bold shadow-md">
                  {item.badge}
                </span>
              ) : null}

              {/* Accent dot indicator */}
              {isActive && (
                <motion.div 
                  layoutId="bottomTabDot"
                  className="w-1.5 h-1.5 rounded-full bg-indigo-500 absolute -bottom-1"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
}
