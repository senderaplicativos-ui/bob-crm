import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { InstanceProvider } from "@/contexts/InstanceContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import InstanceSelect from "./pages/InstanceSelect";
import Dashboard from "./pages/Dashboard";
import Conversations from "./pages/Conversations";
import ConversationDetail from "./pages/ConversationDetail";
import Funil from "./pages/Funil";
import Regras from "./pages/Regras";
import Conexoes from "./pages/Conexoes";
import Links from "./pages/Links";
import MetaPixel from "./pages/MetaPixel";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const protect = (el: JSX.Element) => <ProtectedRoute>{el}</ProtectedRoute>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <InstanceProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={protect(<InstanceSelect />)} />
              <Route path="/adicionar-cliente" element={protect(<Conexoes />)} />
              <Route path="/dashboard" element={protect(<Dashboard />)} />
              <Route path="/funil" element={protect(<Funil />)} />
              <Route path="/conversations" element={protect(<Conversations />)} />
              <Route path="/conversations/:id" element={protect(<ConversationDetail />)} />
              <Route path="/regras" element={protect(<Regras />)} />
              <Route path="/links" element={protect(<Links />)} />
              <Route path="/meta-pixel" element={protect(<MetaPixel />)} />
              <Route path="/conexoes" element={protect(<Conexoes />)} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          </InstanceProvider>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
