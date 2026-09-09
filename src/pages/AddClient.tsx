import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Copy, CheckCircle2, Loader2 } from "lucide-react";

const WEBHOOK_BASE = "https://whatsapp-webhook-liart.vercel.app";

const AddClient = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refreshInstancias } = useInstance();

  const [form, setForm] = useState({
    nome: "",
    instanceName: "",
    evolutionUrl: "https://chatevo.atende.app.br",
    evolutionApiKey: "d68048fb02ba896f898888a8704467d2",
  });
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"form" | "qr">("form");
  const [qrData, setQrData] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const shareLink = `${WEBHOOK_BASE}/connect/${form.instanceName}`;

  const handleCreate = async () => {
    if (!form.nome.trim() || !form.instanceName.trim()) {
      toast({ title: "Preencha nome e nome da instância", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Call webhook to create instance
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
        const err = await res.text();
        toast({ title: "Erro ao criar instância", description: err, variant: "destructive" });
        setSaving(false);
        return;
      }

      const result = await res.json();

      // Save to Supabase
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
      await refreshInstancias();

      // Try to get QR code
      if (result?.qrcode) {
        setQrData(result.qrcode);
      } else {
        // Fetch QR from connect endpoint
        try {
          const qrRes = await fetch(`${WEBHOOK_BASE}/api/instance/connect/${form.instanceName}`);
          if (qrRes.ok) {
            const qrResult = await qrRes.json();
            setQrData(qrResult?.qrcode || qrResult?.base64 || null);
          }
        } catch {}
      }

      setStep("qr");
      startPolling();
    } catch (e: any) {
      toast({ title: "Erro de rede", description: e.message, variant: "destructive" });
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
            // Update telefone if available
            if (data?.number && createdId) {
              await supabase.from("instancias").update({ telefone_conectado: data.number }).eq("id", createdId);
              await refreshInstancias();
            }
          }
        }
      } catch {}
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    toast({ title: "Link copiado!" });
  };

  if (step === "qr") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 shadow-sm text-center">
          {connected ? (
            <>
              <CheckCircle2 className="mx-auto h-16 w-16 text-primary mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">Conectado com sucesso!</h2>
              <p className="text-sm text-muted-foreground mb-6">A instância {form.instanceName} está pronta.</p>
              <Button onClick={() => navigate("/")} className="w-full">Ir para o CRM</Button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-foreground mb-2">Conecte o WhatsApp</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Escaneie o QR Code abaixo ou envie o link para o cliente
              </p>

              {qrData ? (
                <div className="mb-4 flex justify-center">
                  <img
                    src={qrData.startsWith("data:") ? qrData : `data:image/png;base64,${qrData}`}
                    alt="QR Code"
                    className="h-64 w-64 rounded-lg border border-border"
                  />
                </div>
              ) : (
                <div className="mb-4 flex h-64 w-64 mx-auto items-center justify-center rounded-lg border border-border">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <Input value={shareLink} readOnly className="text-xs" />
                <Button variant="outline" size="icon" onClick={copyLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Aguardando conexão...
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center gap-3 border-b border-border px-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-bold text-foreground">Adicionar Cliente</span>
      </header>

      <main className="flex-1 flex items-start justify-center p-6">
        <div className="max-w-lg w-full rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome do cliente</label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Clínica Dr. Silva"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome da instância (slug sem espaços)</label>
              <Input
                value={form.instanceName}
                onChange={(e) => setForm({ ...form, instanceName: e.target.value.replace(/\s/g, "") })}
                placeholder="Ex: clinica-silva"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">URL da Evolution API</label>
              <Input
                value={form.evolutionUrl}
                onChange={(e) => setForm({ ...form, evolutionUrl: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">API Key da Evolution</label>
              <Input
                value={form.evolutionApiKey}
                onChange={(e) => setForm({ ...form, evolutionApiKey: e.target.value })}
              />
            </div>
          </div>

          <Button onClick={handleCreate} disabled={saving} className="mt-6 w-full">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Criando...</> : "Criar Instância"}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default AddClient;
