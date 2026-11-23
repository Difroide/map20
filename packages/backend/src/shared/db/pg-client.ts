import { Pool, types } from 'pg';

/**
 * Cliente Postgres com a MESMA interface do supabase-js que o código usa
 * (from/select/insert/update/upsert/delete/filtros/single/rpc), falando SQL
 * direto num Postgres puro — sem PostgREST, sem Supabase.
 *
 * Existe para a migração Supabase → Postgres do Coolify não tocar nos 39
 * serviços que consultam o banco: eles continuam chamando
 * `this.supabase.getClient().from('tabela')...` e recebendo `{ data, error }`.
 *
 * Cobre só o subconjunto que o código usa. Join embutido no select
 * (`select('*, outra(*)')`) não é suportado — o projeto não usa.
 */

// O supabase-js entrega timestamps como string ISO (JSON do PostgREST), e o
// código e o frontend contam com isso (comparações, date-fns). O driver pg
// entrega Date por padrão — aqui volta a ser string ISO.
types.setTypeParser(1184, (v: string) => (v === null ? null : new Date(v).toISOString())); // timestamptz
types.setTypeParser(1114, (v: string) => (v === null ? null : v.replace(' ', 'T'))); // timestamp
types.setTypeParser(1082, (v: string) => v); // date
// int8/numeric chegam como number, como no JSON do PostgREST.
types.setTypeParser(20, (v: string) => (v === null ? null : Number(v)));
types.setTypeParser(1700, (v: string) => (v === null ? null : Number(v)));

export interface PgError {
  message: string;
  code?: string;
  details?: string;
}

export interface PgResult<T = any> {
  // `T[] | null` para listas e `T | null` para single/maybeSingle, como o
  // supabase-js: é o que dá tipo contextual aos callbacks de .filter/.map
  // nos call sites.
  data: T | null;
  error: PgError | null;
  count: number | null;
}

/** `metadata->>subscription_id` vira `"metadata"->>'subscription_id'`. */
function colExpr(col: string): string {
  const m = col.match(/^([a-zA-Z_][a-zA-Z0-9_]*)((->>?.+)*)$/);
  if (!m) throw new Error(`coluna inválida: ${col}`);
  const [, ident, path] = m;
  if (!path) return `"${ident}"`;
  const parts = path.split(/(->>|->)/).filter(Boolean);
  let expr = `"${ident}"`;
  for (let i = 0; i < parts.length; i += 2) {
    expr += `${parts[i]}'${parts[i + 1].replace(/'/g, "''")}'`;
  }
  return expr;
}

function selectList(cols: string): string {
  if (cols.trim() === '*') return '*';
  return cols
    .split(',')
    .map((c) => colExpr(c.trim()))
    .join(', ');
}

type Op = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in';

const OPS: Record<Op, string> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  ilike: 'ILIKE',
  is: 'IS',
  in: 'IN',
};

export class QueryBuilder<T = any[]> implements PromiseLike<PgResult<T>> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private cols = '*';
  private countMode: 'exact' | null = null;
  private headOnly = false;
  private rows: Record<string, any>[] = [];
  private patch: Record<string, any> | null = null;
  private onConflictCols: string | null = null;
  private ignoreDuplicates = false;
  // select() depois de insert/update/delete = RETURNING
  private returning: string | null = null;
  private conds: string[] = [];
  private params: any[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private mode: 'many' | 'single' | 'maybeSingle' = 'many';

  constructor(
    private readonly pool: Pool,
    private readonly table: string,
  ) {}

  private param(v: any): string {
    this.params.push(v);
    return `$${this.params.length}`;
  }

  select(cols = '*', opts?: { count?: 'exact'; head?: boolean }): this {
    if (this.op === 'select') {
      this.cols = cols;
      if (opts?.count) this.countMode = opts.count;
      if (opts?.head) this.headOnly = true;
    } else {
      this.returning = cols;
    }
    return this;
  }

  insert(values: Record<string, any> | Record<string, any>[]): this {
    this.op = 'insert';
    this.rows = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(
    values: Record<string, any> | Record<string, any>[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    this.op = 'upsert';
    this.rows = Array.isArray(values) ? values : [values];
    this.onConflictCols = opts?.onConflict ?? null;
    this.ignoreDuplicates = opts?.ignoreDuplicates ?? false;
    return this;
  }

  update(values: Record<string, any>): this {
    this.op = 'update';
    this.patch = values;
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  eq(col: string, v: any): this {
    this.conds.push(v === null ? `${colExpr(col)} IS NULL` : `${colExpr(col)} = ${this.param(v)}`);
    return this;
  }

  neq(col: string, v: any): this {
    this.conds.push(`${colExpr(col)} <> ${this.param(v)}`);
    return this;
  }

  gt(col: string, v: any): this {
    this.conds.push(`${colExpr(col)} > ${this.param(v)}`);
    return this;
  }

  gte(col: string, v: any): this {
    this.conds.push(`${colExpr(col)} >= ${this.param(v)}`);
    return this;
  }

  lt(col: string, v: any): this {
    this.conds.push(`${colExpr(col)} < ${this.param(v)}`);
    return this;
  }

  lte(col: string, v: any): this {
    this.conds.push(`${colExpr(col)} <= ${this.param(v)}`);
    return this;
  }

  in(col: string, values: any[]): this {
    this.conds.push(`${colExpr(col)} = ANY(${this.param(values)})`);
    return this;
  }

  is(col: string, v: null | boolean): this {
    this.conds.push(`${colExpr(col)} IS ${v === null ? 'NULL' : v ? 'TRUE' : 'FALSE'}`);
    return this;
  }

  not(col: string, op: string, v: any): this {
    if (op === 'is' && v === null) {
      this.conds.push(`${colExpr(col)} IS NOT NULL`);
    } else {
      const sql = OPS[op as Op];
      if (!sql) throw new Error(`not(): operador não suportado: ${op}`);
      this.conds.push(`NOT (${colExpr(col)} ${sql} ${this.param(v)})`);
    }
    return this;
  }

  /** Sintaxe PostgREST: 'amount.is.null,customer_email.is.null' (OR). */
  or(expr: string): this {
    const parts = expr.split(',').map((seg) => {
      const [col, op, ...rest] = seg.trim().split('.');
      const value = rest.join('.');
      if (op === 'is' && value === 'null') return `${colExpr(col)} IS NULL`;
      const sql = OPS[op as Op];
      if (!sql || op === 'is' || op === 'in') throw new Error(`or(): segmento não suportado: ${seg}`);
      return `${colExpr(col)} ${sql} ${this.param(value)}`;
    });
    this.conds.push(`(${parts.join(' OR ')})`);
    return this;
  }

  filter(col: string, op: string, value: any): this {
    if (op === 'is' && (value === null || value === 'null')) {
      this.conds.push(`${colExpr(col)} IS NULL`);
      return this;
    }
    const sql = OPS[op as Op];
    if (!sql) throw new Error(`filter(): operador não suportado: ${op}`);
    if (op === 'in') {
      const list = Array.isArray(value)
        ? value
        : String(value).replace(/^\(|\)$/g, '').split(',');
      this.conds.push(`${colExpr(col)} = ANY(${this.param(list)})`);
    } else {
      this.conds.push(`${colExpr(col)} ${sql} ${this.param(value)}`);
    }
    return this;
  }

  match(obj: Record<string, any>): this {
    for (const [col, v] of Object.entries(obj)) this.eq(col, v);
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push(`${colExpr(col)} ${opts?.ascending === false ? 'DESC' : 'ASC'}`);
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  range(from: number, to: number): this {
    this.limitN = to - from + 1;
    this.offsetN = from;
    return this;
  }

  single(): QueryBuilder<any> {
    this.mode = 'single';
    return this as unknown as QueryBuilder<any>;
  }

  maybeSingle(): QueryBuilder<any> {
    this.mode = 'maybeSingle';
    return this as unknown as QueryBuilder<any>;
  }

  private buildSelect(): string {
    const where = this.conds.length ? ` WHERE ${this.conds.join(' AND ')}` : '';
    const order = this.orders.length ? ` ORDER BY ${this.orders.join(', ')}` : '';
    const limit = this.limitN !== null ? ` LIMIT ${this.limitN}` : '';
    const offset = this.offsetN !== null ? ` OFFSET ${this.offsetN}` : '';
    return `SELECT ${selectList(this.cols)} FROM "${this.table}"${where}${order}${limit}${offset}`;
  }

  private buildMutation(): string {
    const ret = this.returning !== null ? ` RETURNING ${selectList(this.returning || '*')}` : '';
    const where = this.conds.length ? ` WHERE ${this.conds.join(' AND ')}` : '';

    if (this.op === 'update') {
      const sets = Object.entries(this.patch!).map(([k, v]) => `"${k}" = ${this.param(v)}`);
      return `UPDATE "${this.table}" SET ${sets.join(', ')}${where}${ret}`;
    }

    if (this.op === 'delete') {
      return `DELETE FROM "${this.table}"${where}${ret}`;
    }

    // insert / upsert — colunas = união das chaves; chave ausente numa linha
    // vira DEFAULT para o default da coluna (id, created_at) valer.
    const keys = [...new Set(this.rows.flatMap((r) => Object.keys(r)))];
    const tuples = this.rows
      .map(
        (r) =>
          `(${keys
            .map((k) => (Object.prototype.hasOwnProperty.call(r, k) ? this.param(r[k]) : 'DEFAULT'))
            .join(', ')})`,
      )
      .join(', ');
    let sql = `INSERT INTO "${this.table}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES ${tuples}`;
    if (this.op === 'upsert') {
      const conflict = this.onConflictCols
        ? `(${this.onConflictCols.split(',').map((c) => `"${c.trim()}"`).join(', ')})`
        : '';
      if (this.ignoreDuplicates) {
        sql += ` ON CONFLICT ${conflict} DO NOTHING`;
      } else {
        const conflictSet = new Set((this.onConflictCols ?? '').split(',').map((c) => c.trim()));
        const updates = keys.filter((k) => !conflictSet.has(k)).map((k) => `"${k}" = EXCLUDED."${k}"`);
        sql += updates.length
          ? ` ON CONFLICT ${conflict} DO UPDATE SET ${updates.join(', ')}`
          : ` ON CONFLICT ${conflict} DO NOTHING`;
      }
    }
    return sql + ret;
  }

  private async run(): Promise<PgResult<any>> {
    try {
      let count: number | null = null;

      if (this.op === 'select' && this.countMode) {
        const where = this.conds.length ? ` WHERE ${this.conds.join(' AND ')}` : '';
        const res = await this.pool.query(
          `SELECT count(*)::int AS n FROM "${this.table}"${where}`,
          this.params,
        );
        count = res.rows[0]?.n ?? 0;
        if (this.headOnly) return { data: null, error: null, count };
      }

      const sql = this.op === 'select' ? this.buildSelect() : this.buildMutation();
      const res = await this.pool.query(sql, this.params);
      const rows = this.op === 'select' || this.returning !== null ? res.rows : null;

      if (this.mode === 'single') {
        if (!rows || rows.length !== 1) {
          return {
            data: null,
            error: {
              message: `JSON object requested, multiple (or no) rows returned (${rows?.length ?? 0})`,
              code: 'PGRST116',
            },
            count,
          };
        }
        return { data: rows[0], error: null, count };
      }

      if (this.mode === 'maybeSingle') {
        if (rows && rows.length > 1) {
          return {
            data: null,
            error: { message: 'JSON object requested, multiple rows returned', code: 'PGRST116' },
            count,
          };
        }
        return { data: rows?.[0] ?? null, error: null, count };
      }

      return { data: rows, error: null, count };
    } catch (err: any) {
      return {
        data: null,
        error: { message: err?.message ?? String(err), code: err?.code, details: err?.detail },
        count: null,
      };
    }
  }

  then<R1 = PgResult<T>, R2 = never>(
    onfulfilled?: ((value: PgResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export class PgClient {
  constructor(private readonly pool: Pool) {}

  from(table: string): QueryBuilder {
    return new QueryBuilder(this.pool, table);
  }

  /**
   * Chama uma função SQL com argumentos nomeados, como o PostgREST.
   * Retorno escalar (int/jsonb) vira o valor; RETURNS TABLE vira array.
   */
  async rpc(fn: string, args: Record<string, any> = {}): Promise<PgResult<any>> {
    try {
      const names = Object.keys(args);
      const call = names.map((n, i) => `"${n}" => $${i + 1}`).join(', ');
      const res = await this.pool.query(
        `SELECT * FROM public."${fn}"(${call})`,
        names.map((n) => args[n]),
      );
      const scalar = res.fields.length === 1 && res.fields[0].name === fn;
      const data = scalar ? (res.rows.length ? res.rows[0][fn] : null) : res.rows;
      return { data, error: null, count: null };
    } catch (err: any) {
      return {
        data: null,
        error: { message: err?.message ?? String(err), code: err?.code, details: err?.detail },
        count: null,
      };
    }
  }

  /** Acesso direto para SQL que o builder não cobre (crons de retenção). */
  query(sql: string, params: any[] = []) {
    return this.pool.query(sql, params);
  }

  end() {
    return this.pool.end();
  }
}

export function createPgClient(databaseUrl: string): PgClient {
  const ssl = /sslmode=require/.test(databaseUrl) ? { rejectUnauthorized: false } : undefined;
  return new PgClient(
    new Pool({ connectionString: databaseUrl, max: 10, ssl }),
  );
}
