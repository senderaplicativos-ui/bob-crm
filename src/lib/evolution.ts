// Cliente do proxy da Evolution API (EVO).
//
// O navegador não fala direto com a EVO (CORS + apikey no header), então
// tudo passa pelo endpoint /api/evolution do próprio bob-crm, que repassa a
// requisição e normaliza a resposta. Mesmo padrão de token do shim de dados.

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") || "";
const API_TOKEN = (import.meta.env.VITE_API_TOKEN as string | undefined) || "";

export type EvoAction = "create" | "connect" | "status" | "delete" | "logout" | "restart";

export interface EvoParams {
  action: EvoAction;
  instanceName: string;
  evolutionUrl: string;
  evolutionApiKey: string;
  clientName?: string;
}

export interface EvoResult {
  ok: boolean;
  state: string | null;
  qrcode: string | null;
  number: string | null;
  raw: unknown;
  error: { message: string; status?: number } | null;
  status: number;
}

export async function callEvolution(params: EvoParams): Promise<EvoResult> {
  try {
    const res = await fetch(`${API_BASE}/api/evolution`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": API_TOKEN,
      },
      body: JSON.stringify(params),
    });

    let body: any = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }

    if (!res.ok) {
      return {
        ok: false,
        state: null,
        qrcode: null,
        number: null,
        raw: body?.raw ?? null,
        error: body?.error ?? { message: `HTTP ${res.status}`, status: res.status },
        status: res.status,
      };
    }

    return {
      ok: true,
      state: body?.state ?? null,
      qrcode: body?.qrcode ?? null,
      number: body?.number ?? null,
      raw: body?.raw ?? null,
      error: null,
      status: res.status,
    };
  } catch (err) {
    return {
      ok: false,
      state: null,
      qrcode: null,
      number: null,
      raw: null,
      error: { message: err instanceof Error ? err.message : "Erro de rede" },
      status: 0,
    };
  }
}

// Indica se a mensagem de erro da EVO é "instância já existe".
export function isAlreadyExists(err: { message?: string } | null): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  return m.includes("already") || m.includes("já existe") || m.includes("in use");
}
