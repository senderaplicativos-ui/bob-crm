// Página PÚBLICA de conexão (QR code para o cliente final).
//
// Fora do login: quem abre é o cliente da empresa, que só precisa escanear o
// QR. Chama o endpoint público /api/conectar, que resolve a apikey no servidor
// e devolve apenas o QR (a apikey nunca chega ao navegador). Faz polling até
// a instância conectar.

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2, MessageSquare, AlertTriangle } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") || "";

interface ConectarResponse {
  ok: boolean;
  state: string | null;
  connected: boolean;
  qrcode: string | null;
  nome?: string;
  error?: string;
}

const Conectar = () => {
  const { name } = useParams<{ name: string }>();
  const [qr, setQr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [nome, setNome] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = async () => {
    if (!name) return;
    try {
      const res = await fetch(`${API_BASE}/api/conectar?i=${encodeURIComponent(name)}`);
      const body: ConectarResponse = await res.json();
      if (body.nome) setNome(body.nome);
      if (body.connected || body.state === "open") {
        setConnected(true);
        setQr(null);
        if (pollingRef.current) clearInterval(pollingRef.current);
      } else if (body.ok) {
        setQr(body.qrcode);
        setError(null);
      } else {
        setError(body.error || "Não foi possível gerar o QR Code.");
      }
    } catch {
      setError("Erro de conexão. Tente novamente em instantes.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchState();
    pollingRef.current = setInterval(fetchState, 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
          <MessageSquare className="h-6 w-6 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Conectar WhatsApp</h1>
        {nome && <p className="mt-1 text-sm text-muted-foreground">{nome}</p>}

        <div className="mt-6">
          {connected ? (
            <div className="py-6">
              <CheckCircle2 className="mx-auto h-16 w-16 text-primary mb-4" />
              <p className="font-medium text-foreground">WhatsApp conectado!</p>
              <p className="mt-1 text-sm text-muted-foreground">Já pode fechar esta página.</p>
            </div>
          ) : error ? (
            <div className="py-6">
              <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
              <p className="text-sm text-destructive">{error}</p>
              <p className="mt-2 text-xs text-muted-foreground">A página tentará novamente automaticamente.</p>
            </div>
          ) : loading || !qr ? (
            <div className="flex h-64 w-64 mx-auto items-center justify-center rounded-lg border border-border">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Abra o WhatsApp no celular, vá em Aparelhos conectados e escaneie o código abaixo.
              </p>
              <img
                src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                alt="QR Code"
                className="mx-auto h-64 w-64 rounded-lg border border-border"
              />
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Aguardando leitura...
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Conectar;
