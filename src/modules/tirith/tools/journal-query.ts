import { getJournalEntries, type JournalEntry } from '../commands/systemd.js';

interface JournalQueryResult {
  timestamp: string;
  query: {
    unit: string;
    since?: string;
    priority?: number;
    search?: string;
    limit: number;
  };
  totalMatches: number;
  truncated: boolean;
  entries: JournalEntry[];
}

export async function handleJournalQuery(input: {
  unit: string;
  since?: string;
  until?: string;
  priority?: number;
  search?: string;
  limit?: number;
}): Promise<JournalQueryResult> {
  const limit = input.limit ?? 100;

  try {
    const entries = await getJournalEntries(input.unit, {
      since: input.since,
      priority: input.priority,
      search: input.search,
      limit: limit + 1,
    });

    const truncated = entries.length > limit;
    const sliced = truncated ? entries.slice(0, limit) : entries;

    return {
      timestamp: new Date().toISOString(),
      query: {
        unit: input.unit,
        since: input.since,
        priority: input.priority,
        search: input.search,
        limit,
      },
      totalMatches: truncated ? limit + 1 : entries.length,
      truncated,
      entries: sliced,
    };
  } catch {
    return {
      timestamp: new Date().toISOString(),
      query: {
        unit: input.unit,
        since: input.since,
        priority: input.priority,
        search: input.search,
        limit,
      },
      totalMatches: 0,
      truncated: false,
      entries: [],
    };
  }
}
