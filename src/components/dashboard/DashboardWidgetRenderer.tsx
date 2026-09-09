import { DashboardWidgetType } from "@/hooks/useDashboardConfig";
import { EstagioFunil } from "@/hooks/useFunnelStages";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from "recharts";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OriginIcon } from "@/components/OriginBadge";

interface ConversaRow {
  status: string | null;
  origem: string | null;
  campanha: string | null;
  criado_em: string | null;
}

interface Props {
  type: DashboardWidgetType;
  conversas: ConversaRow[];
  stages: EstagioFunil[];
  mensagensPorDia: { day: string; count: number }[];
  editing: boolean;
  onRemove?: () => void;
  label?: string;
  filterValue?: string;
  getStatusColor?: (status: string) => string;
  getOrigemColor?: (origem: string) => string;
}

const FALLBACK_COLORS = ["#6366F1", "#F59E0B", "#EC4899", "#14B8A6", "#8B5CF6", "#F97316"];

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
};

const EmptyMessage = () => (
  <p className="text-sm text-muted-foreground py-8 text-center">
    Nenhum dado ainda. Configure regras ou links rastreáveis para classificar seus leads.
  </p>
);

export const DashboardWidgetRenderer = ({ type, conversas, stages, mensagensPorDia, editing, onRemove, label, filterValue, getStatusColor, getOrigemColor }: Props) => {
  const title = label || getTitle(type);

  // Handle count_by_status and count_by_origin
  if (type === "count_by_status" || type === "count_by_origin") {
    const count = type === "count_by_status"
      ? conversas.filter((c) => (c.status || "NOVO") === filterValue).length
      : conversas.filter((c) => c.origem === filterValue).length;
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm relative">
        {editing && onRemove && (
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-destructive hover:text-destructive" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
        </div>
        <p className="mt-2 text-3xl font-bold text-card-foreground">{count}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm relative">
      {editing && onRemove && (
        <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-destructive hover:text-destructive" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      )}
      <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>
      {renderContent(type, conversas, stages, mensagensPorDia, getStatusColor, getOrigemColor)}
    </div>
  );
};

function getTitle(type: DashboardWidgetType): string {
  const map: Record<string, string> = {
    leads_por_status: "Leads por Status",
    leads_por_origem: "Leads por Origem",
    leads_por_campanha: "Leads por Campanha",
    funil_vendas: "Funil de Vendas",
    sem_classificacao: "Sem Classificação",
    sem_status: "Sem Status Definido",
    conversas_por_dia: "Conversas por Dia",
    mensagens_por_dia: "Mensagens por Dia",
    count_by_status: "Contagem por Status",
    count_by_origin: "Contagem por Origem",
  };
  return map[type] || type;
}

function renderContent(type: DashboardWidgetType, conversas: ConversaRow[], stages: EstagioFunil[], mensagensPorDia: { day: string; count: number }[], getStatusColor?: (s: string) => string, getOrigemColor?: (o: string) => string) {
  switch (type) {
    case "leads_por_status":
      return <StatusChart conversas={conversas} stages={stages} getColor={getStatusColor} />;
    case "leads_por_origem":
      return <OrigemChart conversas={conversas} getColor={getOrigemColor} />;
    case "leads_por_campanha":
      return <CampaignChart conversas={conversas} />;
    case "funil_vendas":
      return <FunnelChart conversas={conversas} stages={stages} />;
    case "sem_classificacao":
      return <StatCard value={conversas.filter((c) => !c.origem).length} label="conversas sem origem definida" />;
    case "sem_status":
      return <StatCard value={conversas.filter((c) => (c.status || "NOVO") === "NOVO").length} label="conversas ainda como NOVO" />;
    case "conversas_por_dia":
      return <DailyLineChart data={buildDailyData(conversas)} />;
    case "mensagens_por_dia":
      return <DailyLineChart data={mensagensPorDia} />;
    default:
      return null;
  }
}

function StatCard({ value, label }: { value: number; label: string }) {
  if (value === 0) return <EmptyMessage />;
  return (
    <div className="text-center py-4">
      <p className="text-4xl font-bold text-card-foreground">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function StatusChart({ conversas, stages, getColor }: { conversas: ConversaRow[]; stages: EstagioFunil[]; getColor?: (s: string) => string }) {
  const data = stages.map((s) => ({
    name: s.nome,
    value: conversas.filter((c) => (c.status || "NOVO") === s.nome).length,
    color: getColor ? getColor(s.nome) : s.cor,
  }));
  if (data.every((d) => d.value === 0)) return <EmptyMessage />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" name="Leads" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function OrigemChart({ conversas, getColor }: { conversas: ConversaRow[]; getColor?: (o: string) => string }) {
  const map: Record<string, number> = {};
  conversas.forEach((c) => { const o = c.origem || "DESCONHECIDO"; map[o] = (map[o] || 0) + 1; });
  if (Object.keys(map).length === 0) return <EmptyMessage />;
  let colorIdx = 0;
  const ORIGEM_COLORS: Record<string, string> = { GOOGLE: "#4285F4", INSTAGRAM: "#E1306C", SITE: "#10B981", DESCONHECIDO: "#9CA3AF" };
  const data = Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({
    name, value,
    color: getColor ? getColor(name) : (ORIGEM_COLORS[name] || FALLBACK_COLORS[colorIdx++ % FALLBACK_COLORS.length]),
  }));
  return (
    <div className="space-y-3">
      {data.map((entry) => (
        <div key={entry.name} className="flex items-center gap-3">
          <OriginIcon origin={entry.name} size="sm" />
          <span className="text-sm font-medium text-foreground min-w-[80px]">{entry.name}</span>
          <div className="flex-1">
            <div className="flex h-6 items-center rounded-md px-2 text-xs font-bold text-white"
              style={{ width: `${Math.max((entry.value / Math.max(...data.map(d => d.value), 1)) * 100, 12)}%`, backgroundColor: entry.color, minWidth: 32 }}>
              {entry.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CampaignChart({ conversas }: { conversas: ConversaRow[] }) {
  const map: Record<string, number> = {};
  conversas.forEach((c) => { if (c.campanha) map[c.campanha] = (map[c.campanha] || 0) + 1; });
  const data = Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  if (data.length === 0) return <EmptyMessage />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 40 + 40, 120)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" name="Leads" fill="#6366F1" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function FunnelChart({ conversas, stages }: { conversas: ConversaRow[]; stages: EstagioFunil[] }) {
  const funnelData = stages.map((s) => ({
    nome: s.nome, cor: s.cor,
    count: conversas.filter((c) => (c.status || "NOVO") === s.nome).length,
  }));
  const maxCount = Math.max(...funnelData.map((d) => d.count), 1);
  if (funnelData.every((d) => d.count === 0)) return <EmptyMessage />;
  return (
    <div className="space-y-3">
      {funnelData.map((item) => {
        const widthPercent = Math.max((item.count / maxCount) * 100, 8);
        return (
          <div key={item.nome} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-right text-sm font-medium text-muted-foreground truncate">{item.nome}</span>
            <div className="flex-1">
              <div className="flex h-8 items-center rounded-md px-3 text-xs font-bold text-white transition-all"
                style={{ width: `${widthPercent}%`, backgroundColor: item.cor, minWidth: 40 }}>
                {item.count}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DailyLineChart({ data }: { data: { day: string; count: number }[] }) {
  if (data.every((d) => d.count === 0)) return <EmptyMessage />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="day" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="count" name="Total" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function buildDailyData(conversas: ConversaRow[]): { day: string; count: number }[] {
  const now = new Date();
  const days: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const count = conversas.filter((c) => {
      if (!c.criado_em) return false;
      const iso = c.criado_em.endsWith("Z") || c.criado_em.includes("+") ? c.criado_em : c.criado_em + "Z";
      return new Date(iso).toISOString().slice(0, 10) === key;
    }).length;
    days.push({ day: label, count });
  }
  return days;
}
