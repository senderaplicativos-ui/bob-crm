import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import Layout from "@/components/Layout";
import StatusBadge from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, Globe, Pencil, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatPhone, formatDateBR } from "@/lib/formatters";
import { useOptionsFromDB } from "@/hooks/useOptionsFromDB";

interface Conversa {
  id: string;
  nome: string | null;
  telefone: string;
  origem: string | null;
  status: string | null;
  ultima_mensagem: string | null;
  atualizado_em: string | null;
}

interface Mensagem {
  id: string;
  telefone: string;
  mensagem: string | null;
  direcao: string | null;
  criado_em: string | null;
}

interface Regra {
  texto: string;
  resultado: string;
  tipo_regra: string;
  cor: string | null;
  modo: string;
}

interface RuleMatch {
  start: number;
  end: number;
  resultado: string;
  cor: string | null;
}

function findRuleMatches(text: string, regras: Regra[]): RuleMatch[] {
  const matches: RuleMatch[] = [];
  const lowerText = text.toLowerCase();

  for (const regra of regras) {
    const keywords = regra.texto.split(",").map((k) => k.trim()).filter(Boolean);
    for (const keyword of keywords) {
      const lowerKey = keyword.toLowerCase();
      if (regra.modo === "exact") {
        if (lowerText === lowerKey) {
          matches.push({ start: 0, end: text.length, resultado: regra.resultado, cor: regra.cor });
        }
      } else if (regra.modo === "word") {
        const regex = new RegExp(`\\b${lowerKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) {
          matches.push({ start: m.index, end: m.index + m[0].length, resultado: regra.resultado, cor: regra.cor });
        }
      } else {
        // contains
        let idx = 0;
        while ((idx = lowerText.indexOf(lowerKey, idx)) !== -1) {
          matches.push({ start: idx, end: idx + keyword.length, resultado: regra.resultado, cor: regra.cor });
          idx += keyword.length;
        }
      }
    }
  }
  // Sort by start, remove overlaps
  matches.sort((a, b) => a.start - b.start);
  const deduped: RuleMatch[] = [];
  for (const m of matches) {
    if (deduped.length === 0 || m.start >= deduped[deduped.length - 1].end) {
      deduped.push(m);
    }
  }
  return deduped;
}

function HighlightedMessage({ text, matches }: { text: string; matches: RuleMatch[] }) {
  if (matches.length === 0) return <p>{text}</p>;

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;
  matches.forEach((m, i) => {
    if (m.start > lastEnd) parts.push(<span key={`t${i}`}>{text.slice(lastEnd, m.start)}</span>);
    parts.push(
      <TooltipProvider key={`h${i}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <mark className="rounded px-0.5" style={{ backgroundColor: m.cor ? `${m.cor}33` : "#FBBF2433", color: "inherit" }}>
              {text.slice(m.start, m.end)}
            </mark>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ backgroundColor: m.cor || "#FBBF24" }} />
            → {m.resultado}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    lastEnd = m.end;
  });
  if (lastEnd < text.length) parts.push(<span key="tail">{text.slice(lastEnd)}</span>);
  return <p>{parts}</p>;
}

const ConversationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selected } = useInstance();
  const { statuses, origins } = useOptionsFromDB();
  const [conversa, setConversa] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    const newName = trimmed || null;
    if (newName === (conversa?.nome ?? null)) {
      setEditingName(false);
      return;
    }
    const { error } = await supabase.from("conversas").update({ nome: newName }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar nome", description: error.message, variant: "destructive" });
    } else {
      setConversa((prev) => (prev ? { ...prev, nome: newName } : prev));
      toast({ title: "Nome atualizado" });
    }
    setEditingName(false);
  };

  const startEditingName = () => {
    setNameDraft(conversa?.nome || "");
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  useEffect(() => {
    const fetchData = async () => {
      const convRes = await supabase.from("conversas").select("*").eq("id", id).maybeSingle();

      if (convRes.data) {
        setConversa(convRes.data);

        const msgQuery = supabase
          .from("mensagens")
          .select("*")
          .eq("telefone", convRes.data.telefone)
          .order("criado_em", { ascending: true });
        if (convRes.data.instancia_id) {
          msgQuery.eq("instancia_id", convRes.data.instancia_id);
        }
        const msgRes = await msgQuery;

        if (msgRes.data) setMensagens(msgRes.data);
      }

      // Fetch active rules for highlighting
      if (selected) {
        const { data: regrasData } = await supabase
          .from("regras")
          .select("texto, resultado, tipo_regra, cor, modo")
          .eq("instancia_id", selected.id)
          .eq("ativo", true);
        if (regrasData) setRegras(regrasData as Regra[]);
      }

      setLoading(false);
    };
    fetchData();
  }, [id, selected]);

  const updateField = async (field: string, value: string) => {
    const { error } = await supabase.from("conversas").update({ [field]: value }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      setConversa((prev) => (prev ? { ...prev, [field]: value } : prev));
      toast({ title: "Atualizado com sucesso" });
    }
  };

  if (loading) {
    return (
      <Layout>
        <p className="text-muted-foreground">Carregando...</p>
      </Layout>
    );
  }

  if (!conversa) {
    return (
      <Layout>
        <p className="text-muted-foreground">Conversa não encontrada</p>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/conversations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <Input
                  ref={nameInputRef}
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                  onBlur={saveName}
                  className="h-8 w-48 text-lg font-bold"
                  placeholder="Nome do contato"
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group cursor-pointer" onClick={startEditingName}>
                <h1 className="text-xl font-bold text-foreground">{conversa.nome || "Sem nome"}</h1>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {formatPhone(conversa.telefone)}
              </span>
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" /> {conversa.origem || "—"}
              </span>
            </div>
          </div>
        </div>
        <StatusBadge status={conversa.status || "NOVO"} className="self-start text-sm" />
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select value={conversa.status || "NOVO"} onValueChange={(v) => updateField("status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Origem</label>
          <Select value={conversa.origem || ""} onValueChange={(v) => updateField("origem", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {origins.map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Messages */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Mensagens</h2>
        </div>
        <div className="max-h-[500px] overflow-y-auto p-4 space-y-3">
          {mensagens.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhuma mensagem encontrada</p>
          ) : (
            mensagens.map((msg) => {
              const isSaida = msg.direcao === "saida";
              const matches = msg.mensagem ? findRuleMatches(msg.mensagem, regras) : [];
              return (
                <div key={msg.id} className={cn("flex flex-col", isSaida ? "items-end" : "items-start")}>
                  <span className="mb-0.5 text-[10px] text-muted-foreground">{isSaida ? (selected?.nome || "Você") : (conversa.nome || "Lead")}</span>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                      isSaida
                        ? "bg-[#D1FAE5] text-gray-900 rounded-br-md dark:bg-emerald-900/60 dark:text-emerald-50"
                        : "bg-[#F3F4F6] text-gray-900 rounded-bl-md dark:bg-secondary dark:text-secondary-foreground"
                    )}
                  >
                    {msg.mensagem ? <HighlightedMessage text={msg.mensagem} matches={matches} /> : <p />}
                    {matches.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {[...new Set(matches.map((m) => m.resultado))].map((r) => {
                          const cor = matches.find((m) => m.resultado === r)?.cor;
                          return (
                            <span key={r} className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${cor || "#FBBF24"}22`, color: cor || "#92400E" }}>
                              → {r}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <p className={cn("mt-1 text-[10px]", isSaida ? "text-gray-600 dark:text-emerald-200/70" : "text-muted-foreground/70")}>
                      {formatDateBR(msg.criado_em)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ConversationDetail;
