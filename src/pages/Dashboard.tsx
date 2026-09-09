import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import Layout from "@/components/Layout";
import { MessageSquare, Pencil, Plus, Check } from "lucide-react";
import { useFunnelStages } from "@/hooks/useFunnelStages";
import { useDashboardConfig, WIDGET_OPTIONS, DashboardWidgetType } from "@/hooks/useDashboardConfig";
import { DashboardWidgetRenderer } from "@/components/dashboard/DashboardWidgetRenderer";
import { PeriodFilter, PeriodKey, getDateRange } from "@/components/dashboard/PeriodFilter";
import { useRegraColors } from "@/hooks/useRegraColors";
import { useGroupConfig } from "@/hooks/useGroupConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getBadgeStyle, getReadableTextColor } from "@/lib/colorContrast";

interface ConversaRow {
  status: string | null;
  origem: string | null;
  campanha: string | null;
  criado_em: string | null;
  is_grupo: boolean | null;
  telefone: string;
}

const Dashboard = () => {
  const { selected } = useInstance();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const { stages } = useFunnelStages();
  const [allConversas, setAllConversas] = useState<ConversaRow[]>([]);
  const [allMensagens, setAllMensagens] = useState<{ criado_em: string | null }[]>([]);
  const { widgets, loading: configLoading, saveConfig, addWidget, removeWidget, setWidgets } = useDashboardConfig();
  const { getStatusColor, getOrigemColor, refreshColors } = useRegraColors();
  const { aplicarRegrasGrupo } = useGroupConfig();
  const [editing, setEditing] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<DashboardWidgetType | "">("");
  const [editSnapshot, setEditSnapshot] = useState(widgets);
  const [customLabel, setCustomLabel] = useState("");
  const [filterValue, setFilterValue] = useState("");

  // Period filter state
  const [period, setPeriod] = useState<PeriodKey>("max");
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();

  // Available statuses and origins for count_by_* dropdowns
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [availableOrigins, setAvailableOrigins] = useState<string[]>([]);

  useEffect(() => {
    if (!selected) { navigate("/"); return; }
    const fetchData = async () => {
      setLoading(true);
      const [conversasRes, mensagensRes] = await Promise.all([
        supabase.from("conversas").select("status, origem, campanha, criado_em, is_grupo, telefone").eq("instancia_id", selected.id),
        supabase.from("mensagens").select("criado_em").eq("instancia_id", selected.id),
      ]);
      refreshColors();
      if (conversasRes.data) {
        setAllConversas(conversasRes.data);
        // Extract unique statuses and origins
        const sts = new Set<string>();
        const ors = new Set<string>();
        conversasRes.data.forEach((c: ConversaRow) => {
          sts.add(c.status || "NOVO");
          if (c.origem) ors.add(c.origem);
        });
        // Also add funnel stages
        stages.forEach((s) => sts.add(s.nome));
        setAvailableStatuses([...sts]);
        setAvailableOrigins([...ors]);
      }
      if (mensagensRes.data) setAllMensagens(mensagensRes.data);
      setLoading(false);
    };
    fetchData();
  }, [selected, stages]);

  // Filter conversas & mensagens by period
  const filterByDate = <T extends { criado_em: string | null }>(items: T[]): T[] => {
    const { start, end } = getDateRange(period, customStart, customEnd);
    if (!start && !end) return items;
    return items.filter((item) => {
      if (!item.criado_em) return false;
      const iso = item.criado_em.endsWith("Z") || item.criado_em.includes("+") ? item.criado_em : item.criado_em + "Z";
      const d = new Date(iso);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  };

  const isGroup = (c: ConversaRow) => {
    if (c.is_grupo) return true;
    const digits = c.telefone.replace(/\D/g, "");
    return digits.length > 15;
  };

  const conversasAll = filterByDate(allConversas);
  // Exclude groups from dashboard metrics when rules are disabled for groups
  const conversas = aplicarRegrasGrupo ? conversasAll : conversasAll.filter((c) => !isGroup(c));
  const mensagensFiltered = filterByDate(allMensagens);

  // Build mensagens por dia from filtered data
  const mensagensPorDia = (() => {
    const now = new Date();
    const days: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      const count = mensagensFiltered.filter((m) => {
        if (!m.criado_em) return false;
        const iso = m.criado_em.endsWith("Z") || m.criado_em.includes("+") ? m.criado_em : m.criado_em + "Z";
        return new Date(iso).toISOString().slice(0, 10) === key;
      }).length;
      days.push({ day: label, count });
    }
    return days;
  })();

  const startEditing = () => { setEditSnapshot([...widgets]); setEditing(true); };
  const cancelEditing = () => { setWidgets(editSnapshot); setEditing(false); };
  const finishEditing = async () => { await saveConfig(widgets); setEditing(false); };

  const handleAddWidget = () => {
    if (!selectedType) return;
    const needsFilter = selectedType === "count_by_status" || selectedType === "count_by_origin";
    if (needsFilter && !filterValue) return;
    const label = customLabel.trim() || (needsFilter ? filterValue : undefined);
    addWidget(selectedType as DashboardWidgetType, label || undefined, needsFilter ? filterValue : undefined);
    setSelectedType("");
    setCustomLabel("");
    setFilterValue("");
    setAddDialogOpen(false);
  };

  const needsFilterValue = selectedType === "count_by_status" || selectedType === "count_by_origin";

  // Separate metric cards from chart widgets
  const metricWidgets = widgets.filter((w) => w.type === "count_by_status" || w.type === "count_by_origin" || w.type === "sem_classificacao" || w.type === "sem_status");
  const chartWidgets = widgets.filter((w) => w.type !== "count_by_status" && w.type !== "count_by_origin" && w.type !== "sem_classificacao" && w.type !== "sem_status");

  const getStatusColorBound = (status: string) => getStatusColor(status, stages);

  // Top 5 statuses by activity in the selected period
  const topStatusPeriodo = (() => {
    const map: Record<string, number> = {};
    conversas.forEach((c) => {
      const s = c.status || "NOVO";
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nome, count]) => ({ nome, count, cor: getStatusColorBound(nome) }));
  })();

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral das conversas</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="outline" onClick={cancelEditing}>Cancelar</Button>
              <Button size="sm" onClick={() => setAddDialogOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
              <Button size="sm" onClick={finishEditing}>
                <Check className="mr-1 h-4 w-4" /> Salvar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={startEditing}>
              <Pencil className="mr-1 h-4 w-4" /> Editar Dashboard
            </Button>
          )}
        </div>
      </div>

      {/* Period filter */}
      <PeriodFilter
        value={period}
        onChange={setPeriod}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
      />

      {/* Fixed card + metric cards grid */}
      <div className="mb-4 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {/* Fixed: Total de Conversas */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Total de Conversas</span>
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-2 text-3xl font-bold text-card-foreground">
            {loading ? "—" : conversas.length}
          </p>
        </div>

        {/* Dynamic metric cards */}
        {!loading && !configLoading && metricWidgets.map((w) => (
          <DashboardWidgetRenderer
            key={w.id}
            type={w.type}
            conversas={conversas}
            stages={stages}
            mensagensPorDia={mensagensPorDia}
            editing={editing}
            onRemove={() => removeWidget(w.id)}
            label={w.label}
            filterValue={w.filterValue}
            getStatusColor={getStatusColorBound}
            getOrigemColor={getOrigemColor}
          />
        ))}
      </div>

      {/* Chart widgets */}
      {!loading && !configLoading && (
        <div className="grid gap-6 lg:grid-cols-2">
          {chartWidgets.map((w) => (
            <DashboardWidgetRenderer
              key={w.id}
              type={w.type}
              conversas={conversas}
              stages={stages}
              mensagensPorDia={mensagensPorDia}
              editing={editing}
              onRemove={() => removeWidget(w.id)}
              label={w.label}
              filterValue={w.filterValue}
              getStatusColor={getStatusColorBound}
              getOrigemColor={getOrigemColor}
            />
          ))}

          {/* Top 5 status do período (fixo) */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold text-foreground">Status do período</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Top {Math.min(topStatusPeriodo.length, 5)} status com mais atividade
            </p>
            {topStatusPeriodo.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sem atividade no período selecionado.
              </p>
            ) : (
              <div className="space-y-3">
                {topStatusPeriodo.map((item) => {
                  const max = topStatusPeriodo[0].count || 1;
                  const widthPercent = Math.max((item.count / max) * 100, 8);
                  return (
                    <div key={item.nome} className="flex items-center gap-3">
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 min-w-[100px] justify-center"
                        style={getBadgeStyle(item.cor)}
                      >
                        {item.nome}
                      </span>
                      <div className="flex-1">
                        <div
                          className="flex h-7 items-center rounded-md px-3 text-xs font-bold transition-all"
                          style={{
                            width: `${widthPercent}%`,
                            backgroundColor: item.cor,
                            color: getReadableTextColor(item.cor),
                            minWidth: 40,
                          }}
                        >
                          {item.count}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {loading && (
        <p className="py-8 text-center text-muted-foreground">Carregando...</p>
      )}

      {/* Add widget dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Visualização</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <Select value={selectedType} onValueChange={(v) => { setSelectedType(v as DashboardWidgetType); setFilterValue(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  {WIDGET_OPTIONS.map((opt) => (
                    <SelectItem key={opt.type} value={opt.type}>
                      <div>
                        <span className="font-medium">{opt.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsFilterValue && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {selectedType === "count_by_status" ? "Status" : "Origem"}
                </label>
                <Select value={filterValue} onValueChange={setFilterValue}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(selectedType === "count_by_status" ? availableStatuses : availableOrigins).map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Título personalizado (opcional)</label>
              <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Ex: Leads Quentes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddWidget} disabled={!selectedType || (needsFilterValue && !filterValue)}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Dashboard;
