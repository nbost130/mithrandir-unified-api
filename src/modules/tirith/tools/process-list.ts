import { getProcessList, type ProcessEntry } from '../commands/system.js';

interface ProcessListResult {
  timestamp: string;
  sortedBy: 'cpu' | 'memory';
  appliedFilter: string | null;
  totalProcesses: number;
  processes: ProcessEntry[];
}

export async function handleProcessList(input: {
  sortBy?: 'cpu' | 'memory';
  limit?: number;
  filter?: string;
}): Promise<ProcessListResult> {
  try {
    const sortBy = input.sortBy ?? 'cpu';
    const limit = input.limit ?? 20;

    const processes = await getProcessList({
      sortBy,
      limit,
      filter: input.filter,
    });

    return {
      timestamp: new Date().toISOString(),
      sortedBy: sortBy,
      appliedFilter: input.filter ?? null,
      totalProcesses: processes.length,
      processes,
    };
  } catch {
    return {
      timestamp: new Date().toISOString(),
      sortedBy: input.sortBy ?? 'cpu',
      appliedFilter: input.filter ?? null,
      totalProcesses: 0,
      processes: [],
    };
  }
}
