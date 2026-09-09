import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useFunnelStages, EstagioFunil } from "@/hooks/useFunnelStages";
import { formatPhone, formatDateBR } from "@/lib/formatters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Plus, Trash2, GripVertical, AlertTriangle, Info } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useGroupConfig } from "@/hooks/useGroupConfig";
import { useMissingStages } from "@/hooks/useMissingStages";
import { MissingStagesBanner } from "@/components/funnel/MissingStagesBanner";
import { FunnelOnboarding } from "@/components/funnel/FunnelOnboarding";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Conversa {
  id: string;
  nome: string | null;
  telefone: string;
  origem: string | null;
  status: string | null;
  campanha: string | null;
  ultima_mensagem: string | null;
  criado_em: string | null;
  is_grupo: boolean | null;
}

const Funil = () => {
  const { selected } = useInstance();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { stages, loading: stagesLoading, fetchStages, createDefaults } = useFunnelStages();
  const { aplicarRegrasGrupo } = useGroupConfig();
  const { missingStatuses, refresh: refreshMissing } = useMissingStages(stages);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [loading, setLoading] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);

  const fetchConversas = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    const { data } = await supabase
      .from("conversas")
      .select("id, nome, telefone, origem, status, campanha, ultima_mensagem, criado_em, is_grupo")
      .eq("instancia_id", selected.id)
      .order("atualizado_em", { ascending: false });
    if (data) setConversas(data as Conversa[]);
    setLoading(false);
  }, [selected]);

  useEffect(() => {
    if (!selected) { navigate("/"); return; }
    fetchConversas();
  }, [selected, fetchConversas, navigate]);

  const isGroup = (c: Conversa) => {
    if (c.is_grupo) return true;
    const digits = c.telefone.replace(/\D/g, "");
    return digits.length > 15;
  };

  const getConversasForStage = (stageName: string) =>
    conversas.filter((c) => {
      const isGrupo = isGroup(c);
      if (isGrupo && !aplicarRegrasGrupo) {
        return stageName === "GRUPO";
      }
      return (c.status || "NOVO") === stageName;
    });

  const timeSince = (dateStr: string | null) => {
    if (!dateStr) return "";
    const iso = dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z";
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days > 0) return `${days}d atrás`;
    const hours = Math.floor(diff / 3600000);
    if (hours > 0) return `${hours}h atrás`;
    const mins = Math.floor(diff / 60000);
    return `${mins}m atrás`;
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const conversaId = result.draggableId;
    const newStatus = result.destination.droppableId;
    if (newStatus === "GRUPO") return; // Can't drag into GRUPO column
    const conversa = conversas.find((c) => c.id === conversaId);
    if (conversa && isGroup(conversa) && !aplicarRegrasGrupo) return; // Can't drag groups when disabled
    // Optimistic update
    setConversas((prev) =>
      prev.map((c) => (c.id === conversaId ? { ...c, status: newStatus } : c))
    );
    const { error } = await supabase
      .from("conversas")
      .update({ status: newStatus })
      .eq("id", conversaId);
    if (error) {
      toast({ title: "Erro ao mover", variant: "destructive" });
      fetchConversas();
    } else if (selected && conversa) {
      fetch("https://whatsapp-webhook-liart.vercel.app/api/meta/evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instancia_id: selected.id,
          conversa_id: conversaId,
          telefone: conversa.telefone,
          estagio_nome: newStatus,
        }),
      }).catch((err) => console.log("Meta event error:", err));
    }
  };

  if (stagesLoading || loading) {
    return (
      <Layout>
        <p className="text-muted-foreground">Carregando...</p>
      </Layout>
    );
  }

  if (stages.length === 0) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <h1 className="text-2xl font-bold text-foreground">Funil de Vendas</h1>
          <p className="text-muted-foreground">Nenhum estágio configurado para esta instância.</p>
          <Button onClick={createDefaults}>Configurar Funil</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Funil de Vendas</h1>
          <p className="text-sm text-muted-foreground">{conversas.length} leads no funil</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
          <Settings className="mr-1.5 h-4 w-4" /> Configurar Estágios
        </Button>
      </div>

      {/* Missing stages warning in funnel config */}
      <MissingStagesBanner
        missingStatuses={missingStatuses}
        stages={stages}
        onCreated={() => { fetchStages(); refreshMissing(); }}
      />

      <FunnelOnboarding totalLeads={conversas.length} />

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 500 }}>
          {/* Regular stages */}
          {stages.map((stage) => {
            const items = getConversasForStage(stage.nome);
            return (
              <Droppable key={stage.nome} droppableId={stage.nome}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex w-72 min-w-[272px] flex-col rounded-xl border border-border bg-card/50"
                    style={{
                      background: snapshot.isDraggingOver
                        ? `${stage.cor}10`
                        : undefined,
                    }}
                  >
                    {/* Column header */}
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: stage.cor }}
                        />
                        <span className="text-sm font-semibold text-foreground">{stage.nome}</span>
                      </div>
                      <span
                        className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
                        style={{ backgroundColor: stage.cor }}
                      >
                        {items.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: 600 }}>
                      {items.map((c, idx) => (
                        <Draggable key={c.id} draggableId={c.id} index={idx} isDragDisabled={isGroup(c) && !aplicarRegrasGrupo}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              onClick={() => navigate(`/conversations/${c.id}`)}
                              className={`cursor-pointer rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md ${
                                snap.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""
                              }`}
                            >
                              <p className="text-sm font-medium text-foreground truncate">
                                {c.nome || "Sem nome"}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatPhone(c.telefone)}
                              </p>
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {c.origem && (
                                  <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {c.origem}
                                  </span>
                                )}
                                {c.campanha && (
                                  <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                    {c.campanha}
                                  </span>
                                )}
                              </div>
                              {c.ultima_mensagem && (
                                <p className="mt-1.5 text-xs text-muted-foreground truncate">
                                  {c.ultima_mensagem}
                                </p>
                              )}
                              <p className="mt-1 text-[10px] text-muted-foreground/70">
                                {timeSince(c.criado_em)}
                              </p>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}

          {/* GRUPO column when rules disabled for groups */}
          {!aplicarRegrasGrupo && (() => {
            const grupoItems = getConversasForStage("GRUPO");
            if (grupoItems.length === 0) return null;
            return (
              <Droppable key="GRUPO" droppableId="GRUPO">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex w-72 min-w-[272px] flex-col rounded-xl border border-border bg-card/50"
                  >
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#9CA3AF" }} />
                        <span className="text-sm font-semibold text-foreground">GRUPO</span>
                      </div>
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white" style={{ backgroundColor: "#9CA3AF" }}>
                        {grupoItems.length}
                      </span>
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: 600 }}>
                      {grupoItems.map((c, idx) => (
                        <Draggable key={c.id} draggableId={c.id} index={idx} isDragDisabled>
                          {(prov) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              onClick={() => navigate(`/conversations/${c.id}`)}
                              className="cursor-pointer rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md opacity-70"
                            >
                              <p className="text-sm font-medium text-foreground truncate">{c.nome || "Sem nome"}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{formatPhone(c.telefone)}</p>
                              {c.ultima_mensagem && (
                                <p className="mt-1.5 text-xs text-muted-foreground truncate">{c.ultima_mensagem}</p>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })()}
        </div>
      </DragDropContext>

      {/* Hidden leads footer */}
      {(() => {
        const stageNames = new Set(stages.map((s) => s.nome));
        if (!aplicarRegrasGrupo) stageNames.add("GRUPO");
        const hidden = conversas.filter((c) => !stageNames.has(c.status || "NOVO"));
        if (hidden.length === 0) return null;
        return (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-4 py-2.5 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            <span>
              {hidden.length} lead(s) não visível(is) no funil por ter(em) status sem coluna (ex: {hidden[0].status}).{" "}
              <button className="underline hover:text-foreground" onClick={() => setConfigOpen(true)}>
                Configurar Estágios
              </button>
            </span>
          </div>
        );
      })()}

      <StageConfigModal
        open={configOpen}
        onOpenChange={setConfigOpen}
        stages={stages}
        instanceId={selected?.id || ""}
        onSaved={() => { fetchStages(); refreshMissing(); }}
      />
    </Layout>
  );
};

/* ---- Stage Configuration Modal ---- */

interface StageConfigModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stages: EstagioFunil[];
  instanceId: string;
  onSaved: () => void;
}

interface StageRow {
  id?: string;
  nome: string;
  cor: string;
  ordem: number;
  isNew?: boolean;
}

const StageConfigModal = ({ open, onOpenChange, stages, instanceId, onSaved }: StageConfigModalProps) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<StageRow[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<StageRow | null>(null);
  const [moveToStage, setMoveToStage] = useState<string>("");
  const [deleteConversaCount, setDeleteConversaCount] = useState(0);

  useEffect(() => {
    if (open) {
      setRows(
        stages.map((s) => ({ id: s.id, nome: s.nome, cor: s.cor, ordem: s.ordem }))
      );
    }
  }, [open, stages]);

  const addRow = () => {
    setRows([...rows, { nome: "", cor: "#3B82F6", ordem: rows.length + 1, isNew: true }]);
  };

  const updateRow = (idx: number, field: keyof StageRow, value: string | number) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const handleDeleteClick = async (row: StageRow) => {
    if (row.id) {
      const { count } = await supabase
        .from("conversas")
        .select("*", { count: "exact", head: true })
        .eq("instancia_id", instanceId)
        .eq("status", row.nome);
      setDeleteConversaCount(count || 0);
      const otherStages = rows.filter((r) => r !== row);
      setMoveToStage(otherStages.length > 0 ? otherStages[0].nome : "");
    } else {
      setDeleteConversaCount(0);
    }
    setDeleteTarget(row);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.id) {
      const targetStage = deleteConversaCount > 0 ? moveToStage : "NOVO";
      if (deleteConversaCount > 0) {
        await supabase
          .from("conversas")
          .update({ status: targetStage })
          .eq("instancia_id", instanceId)
          .eq("status", deleteTarget.nome);
      }
      await supabase.from("estagios_funil").update({ ativo: false }).eq("id", deleteTarget.id);
    }
    setRows((prev) => prev.filter((r) => r !== deleteTarget));
    setDeleteTarget(null);
    toast({ title: deleteConversaCount > 0 ? `Estágio removido, ${deleteConversaCount} leads movidos para ${moveToStage}` : "Estágio removido" });
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = [...rows];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    // Ensure NOVO stays first
    const novoIdx = reordered.findIndex((r) => r.nome === "NOVO" || (r.id && stages.find((s) => s.id === r.id)?.nome === "NOVO"));
    if (novoIdx > 0) {
      const [novo] = reordered.splice(novoIdx, 1);
      reordered.unshift(novo);
    }
    setRows(reordered.map((r, i) => ({ ...r, ordem: i + 1 })));
  };

  const save = async () => {
    for (const row of rows) {
      if (!row.nome.trim()) {
        toast({ title: "Nome do estágio é obrigatório", variant: "destructive" });
        return;
      }
    }
    // Update existing & insert new
    for (const row of rows) {
      if (row.id) {
        await supabase
          .from("estagios_funil")
          .update({ nome: row.nome, cor: row.cor, ordem: row.ordem })
          .eq("id", row.id);
      } else {
        await supabase
          .from("estagios_funil")
          .insert({ nome: row.nome, cor: row.cor, ordem: row.ordem, instancia_id: instanceId });
      }
    }
    toast({ title: "Estágios salvos" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar Estágios do Funil</DialogTitle>
          </DialogHeader>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="stage-config">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 py-2">
                   {rows.map((row, idx) => {
                    const isNovo = row.nome === "NOVO" || (row.id && stages.find((s) => s.id === row.id)?.nome === "NOVO");
                    return (
                    <Draggable key={row.id || `new-${idx}`} draggableId={row.id || `new-${idx}`} index={idx} isDragDisabled={!!isNovo}>
                      {(prov) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 p-2"
                        >
                          <div {...prov.dragHandleProps} className={`text-muted-foreground ${isNovo ? "opacity-30" : "cursor-grab"}`}>
                            <GripVertical className="h-4 w-4" />
                          </div>
                          <Input
                            value={row.nome}
                            onChange={(e) => updateRow(idx, "nome", e.target.value)}
                            placeholder="Nome"
                            className="flex-1 h-8 text-sm"
                            disabled={!!isNovo}
                          />
                          <input
                            type="color"
                            value={row.cor}
                            onChange={(e) => updateRow(idx, "cor", e.target.value)}
                            className="h-8 w-8 cursor-pointer rounded border-0 p-0"
                          />
                          {isNovo ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="h-8 w-8 flex items-center justify-center opacity-30">
                                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>NOVO é obrigatório — é o status padrão de toda conversa nova</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDeleteClick(row)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      )}
                    </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          <Button variant="outline" size="sm" onClick={addRow} className="w-full">
            <Plus className="mr-1.5 h-4 w-4" /> Adicionar Estágio
          </Button>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover estágio "{deleteTarget?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConversaCount > 0 ? (
                <span className="space-y-2 block">
                  <span className="block">Este estágio tem <strong>{deleteConversaCount}</strong> conversa(s). Escolha para qual estágio mover:</span>
                  <Select value={moveToStage} onValueChange={setMoveToStage}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {rows.filter((r) => r !== deleteTarget).map((r) => (
                        <SelectItem key={r.nome} value={r.nome}>{r.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </span>
              ) : (
                "Este estágio não tem conversas e será removido. Esta ação não pode ser desfeita."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirmar Remoção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Funil;
