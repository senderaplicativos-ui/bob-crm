import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInstance, Instancia } from "@/contexts/InstanceContext";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Wifi, WifiOff, QrCode, Copy, LogOut, Trash2, RefreshCw, Loader2, Plus, CheckCircle2, Pencil, Eye, EyeOff } from "lucide-react";

const WEBHOOK_BASE = "https://whatsapp-webhook-liart.vercel.app";

const Conexoes = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { instancias, refreshInstancias, selected, setSelected } = useInstance();
  const ativas = instancias.filter((i) => i.ativo !== false);
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Instancia | null>(null);
  const [logoutTarget, setLogoutTarget] = useState<Instancia | null>(null);
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const [qrDialog, setQrDialog] = useState<{ open: boolean; name: string; qr: string | null; loading: boolean }>({
    open: false, name: "", qr: null, loading: false,
  });

  // Edit state
  const [editTarget, setEditTarget] = useState<Instancia | null>(null);
  const [editForm, setEditForm] = useState({ nome: "", instanceName: "", evolutionUrl: "", evolutionApiKey: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [showEditKey, setShowEditKey] = useState(false);

  // Add client state
  const [showAddForm, setShowAddForm] = useState(searchParams.get("add") === "true");
  const [addStep, setAddStep] = useState<"form" | "qr">("form");
  const [form, setForm] = useState({
    nome: "",
    instanceName: "",
    evolutionUrl: "https://chatevo.atende.app.br",
    evolutionApiKey: "d68048fb02ba896f898888a8704467d2",
  });
  const [saving, setSaving] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [alreadyExistsPrompt, setAlreadyExistsPrompt] = useState(false);

  useEffect(() => {
    if (searchParams.get("add") === "true") {
      setShowAddForm(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const checkStatuses = async () => {
    setChecking(true);
    const results: Record<string, boolean> = {};
    await Promise.all(
      ativas.map(async (inst) => {
        if (!inst.evolution_instance_name) { results[inst.id] = false; return; }
        try {
          const res = await fetch(`${WEBHOOK_BASE}/api/instance/status/${inst.evolution_instance_name}?t=${Date.now()}`);
          if (res.ok || res.status === 304) {
            const data = await res.json();
            const state = data?.instance?.state || data?.state;
            results[inst.id] = state === "open";
          } else { results[inst.id] = false; }
        } catch { results[inst.id] = false; }
      })
    );
    setStatuses(results);
    setChecking(false);
  };

  useEffect(() => { if (ativas.length > 0) checkStatuses(); }, [instancias]);

  const openQr = async (inst: Instancia) => {
    if (!inst.evolution_instance_name) return;
    setQrDialog({ open: true, name: inst.evolution_instance_name, qr: null, loading: true });
    try {
      const res = await fetch(`${WEBHOOK_BASE}/api/instance/connect/${inst.evolution_instance_name}`);
      if (res.ok) {
        const data = await res.json();
        setQrDialog((prev) => ({ ...prev, qr: data?.qrcode || data?.base64 || null, loading: false }));
      } else {
        setQrDialog((prev) => ({ ...prev, loading: false }));
        toast({ title: "Erro ao gerar QR Code", variant: "destructive" });
      }
    } catch {
      setQrDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  const copyLink = (name: string) => {
    navigator.clipboard.writeText(`${WEBHOOK_BASE}/connect/${name}`);
    toast({ title: "Link copiado!" });
  };

  const logout = async (inst: Instancia) => {
    if (!inst.evolution_instance_name) return;
    try {
      await fetch(`${WEBHOOK_BASE}/api/instance/logout/${inst.evolution_instance_name}`, { method: "DELETE" });
      toast({ title: "Desconectado" });
      setLogoutTarget(null);
      checkStatuses();
    } catch {
      toast({ title: "Erro ao desconectar", variant: "destructive" });
    }
  };

  const remove = async (inst: Instancia) => {
    if (!inst.evolution_instance_name) return;
    try {
      await fetch(`${WEBHOOK_BASE}/api/instance/delete/${inst.evolution_instance_name}`, { method: "DELETE" });
      await supabase.from("instancias").update({ ativo: false }).eq("id", inst.id);
      toast({ title: "Instância removida" });
      setRemoveTarget(null);
      await refreshInstancias();
      if (selected?.id === inst.id) {
        setSelected(null);
        navigate("/");
      }
    } catch {
      toast({ title: "Erro ao remover", variant: "destructive" });
    }
  };

  const reconnect = async (inst: Instancia) => {
    if (!inst.evolution_instance_name) return;
    setReconnecting(inst.id);
    try {
      const res = await fetch(`${WEBHOOK_BASE}/api/instance/restart/${inst.evolution_instance_name}`, { method: "PUT" });
      if (res.ok) {
        const data = await res.json();
        if (data?.state === "open") {
          toast({ title: "WhatsApp reconectado com sucesso!" });
          setStatuses((prev) => ({ ...prev, [inst.id]: true }));
          await refreshInstancias();
        } else {
          toast({ title: "Reconexão em andamento... Atualize em alguns segundos" });
          setTimeout(() => checkStatuses(), 5000);
        }
      } else {
        toast({ title: "Não foi possível reconectar. Tente escanear o QR Code novamente", variant: "destructive" });
      }
    } catch {
      toast({ title: "Não foi possível reconectar. Tente escanear o QR Code novamente", variant: "destructive" });
    }
    setReconnecting(null);
  };

  // Edit handlers
  const openEdit = (inst: Instancia) => {
    setEditTarget(inst);
    setEditForm({
      nome: inst.nome,
      instanceName: inst.evolution_instance_name || "",
      evolutionUrl: inst.evolution_url || "",
      evolutionApiKey: inst.evolution_api_key || "",
    });
    setShowEditKey(false);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const res = await fetch(`${WEBHOOK_BASE}/api/instance/edit/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: editForm.nome,
          evolution_url: editForm.evolutionUrl,
          evolution_api_key: editForm.evolutionApiKey,
          evolution_instance_name: editForm.instanceName,
        }),
      });
      if (res.ok) {
        toast({ title: "Instância atualizada com sucesso" });
        setEditTarget(null);
        await refreshInstancias();
      } else {
        const errText = await res.text();
        toast({ title: "Erro ao atualizar", description: errText, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
    setEditSaving(false);
  };

  // ---- Add client logic ----
  const saveToSupabaseOnly = async () => {
    setSaving(true);
    const { data, error } = await supabase.from("instancias").insert({
      nome: form.nome,
      evolution_instance_name: form.instanceName,
      evolution_url: form.evolutionUrl,
      evolution_api_key: form.evolutionApiKey,
    }).select().single();
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    setCreatedId(data.id);
    // Create default funnel stages for the new instance
    const { data: existingStages } = await supabase.from("estagios_funil").select("id").eq("instancia_id", data.id).limit(1);
    if (!existingStages || existingStages.length === 0) {
      await supabase.from("estagios_funil").insert([
        { nome: "NOVO", ordem: 1, cor: "#6B7280", instancia_id: data.id },
        { nome: "LEAD", ordem: 2, cor: "#3B82F6", instancia_id: data.id },
        { nome: "CONTATO", ordem: 3, cor: "#F59E0B", instancia_id: data.id },
        { nome: "COMPROU", ordem: 4, cor: "#10B981", instancia_id: data.id },
      ]);
    }
    setAlreadyExistsPrompt(false);
    await refreshInstancias();
    try {
      const qrRes = await fetch(`${WEBHOOK_BASE}/api/instance/connect/${form.instanceName}`);
      if (qrRes.ok) {
        const qrResult = await qrRes.json();
        setQrData(qrResult?.qrcode || qrResult?.base64 || null);
      }
    } catch {}
    setAddStep("qr");
    startPolling();
    setSaving(false);
  };

  const handleCreate = async () => {
    if (!form.nome.trim() || !form.instanceName.trim()) {
      toast({ title: "Preencha nome e nome da instância", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("instancias")
        .select("id")
        .eq("evolution_instance_name", form.instanceName)
        .eq("ativo", true)
        .maybeSingle();
      if (existing) {
        toast({ title: "Já existe uma instância com esse nome", variant: "destructive" });
        setSaving(false);
        return;
      }

      let evolutionResult: any = null;
      try {
        const res = await fetch(`${WEBHOOK_BASE}/api/instance/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instanceName: form.instanceName,
            evolutionUrl: form.evolutionUrl,
            evolutionApiKey: form.evolutionApiKey,
            clientName: form.nome,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          if (res.status === 400 && errText.toLowerCase().includes("already")) {
            setAlreadyExistsPrompt(true);
            setSaving(false);
            return;
          }
          toast({ title: "Erro ao criar instância", description: errText, variant: "destructive" });
          setSaving(false);
          return;
        }
        evolutionResult = await res.json();
      } catch (fetchErr: any) {
        toast({ title: "Erro de rede ao criar instância", description: fetchErr.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      await refreshInstancias();
      const newId = evolutionResult?.supabaseId || null;
      setCreatedId(newId);
      // Create default funnel stages for the new instance
      if (newId) {
        const { data: existingStages } = await supabase.from("estagios_funil").select("id").eq("instancia_id", newId).limit(1);
        if (!existingStages || existingStages.length === 0) {
          await supabase.from("estagios_funil").insert([
            { nome: "NOVO", ordem: 1, cor: "#6B7280", instancia_id: newId },
            { nome: "LEAD", ordem: 2, cor: "#3B82F6", instancia_id: newId },
            { nome: "CONTATO", ordem: 3, cor: "#F59E0B", instancia_id: newId },
            { nome: "COMPROU", ordem: 4, cor: "#10B981", instancia_id: newId },
          ]);
        }
      }
      toast({ title: "Instância criada com sucesso!" });
      try { await refreshInstancias(); } catch {}
      closeAddForm();
      
      try {
        let qr: string | null = evolutionResult?.qrcode || null;
        if (!qr) {
          const qrRes = await fetch(`${WEBHOOK_BASE}/api/instance/connect/${form.instanceName}`);
          if (qrRes.ok) {
            const qrResult = await qrRes.json();
            qr = qrResult?.qrcode || qrResult?.base64 || null;
          }
        }
        setQrDialog({ open: true, name: form.instanceName, qr, loading: false });
      } catch {
        setQrDialog({ open: true, name: form.instanceName, qr: null, loading: false });
      }
    } catch (e: any) {
      toast({ title: "Erro inesperado", description: e?.message || "Tente novamente", variant: "destructive" });
    }
    setSaving(false);
  };

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${WEBHOOK_BASE}/api/instance/status/${form.instanceName}?t=${Date.now()}`);
        if (res.ok || res.status === 304) {
          const data = await res.json();
          const state = data?.instance?.state || data?.state;
          if (state === "open") {
            setConnected(true);
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (data?.number && createdId) {
              await supabase.from("instancias").update({ telefone_conectado: data.number }).eq("id", createdId);
              await refreshInstancias();
            }
          }
        }
      } catch {}
    }, 5000);
  };

  const closeAddForm = () => {
    setShowAddForm(false);
    setAddStep("form");
    setForm({ nome: "", instanceName: "", evolutionUrl: "https://chatevo.atende.app.br", evolutionApiKey: "d68048fb02ba896f898888a8704467d2" });
    setQrData(null);
    setConnected(false);
    setCreatedId(null);
    setAlreadyExistsPrompt(false);
    if (pollingRef.current) clearInterval(pollingRef.current);
  };

  const shareLink = `${WEBHOOK_BASE}/connect/${form.instanceName}`;

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conexões</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas instâncias WhatsApp</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={checkStatuses} disabled={checking}>
            <RefreshCw className={`h-4 w-4 mr-1 ${checking ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar Cliente
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {ativas.map((inst) => {
          const isConnected = statuses[inst.id] ?? false;
          const isReconnecting = reconnecting === inst.id;
          return (
            <div key={inst.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                {isConnected ? <Wifi className="h-5 w-5 text-primary" /> : <WifiOff className="h-5 w-5 text-destructive" />}
                <div>
                  <h3 className="font-semibold text-foreground">{inst.nome}</h3>
                  <p className="text-xs text-muted-foreground">{inst.evolution_instance_name} • {inst.telefone_conectado || "Sem número"}</p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${isConnected ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                  {isConnected ? "Conectado" : "Desconectado"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {!isConnected && (
                  <Button
                    size="sm"
                    disabled={isReconnecting}
                    onClick={() => reconnect(inst)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isReconnecting ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Reconectando...</>
                    ) : (
                      <><Wifi className="h-4 w-4 mr-1" /> Conectar</>
                    )}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => openQr(inst)}>
                  <QrCode className="h-4 w-4 mr-1" /> QR Code
                </Button>
                <Button variant="outline" size="sm" onClick={() => copyLink(inst.evolution_instance_name || "")}>
                  <Copy className="h-4 w-4 mr-1" /> Copiar Link
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(inst)}>
                  <Pencil className="h-4 w-4 mr-1" /> Editar
                </Button>
                {isConnected && (
                  <Button variant="outline" size="sm" onClick={() => setLogoutTarget(inst)}>
                    <LogOut className="h-4 w-4 mr-1" /> Desconectar
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setRemoveTarget(inst)} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-1" /> Remover
                </Button>
              </div>
            </div>
          );
        })}
        {ativas.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">Nenhuma instância cadastrada</p>
        )}
      </div>

      {/* Edit Instance Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Instância</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome do cliente</label>
              <Input value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome da instância (Evolution)</label>
              <Input value={editForm.instanceName} onChange={(e) => setEditForm({ ...editForm, instanceName: e.target.value.replace(/\s/g, "") })} />
              <p className="text-xs text-amber-500">⚠️ Alterar apenas se souber o que está fazendo</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">URL da Evolution</label>
              <Input value={editForm.evolutionUrl} onChange={(e) => setEditForm({ ...editForm, evolutionUrl: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">API Key da Evolution</label>
              <div className="relative">
                <Input
                  type={showEditKey ? "text" : "password"}
                  value={editForm.evolutionApiKey}
                  onChange={(e) => setEditForm({ ...editForm, evolutionApiKey: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-10 w-10"
                  onClick={() => setShowEditKey(!showEditKey)}
                >
                  {showEditKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
              <Button onClick={saveEdit} disabled={editSaving}>
                {editSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Client Dialog */}
      <Dialog open={showAddForm} onOpenChange={(o) => { if (!o) closeAddForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{addStep === "qr" ? (connected ? "Conectado!" : "Conecte o WhatsApp") : "Adicionar Cliente"}</DialogTitle>
          </DialogHeader>

          {addStep === "qr" ? (
            connected ? (
              <div className="text-center py-4">
                <CheckCircle2 className="mx-auto h-16 w-16 text-primary mb-4" />
                <p className="text-sm text-muted-foreground mb-6">A instância {form.instanceName} está pronta.</p>
                <Button onClick={closeAddForm} className="w-full">Fechar</Button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">Escaneie o QR Code ou envie o link para o cliente</p>
                {qrData ? (
                  <img
                    src={qrData.startsWith("data:") ? qrData : `data:image/png;base64,${qrData}`}
                    alt="QR Code"
                    className="mx-auto h-56 w-56 rounded-lg border border-border mb-4"
                  />
                ) : (
                  <div className="mb-4 flex h-56 w-56 mx-auto items-center justify-center rounded-lg border border-border">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-4">
                  <Input value={shareLink} readOnly className="text-xs" />
                  <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(shareLink); toast({ title: "Link copiado!" }); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Aguardando conexão...
                </div>
              </div>
            )
          ) : alreadyExistsPrompt ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Esta instância já existe na Evolution API. Deseja cadastrá-la no CRM sem criar nova?
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAlreadyExistsPrompt(false)} className="flex-1">Voltar</Button>
                <Button onClick={saveToSupabaseOnly} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Cadastrar no CRM
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nome do cliente</label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Clínica Dr. Silva" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nome da instância (slug sem espaços)</label>
                <Input value={form.instanceName} onChange={(e) => setForm({ ...form, instanceName: e.target.value.replace(/\s/g, "") })} placeholder="Ex: clinica-silva" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">URL da Evolution API</label>
                <Input value={form.evolutionUrl} onChange={(e) => setForm({ ...form, evolutionUrl: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">API Key da Evolution</label>
                <Input value={form.evolutionApiKey} onChange={(e) => setForm({ ...form, evolutionApiKey: e.target.value })} />
              </div>
              <Button onClick={handleCreate} disabled={saving} className="w-full">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Criando...</> : "Criar Instância"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Dialog */}
      <Dialog open={qrDialog.open} onOpenChange={(o) => setQrDialog((prev) => ({ ...prev, open: o }))}>
        <DialogContent className="sm:max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>QR Code - {qrDialog.name}</DialogTitle>
          </DialogHeader>
          {qrDialog.loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : qrDialog.qr ? (
            <img
              src={qrDialog.qr.startsWith("data:") ? qrDialog.qr : `data:image/png;base64,${qrDialog.qr}`}
              alt="QR Code"
              className="mx-auto h-64 w-64 rounded-lg border border-border"
            />
          ) : (
            <p className="py-8 text-muted-foreground">QR Code não disponível. Tente novamente.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Disconnect Dialog */}
      <AlertDialog open={!!logoutTarget} onOpenChange={(o) => !o && setLogoutTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar WhatsApp</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja desconectar? Você poderá reconectar usando o botão "Conectar" sem precisar escanear o QR Code novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => logoutTarget && logout(logoutTarget)}
            >
              Sim, desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Remove Dialog */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover instância</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-destructive">ATENÇÃO:</span> Esta ação é irreversível. A instância será removida permanentemente e você precisará criar uma nova conexão e escanear o QR Code novamente. Todas as configurações desta instância serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeTarget && remove(removeTarget)}
            >
              Sim, remover permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Conexoes;
