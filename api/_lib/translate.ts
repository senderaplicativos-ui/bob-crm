// Traduz payloads no estilo PostgREST (Supabase) para operacoes MongoDB.
import type { Db } from "mongodb";
import { randomUUID } from "crypto";

export type FilterOp =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "is" | "not";

export interface Filter {
  column: string;
  op: FilterOp;
  value: unknown;
}

export interface OrClause {
  expr: string; // ex: "nome.eq.joao,idade.gt.10"
}

export interface OrderSpec {
  column: string;
  ascending: boolean;
}

export type Operation =
  | "select" | "insert" | "update" | "delete" | "upsert";

export interface QueryPayload {
  table: string;
  operation: Operation;
  filters?: Filter[];
  or?: OrClause[];
  order?: OrderSpec[];
  limit?: number;
  // select
  count?: "exact" | null;
  head?: boolean;
  single?: boolean;
  maybeSingle?: boolean;
  // insert/update/upsert
  values?: Record<string, unknown> | Record<string, unknown>[];
  // upsert
  onConflict?: string;
}

export const KNOWN_COLLECTIONS = new Set<string>([
  "instancias",
  "conversas",
  "mensagens",
  "estagios_funil",
  "regras",
  "links_rastreavel",
  "cliques_rastreavel",
  "meta_config",
  "mapeamento_eventos",
  "log_eventos_meta",
  "log_erros",
  "configuracoes",
]);

export function uuid(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

// Remove o _id interno do Mongo antes de devolver ao cliente.
function clean<T extends Record<string, unknown>>(doc: T | null): T | null {
  if (!doc) return doc;
  const { _id, ...rest } = doc as Record<string, unknown>;
  return rest as T;
}

function withDefaults(doc: Record<string, unknown>): Record<string, unknown> {
  const out = { ...doc };
  if (out.id === undefined || out.id === null) out.id = uuid();
  if (out.criado_em === undefined || out.criado_em === null) {
    out.criado_em = nowIso();
  }
  return out;
}

function coerce(value: unknown): unknown {
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function filterToMongo(f: Filter): Record<string, unknown> {
  const col = f.column;
  switch (f.op) {
    case "eq":
      return { [col]: f.value };
    case "neq":
      return { [col]: { $ne: f.value } };
    case "gt":
      return { [col]: { $gt: f.value } };
    case "gte":
      return { [col]: { $gte: f.value } };
    case "lt":
      return { [col]: { $lt: f.value } };
    case "lte":
      return { [col]: { $lte: f.value } };
    case "in":
      return { [col]: { $in: Array.isArray(f.value) ? f.value : [f.value] } };
    case "is":
      return { [col]: coerce(f.value) };
    case "not":
      return { [col]: { $ne: coerce(f.value) } };
    default:
      return {};
  }
}

// Converte "col.op.value,col2.op2.value2" (semantica OR do PostgREST).
function orToMongo(clause: OrClause): Record<string, unknown> {
  const parts = clause.expr.split(",");
  const conditions: Record<string, unknown>[] = [];
  for (const part of parts) {
    const [column, op, ...rest] = part.split(".");
    const raw = rest.join(".");
    conditions.push(filterToMongo({ column, op: op as FilterOp, value: coerce(raw) }));
  }
  return conditions.length ? { $or: conditions } : {};
}

function buildMongoFilter(payload: QueryPayload): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  for (const f of payload.filters ?? []) and.push(filterToMongo(f));
  for (const o of payload.or ?? []) and.push(orToMongo(o));
  if (and.length === 0) return {};
  if (and.length === 1) return and[0];
  return { $and: and };
}

export interface QueryResult {
  data: unknown;
  error: { message: string } | null;
  count: number | null;
}

export async function executeQuery(
  db: Db,
  payload: QueryPayload
): Promise<QueryResult> {
  if (!KNOWN_COLLECTIONS.has(payload.table)) {
    return { data: null, error: { message: `Tabela desconhecida: ${payload.table}` }, count: null };
  }

  const col = db.collection(payload.table);
  const filter = buildMongoFilter(payload);

  try {
    switch (payload.operation) {
      case "select": {
        const wantCount = payload.count === "exact";
        let count: number | null = null;
        if (wantCount) {
          count = await col.countDocuments(filter);
          if (payload.head) {
            return { data: null, error: null, count };
          }
        }

        let cursor = col.find(filter);
        if (payload.order && payload.order.length) {
          const sort: Record<string, 1 | -1> = {};
          for (const o of payload.order) sort[o.column] = o.ascending ? 1 : -1;
          cursor = cursor.sort(sort);
        }
        if (typeof payload.limit === "number") cursor = cursor.limit(payload.limit);

        const docs = (await cursor.toArray()).map((d) => clean(d as Record<string, unknown>));

        if (payload.single) {
          if (docs.length !== 1) {
            return {
              data: null,
              error: { message: `Esperava 1 linha, obteve ${docs.length}` },
              count,
            };
          }
          return { data: docs[0], error: null, count };
        }
        if (payload.maybeSingle) {
          return { data: docs[0] ?? null, error: null, count };
        }
        return { data: docs, error: null, count };
      }

      case "insert": {
        const values = Array.isArray(payload.values)
          ? payload.values
          : [payload.values ?? {}];
        const prepared = values.map((v) => withDefaults(v as Record<string, unknown>));
        await col.insertMany(prepared as any[]);
        const out = prepared.map((d) => clean({ ...d }));
        return { data: out, error: null, count: out.length };
      }

      case "update": {
        const patch = { ...(payload.values as Record<string, unknown>), atualizado_em: nowIso() };
        delete (patch as Record<string, unknown>)._id;
        await col.updateMany(filter, { $set: patch });
        const docs = (await col.find(filter).toArray()).map((d) =>
          clean(d as Record<string, unknown>)
        );
        return { data: docs, error: null, count: docs.length };
      }

      case "delete": {
        const docs = (await col.find(filter).toArray()).map((d) =>
          clean(d as Record<string, unknown>)
        );
        await col.deleteMany(filter);
        return { data: docs, error: null, count: docs.length };
      }

      case "upsert": {
        const values = Array.isArray(payload.values)
          ? payload.values
          : [payload.values ?? {}];
        const conflictKey = payload.onConflict || (payload.table === "configuracoes" ? "chave" : "id");
        const out: Record<string, unknown>[] = [];
        for (const raw of values) {
          const doc = withDefaults(raw as Record<string, unknown>);
          const keyVal = doc[conflictKey];
          const query = { [conflictKey]: keyVal };
          const { id, criado_em, _id, ...mutable } = doc as Record<string, unknown>;
          await col.updateOne(
            query,
            {
              $set: { ...mutable, atualizado_em: nowIso() },
              $setOnInsert: { id, criado_em },
            },
            { upsert: true }
          );
          const saved = await col.findOne(query);
          out.push(clean(saved as Record<string, unknown>) as Record<string, unknown>);
        }
        return { data: out, error: null, count: out.length };
      }

      default:
        return { data: null, error: { message: `Operacao invalida: ${payload.operation}` }, count: null };
    }
  } catch (err: any) {
    return { data: null, error: { message: err?.message ?? "Erro desconhecido" }, count: null };
  }
}
