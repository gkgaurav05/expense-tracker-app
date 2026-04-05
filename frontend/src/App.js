import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import Expenses from "@/pages/Expenses";
import Budgets from "@/pages/Budgets";
import Insights from "@/pages/Insights";
import Summary from "@/pages/Summary";
import Reports from "@/pages/Reports";
import Savings from "@/pages/Savings";
import Login from "@/pages/Login";
import Register from "@/pages/Register";

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Register />}
      />

      {/* Protected routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <div className="relative z-10 flex min-h-screen">
              <Sidebar />
              <main className="flex-1 overflow-auto pb-24 md:pb-0 md:ml-20">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/expenses" element={<Expenses />} />
                  <Route path="/budgets" element={<Budgets />} />
                  <Route path="/savings" element={<Savings />} />
                  <Route path="/summary" element={<Summary />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/insights" element={<Insights />} />
                </Routes>
              </main>
            </div>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-[#0A0A0A] text-white relative">
          <div className="blob-bg">
            <div className="blob-yellow-1" />
            <div className="blob-yellow-2" />
          </div>
          <AppRoutes />
          <Toaster theme="dark" position="top-right" />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
