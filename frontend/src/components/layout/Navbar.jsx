import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GraduationCap, LayoutDashboard, BookOpen, Menu, ClipboardList, LogOut, UploadCloud } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import ImportModal from '../ui/ImportModal.jsx';
import AIEngineBadge from '../ui/AIEngineBadge.jsx';
import { useAuthStore } from '../../store/authStore.js';

const navLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/subjects',  label: 'Subjects & Calendar',  icon: BookOpen },
  { to: '/attendance', label: 'Attendance', icon: ClipboardList },
];

const Navbar = () => {
  const location  = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [importOpen,  setImportOpen]  = useState(false);
  const { logout } = useAuthStore();

  return (
    <>
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-200"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 group">
            <GraduationCap size={24} className="text-gray-900 group-hover:text-primary transition-colors" />
            <span className="text-xl font-bold text-gray-900 hidden sm:block">BunkCalc</span>
          </Link>

          {/* Center nav (desktop) */}
          <nav className="hidden md:flex items-center gap-2">
            {navLinks.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to || (to === '/attendance' && location.pathname.startsWith('/attendance'));
              return (
                <Link
                  key={to}
                  to={to}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                    active
                      ? 'text-primary bg-purple-50'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                  {active && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-full"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <a
              href="/portal_demo.html"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-50 text-cyan-600 hover:bg-cyan-100 transition-colors border border-cyan-200"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                <path d="M6 12v5c3 3 9 3 12 0v-5"/>
              </svg>
              Portal Sync Demo
            </a>
            <AIEngineBadge className="hidden sm:inline-flex" />
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 text-primary hover:bg-purple-100 transition-colors border border-purple-100"
            >
              <UploadCloud size={14} /> Import
            </button>
            <button
              onClick={logout}
              className="hidden md:flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-red-500 transition-colors"
            >
              <LogOut size={16} /> Logout
            </button>
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </motion.nav>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImportCompleted={() => window.location.reload()} />
    </>
  );
};

export default Navbar;
