import { db } from '../db';

type QueryOptions = {
  json: boolean;
  limit: number;
  rawEmails: boolean;
};

function parseArgs(argv: string[]): QueryOptions {
  const options: QueryOptions = {
    json: false,
    limit: 100,
    rawEmails: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--raw-emails') {
      options.rawEmails = true;
      continue;
    }

    if (arg === '--limit') {
      const value = argv[index + 1];
      const parsed = Number.parseInt(value ?? '', 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('--limit must be a positive integer');
      }
      options.limit = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function redactEmail(email: string): string {
  const [localPart = '', domain = ''] = email.split('@');
  if (!domain) return email;

  const visibleLocal = localPart.slice(0, 3);
  const hiddenLocal = Math.max(localPart.length - visibleLocal.length, 0);

  return `${visibleLocal}${'*'.repeat(hiddenLocal)}@${domain}`;
}

function formatTimestamp(createdAt: number): string {
  return new Date(createdAt).toISOString();
}

const WAITLIST_QUERY = `
  SELECT id, name, email, source, created_at
  FROM waitlist_signups
  ORDER BY created_at DESC
  LIMIT ?
`;

type WaitlistRow = {
  id: string;
  name: string;
  email: string;
  source: string | null;
  created_at: number;
};

function main(): void {
  const options = parseArgs(Bun.argv.slice(2));
  const rows = db.query<WaitlistRow, [number]>(WAITLIST_QUERY).all(options.limit);

  if (options.json) {
    const payload = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: options.rawEmails ? row.email : redactEmail(row.email),
      source: row.source,
      createdAt: row.created_at,
      createdAtIso: formatTimestamp(row.created_at),
    }));
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Waitlist signups: ${rows.length}`);
  console.log('');

  if (rows.length === 0) {
    console.log('No waitlist signups found.');
    return;
  }

  for (const [index, row] of rows.entries()) {
    const email = options.rawEmails ? row.email : redactEmail(row.email);
    console.log(`${index + 1}. ${row.name || '(no name)'}`);
    console.log(`   email: ${email}`);
    console.log(`   source: ${row.source ?? '(none)'}`);
    console.log(`   created_at: ${row.created_at} (${formatTimestamp(row.created_at)})`);
    console.log(`   id: ${row.id}`);
  }
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? `[query-waitlist] ${error.message}` : '[query-waitlist] Unknown error',
  );
  process.exit(1);
} finally {
  db.close();
}
