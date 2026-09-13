import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInstance, Instancia } from "@/contexts/InstanceContext";
import { Button } from "@/components/ui/button";
import { Plus, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { callEvolution } from "@/lib/evolution";

const InstanceSelect = () => {
  const { instancias, setSelected, refreshInstancias, loading } = useInstance();
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);
  const navigate = useNavigate();

  const checkStatuses = async () => {
    setChecking(true);
    const results: Record<string, boolean> = {};
    await Promise.all(
      instancias.map(async (inst) => {
        if (!inst.evolution_instance_name) {
          results[inst.id] = false;
          return;
        }
        try {
          const res = await callEvolution({
            action: "status",
            instanceName: inst.evolution_instance_name,
            evolutionUrl: inst.evolution_url || "",
            evolutionApiKey: inst.evolution_api_key || "",
          });
          results[inst.id] = res.ok && res.state === "open";
        } catch {
          results[inst.id] = false;
        }
      })
    );
    setStatuses(results);
    setChecking(false);
  };

  useEffect(() => {
    if (instancias.length > 0) checkStatuses();
  }, [instancias]);

  const handleSelect = (inst: Instancia) => {
    setSelected(inst);
    navigate("/dashboard");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border px-6">
        <span className="text-lg font-bold text-foreground">WhatsApp CRM</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refreshInstancias(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={() => navigate("/conexoes?add=true")}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar Cliente
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        <h1 className="mb-6 text-2xl font-bold text-foreground">Selecione um Cliente</h1>

        {loading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : instancias.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">Nenhum cliente cadastrado</p>
            <Button onClick={() => navigate("/conexoes?add=true")}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar Primeiro Cliente
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {instancias.map((inst) => {
              const connected = statuses[inst.id] ?? false;
              return (
                <button
                  key={inst.id}
                  onClick={() => handleSelect(inst)}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm text-left transition-all hover:shadow-md hover:border-primary/50"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground">{inst.nome}</h2>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        connected
                          ? "bg-primary/15 text-primary"
                          : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                      {connected ? "Conectado" : "Desconectado"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {inst.telefone_conectado || inst.evolution_instance_name || "—"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default InstanceSelect;
