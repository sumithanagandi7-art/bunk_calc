import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from './store/authStore.js';
import Landing    from './pages/Landing.jsx';
import Access     from './pages/Access.jsx';
import Dashboard  from './pages/Dashboard.jsx';
import Subjects   from './pages/Subjects.jsx';
import Attendance from './pages/Attendance.jsx';

const ProtectedRoute = ({ children }) => {
  const { workspace, accessToken } = useAuthStore();
  const isAuthenticated = !!accessToken && !!workspace;
  return isAuthenticated ? children : <Navigate to="/access" replace />;
};

const App = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/"          element={<Landing />} />
        <Route path="/access"    element={<Access />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/subjects"  element={<ProtectedRoute><Subjects /></ProtectedRoute>} />
        <Route path="/attendance/:subjectId?" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
};

export default App;
