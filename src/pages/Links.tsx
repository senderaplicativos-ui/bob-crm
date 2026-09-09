import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Copy, Trash2, RefreshCw, Link as LinkIcon, Check, Pencil } from "lucide-react";
import OriginBadge from "@/components/OriginBadge";
import { useToast } from "@/hooks/use-toast";

interface LinkRastreavel {
  id: string;
  instancia_id: string | null;
  nome: string;
  source: string;
  campaign: string | null;
  ad: string | null;
  mensagem_personalizada: string | null;
  url_gerada: string | null;
  cliques: number | null;
  ativo: boolean | null;
  criado_em: string | null;
}

const WEBHOOK_BASE = "https://whatsapp-webhook-liart.vercel.app";

const Links = () => {
  const { selected } = useInstance();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [links, setLinks] = useState<LinkRastreavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<LinkRastreavel | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Form state
  const [nome, setNome] = useState("");
  const [source, setSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const [ad, setAd] = useState("");
  const [mensagem, setMensagem] = useState("Olá! Quero mais informações");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editNome, setEditNome] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editCampaign, setEditCampaign] = useState("");
  const [editAd, setEditAd] = useState("");
  const [editMensagem, setEditMensagem] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const fetchLinks = async () => {
    if (!selected) { navigate("/"); return; }
    setLoading(true);
    const { data } = await supabase
      .from("links_rastreavel")
      .select("*")
      .eq("instancia_id", selected.id)
      .order("criado_em", { ascending: false });
    if (data) setLinks(data as LinkRastreavel[]);
    setLoading(false);
  };

  useEffect(() => { fetchLinks(); }, [selected]);

  const resetForm = () => {
    setNome(""); setSource(""); setCampaign(""); setAd("");
    setMensagem("Olá! Quero mais informações"); setGeneratedUrl("");
  };

  const buildUrl = () => {
    if (!selected?.evolution_instance_name || !source) return "";
    const params = new URLSearchParams();
    params.set("s", source);
    if (campaign) params.set("c", campaign);
    if (ad) params.set("a", ad);
    if (mensagem) params.set("t", mensagem);
    return `${WEBHOOK_BASE}/go/${selected.evolution_instance_name}?${params.toString()}`;
  };

  const handleSave = async () => {
    if (!selected || !nome.trim() || !source.trim()) return;
    setSaving(true);
    const url = buildUrl();
    const { error } = await supabase.from("links_rastreavel").insert({
      instancia_id: selected.id,
      nome: nome.trim(),
      source: source.trim(),
      campaign: campaign.trim() || null,
      ad: ad.trim() || null,
      mensagem_personalizada: mensagem.trim() || null,
      url_gerada: url,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      setGeneratedUrl(url);
      toast({ title: "Link criado com sucesso!" });
      fetchLinks();
    }
  };

  const toggleAtivo = async (link: LinkRastreavel) => {
    await supabase.from("links_rastreavel").update({ ativo: !link.ativo }).eq("id", link.id);
    fetchLinks();
  };

  const deleteLink = async (id: string) => {
    await supabase.from("links_rastreavel").delete().eq("id", id);
    fetchLinks();
  };

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Link copiado!" });
  };

  const openEdit = (link: LinkRastreavel) => {
    setEditingLink(link);
    setEditNome(link.nome);
    setEditSource(link.source);
    setEditCampaign(link.campaign || "");
    setEditAd(link.ad || "");
    setEditMensagem(link.mensagem_personalizada || "");
    setEditDialogOpen(true);
  };

  const buildEditUrl = () => {
    if (!selected?.evolution_instance_name || !editSource) return "";
    const params = new URLSearchParams();
    params.set("s", editSource);
    if (editCampaign) params.set("c", editCampaign);
    if (editAd) params.set("a", editAd);
    if (editMensagem) params.set("t", editMensagem);
    return `${WEBHOOK_BASE}/go/${selected.evolution_instance_name}?${params.toString()}`;
  };

  const handleEditSave = async () => {
    if (!editingLink || !editNome.trim() || !editSource.trim()) return;
    setEditSaving(true);
    const url = buildEditUrl();
    const { error } = await supabase.from("links_rastreavel").update({
      nome: editNome.trim(),
      source: editSource.trim(),
      campaign: editCampaign.trim() || null,
      ad: editAd.trim() || null,
      mensagem_personalizada: editMensagem.trim() || null,
      url_gerada: url,
    }).eq("id", editingLink.id);
    setEditSaving(false);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Link atualizado com sucesso!" });
      setEditDialogOpen(false);
      fetchLinks();
    }
  };

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Links Rastreáveis</h1>
          <p className="text-sm text-muted-foreground">{links.length} links cadastrados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchLinks} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Criar Link</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Criar Link Rastreável</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Nome do link *</Label>
                  <Input placeholder="Meta Ads - Campanha Verão" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div>
                  <Label>Fonte / Source *</Label>
                  <Input placeholder="meta_ads, google_ads, instagram_bio" value={source} onChange={(e) => setSource(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Campanha (opcional)</Label>
                    <Input placeholder="verao2026" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
                  </div>
                  <div>
                    <Label>Anúncio (opcional)</Label>
                    <Input placeholder="stories_01" value={ad} onChange={(e) => setAd(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Mensagem personalizada</Label>
                  <Textarea placeholder="Olá! Quero mais informações" value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2} />
                </div>

                {generatedUrl ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <p className="mb-2 text-sm font-medium text-foreground">URL gerada:</p>
                    <p className="mb-3 break-all text-xs text-muted-foreground">{generatedUrl}</p>
                    <Button className="w-full" onClick={() => copyUrl(generatedUrl, "new")}>
                      {copiedId === "new" ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                      {copiedId === "new" ? "Copiado!" : "Copiar Link"}
                    </Button>
                  </div>
                ) : (
                  <Button className="w-full" onClick={handleSave} disabled={saving || !nome.trim() || !source.trim()}>
                    {saving ? "Salvando..." : "Salvar e Gerar Link"}
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Links list */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fonte</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Campanha</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Anúncio</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cliques</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : links.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhum link cadastrado</td></tr>
              ) : (
                links.map((link) => (
                  <tr key={link.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{link.nome}</td>
                    <td className="px-4 py-3"><OriginBadge origin={link.source} size="sm" /></td>
                    <td className="px-4 py-3 text-muted-foreground">{link.campaign || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{link.ad || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{link.cliques ?? 0}</td>
                    <td className="px-4 py-3">
                      <Switch checked={link.ativo !== false} onCheckedChange={() => toggleAtivo(link)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(link)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {link.url_gerada && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyUrl(link.url_gerada!, link.id)}>
                            {copiedId === link.id ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteLink(link.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      <Dialog open={editDialogOpen} onOpenChange={(o) => { setEditDialogOpen(o); if (!o) setEditingLink(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Link Rastreável</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Nome do link *</Label>
              <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
            </div>
            <div>
              <Label>Fonte / Source *</Label>
              <Input value={editSource} onChange={(e) => setEditSource(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Campanha (opcional)</Label>
                <Input value={editCampaign} onChange={(e) => setEditCampaign(e.target.value)} />
              </div>
              <div>
                <Label>Anúncio (opcional)</Label>
                <Input value={editAd} onChange={(e) => setEditAd(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Mensagem personalizada</Label>
              <Textarea value={editMensagem} onChange={(e) => setEditMensagem(e.target.value)} rows={2} />
            </div>
            <Button className="w-full" onClick={handleEditSave} disabled={editSaving || !editNome.trim() || !editSource.trim()}>
              {editSaving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Links;
