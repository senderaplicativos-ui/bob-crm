import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import Layout from "@/components/Layout";
import StatusBadge from "@/components/StatusBadge";
import OriginBadge from "@/components/OriginBadge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Search, RefreshCw, Trash2, X, Eye, EyeOff, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateBR, formatPhone } from "@/lib/formatters";
import { useOptionsFromDB } from "@/hooks/useOptionsFromDB";
import { useFunnelStages } from "@/hooks/useFunnelStages";
import { useRegraColors } from "@/hooks/useRegraColors";
import { useGroupConfig } from "@/hooks/useGroupConfig";
import { useToast } from "@/hooks/use-toast";
import { PeriodFilter, PeriodKey, getDateRange } from "@/components/dashboard/PeriodFilter";

interface Conversa {
  id: string;
  nome: string | null;
  telefone: string;
  origem: string | null;
  status: string | null;
  campanha: string | null;
  ultima_mensagem: string | null;
  atualizado_em: string | null;
  criado_em: string | null;
  is_grupo: boolean | null;
  ad_source_url: string | null;
  ad_headline: string | null;
  ad_body: string | null;
  ctwa_clid: string | null;
}

const Conversations = () => {
  const { selected } = useInstance();
  const navigate = useNavigate();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [showGroups, setShowGroups] = useState(false);
  const [originFilter, setOriginFilter] = useState("Todos");
  const [campaignFilter, setCampaignFilter] = useState("Todos");
  const [period, setPeriod] = useState<PeriodKey>("hoje");
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hidePhones, setHidePhones] = useState<boolean>(() => localStorage.getItem("hidePhones") === "1");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  type SortKey = "origem" | "campanha" | "status" | "criado_em" | null;
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (key: Exclude<SortKey, null>) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortDir("desc"); return; }
    setSortKey(null);
  };
  const SortIcon = ({ col }: { col: Exclude<SortKey, null> }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };
  const { statuses, origins } = useOptionsFromDB();
  const { stages } = useFunnelStages();
  const { getStatusColor, getOrigemColor, refreshColors } = useRegraColors();
  const { aplicarRegrasGrupo } = useGroupConfig();
  const { toast } = useToast();

  const changeStatus = async (conversa: Conversa, newStatus: string) => {
    const { error } = await supabase
      .from("conversas")
      .update({ status: newStatus })
      .eq("id", conversa.id);
    if (error) {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
      return;
    }
    setConversas((prev) =>
      prev.map((c) => (c.id === conversa.id ? { ...c, status: newStatus } : c))
    );
    // A integração com o Meta (envio de evento por mudança de estágio) será
    // refeita dentro do próprio bob-crm. O backend antigo foi removido.
  };

  const fetchData = async () => {
    if (!selected) { navigate("/"); return; }
    setLoading(true);
    // Refresh regra colors too
    refreshColors();
    const { start, end } = getDateRange(period, customStart, customEnd);
    let query = supabase
      .from("conversas")
      .select("*")
      .eq("instancia_id", selected.id)
      .order("atualizado_em", { ascending: false });

    if (start) query = query.gte("atualizado_em", start.toISOString());
    if (end) query = query.lte("atualizado_em", end.toISOString());

    const { data, error } = await query;

    if (!error && data) setConversas(data as Conversa[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selected, period, customStart, customEnd]);

  // Auto-atualiza a lista a cada 15s enquanto a tela está aberta, para que as
  // conversas novas (que chegam pelo webhook) apareçam sem precisar clicar em
  // Atualizar nem dar F5. Busca em silêncio (sem mostrar "Carregando...").
  useEffect(() => {
    if (!selected) return;
    const interval = setInterval(() => {
      const { start, end } = getDateRange(period, customStart, customEnd);
      let query = supabase
        .from("conversas")
        .select("*")
        .eq("instancia_id", selected.id)
        .order("atualizado_em", { ascending: false });
      if (start) query = query.gte("atualizado_em", start.toISOString());
      if (end) query = query.lte("atualizado_em", end.toISOString());
      query.then(({ data, error }) => {
        if (!error && data) setConversas(data as Conversa[]);
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [selected, period, customStart, customEnd]);

  const isGroup = (c: Conversa) => {
    if (c.is_grupo) return true;
    const digits = c.telefone.replace(/\D/g, "");
    return digits.length > 15;
  };

  const getDisplayStatus = (c: Conversa) => {
    if (isGroup(c) && !aplicarRegrasGrupo) return "GRUPO";
    return c.status || "NOVO";
  };

  const getDisplayOrigem = (c: Conversa) => {
    if (isGroup(c) && !aplicarRegrasGrupo) return null;
    return c.origem;
  };

  const campaigns = [...new Set(conversas.map((c) => c.campanha).filter(Boolean))] as string[];

  const filtered = conversas.filter((c) => {
    if (!showGroups && isGroup(c)) return false;
    const matchesSearch = !search || c.nome?.toLowerCase().includes(search.toLowerCase()) || c.telefone?.includes(search);
    const displayStatus = getDisplayStatus(c);
    const matchesStatus = statusFilter === "Todos" || displayStatus === statusFilter;
    const matchesOrigin = originFilter === "Todos" || c.origem === originFilter;
    const matchesCampaign = campaignFilter === "Todos" || c.campanha === campaignFilter;
    return matchesSearch && matchesStatus && matchesOrigin && matchesCampaign;
  });

  const sorted = (() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    const getVal = (c: Conversa): string | number => {
      if (sortKey === "origem") return (getDisplayOrigem(c) || "").toLowerCase();
      if (sortKey === "campanha") return (c.campanha || "").toLowerCase();
      if (sortKey === "status") return (getDisplayStatus(c) || "").toLowerCase();
      if (sortKey === "criado_em") return c.criado_em ? new Date(c.criado_em).getTime() : 0;
      return "";
    };
    return [...filtered].sort((a, b) => {
      const va = getVal(a); const vb = getVal(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  })();

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const ids = Array.from(selectedIds);
    const phones = conversas.filter((c) => ids.includes(c.id)).map((c) => c.telefone);

    // Delete in order for FK constraints
    await supabase.from("log_eventos_meta").delete().in("conversa_id", ids);
    if (selected) {
      await supabase.from("mensagens").delete().in("telefone", phones).eq("instancia_id", selected.id);
    }
    const { error } = await supabase.from("conversas").delete().in("id", ids);

    setDeleting(false);
    setShowDeleteDialog(false);

    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${ids.length} contato(s) excluído(s)` });
      setSelectedIds(new Set());
      setConversas((prev) => prev.filter((c) => !ids.includes(c.id)));
    }
  };

  const GRUPO_COLOR = "#9CA3AF";

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conversas</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} conversas encontradas</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchData(); }} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <PeriodFilter
        value={period}
        onChange={setPeriod}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        options={[
          { key: "hoje", label: "Hoje" },
          { key: "hoje_ontem", label: "Hoje e Ontem" },
          { key: "7d", label: "7 dias" },
          { key: "15d", label: "15 dias" },
          { key: "30d", label: "30 dias" },
          { key: "este_mes", label: "Este mês" },
          { key: "max", label: "Máximo" },
          { key: "custom", label: "Personalizado" },
        ]}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos os status</SelectItem>
            {statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={originFilter} onValueChange={setOriginFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todas as origens</SelectItem>
            {origins.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Campanha" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todas as campanhas</SelectItem>
            {campaigns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Switch checked={showGroups} onCheckedChange={setShowGroups} id="show-groups" />
          <label htmlFor="show-groups" className="text-sm text-muted-foreground cursor-pointer select-none">Mostrar grupos</label>
        </div>
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-secondary/50 px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">{selectedIds.size} selecionado(s)</span>
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            <X className="mr-1 h-3.5 w-3.5" /> Cancelar
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={allFilteredSelected && filtered.length > 0} onCheckedChange={toggleAll} />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    Nome
                    <button
                      type="button"
                      onClick={() => {
                        const v = !hidePhones;
                        setHidePhones(v);
                        localStorage.setItem("hidePhones", v ? "1" : "0");
                      }}
                      className="inline-flex items-center justify-center rounded p-1 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title={hidePhones ? "Mostrar dados" : "Ocultar dados"}
                    >
                      {hidePhones ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    Telefone
                    <button
                      type="button"
                      onClick={() => {
                        const v = !hidePhones;
                        setHidePhones(v);
                        localStorage.setItem("hidePhones", v ? "1" : "0");
                      }}
                      className="inline-flex items-center justify-center rounded p-1 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title={hidePhones ? "Mostrar telefones" : "Ocultar telefones"}
                    >
                      {hidePhones ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <button type="button" onClick={() => toggleSort("origem")} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                    Origem <SortIcon col="origem" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <button type="button" onClick={() => toggleSort("campanha")} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                    Campanha <SortIcon col="campanha" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <button type="button" onClick={() => toggleSort("status")} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                    Status <SortIcon col="status" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <button type="button" onClick={() => toggleSort("criado_em")} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                    Primeira Mensagem <SortIcon col="criado_em" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Última Atualização</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Última Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Nenhuma conversa encontrada</td></tr>
              ) : (
                sorted.map((c) => {
                  const displayStatus = getDisplayStatus(c);
                  const displayOrigem = getDisplayOrigem(c);
                  const isGrupo = isGroup(c);
                  const statusColor = displayStatus === "GRUPO" ? GRUPO_COLOR : getStatusColor(displayStatus, stages);

                  return (
                    <tr key={c.id} onClick={() => navigate(`/conversations/${c.id}`)} className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary/30">
                      <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        <span className="flex items-center gap-2">
                          {hidePhones && c.nome ? c.nome.split(" ").map(p => p ? p[0] + "•••" : p).join(" ") : (c.nome || "—")}
                          {isGrupo && (
                            <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Grupo</span>
                          )}
                          {c.ad_source_url && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center justify-center rounded-full p-0.5 text-blue-500 hover:bg-blue-500/10 transition-colors"
                                  title="Veio de anúncio"
                                >
                                  <Megaphone className="h-3.5 w-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 p-3 text-sm" align="start" onClick={(e) => e.stopPropagation()}>
                                <p className="font-semibold text-foreground mb-2">Dados do Anúncio</p>
                                {c.ad_headline && (
                                  <p className="mb-1"><span className="text-muted-foreground">Anúncio:</span> {c.ad_headline}</p>
                                )}
                                {c.ad_body && (
                                  <p className="mb-1"><span className="text-muted-foreground">Texto:</span> {c.ad_body}</p>
                                )}
                                <a
                                  href={c.ad_source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline mb-1 inline-block"
                                >
                                  Ver anúncio ↗
                                </a>
                                {c.ctwa_clid && (
                                  <p className="text-[11px] text-muted-foreground mt-1 break-all">ID: {c.ctwa_clid}</p>
                                )}
                              </PopoverContent>
                            </Popover>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{hidePhones ? formatPhone(c.telefone).replace(/\d(?=\d{2})/g, "•") : formatPhone(c.telefone)}</td>
                      <td className="px-4 py-3">
                        <OriginBadge origin={displayOrigem} size="sm" color={displayOrigem ? getOrigemColor(displayOrigem) : undefined} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.campanha || "—"}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {isGrupo && !aplicarRegrasGrupo ? (
                          <StatusBadge status="GRUPO" color={GRUPO_COLOR} />
                        ) : (
                          <Popover>
                            <PopoverTrigger>
                              <StatusBadge
                                status={displayStatus}
                                color={statusColor}
                                className="cursor-pointer hover:ring-2 hover:ring-primary/30 transition-shadow"
                              />
                            </PopoverTrigger>
                            <PopoverContent className="w-44 p-1" align="start">
                              {stages.map((stage) => (
                                <button
                                  key={stage.nome}
                                  onClick={() => changeStatus(c, stage.nome)}
                                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-secondary ${c.status === stage.nome ? "bg-secondary font-medium" : ""}`}
                                >
                                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.cor }} />
                                  {stage.nome}
                                </button>
                              ))}
                            </PopoverContent>
                          </Popover>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDateBR(c.criado_em)}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDateBR(c.atualizado_em)}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">{c.ultima_mensagem || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contatos</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedIds.size} contato(s)? Todas as mensagens e dados associados serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Excluindo..." : "Excluir permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Conversations;
