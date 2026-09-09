import { ReactNode, useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, MessageSquare, BookOpen, Wifi, Filter, Link, Target, HeartPulse, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInstance } from "@/contexts/InstanceContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusModal, useErrorAlert } from "@/components/StatusModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ThemeToggle from "@/components/ThemeToggle";

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
{ label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
{ label: "Funil", path: "/funil", icon: Filter },
{ label: "Conversas", path: "/conversations", icon: MessageSquare },
{ label: "Regras", path: "/regras", icon: BookOpen },
{ label: "Links", path: "/links", icon: Link },
{ label: "Meta Pixel", path: "/meta-pixel", icon: Target },
{ label: "Conexões", path: "/conexoes", icon: Wifi }];


const Layout = ({ children }: LayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const { instancias, selected, setSelected } = useInstance();
  const { logout } = useAuth();

  // Alert config
  const [alertaAtivo, setAlertaAtivo] = useState(false);
  const configKey = selected ? `alerta_erros_${selected.id}` : null;

  useEffect(() => {
    if (!configKey) return;
    supabase.from("configuracoes").select("valor").eq("chave", configKey).maybeSingle().then(({ data }) => {
      setAlertaAtivo(data?.valor === "true");
    });
  }, [configKey]);

  const hasErrors = useErrorAlert(alertaAtivo, selected?.id);

  const handleInstanceChange = (id: string) => {
    const inst = instancias.find((i) => i.id === id);
    if (inst) setSelected(inst);
  };

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen &&
      <div
        className="fixed inset-0 z-30 bg-foreground/30 lg:hidden"
        onClick={() => setSidebarOpen(false)} />

      }

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>

        <div className="flex h-16 items-center gap-2 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-active">
            <MessageSquare className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold text-white">BOB CRM</span>
            <span className="text-[10px] text-sidebar-foreground/60 leading-tight">Treine o algoritmo. Venda mais.</span>
          </div>
        </div>

        {/* Instance selector in sidebar */}
        {instancias.filter((i) => i.ativo !== false).length > 0 && <div className="px-3 pb-2">
            <Select value={selected?.id || ""} onValueChange={handleInstanceChange}>
              <SelectTrigger className="w-full bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs">
                <SelectValue placeholder="Selecione cliente" />
              </SelectTrigger>
              <SelectContent>
                {instancias.filter((i) => i.ativo !== false).map((inst) => <SelectItem key={inst.id} value={inst.id}>{inst.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>}

        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setSidebarOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ?
                  "bg-sidebar-active text-white" :
                  "text-sidebar-foreground hover:bg-sidebar-hover hover:text-white"
                )}>

                <item.icon className="h-4 w-4" />
                {item.label}
              </button>);

          })}
        </nav>

        {/* Status, Tema & Sair buttons at sidebar footer */}
        <div className="mt-auto border-t border-sidebar-border px-3 py-3 space-y-1">
          <button
            onClick={() => setStatusOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-hover hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="relative">
              <HeartPulse className="h-4 w-4" />
              {alertaAtivo && hasErrors && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
              )}
            </span>
            Status
          </button>
          <button
            onClick={async () => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-hover hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
          <div className="pt-2">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Status Modal */}
      <StatusModal open={statusOpen} onOpenChange={setStatusOpen} />

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-14 items-center justify-between border-b border-border px-4 lg:hidden">
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">

              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="ml-3 text-sm font-semibold">{selected?.nome || "WhatsApp CRM"}</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>);

};

export default Layout;