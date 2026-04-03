import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import Expenses from "@/pages/Expenses";
import Budgets from "@/pages/Budgets";
import Insights from "@/pages/Insights";
import Summary from "@/pages/Summary";
import Reports from "@/pages/Reports";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#0A0A0A] text-white relative">
        <div className="blob-bg">
          <div className="blob-yellow-1" />
          <div className="blob-yellow-2" />
        </div>
        <div className="relative z-10 flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto pb-24 md:pb-0 md:ml-20">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/summary" element={<Summary />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/insights" element={<Insights />} />
            </Routes>
          </main>
        </div>
        <Toaster theme="dark" position="top-right" />
      </div>
    </BrowserRouter>
  );
}

export default App;
