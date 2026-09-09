import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, WifiOff, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/formatters";

interface LogErro {
  id: string;
  tipo: string;
  mensagem: string | null;
  detalhes: string | null;
  criado_em: string | null;
}

interface StatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StatusModal({ open, onOpenChange }: StatusModalProps) {
  const { selected } = useInstance();
  const { toast } = useToast();
  const [erros, setErros] = useState<LogErro[]>([]);
  const [status, setStatus] = useState<"ok" | "error" | "offline">("ok");
  const [loading, setLoading] = useState(false);
  const [alertaAtivo, setAlertaAtivo] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const webhookUrl = selected?.evolution_url
    ? selected.evolution_url.replace(/\/+$/, "")
    : "";

  const configKey = selected ? `alerta_erros_${selected.id}` : null;

  const fetchAlertConfig = useCallback(async () => {
    if (!configKey) return;
    const { data } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", configKey)
      .maybeSingle();
    setAlertaAtivo(data?.valor === "true");
  }, [configKey]);

  const fetchErros = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const res = await fetch(
        `https://whatsapp-webhook-liart.vercel.app/api/erros/recentes`
      );
      if (!res.ok) throw new Error("offline");
      const data = await res.json();
      const list: LogErro[] = data.erros || [];
      setErros(list);
      setStatus(list.length > 0 ? "error" : "ok");
    } catch {
      // Fallback: read directly from supabase
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("log_erros")
        .select("*")
        .gte("criado_em", since)
        .order("criado_em", { ascending: false })
        .limit(50);
      if (data && data.length > 0) {
        setErros(data as LogErro[]);
        setStatus("error");
      } else if (data) {
        setErros([]);
        setStatus("ok");
      } else {
        setStatus("offline");
      }
    }
    setLoading(false);
  }, [open]);

  useEffect(() => {
    if (open) {
      fetchErros();
      fetchAlertConfig();
    }
  }, [open, fetchErros, fetchAlertConfig]);

  const handleClearErrors = async () => {
    try {
      await fetch(`https://whatsapp-webhook-liart.vercel.app/api/erros/limpar`, {
        method: "DELETE",
      });
    } catch {
      // fallback: clear from supabase directly
      await supabase.from("log_erros").delete().lt(
        "criado_em",
        new Date().toISOString()
      );
    }
    setErros([]);
    setStatus("ok");
    toast({ title: "Erros limpos com sucesso" });
  };

  const toggleAlerta = async (value: boolean) => {
    if (!configKey) return;
    setAlertaAtivo(value);
    const { data: existing } = await supabase
      .from("configuracoes")
      .select("id")
      .eq("chave", configKey)
      .maybeSingle();
    if (existing) {
      await supabase.from("configuracoes").update({ valor: String(value) }).eq("id", existing.id);
    } else {
      await supabase.from("configuracoes").insert({ chave: configKey, valor: String(value) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Status do Sistema</DialogTitle>
        </DialogHeader>

        {/* Section 1: General Status */}
        <div className="flex items-center gap-3 rounded-lg border p-4">
          {loading ? (
            <span className="text-sm text-muted-foreground">Verificando...</span>
          ) : status === "ok" ? (
            <>
              <CheckCircle2 className="h-6 w-6 text-green-500" />
              <span className="text-sm font-medium">Tudo funcionando. Nenhum erro nas últimas 24h.</span>
            </>
          ) : status === "error" ? (
            <>
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <span className="text-sm font-medium">{erros.length} erro(s) nas últimas 24h</span>
            </>
          ) : (
            <>
              <WifiOff className="h-6 w-6 text-yellow-500" />
              <span className="text-sm font-medium">Não foi possível conectar ao webhook</span>
            </>
          )}
        </div>

        {/* Section 2: Error List */}
        {erros.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Erros recentes</h3>
              <Button variant="outline" size="sm" onClick={handleClearErrors}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Limpar erros
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Data/Hora</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {erros.map((e) => (
                  <>
                    <TableRow key={e.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                      <TableCell className="text-xs">{formatDateBR(e.criado_em)}</TableCell>
                      <TableCell className="text-xs">{e.mensagem || "—"}</TableCell>
                      <TableCell>
                        {e.detalhes && (expandedId === e.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                      </TableCell>
                    </TableRow>
                    {expandedId === e.id && e.detalhes && (
                      <TableRow key={`${e.id}-detail`}>
                        <TableCell colSpan={3} className="bg-muted/50 text-xs whitespace-pre-wrap break-all">
                          {e.detalhes}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Section 3: Alert Toggle */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Alerta automático</p>
            <p className="text-xs text-muted-foreground">Mostrar indicador vermelho na sidebar quando houver erros</p>
          </div>
          <Switch checked={alertaAtivo} onCheckedChange={toggleAlerta} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook for background error checking (used by Layout)
export function useErrorAlert(enabled: boolean, instanceId: string | undefined) {
  const [hasErrors, setHasErrors] = useState(false);

  useEffect(() => {
    if (!enabled || !instanceId) {
      setHasErrors(false);
      return;
    }

    const check = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("log_erros")
        .select("id", { count: "exact", head: true })
        .gte("criado_em", since);
      setHasErrors((count ?? 0) > 0);
    };

    check();
    const interval = setInterval(check, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(interval);
  }, [enabled, instanceId]);

  return hasErrors;
}
