import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import RoleSelection from './pages/RoleSelection';
import StudentDashboard from './pages/student/Dashboard';
import ProfessorDashboard from './pages/professor/Dashboard';
import AdminDashboard from './pages/admin/Dashboard';
import Home from './pages/Home';
import { Skeleton } from './components/ui/skeleton';
import { ThemeProvider } from './contexts/ThemeContext';

const PrivateRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
  const { currentUser, userRole, loading } = useAuth();
  
  if (loading) {
     return <div className="h-screen w-full flex items-center justify-center"><Skeleton className="h-10 w-40" /></div>;
  }
  
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  if (!userRole) {
      if (window.location.pathname !== '/role-selection') {
          return <Navigate to="/role-selection" />;
      }
      return <>{children}</>;
  }

  // If user has a role but is trying to access role-selection, redirect to dashboard
  if (userRole && window.location.pathname === '/role-selection') {
      if (userRole === 'student') return <Navigate to="/student/dashboard" />;
      if (userRole === 'professor') return <Navigate to="/professor/dashboard" />;
      if (userRole === 'admin') return <Navigate to="/admin/dashboard" />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // Unauthorized access, redirect to their dashboard
    if (userRole === 'student') return <Navigate to="/student/dashboard" />;
    if (userRole === 'professor') return <Navigate to="/professor/dashboard" />;
    if (userRole === 'admin') return <Navigate to="/admin/dashboard" />;
    return <Navigate to="/" />; 
  }

  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/role-selection" element={
        <PrivateRoute>
            <RoleSelection />
        </PrivateRoute>
      } />
      
      {/* Student Routes */}
      <Route path="/student/dashboard" element={
        <PrivateRoute allowedRoles={['student']}>
          <StudentDashboard />
        </PrivateRoute>
      } />
      
      {/* Professor Routes */}
      <Route path="/professor/dashboard" element={
        <PrivateRoute allowedRoles={['professor']}>
          <ProfessorDashboard />
        </PrivateRoute>
      } />

      {/* Admin Routes */}
      <Route path="/admin/dashboard" element={
        <PrivateRoute allowedRoles={['admin']}>
          <AdminDashboard />
        </PrivateRoute>
      } />

      {/* Home Route */}
      <Route path="/" element={<Home />} />
      
      {/* Fallback Redirect */}
      <Route path="*" element={<RedirectHandler />} />
    </Routes>
  );
}

const RedirectHandler = () => {
    const { currentUser, userRole, loading } = useAuth();
    if (loading) return <div className="h-screen w-full flex items-center justify-center"><Skeleton className="h-10 w-40" /></div>;
    if (!currentUser) return <Navigate to="/login" />;
    if (!userRole) return <Navigate to="/role-selection" />;
    if (userRole === 'student') return <Navigate to="/student/dashboard" />;
    if (userRole === 'professor') return <Navigate to="/professor/dashboard" />;
    if (userRole === 'admin') return <Navigate to="/admin/dashboard" />;
    return <Navigate to="/login" />;
};

const MainLayout = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-grow">
        <AppRoutes />
      </div>
    </div>
  );
};

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="eco-submit-theme">
      <AuthProvider>
        <Router>
          <MainLayout />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
