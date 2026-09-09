import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { useOptionsFromDB } from "@/hooks/useOptionsFromDB";
import { useFunnelStages } from "@/hooks/useFunnelStages";
import { useGroupConfig } from "@/hooks/useGroupConfig";

interface Regra {
  id: string;
  tipo_regra: string;
  modo: string;
  texto: string;
  resultado: string;
  ativo: boolean | null;
  criado_em: string | null;
  instancia_id: string | null;
  cor: string | null;
}

interface RegraForm {
  tipo_regra: string;
  modo: string;
  texto: string;
  resultado: string;
  ativo: boolean;
  cor: string;
}

const emptyForm: RegraForm = { tipo_regra: "ORIGEM", modo: "contains", texto: "", resultado: "", ativo: true, cor: "#6B7280" };

const Regras = () => {
  const { selected } = useInstance();
  const navigate = useNavigate();
  const [regras, setRegras] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RegraForm>(emptyForm);
  const { toast } = useToast();
  const { statuses, origins } = useOptionsFromDB();
  const { stages, fetchStages } = useFunnelStages();
  const { aplicarRegrasGrupo, toggleConfig } = useGroupConfig();
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  const fetchRegras = async () => {
    if (!selected) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("regras")
      .select("*")
      .eq("instancia_id", selected.id)
      .order("criado_em", { ascending: false });
    if (error) {
      console.error("Erro ao buscar regras:", error);
      toast({ title: "Erro ao buscar regras", description: error.message, variant: "destructive" });
    }
    setRegras((data as Regra[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchRegras(); }, [selected?.id]);

  const openNew = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (r: Regra) => {
    setEditingId(r.id);
    setForm({ tipo_regra: r.tipo_regra, modo: r.modo, texto: r.texto, resultado: r.resultado, ativo: r.ativo ?? true, cor: r.cor || "#6B7280" });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.texto.trim() || !form.resultado.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    const payload = { ...form, cor: form.cor || null };
    if (editingId) {
      const { error } = await supabase.from("regras").update(payload).eq("id", editingId);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Regra atualizada" });
    } else {
      const { error } = await supabase.from("regras").insert({ ...payload, instancia_id: selected?.id || null });
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Regra criada" });
    }
    setDialogOpen(false);
    fetchRegras();
    // Check if STATUS result is missing from funnel stages
    if (form.tipo_regra === "STATUS") {
      const exists = stages.some((s) => s.nome === form.resultado);
      if (!exists) {
        setSyncWarning(form.resultado);
      }
    }
  };

  const toggleAtivo = async (r: Regra) => {
    await supabase.from("regras").update({ ativo: !r.ativo }).eq("id", r.id);
    fetchRegras();
  };

  const deleteRegra = async (id: string) => {
    const { error } = await supabase.from("regras").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
    toast({ title: "Regra excluída" });
    fetchRegras();
  };

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Regras</h1>
          <p className="text-sm text-muted-foreground">{regras.length} regras cadastradas</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Nova Regra
        </Button>
      </div>

      {/* Sync warning */}
      {syncWarning && (
        <Alert className="mb-4 border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-700">Estágio não encontrado</AlertTitle>
          <AlertDescription className="text-yellow-700/80">
            O status "<strong>{syncWarning}</strong>" não existe como estágio no Funil. Leads com esse status não aparecerão no kanban.
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={async () => {
                if (!selected) return;
                const nextOrdem = stages.length > 0 ? Math.max(...stages.map((s) => s.ordem)) + 1 : 1;
                await supabase.from("estagios_funil").insert({
                  nome: syncWarning,
                  cor: "#6B7280",
                  ordem: nextOrdem,
                  instancia_id: selected.id,
                });
                toast({ title: `Estágio "${syncWarning}" criado` });
                fetchStages();
                setSyncWarning(null);
              }}>
                Criar Estágio
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSyncWarning(null)}>Ignorar</Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Group rules toggle */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <Switch checked={aplicarRegrasGrupo} onCheckedChange={toggleConfig} id="group-rules" />
        <div>
          <label htmlFor="group-rules" className="text-sm font-medium text-foreground cursor-pointer select-none">Aplicar regras em grupos</label>
          <p className="text-xs text-muted-foreground">Quando desativado, mensagens de grupo não alteram status nem origem das conversas</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Modo</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Texto</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Resultado</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cor</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Escopo</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ativo</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : regras.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Nenhuma regra cadastrada</td></tr>
              ) : (
                regras.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{r.tipo_regra}</td>
                    <td className="px-4 py-3 text-muted-foreground">{{ contains: "Contém", word: "Palavra inteira", exact: "Exato" }[r.modo] || r.modo}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{r.texto}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.resultado}</td>
                    <td className="px-4 py-3">
                      {r.cor ? (
                        <div className="h-5 w-5 rounded-full border border-border" style={{ backgroundColor: r.cor }} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.instancia_id ? "Cliente" : "Global"}</td>
                    <td className="px-4 py-3"><Switch checked={r.ativo ?? false} onCheckedChange={() => toggleAtivo(r)} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteRegra(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Regra" : "Nova Regra"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <Select value={form.tipo_regra} onValueChange={(v) => setForm({ ...form, tipo_regra: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORIGEM">ORIGEM</SelectItem>
                  <SelectItem value="STATUS">STATUS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Modo</label>
              <Select value={form.modo} onValueChange={(v) => setForm({ ...form, modo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="word">Palavra inteira</SelectItem>
                  <SelectItem value="exact">Exato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Texto</label>
              <Input value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} placeholder="Use vírgula para múltiplas palavras: valor, preço, quanto custa" />
              <p className="text-xs text-muted-foreground mt-1">Separe palavras com vírgula. A regra ativa se qualquer uma das palavras estiver na mensagem.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Resultado</label>
              <div className="flex items-center gap-2">
                <Input
                  list={`resultado-options-${form.tipo_regra}`}
                  value={form.resultado}
                  onChange={(e) => setForm({ ...form, resultado: e.target.value })}
                  placeholder="Selecione ou digite o resultado"
                  className="flex-1"
                />
                <div className="relative">
                  <input
                    type="color"
                    value={form.cor}
                    onChange={(e) => setForm({ ...form, cor: e.target.value })}
                    className="h-9 w-9 cursor-pointer rounded-md border border-input p-0.5"
                    title="Cor do badge"
                  />
                </div>
              </div>
              <datalist id={`resultado-options-STATUS`}>
                {stages.map((s) => (
                  <option key={s.nome} value={s.nome} />
                ))}
                {statuses.filter((s) => !stages.some((st) => st.nome === s)).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <datalist id={`resultado-options-ORIGEM`}>
                {[...new Set([
                  ...origins,
                  "INSTAGRAM", "FACEBOOK", "GOOGLE", "SITE", "YOUTUBE",
                  "TIKTOK", "INDICAÇÃO", "WHATSAPP", "EMAIL", "LINKEDIN"
                ])].map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <label className="text-sm text-foreground">Ativo</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editingId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Regras;
