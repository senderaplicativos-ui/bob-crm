import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useFunnelStages } from "@/hooks/useFunnelStages";
import { formatDateBR, formatPhone } from "@/lib/formatters";
import { Save, Plus, Trash2, RefreshCw, Eye, EyeOff } from "lucide-react";
import { PeriodFilter, PeriodKey, getDateRange } from "@/components/dashboard/PeriodFilter";

const META_EVENTS = [
  "Lead",
  "CompleteRegistration",
  "Schedule",
  "Contact",
  "Purchase",
  "Subscribe",
  "ViewContent",
  "InitiateCheckout",
  "AddToCart",
  "CustomEvent",
];

/* ======== Main Page ======== */

const MetaPixel = () => {
  const { selected } = useInstance();
  const navigate = useNavigate();

  useEffect(() => {
    if (!selected) navigate("/");
  }, [selected, navigate]);

  if (!selected) return null;

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Meta Pixel</h1>
        <p className="text-sm text-muted-foreground">Configuração do Pixel, mapeamento de eventos e histórico de disparos</p>
      </div>
      <div className="space-y-6">
        <ConfigSection instanceId={selected.id} />
        <MappingSection instanceId={selected.id} />
        <LogsSection instanceId={selected.id} />
      </div>
    </Layout>
  );
};

/* ======== Section 1: Config ======== */

const ConfigSection = ({ instanceId }: { instanceId: string }) => {
  const { toast } = useToast();
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [testEventCode, setTestEventCode] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    const { data } = await supabase
      .from("meta_config")
      .select("*")
      .eq("instancia_id", instanceId)
      .maybeSingle();
    if (data) {
      setPixelId(data.pixel_id);
      setAccessToken(data.access_token);
      setAtivo(data.ativo ?? true);
      setTestEventCode((data as any).test_event_code ?? "");
      setExistingId(data.id);
    } else {
      setPixelId("");
      setAccessToken("");
      setAtivo(true);
      setTestEventCode("");
      setExistingId(null);
    }
  }, [instanceId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    if (!pixelId.trim() || !accessToken.trim()) {
      toast({ title: "Preencha Pixel ID e Access Token", variant: "destructive" });
      return;
    }
    setSaving(true);
    if (existingId) {
      await supabase
        .from("meta_config")
        .update({ pixel_id: pixelId, access_token: accessToken, ativo, test_event_code: testEventCode.trim() || null, atualizado_em: new Date().toISOString() } as any)
        .eq("id", existingId);
    } else {
      await supabase
        .from("meta_config")
        .insert({ instancia_id: instanceId, pixel_id: pixelId, access_token: accessToken, ativo, test_event_code: testEventCode.trim() || null } as any);
    }
    toast({ title: "Configuração salva com sucesso" });
    setSaving(false);
    fetchConfig();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuração Meta</CardTitle>
        <CardDescription>Pixel ID e Access Token da sua conta Meta</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Pixel ID</label>
          <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="Ex: 123456789012345" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Access Token</label>
          <div className="relative">
            <Input
              type={showToken ? "text" : "password"}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Cole o token aqui"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={ativo} onCheckedChange={setAtivo} />
          <label className="text-sm text-muted-foreground">Ativo</label>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Código de Teste (Events Manager)</label>
          <Input value={testEventCode} onChange={(e) => setTestEventCode(e.target.value)} placeholder="Ex: TEST11452" />
          <p className="text-xs text-muted-foreground">Opcional. Copie da aba "Eventos de teste" no Meta Events Manager. Remova após validar.</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" /> Salvar
        </Button>
      </CardContent>
    </Card>
  );
};

/* ======== Section 2: Mapping ======== */

interface Mapeamento {
  id: string;
  estagio_nome: string;
  evento_meta: string;
  ativo: boolean | null;
}

const MappingSection = ({ instanceId }: { instanceId: string }) => {
  const { toast } = useToast();
  const { stages } = useFunnelStages();
  const [mappings, setMappings] = useState<Mapeamento[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Mapeamento | null>(null);
  const [ruleOnlyStatuses, setRuleOnlyStatuses] = useState<string[]>([]);

  // New row state
  const [newStage, setNewStage] = useState("");
  const [newEvent, setNewEvent] = useState("");
  const [newCustomEvent, setNewCustomEvent] = useState("");

  const fetchMappings = useCallback(async () => {
    const { data } = await supabase
      .from("mapeamento_eventos")
      .select("id, estagio_nome, evento_meta, ativo")
      .eq("instancia_id", instanceId);
    if (data) setMappings(data);
  }, [instanceId]);

  useEffect(() => { fetchMappings(); }, [fetchMappings]);

  // Fetch rule-only statuses
  useEffect(() => {
    const fetchRuleStatuses = async () => {
      const { data } = await supabase
        .from("regras")
        .select("resultado")
        .eq("tipo_regra", "STATUS")
        .or(`instancia_id.eq.${instanceId},instancia_id.is.null`)
        .eq("ativo", true);
      if (data) {
        const stageNames = new Set(stages.map((s) => s.nome));
        const unique = [...new Set(data.map((r) => r.resultado))].filter((r) => !stageNames.has(r));
        setRuleOnlyStatuses(unique);
      }
    };
    fetchRuleStatuses();
  }, [instanceId, stages]);

  const handleAdd = async () => {
    if (!newStage || !newEvent) {
      toast({ title: "Selecione estágio e evento", variant: "destructive" });
      return;
    }
    const evento = newEvent === "CustomEvent" ? newCustomEvent.trim() : newEvent;
    if (!evento) {
      toast({ title: "Informe o nome do evento customizado", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("mapeamento_eventos")
      .insert({ instancia_id: instanceId, estagio_nome: newStage, evento_meta: evento });
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Este estágio já está mapeado", variant: "destructive" });
      } else {
        toast({ title: "Erro ao adicionar", variant: "destructive" });
      }
      return;
    }
    toast({ title: "Mapeamento adicionado" });
    setNewStage("");
    setNewEvent("");
    setNewCustomEvent("");
    fetchMappings();
  };

  const toggleAtivo = async (m: Mapeamento) => {
    await supabase.from("mapeamento_eventos").update({ ativo: !m.ativo }).eq("id", m.id);
    fetchMappings();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("mapeamento_eventos").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    toast({ title: "Mapeamento removido" });
    fetchMappings();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Mapeamento de Eventos</CardTitle>
              <CardDescription>Defina qual estágio do funil dispara qual evento no Meta Pixel</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add row */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Estágio do Funil</label>
              <Select value={newStage} onValueChange={setNewStage}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>
                  ))}
                  {ruleOnlyStatuses.map((s) => (
                    <SelectItem key={`rule-${s}`} value={s}>
                      {s} <span className="text-muted-foreground text-xs">(sem coluna no funil)</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Evento Meta</label>
              <Select value={newEvent} onValueChange={setNewEvent}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {META_EVENTS.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newEvent === "CustomEvent" && (
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nome do Evento</label>
                <Input value={newCustomEvent} onChange={(e) => setNewCustomEvent(e.target.value)} placeholder="Nome customizado" />
              </div>
            )}
            <Button onClick={handleAdd} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </div>

          {/* Table */}
          {mappings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum mapeamento configurado</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Estágio</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Evento Meta</th>
                    <th className="px-4 py-2 text-center font-medium text-muted-foreground">Ativo</th>
                    <th className="px-4 py-2 text-center font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-foreground">{m.estagio_nome}</td>
                      <td className="px-4 py-2 text-foreground">{m.evento_meta}</td>
                      <td className="px-4 py-2 text-center">
                        <Switch checked={m.ativo ?? true} onCheckedChange={() => toggleAtivo(m)} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(m)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover mapeamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O mapeamento do estágio "{deleteTarget?.estagio_nome}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

/* ======== Section 3: Logs ======== */

interface LogEvento {
  id: string;
  evento_meta: string;
  estagio_origem: string | null;
  telefone: string | null;
  status_resposta: number | null;
  resposta: string | null;
  criado_em: string | null;
}

const StatusResponseBadge = ({ status }: { status: number | null }) => {
  if (status === 200) return <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Sucesso</span>;
  if (status === 0) return <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">Erro</span>;
  return <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-muted-foreground">{status ?? "—"}</span>;
};

const LogsSection = ({ instanceId }: { instanceId: string }) => {
  const [logs, setLogs] = useState<LogEvento[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterEvento, setFilterEvento] = useState("__all__");
  const [filterEstagio, setFilterEstagio] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();

  // Distinct values for dropdowns
  const [distinctEventos, setDistinctEventos] = useState<string[]>([]);
  const [distinctEstagios, setDistinctEstagios] = useState<string[]>([]);

  const fetchDistincts = useCallback(async () => {
    const [evtRes, estRes] = await Promise.all([
      supabase.from("log_eventos_meta").select("evento_meta").eq("instancia_id", instanceId),
      supabase.from("log_eventos_meta").select("estagio_origem").eq("instancia_id", instanceId),
    ]);
    if (evtRes.data) setDistinctEventos([...new Set(evtRes.data.map((r) => r.evento_meta))].sort());
    if (estRes.data) setDistinctEstagios([...new Set(estRes.data.map((r) => r.estagio_origem).filter(Boolean) as string[])].sort());
  }, [instanceId]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("log_eventos_meta")
      .select("id, evento_meta, estagio_origem, telefone, status_resposta, resposta, criado_em")
      .eq("instancia_id", instanceId);

    if (filterEvento !== "__all__") query = query.eq("evento_meta", filterEvento);
    if (filterEstagio !== "__all__") query = query.eq("estagio_origem", filterEstagio);
    if (filterStatus === "sucesso") query = query.eq("status_resposta", 200);
    if (filterStatus === "erro") query = query.neq("status_resposta", 200);

    const { start, end } = getDateRange(period, customStart, customEnd);
    if (start) query = query.gte("criado_em", start.toISOString());
    if (end) query = query.lte("criado_em", end.toISOString());

    const { data } = await query.order("criado_em", { ascending: false }).limit(200);
    if (data) setLogs(data);
    setLoading(false);
  }, [instanceId, filterEvento, filterEstagio, filterStatus, period, customStart, customEnd]);

  useEffect(() => { fetchDistincts(); }, [fetchDistincts]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const periodOptions = [
    { key: "hoje" as PeriodKey, label: "Hoje" },
    { key: "hoje_ontem" as PeriodKey, label: "Hoje e Ontem" },
    { key: "7d" as PeriodKey, label: "7 dias" },
    { key: "15d" as PeriodKey, label: "15 dias" },
    { key: "30d" as PeriodKey, label: "30 dias" },
    { key: "max" as PeriodKey, label: "Máximo" },
    { key: "custom" as PeriodKey, label: "Personalizado" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Histórico de Disparos</CardTitle>
            <CardDescription>Últimos eventos enviados para a Meta</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dropdown filters row */}
        <div className="flex flex-wrap gap-2">
          <Select value={filterEvento} onValueChange={setFilterEvento}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Evento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os eventos</SelectItem>
              {distinctEventos.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterEstagio} onValueChange={setFilterEstagio}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Estágio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os estágios</SelectItem>
              {distinctEstagios.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="sucesso">Sucesso</SelectItem>
              <SelectItem value="erro">Erro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Period filter */}
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
          options={periodOptions}
        />

        {/* Counter */}
        <p className="text-xs text-muted-foreground">{logs.length} disparo(s) encontrado(s)</p>

        {/* Table */}
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento encontrado com os filtros selecionados</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Data/Hora</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Evento</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Estágio</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Telefone</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Resposta</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{formatDateBR(l.criado_em)}</td>
                      <td className="px-4 py-2 text-foreground font-medium">{l.evento_meta}</td>
                      <td className="px-4 py-2 text-muted-foreground">{l.estagio_origem || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{l.telefone ? formatPhone(l.telefone) : "—"}</td>
                      <td className="px-4 py-2"><StatusResponseBadge status={l.status_resposta} /></td>
                      <td className="px-4 py-2 text-muted-foreground max-w-[200px]">
                        {l.resposta ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate block cursor-help">{l.resposta.slice(0, 100)}{l.resposta.length > 100 ? "…" : ""}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm whitespace-pre-wrap text-xs">{l.resposta}</TooltipContent>
                          </Tooltip>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MetaPixel;
