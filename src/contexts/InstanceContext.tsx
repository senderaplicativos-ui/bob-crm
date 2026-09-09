import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Instancia {
  id: string;
  nome: string;
  telefone_conectado: string | null;
  evolution_url: string | null;
  evolution_api_key: string | null;
  evolution_instance_name: string | null;
  ativo: boolean | null;
  criado_em: string | null;
  atualizado_em: string | null;
}

interface InstanceContextType {
  instancias: Instancia[];
  selected: Instancia | null;
  setSelected: (i: Instancia | null) => void;
  refreshInstancias: () => Promise<void>;
  loading: boolean;
}

const InstanceContext = createContext<InstanceContextType>({
  instancias: [],
  selected: null,
  setSelected: () => {},
  refreshInstancias: async () => {},
  loading: true,
});

export const useInstance = () => useContext(InstanceContext);

export const InstanceProvider = ({ children }: { children: ReactNode }) => {
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [selected, setSelected] = useState<Instancia | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshInstancias = async () => {
    const { data } = await supabase
      .from("instancias")
      .select("*")
      .eq("ativo", true)
      .order("criado_em", { ascending: true });
    if (data) {
      setInstancias(data as Instancia[]);
      // Keep selected in sync
      if (selected) {
        const updated = data.find((i: any) => i.id === selected.id);
        if (updated) setSelected(updated as Instancia);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshInstancias();
  }, []);

  return (
    <InstanceContext.Provider value={{ instancias, selected, setSelected, refreshInstancias, loading }}>
      {children}
    </InstanceContext.Provider>
  );
};
