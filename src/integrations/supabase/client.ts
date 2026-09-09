// Compatibilidade com a API do Supabase, mas usando MongoDB por baixo.
// Mantém o mesmo caminho de import e a mesma API encadeável que as telas já usam:
//   import { supabase } from "@/integrations/supabase/client";
//   const { data, error } = await supabase.from("mensagens").select("*").eq("id", x).single();
//
// Em vez de falar com o PostgREST, serializa a consulta e envia para /api/query,
// que traduz para operações MongoDB no servidor (Vercel serverless).

import type { Database } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';
const API_TOKEN = (import.meta.env.VITE_API_TOKEN as string | undefined) || '';

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'not';

interface Filter {
  column: string;
  op: FilterOp;
  value: unknown;
}

interface OrderSpec {
  column: string;
  ascending: boolean;
}

interface OrClause {
  expr: string;
}

interface QueryPayload {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  filters?: Filter[];
  or?: OrClause[];
  order?: OrderSpec[];
  limit?: number;
  single?: boolean;
  maybeSingle?: boolean;
  count?: 'exact';
  head?: boolean;
  values?: unknown;
  onConflict?: string;
}

interface Result<T = unknown> {
  data: T;
  error: { message: string; code?: string } | null;
  count: number | null;
  status: number;
  statusText: string;
}

async function runQuery(payload: QueryPayload): Promise<Result> {
  try {
    const res = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': API_TOKEN,
      },
      body: JSON.stringify(payload),
    });

    let body: { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null } = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }

    if (!res.ok) {
      return {
        data: null,
        error: body.error ?? { message: `HTTP ${res.status} ${res.statusText}` },
        count: body.count ?? null,
        status: res.status,
        statusText: res.statusText,
      };
    }

    return {
      data: body.data ?? null,
      error: body.error ?? null,
      count: body.count ?? null,
      status: res.status,
      statusText: res.statusText,
    };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Erro de rede' },
      count: null,
      status: 0,
      statusText: 'network error',
    };
  }
}

// Builder encadeável e "thenable" (pode dar await direto), imitando o PostgrestFilterBuilder.
class QueryBuilder<T = unknown> implements PromiseLike<Result<T>> {
  private payload: QueryPayload;

  constructor(table: string) {
    this.payload = { table, operation: 'select', filters: [] };
  }

  // ---- seleção de ação ----
  // .select() serve tanto para consultar quanto para pedir o retorno das linhas
  // após insert/update/upsert/delete. Só muda a operação se ainda for a padrão (select).
  select(_columns = '*', opts?: { count?: 'exact'; head?: boolean }): this {
    if (opts?.count) this.payload.count = opts.count;
    if (opts?.head) this.payload.head = opts.head;
    return this;
  }

  insert(values: unknown): this {
    this.payload.operation = 'insert';
    this.payload.values = values;
    return this;
  }

  update(values: unknown): this {
    this.payload.operation = 'update';
    this.payload.values = values;
    return this;
  }

  upsert(values: unknown, opts?: { onConflict?: string }): this {
    this.payload.operation = 'upsert';
    this.payload.values = values;
    if (opts?.onConflict) this.payload.onConflict = opts.onConflict;
    return this;
  }

  delete(): this {
    this.payload.operation = 'delete';
    return this;
  }

  // ---- filtros ----
  private addFilter(column: string, op: FilterOp, value: unknown): this {
    (this.payload.filters ??= []).push({ column, op, value });
    return this;
  }

  eq(column: string, value: unknown): this { return this.addFilter(column, 'eq', value); }
  neq(column: string, value: unknown): this { return this.addFilter(column, 'neq', value); }
  gt(column: string, value: unknown): this { return this.addFilter(column, 'gt', value); }
  gte(column: string, value: unknown): this { return this.addFilter(column, 'gte', value); }
  lt(column: string, value: unknown): this { return this.addFilter(column, 'lt', value); }
  lte(column: string, value: unknown): this { return this.addFilter(column, 'lte', value); }
  in(column: string, values: unknown[]): this { return this.addFilter(column, 'in', values); }
  is(column: string, value: unknown): this { return this.addFilter(column, 'is', value); }
  not(column: string, _op: string, value: unknown): this { return this.addFilter(column, 'not', value); }

  // .or("col.eq.x,col2.gt.10") — mantém a mesma expressão do PostgREST; o backend a interpreta.
  or(expression: string): this {
    (this.payload.or ??= []).push({ expr: expression });
    return this;
  }

  // ---- modificadores ----
  order(column: string, opts?: { ascending?: boolean }): this {
    (this.payload.order ??= []).push({ column, ascending: opts?.ascending ?? true });
    return this;
  }

  limit(n: number): this {
    this.payload.limit = n;
    return this;
  }

  // .range(from, to) do PostgREST é inclusivo nos dois extremos.
  // Sem offset no backend, aproximamos limitando a quantidade de linhas.
  range(from: number, to: number): this {
    this.payload.limit = Math.max(0, to - from + 1);
    return this;
  }

  single(): this {
    this.payload.single = true;
    return this;
  }

  maybeSingle(): this {
    this.payload.maybeSingle = true;
    return this;
  }

  // ---- execução (thenable) ----
  then<TResult1 = Result<T>, TResult2 = never>(
    onfulfilled?: ((value: Result<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return runQuery(this.payload).then(onfulfilled as never, onrejected);
  }
}

// Auth mínimo: o app usa login fake em localStorage (AuthContext), então
// só precisamos manter as chamadas existentes sem quebrar.
const auth = {
  async getSession() {
    return { data: { session: null }, error: null };
  },
  async getUser() {
    return { data: { user: null }, error: null };
  },
  onAuthStateChange(_cb: unknown) {
    return { data: { subscription: { unsubscribe() {} } } };
  },
  async signOut() {
    return { error: null };
  },
};

export const supabase = {
  from<K extends keyof Database['public']['Tables'] & string>(table: K) {
    return new QueryBuilder(table);
  },
  auth,
};
