/**
 * Test-only in-memory DynamoDB table for the Document client.
 *
 * Install it with the same mock pattern the existing tests use:
 *
 *   const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
 *   vi.mock('@aws-sdk/lib-dynamodb', fakeDynamoMockFactory(() => holder.fake));
 *   beforeEach(() => { holder.fake = createFakeDynamoTable(); });
 *
 * Supported: GetCommand, PutCommand, UpdateCommand, QueryCommand (IndexName GSI1 only).
 * Any other command class, and any write to a RATELIMIT# item (unless
 * `allowRateLimitWrites`), throws so the test fails.
 */
import { isDeepStrictEqual } from 'node:util';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

export type FakeItem = Record<string, unknown>;

export interface FakeDynamoOptions {
  /** Allow writes to RATELIMIT# items (for the existing rate limiter tests). */
  allowRateLimitWrites?: boolean;
}

export interface RecordedCall {
  name: string;
  input: Record<string, unknown>;
}

export interface FakeDynamoTable {
  send: (command: unknown) => Promise<Record<string, unknown>>;
  /** Live storage keyed by `${PK}|${SK}`. */
  items: Map<string, FakeItem>;
  /** Every command received, in order (including ones the guard rejected). */
  calls: RecordedCall[];
  /** Make the next commands of this class wait until `release()`. */
  hold: (commandName: 'GetCommand' | 'PutCommand' | 'UpdateCommand' | 'QueryCommand') => void;
  /** Release every held command and stop holding. */
  release: () => void;
  /** Number of commands currently waiting because of `hold`. */
  heldCount: () => number;
  seed: (item: FakeItem) => void;
  get: (pk: string, sk?: string) => FakeItem | undefined;
}

// ── DynamoDB reserved words (common subset used in this app) ────────────────
const RESERVED_WORDS = new Set(
  (
    'ABORT ABSOLUTE ACTION ADD AFTER AGENT ALL ALLOCATE ALTER ANALYZE AND ANY ARCHIVE ARE ARRAY AS ASC ' +
    'ASCII ASENSITIVE ASSERTION ASYMMETRIC AT ATOMIC ATTACH ATTRIBUTE AUTH AUTHORIZATION AUTHORIZE AUTO ' +
    'AVG BACK BACKUP BASE BATCH BEFORE BEGIN BETWEEN BIGINT BINARY BIT BLOB BLOCK BOOLEAN BOTH BREADTH ' +
    'BUCKET BULK BY BYTE CALL CALLED CALLING CAPACITY CASCADE CASCADED CASE CAST CATALOG CHAR CHARACTER ' +
    'CHECK CLASS CLOB CLOSE CLUSTER CLUSTERED CLUSTERING CLUSTERS COALESCE COLLATE COLLATION COLLECTION ' +
    'COLUMN COLUMNS COMBINE COMMENT COMMIT COMPACT COMPILE COMPRESS CONDITION CONFLICT CONNECT CONNECTION ' +
    'CONSISTENCY CONSISTENT CONSTRAINT CONSTRAINTS CONSTRUCTOR CONSUMED CONTINUE CONVERT COPY CORRESPONDING ' +
    'COUNT COUNTER CREATE CROSS CUBE CURRENT CURSOR CYCLE DATA DATABASE DATE DATETIME DAY DEALLOCATE DEC ' +
    'DECIMAL DECLARE DEFAULT DEFERRABLE DEFERRED DEFINE DEFINED DEFINITION DELETE DELIMITED DEPTH DEREF ' +
    'DESC DESCRIBE DESCRIPTOR DETACH DETERMINISTIC DIAGNOSTICS DIRECTORIES DISABLE DISCONNECT DISTINCT ' +
    'DISTRIBUTE DO DOMAIN DOUBLE DROP DUMP DURATION DYNAMIC EACH ELEMENT ELSE ELSEIF EMPTY ENABLE END ' +
    'EQUAL EQUALS ERROR ESCAPE ESCAPED EVAL EVALUATE EXCEEDED EXCEPT EXCEPTION EXCEPTIONS EXCLUSIVE EXEC ' +
    'EXECUTE EXISTS EXIT EXPLAIN EXPLODE EXPORT EXPRESSION EXTENDED EXTERNAL EXTRACT FAIL FALSE FAMILY ' +
    'FETCH FIELDS FILE FILTER FILTERING FINAL FINISH FIRST FIXED FLATTERN FLOAT FOR FORCE FOREIGN FORMAT ' +
    'FORWARD FOUND FREE FROM FULL FUNCTION FUNCTIONS GENERAL GENERATE GET GLOB GLOBAL GO GOTO GRANT ' +
    'GREATER GROUP GROUPING HANDLER HASH HAVE HAVING HEAP HIDDEN HOLD HOUR IDENTIFIED IDENTITY IF IGNORE ' +
    'IMMEDIATE IMPORT IN INCLUDING INCLUSIVE INCREMENT INCREMENTAL INDEX INDEXED INDEXES INDICATOR INFINITE ' +
    'INITIALLY INLINE INNER INNTER INOUT INPUT INSENSITIVE INSERT INSTEAD INT INTEGER INTERSECT INTERVAL ' +
    'INTO INVALIDATE IS ISOLATION ITEM ITEMS ITERATE JOIN KEY KEYS LAG LANGUAGE LARGE LAST LATERAL LEAD ' +
    'LEADING LEAVE LEFT LENGTH LESS LEVEL LIKE LIMIT LIMITED LINES LIST LOAD LOCAL LOCALTIME LOCALTIMESTAMP ' +
    'LOCATION LOCATOR LOCK LOCKS LOG LOGED LONG LOOP LOWER MAP MATCH MATERIALIZED MAX MAXLEN MEMBER MERGE ' +
    'METHOD METRICS MIN MINUS MINUTE MISSING MOD MODE MODIFIES MODIFY MODULE MONTH MULTI MULTISET NAME ' +
    'NAMES NATIONAL NATURAL NCHAR NCLOB NEW NEXT NO NONE NOT NULL NULLIF NUMBER NUMERIC OBJECT OF OFFLINE ' +
    'OFFSET OLD ON ONLINE ONLY OPAQUE OPEN OPERATOR OPTION OR ORDER ORDINALITY OTHER OTHERS OUT OUTER ' +
    'OUTPUT OVER OVERLAPS OVERRIDE OWNER PAD PARALLEL PARAMETER PARAMETERS PARTIAL PARTITION PARTITIONED ' +
    'PARTITIONS PATH PERCENT PERCENTILE PERMISSION PERMISSIONS PIPE PIPELINED PLAN POOL POSITION PRECISION ' +
    'PREPARE PRESERVE PRIMARY PRIOR PRIVATE PRIVILEGES PROCEDURE PROCESSED PROJECT PROJECTION PROPERTY ' +
    'PROVISIONING PUBLIC PUT QUERY QUIT QUORUM RAISE RANDOM RANGE RANK RAW READ READS REAL REBUILD RECORD ' +
    'RECURSIVE REDUCE REF REFERENCE REFERENCES REFERENCING REGEXP REGION REINDEX RELATIVE RELEASE REMAINDER ' +
    'RENAME REPEAT REPLACE REQUEST RESET RESIGNAL RESOURCE RESPONSE RESTORE RESTRICT RESULT RETURN RETURNING ' +
    'RETURNS REVERSE REVOKE RIGHT ROLE ROLES ROLLBACK ROLLUP ROUTINE ROW ROWS RULE RULES SAMPLE SATISFIES ' +
    'SAVE SAVEPOINT SCAN SCHEMA SCOPE SCROLL SEARCH SECOND SECTION SEGMENT SEGMENTS SELECT SELF SEMI ' +
    'SENSITIVE SEPARATE SEQUENCE SERIALIZABLE SESSION SET SETS SHARD SHARE SHARED SHORT SHOW SIGNAL SIMILAR ' +
    'SIZE SKEWED SMALLINT SNAPSHOT SOME SOURCE SPACE SPACES SPARSE SPECIFIC SPECIFICTYPE SPLIT SQL SQLCODE ' +
    'SQLERROR SQLEXCEPTION SQLSTATE SQLWARNING START STATE STATIC STATUS STORAGE STORE STORED STREAM STRING ' +
    'STRUCT STYLE SUB SUBMULTISET SUBPARTITION SUBSTRING SUBTYPE SUM SUPER SYMMETRIC SYNONYM SYSTEM TABLE ' +
    'TABLESAMPLE TEMP TEMPORARY TERMINATED TEXT THAN THEN THROUGHPUT TIME TIMESTAMP TIMEZONE TINYINT TO ' +
    'TOKEN TOTAL TOUCH TRAILING TRANSACTION TRANSFORM TRANSLATE TRANSLATION TREAT TRIGGER TRIM TRUE ' +
    'TRUNCATE TTL TUPLE TYPE UNDER UNDO UNION UNIQUE UNIT UNKNOWN UNLOGGED UNNEST UNPROCESSED UNSIGNED ' +
    'UNTIL UPDATE UPPER URL USAGE USE USER USERS USING UUID VACUUM VALUE VALUED VALUES VARCHAR VARIABLE ' +
    'VARIANCE VARINT VARYING VIEW VIEWS VIRTUAL VOID WAIT WHEN WHENEVER WHERE WHILE WINDOW WITH WITHIN ' +
    'WITHOUT WORK WRAPPED WRITE YEAR ZONE'
  ).split(' '),
);

const GUARDED_COMMANDS = new Set([
  'ScanCommand',
  'DeleteCommand',
  'BatchWriteCommand',
  'BatchGetCommand',
  'TransactWriteCommand',
  'TransactGetCommand',
]);

const GSI1_PROJECTED = ['id', 'createdAt', 'urgency', 'isEmergency', 'trade', 'status', 'answers'];
const GSI1_KEYS = ['PK', 'SK', 'GSI1PK', 'GSI1SK'];

// ── Tokenizer ───────────────────────────────────────────────────────────────
type Token = string;

function tokenize(expr: string): Token[] {
  const re = /\s*(<=|>=|<>|[=<>(),+-]|[#:]?[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?)/y;
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < expr.length) {
    if (/^\s*$/.test(expr.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(expr);
    if (!m) {
      throw new Error(`fakeDynamoTable: unsupported token at "${expr.slice(pos).trim()}" in expression: ${expr}`);
    }
    tokens.push(m[1]);
    pos = re.lastIndex;
  }
  return tokens;
}

interface ExprContext {
  names: Record<string, string>;
  values: Record<string, unknown>;
  /** Item the expression reads from (undefined when the item does not exist). */
  item: FakeItem | undefined;
  expression: string;
}

class Parser {
  private i = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly ctx: ExprContext,
  ) {}

  peek(): Token | undefined {
    return this.tokens[this.i];
  }
  next(): Token {
    const t = this.tokens[this.i++];
    if (t === undefined) this.fail('unexpected end of expression');
    return t;
  }
  expect(t: string): void {
    const got = this.next();
    if (got !== t) this.fail(`expected "${t}" but found "${got}"`);
  }
  atEnd(): boolean {
    return this.i >= this.tokens.length;
  }
  fail(msg: string): never {
    throw new Error(`fakeDynamoTable: ${msg} in expression: ${this.ctx.expression}`);
  }
  isKeyword(t: string | undefined, kw: string): boolean {
    return t !== undefined && t.toUpperCase() === kw;
  }

  /** Resolve an attribute name token (#alias or bare). Bare reserved words throw. */
  attrName(token: string): string {
    if (token.startsWith('#')) {
      const name = this.ctx.names[token];
      if (name === undefined) this.fail(`unresolved name placeholder ${token}`);
      return name;
    }
    if (token.startsWith(':') || !/^[A-Za-z_]/.test(token)) this.fail(`"${token}" is not an attribute name`);
    if (RESERVED_WORDS.has(token.toUpperCase())) {
      this.fail(`"${token}" is a DynamoDB reserved word; use an ExpressionAttributeNames alias`);
    }
    return token;
  }

  value(token: string): unknown {
    if (!(token in this.ctx.values)) this.fail(`unresolved value placeholder ${token}`);
    return this.ctx.values[token];
  }

  // operand := :value | number | path | if_not_exists(path, operand) | list_append(op, op)
  operand(): unknown {
    const t = this.next();
    if (t.startsWith(':')) return this.value(t);
    if (/^\d/.test(t)) return Number(t);
    if (this.peek() === '(') {
      const fn = t.toLowerCase();
      this.expect('(');
      if (fn === 'if_not_exists') {
        const name = this.attrName(this.next());
        this.expect(',');
        const fallback = this.operand();
        this.expect(')');
        const current = this.ctx.item?.[name];
        return current !== undefined ? current : fallback;
      }
      if (fn === 'list_append') {
        const a = this.operand();
        this.expect(',');
        const b = this.operand();
        this.expect(')');
        if (!Array.isArray(a) || !Array.isArray(b)) this.fail('list_append needs two lists');
        return [...a, ...b];
      }
      this.fail(`unsupported function "${t}"`);
    }
    return this.ctx.item?.[this.attrName(t)];
  }

  // arithmetic := operand (('+' | '-') operand)?
  arithmetic(): unknown {
    const left = this.operand();
    const op = this.peek();
    if (op === '+' || op === '-') {
      this.next();
      const right = this.operand();
      if (typeof left !== 'number' || typeof right !== 'number') {
        this.fail(`operator "${op}" needs two numbers (an operand is missing or not a number)`);
      }
      return op === '+' ? left + right : left - right;
    }
    return left;
  }

  // ── conditions ────────────────────────────────────────────────────────────
  condition(): boolean {
    const result = this.orExpr();
    if (!this.atEnd()) this.fail(`unsupported token "${this.peek()}"`);
    return result;
  }
  private orExpr(): boolean {
    let r = this.andExpr();
    while (this.isKeyword(this.peek(), 'OR')) {
      this.next();
      const rhs = this.andExpr();
      r = r || rhs;
    }
    return r;
  }
  private andExpr(): boolean {
    let r = this.notExpr();
    while (this.isKeyword(this.peek(), 'AND')) {
      this.next();
      const rhs = this.notExpr();
      r = r && rhs;
    }
    return r;
  }
  private notExpr(): boolean {
    if (this.isKeyword(this.peek(), 'NOT')) {
      this.next();
      return !this.notExpr();
    }
    return this.primary();
  }
  private primary(): boolean {
    const t = this.peek();
    if (t === '(') {
      this.next();
      const r = this.orExpr();
      this.expect(')');
      return r;
    }
    if (t !== undefined && this.tokens[this.i + 1] === '(') {
      const fn = t.toLowerCase();
      if (fn === 'attribute_exists' || fn === 'attribute_not_exists') {
        this.next();
        this.expect('(');
        const name = this.attrName(this.next());
        this.expect(')');
        const exists = this.ctx.item !== undefined && this.ctx.item[name] !== undefined;
        return fn === 'attribute_exists' ? exists : !exists;
      }
    }
    const left = this.operand();
    const op = this.next();
    if (!['=', '<>', '<', '<=', '>', '>='].includes(op)) this.fail(`unsupported operator "${op}"`);
    const right = this.operand();
    return compare(left, op, right);
  }
}

function compare(a: unknown, op: string, b: unknown): boolean {
  if (a === undefined || b === undefined) return false; // a missing attribute never compares true
  if (op === '=') return isDeepStrictEqual(a, b);
  if (op === '<>') return !isDeepStrictEqual(a, b);
  const bothNumbers = typeof a === 'number' && typeof b === 'number';
  const bothStrings = typeof a === 'string' && typeof b === 'string';
  if (!bothNumbers && !bothStrings) return false;
  const x = a as number | string;
  const y = b as number | string;
  if (op === '<') return x < y;
  if (op === '<=') return x <= y;
  if (op === '>') return x > y;
  return x >= y;
}

// ── Update expressions ──────────────────────────────────────────────────────
type UpdateAction = (target: FakeItem) => void;

function parseUpdate(expression: string, ctx: ExprContext): UpdateAction[] {
  const p = new Parser(tokenize(expression), ctx);
  const actions: UpdateAction[] = [];
  while (!p.atEnd()) {
    const clause = p.next().toUpperCase();
    if (clause !== 'SET' && clause !== 'ADD' && clause !== 'REMOVE') {
      p.fail(`unsupported update clause "${clause}"`);
    }
    for (;;) {
      const name = p.attrName(p.next());
      if (clause === 'SET') {
        p.expect('=');
        const v = p.arithmetic();
        if (v === undefined) p.fail(`SET ${name} evaluates to a missing value`);
        actions.push((t) => {
          t[name] = structuredClone(v);
        });
      } else if (clause === 'ADD') {
        const v = p.operand();
        if (typeof v !== 'number') return p.fail('ADD supports numbers only');
        const delta: number = v;
        actions.push((t) => {
          const cur = t[name];
          if (cur !== undefined && typeof cur !== 'number') throw new Error(`fakeDynamoTable: ADD on non-number ${name}`);
          t[name] = (cur ?? 0) + delta;
        });
      } else {
        actions.push((t) => {
          delete t[name];
        });
      }
      const nextTok = p.peek();
      if (nextTok === ',') {
        p.next();
        continue;
      }
      break;
    }
  }
  return actions;
}

// ── Fake table ──────────────────────────────────────────────────────────────
function storageKey(pk: unknown, sk: unknown): string {
  if (typeof pk !== 'string' || typeof sk !== 'string') {
    throw new Error('fakeDynamoTable: PK and SK must be strings');
  }
  return `${pk}|${sk}`;
}

function conditionHolds(
  input: Record<string, unknown>,
  item: FakeItem | undefined,
): boolean {
  const expression = input.ConditionExpression;
  if (expression === undefined) return true;
  if (typeof expression !== 'string') throw new Error('fakeDynamoTable: ConditionExpression must be a string');
  const ctx: ExprContext = {
    names: (input.ExpressionAttributeNames ?? {}) as Record<string, string>,
    values: (input.ExpressionAttributeValues ?? {}) as Record<string, unknown>,
    item,
    expression,
  };
  return new Parser(tokenize(expression), ctx).condition();
}

function conditionFailed(): ConditionalCheckFailedException {
  return new ConditionalCheckFailedException({
    message: 'The conditional request failed',
    $metadata: {},
  });
}

export function createFakeDynamoTable(options: FakeDynamoOptions = {}): FakeDynamoTable {
  const items = new Map<string, FakeItem>();
  const calls: RecordedCall[] = [];
  const held = new Set<string>();
  let waiters: Array<() => void> = [];

  const assertWritable = (pk: unknown): void => {
    if (!options.allowRateLimitWrites && typeof pk === 'string' && pk.startsWith('RATELIMIT#')) {
      throw new Error(`fakeDynamoTable guard: write to ${pk} is not allowed (RATELIMIT# items)`);
    }
  };

  const runGet = (input: Record<string, unknown>): Record<string, unknown> => {
    const key = input.Key as Record<string, unknown>;
    const item = items.get(storageKey(key.PK, key.SK));
    return item ? { Item: structuredClone(item) } : {};
  };

  const runPut = (input: Record<string, unknown>): Record<string, unknown> => {
    const item = input.Item as FakeItem;
    assertWritable(item.PK);
    const k = storageKey(item.PK, item.SK);
    const old = items.get(k);
    if (!conditionHolds(input, old)) throw conditionFailed();
    items.set(k, structuredClone(item));
    return input.ReturnValues === 'ALL_OLD' && old ? { Attributes: structuredClone(old) } : {};
  };

  const runUpdate = (input: Record<string, unknown>): Record<string, unknown> => {
    const key = input.Key as Record<string, unknown>;
    assertWritable(key.PK);
    const k = storageKey(key.PK, key.SK);
    const old = items.get(k);
    if (!conditionHolds(input, old)) throw conditionFailed();
    const expression = input.UpdateExpression;
    if (typeof expression !== 'string') throw new Error('fakeDynamoTable: UpdateExpression is required');
    const ctx: ExprContext = {
      names: (input.ExpressionAttributeNames ?? {}) as Record<string, string>,
      values: (input.ExpressionAttributeValues ?? {}) as Record<string, unknown>,
      item: old,
      expression,
    };
    const actions = parseUpdate(expression, ctx);
    const copy: FakeItem = old ? structuredClone(old) : { PK: key.PK, SK: key.SK };
    for (const action of actions) action(copy);
    items.set(k, copy);
    const rv = input.ReturnValues ?? 'NONE';
    if (rv === 'ALL_NEW') return { Attributes: structuredClone(copy) };
    if (rv === 'ALL_OLD') return old ? { Attributes: structuredClone(old) } : {};
    if (rv === 'NONE') return {};
    throw new Error(`fakeDynamoTable: unsupported ReturnValues ${String(rv)}`);
  };

  const runQuery = (input: Record<string, unknown>): Record<string, unknown> => {
    if (input.IndexName !== 'GSI1') {
      throw new Error(`fakeDynamoTable: only IndexName "GSI1" is supported (got ${String(input.IndexName)})`);
    }
    for (const unsupported of ['FilterExpression', 'ProjectionExpression', 'ExclusiveStartKey']) {
      if (input[unsupported] !== undefined) throw new Error(`fakeDynamoTable: ${unsupported} is not supported`);
    }
    const kce = input.KeyConditionExpression;
    if (typeof kce !== 'string') throw new Error('fakeDynamoTable: KeyConditionExpression is required');
    const tokens = tokenize(kce);
    const shape = tokens.map((t) => (t.toUpperCase() === 'AND' ? 'AND' : t)).join(' ');
    if (shape !== 'GSI1PK = :pk AND GSI1SK > :since') {
      throw new Error(`fakeDynamoTable: unsupported key condition: ${kce}`);
    }
    const values = (input.ExpressionAttributeValues ?? {}) as Record<string, unknown>;
    if (values[':pk'] === undefined || values[':since'] === undefined) {
      throw new Error('fakeDynamoTable: :pk and :since are required');
    }
    const pk = values[':pk'];
    const since = values[':since'] as string;
    const matches = [...items.values()]
      .filter(
        (it) =>
          typeof it.GSI1PK === 'string' &&
          typeof it.GSI1SK === 'string' &&
          it.GSI1PK === pk &&
          it.GSI1SK > since,
      )
      .sort((a, b) => (a.GSI1SK as string).localeCompare(b.GSI1SK as string));
    if (input.ScanIndexForward === false) matches.reverse();
    const limited = typeof input.Limit === 'number' ? matches.slice(0, input.Limit) : matches;
    const projected = limited.map((it) => {
      const out: FakeItem = {};
      for (const attr of [...GSI1_KEYS, ...GSI1_PROJECTED]) {
        if (it[attr] !== undefined) out[attr] = structuredClone(it[attr]);
      }
      return out;
    });
    return { Items: projected, Count: projected.length };
  };

  const send = async (command: unknown): Promise<Record<string, unknown>> => {
    const name = (command as { constructor: { name: string } }).constructor.name;
    const input = ((command as { input?: Record<string, unknown> }).input ?? {}) as Record<string, unknown>;
    calls.push({ name, input });

    if (GUARDED_COMMANDS.has(name)) {
      throw new Error(`fakeDynamoTable guard: ${name} must never be sent by this feature`);
    }
    if (!['GetCommand', 'PutCommand', 'UpdateCommand', 'QueryCommand'].includes(name)) {
      throw new Error(`fakeDynamoTable: unsupported command ${name}`);
    }

    if (held.has(name)) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }

    switch (name) {
      case 'GetCommand':
        return runGet(input);
      case 'PutCommand':
        return runPut(input);
      case 'UpdateCommand':
        return runUpdate(input);
      default:
        return runQuery(input);
    }
  };

  return {
    send,
    items,
    calls,
    hold: (commandName) => {
      held.add(commandName);
    },
    release: () => {
      held.clear();
      const pending = waiters;
      waiters = [];
      for (const resolve of pending) resolve();
    },
    heldCount: () => waiters.length,
    seed: (item) => {
      items.set(storageKey(item.PK, item.SK), structuredClone(item));
    },
    get: (pk, sk = pk) => {
      const item = items.get(storageKey(pk, sk));
      return item ? structuredClone(item) : undefined;
    },
  };
}

/**
 * Factory for `vi.mock('@aws-sdk/lib-dynamodb', fakeDynamoMockFactory(() => fake))`.
 * Keeps the real command classes and replaces `DynamoDBDocumentClient.from` so it
 * returns `{ send }` backed by the fake table.
 */
export function fakeDynamoMockFactory(getFake: () => FakeDynamoTable) {
  return async (importOriginal: () => Promise<typeof import('@aws-sdk/lib-dynamodb')>) => {
    const actual = await importOriginal();
    return {
      ...actual,
      DynamoDBDocumentClient: { from: () => ({ send: (c: unknown) => getFake().send(c) }) },
    };
  };
}
