import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, LayoutDashboard, BookOpen, ClipboardList, X } from 'lucide-react';

const navLinks = [
  { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/subjects',   label: 'Subjects & Calendar',   icon: BookOpen },
  { to: '/attendance', label: 'Attendance', icon: ClipboardList },
];

const Sidebar = ({ open, onClose }) => {
  const location = useLocation();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm md:hidden"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-white border-r border-gray-200 flex flex-col md:hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <GraduationCap size={24} className="text-gray-900" />
                <span className="text-xl font-bold text-gray-900">BunkCalc</span>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all">
                <X size={18} />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 p-4 space-y-2">
              {navLinks.map(({ to, label, icon: Icon }) => {
                const active = location.pathname === to || (to === '/attendance' && location.pathname.startsWith('/attendance'));
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
                      active
                        ? 'bg-primary text-white shadow-soft'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={18} />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default Sidebar;
