import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  totalLeads: number;
}

export const FunnelOnboarding = ({ totalLeads }: Props) => {
  const { selected } = useInstance();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(true); // hidden by default until checked

  const configKey = selected ? `onboarding_funil_${selected.id}` : "";

  const checkFlag = useCallback(async () => {
    if (!configKey) return;
    const { data } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", configKey)
      .maybeSingle();
    setDismissed(data?.valor === "done");
  }, [configKey]);

  useEffect(() => {
    checkFlag();
  }, [checkFlag]);

  if (dismissed || totalLeads > 0) return null;

  const dismiss = async () => {
    setDismissed(true);
    if (!configKey) return;
    await supabase.from("configuracoes").upsert(
      { chave: configKey, valor: "done" },
      { onConflict: "chave" }
    );
  };

  return (
    <div className="flex items-center justify-center py-10">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Bem-vindo ao Funil de Vendas!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Seus leads aparecerão aqui automaticamente quando receberem mensagens no WhatsApp.</p>
          <p className="font-medium text-foreground">Como funciona:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Todo novo lead começa na coluna <strong>NOVO</strong></li>
            <li>Crie <strong>Regras</strong> para classificar leads automaticamente (ex: se a mensagem contém "preço" → PEDIU VALORES)</li>
            <li>Os nomes dos estágios do funil devem ser iguais aos resultados das regras</li>
            <li>Arraste os cards manualmente para mudar o status</li>
          </ul>
          <p className="text-xs italic">Dica: Configure suas Regras primeiro, depois ajuste os estágios do Funil com os mesmos nomes.</p>
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={() => navigate("/regras")}>Ir para Regras</Button>
            <Button size="sm" variant="outline" onClick={dismiss}>Entendi, fechar</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
