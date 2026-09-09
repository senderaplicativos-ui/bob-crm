import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";
import { EstagioFunil } from "@/hooks/useFunnelStages";

interface Props {
  missingStatuses: string[];
  stages: EstagioFunil[];
  onCreated: () => void;
}

export const MissingStagesBanner = ({ missingStatuses, stages, onCreated }: Props) => {
  const { selected } = useInstance();
  const { toast } = useToast();

  if (missingStatuses.length === 0 || !selected) return null;

  const createAll = async () => {
    const nextOrdem = stages.length > 0 ? Math.max(...stages.map((s) => s.ordem)) + 1 : 1;
    const rows = missingStatuses.map((nome, i) => ({
      nome,
      cor: "#6B7280",
      ordem: nextOrdem + i,
      instancia_id: selected.id,
    }));
    await supabase.from("estagios_funil").insert(rows);
    toast({ title: `${rows.length} estágio(s) criado(s)` });
    onCreated();
  };

  return (
    <Alert className="mb-4 border-yellow-500/50 bg-yellow-500/10">
      <AlertTriangle className="h-4 w-4 text-yellow-600" />
      <AlertTitle className="text-yellow-700">Estágios faltantes</AlertTitle>
      <AlertDescription className="text-yellow-700/80">
        Existem regras de STATUS que geram valores sem coluna no funil:{" "}
        <strong>{missingStatuses.join(", ")}</strong>. Leads com esses status não aparecerão no kanban.
        <div className="mt-2">
          <Button size="sm" variant="outline" onClick={createAll}>
            Criar estágios faltantes
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};
