import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useFunnelStages } from "@/hooks/useFunnelStages";
import { formatDateBR, formatPhone } from "@/lib/formatters";
import { Save, Plus, Trash2, RefreshCw, Eye, EyeOff, Send, CheckCircle2, XCircle, Percent } from "lucide-react";
import { PeriodFilter, PeriodKey, getDateRange } from "@/components/dashboard/PeriodFilter";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Tooltip as RechartsTooltip,
} from "recharts";

// Esta integração envia action_source=system_generated: o evento é gerado pelo
// CRM quando o lead avança de estágio no funil. Nesse modo a Meta aceita os
// nomes de evento padrão (não há a lista restrita do business_messaging).
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
      setTestEventCode((data as unknown as { test_event_code?: string | null }).test_event_code ?? "");
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
        .update({ pixel_id: pixelId, access_token: accessToken, ativo, test_event_code: testEventCode.trim() || null, atualizado_em: new Date().toISOString() } as Record<string, unknown>)
        .eq("id", existingId);
    } else {
      await supabase
        .from("meta_config")
        .insert({ instancia_id: instanceId, pixel_id: pixelId, access_token: accessToken, ativo, test_event_code: testEventCode.trim() || null } as Record<string, unknown>);
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
    const { error } = await supabase
      .from("mapeamento_eventos")
      .insert({ instancia_id: instanceId, estagio_nome: newStage, evento_meta: newEvent });
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
            <Button onClick={handleAdd} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Escolha o evento Meta que cada estágio do funil deve disparar. Os eventos são enviados como <strong>system_generated</strong> (gerados pelo CRM na mudança de estágio), então aceitam os nomes padrão da Meta.
          </p>

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

/* ======== Section 3a: Resumo dos disparos ======== */

const StatCard = ({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "sucesso" | "erro";
}) => (
  <div className="rounded-lg border border-border bg-card p-4">
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </div>
    <p
      className={`mt-2 text-2xl font-bold ${
        tone === "sucesso" ? "text-primary" : tone === "erro" ? "text-destructive" : "text-foreground"
      }`}
    >
      {value}
    </p>
    {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

// Agrega os disparos já carregados (respeita os mesmos filtros da tabela).
const ResumoDisparos = ({ logs }: { logs: LogEvento[] }) => {
  const { total, sucesso, erro, taxa, porEvento, errosPorTipo } = useMemo(() => {
    const total = logs.length;
    const sucesso = logs.filter((l) => l.status_resposta === 200).length;
    const erro = total - sucesso;
    const taxa = total === 0 ? 0 : Math.round((sucesso / total) * 100);

    const mapa = new Map<string, { evento: string; Sucesso: number; Erro: number }>();
    for (const l of logs) {
      const chave = l.evento_meta || "—";
      const linha = mapa.get(chave) ?? { evento: chave, Sucesso: 0, Erro: 0 };
      if (l.status_resposta === 200) linha.Sucesso += 1;
      else linha.Erro += 1;
      mapa.set(chave, linha);
    }
    const porEvento = [...mapa.values()].sort(
      (a, b) => b.Sucesso + b.Erro - (a.Sucesso + a.Erro)
    );

    // Agrupa as falhas pelo código de status, para ver de relance o que domina.
    const statusMap = new Map<string, number>();
    for (const l of logs) {
      if (l.status_resposta === 200) continue;
      const chave = l.status_resposta === 0 || l.status_resposta === null ? "Falha de rede" : `HTTP ${l.status_resposta}`;
      statusMap.set(chave, (statusMap.get(chave) ?? 0) + 1);
    }
    const errosPorTipo = [...statusMap.entries()].sort((a, b) => b[1] - a[1]);

    return { total, sucesso, erro, taxa, porEvento, errosPorTipo };
  }, [logs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumo dos Disparos</CardTitle>
        <CardDescription>Resultado dos eventos no período e filtros selecionados abaixo</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={<Send className="h-4 w-4" />} label="Disparos" value={total} />
          <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Sucesso" value={sucesso} tone="sucesso" />
          <StatCard icon={<XCircle className="h-4 w-4" />} label="Com erro" value={erro} tone="erro" />
          <StatCard
            icon={<Percent className="h-4 w-4" />}
            label="Taxa de sucesso"
            value={`${taxa}%`}
            hint={total === 0 ? "sem dados" : `${sucesso} de ${total}`}
          />
        </div>

        {total === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhum disparo no período selecionado.
          </p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Por evento</p>
              <ResponsiveContainer width="100%" height={Math.max(porEvento.length * 44 + 40, 140)}>
                <BarChart data={porEvento} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    type="category"
                    dataKey="evento"
                    width={130}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Sucesso" stackId="s" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Erro" stackId="s" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {errosPorTipo.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Falhas por tipo</p>
                <div className="flex flex-wrap gap-2">
                  {errosPorTipo.map(([tipo, qtd]) => (
                    <span
                      key={tipo}
                      className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
                    >
                      {tipo}
                      <span className="rounded-full bg-destructive/20 px-1.5">{qtd}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

/* ======== Section 3b: Histórico ======== */

const DIAS_ANTIGOS = [7, 30, 90] as const;

const LogsSection = ({ instanceId }: { instanceId: string }) => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogEvento[]>([]);
  const [loading, setLoading] = useState(false);

  // Seleção para limpeza do histórico. Guarda os ids marcados; a ação de
  // apagar sempre envia ids explícitos + instancia_id, para nunca existir um
  // delete sem filtro (que varreria a coleção inteira).
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState<"selecionados" | "erros" | "antigos" | null>(null);
  const [apagando, setApagando] = useState(false);
  const [diasAntigos, setDiasAntigos] = useState<number>(30);
  const [antigosCount, setAntigosCount] = useState<number | null>(null);

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

  // Corte para "antigos": tudo com criado_em anterior a hoje - diasAntigos.
  // Calculado na hora do uso para não guardar uma data velha em estado.
  const cortarEm = useCallback(
    (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString(),
    []
  );

  // Conta quantos registros cairiam na limpeza por idade, independente dos
  // filtros da tabela (a limpeza por idade varre todo o histórico da instância).
  const fetchAntigos = useCallback(async () => {
    const { count } = await supabase
      .from("log_eventos_meta")
      .select("id", { count: "exact", head: true })
      .eq("instancia_id", instanceId)
      .lt("criado_em", cortarEm(diasAntigos));
    setAntigosCount(count ?? 0);
  }, [instanceId, diasAntigos, cortarEm]);

  useEffect(() => { fetchDistincts(); }, [fetchDistincts]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { fetchAntigos(); }, [fetchAntigos]);

  // Ao recarregar a lista, descarta seleção de linhas que já não existem.
  useEffect(() => {
    setMarcados((atual) => {
      if (atual.size === 0) return atual;
      const visiveis = new Set(logs.map((l) => l.id));
      const novo = new Set([...atual].filter((id) => visiveis.has(id)));
      return novo.size === atual.size ? atual : novo;
    });
  }, [logs]);

  const idsComErro = logs.filter((l) => l.status_resposta !== 200).map((l) => l.id);
  const todosMarcados = logs.length > 0 && marcados.size === logs.length;

  const alternar = (id: string) => {
    setMarcados((atual) => {
      const novo = new Set(atual);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  };

  const alternarTodos = () => {
    setMarcados(todosMarcados ? new Set() : new Set(logs.map((l) => l.id)));
  };

  // Apaga por lista explícita de ids. Nunca envia delete sem filtro, e mantém o
  // eq(instancia_id) como cinto de segurança para não tocar em outra instância.
  const apagar = async (ids: string[]) => {
    if (ids.length === 0) return;
    setApagando(true);
    const { error } = await supabase
      .from("log_eventos_meta")
      .delete()
      .eq("instancia_id", instanceId)
      .in("id", ids);
    setApagando(false);
    setConfirmar(null);

    if (error) {
      toast({ title: "Erro ao apagar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${ids.length} registro(s) apagado(s)` });
    setMarcados(new Set());
    await fetchLogs();
    await fetchDistincts();
    await fetchAntigos();
  };

  // Limpeza por idade: apaga tudo da instância anterior ao corte. Aqui o filtro
  // é a própria data (lt), não uma lista de ids — então varre além das 200 linhas
  // visíveis na tabela, que é o ponto de "limpar os antigos do banco".
  const apagarAntigos = async () => {
    setApagando(true);
    const { error, count } = await supabase
      .from("log_eventos_meta")
      .delete()
      .eq("instancia_id", instanceId)
      .lt("criado_em", cortarEm(diasAntigos));
    setApagando(false);
    setConfirmar(null);

    if (error) {
      toast({ title: "Erro ao apagar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${count ?? 0} registro(s) antigo(s) apagado(s)` });
    setMarcados(new Set());
    await fetchLogs();
    await fetchDistincts();
    await fetchAntigos();
  };

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
    <>
    <ResumoDisparos logs={logs} />

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

        {/* Contador + ações de limpeza */}
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {logs.length} disparo(s) encontrado(s)
            {marcados.size > 0 ? ` · ${marcados.size} selecionado(s)` : ""}
          </p>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs text-destructive hover:text-destructive"
              disabled={apagando || idsComErro.length === 0}
              onClick={() => setConfirmar("erros")}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Limpar com erro ({idsComErro.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs text-destructive hover:text-destructive"
              disabled={apagando || marcados.size === 0}
              onClick={() => setConfirmar("selecionados")}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Apagar selecionados
            </Button>
          </div>
        </div>

        {/* Limpeza por idade: independe dos filtros acima, varre todo o histórico */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">Limpar registros com mais de</span>
          <Select value={String(diasAntigos)} onValueChange={(v) => setDiasAntigos(Number(v))}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIAS_ANTIGOS.map((d) => (
                <SelectItem key={d} value={String(d)}>{d} dias</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {antigosCount === null
              ? "verificando..."
              : `${antigosCount} registro(s) no banco`}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-8 text-xs text-destructive hover:text-destructive"
            disabled={apagando || !antigosCount}
            onClick={() => setConfirmar("antigos")}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Limpar antigos
          </Button>
        </div>

        {/* Table */}
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento encontrado com os filtros selecionados</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-3 py-2 w-10">
                      <Checkbox
                        checked={todosMarcados}
                        onCheckedChange={alternarTodos}
                        aria-label="Selecionar todos os disparos"
                      />
                    </th>
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
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={marcados.has(l.id)}
                          onCheckedChange={() => alternar(l.id)}
                          aria-label={`Selecionar disparo ${l.evento_meta} de ${formatDateBR(l.criado_em)}`}
                        />
                      </td>
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

    <AlertDialog open={!!confirmar} onOpenChange={(v) => !v && setConfirmar(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirmar === "erros"
              ? "Limpar disparos com erro?"
              : confirmar === "antigos"
                ? `Limpar disparos com mais de ${diasAntigos} dias?`
                : "Apagar disparos selecionados?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmar === "erros"
              ? `${idsComErro.length} registro(s) com falha serão removidos do histórico permanentemente. Isso não desfaz nem reenvia nada para a Meta — só limpa o log aqui.`
              : confirmar === "antigos"
                ? `${antigosCount ?? 0} registro(s) anteriores a ${formatDateBR(cortarEm(diasAntigos))} serão removidos do banco permanentemente, inclusive os que não aparecem na tabela. Isso não desfaz nem reenvia nada para a Meta — só limpa o log aqui.`
                : `${marcados.size} registro(s) serão removidos do histórico permanentemente. Isso não desfaz nem reenvia nada para a Meta — só limpa o log aqui.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={apagando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Sem fechar automaticamente: o apagar() controla o estado para o
              // botão poder mostrar "Apagando..." enquanto a requisição corre.
              e.preventDefault();
              if (confirmar === "antigos") {
                apagarAntigos();
                return;
              }
              apagar(confirmar === "erros" ? idsComErro : [...marcados]);
            }}
            disabled={apagando}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {apagando ? "Apagando..." : "Apagar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default MetaPixel;
