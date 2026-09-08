/**
 * Bounded graceful shutdown.
 *
 * 2026-09-08: a SIGTERM closed the Fastify listener and then hung. The
 * process kept polling for minutes with port 8080 dark, because close()
 * waited on keep-alive connections and a bare setInterval kept the loop
 * alive. systemd only restarts a unit whose main process has EXITED, so a
 * shutdown that never finishes is worse than a crash. This helper races the
 * real cleanup against a deadline and returns the exit code to use:
 *
 *   0 — cleanup finished in time
 *   1 — cleanup threw, or the deadline fired first
 */
export const SHUTDOWN_DEADLINE_MS = 10_000;

export async function shutdownWithDeadline(
  cleanup: () => Promise<void>,
  deadlineMs: number,
  onError: (error: unknown) => void = () => {}
): Promise<0 | 1> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<1>((resolve) => {
    timer = setTimeout(() => {
      onError(new Error(`Shutdown exceeded ${deadlineMs} ms; exiting anyway`));
      resolve(1);
    }, deadlineMs);
    // Never let the deadline itself keep a finished process alive.
    timer.unref?.();
  });

  const attempt: Promise<0 | 1> = cleanup().then(
    () => 0 as const,
    (error) => {
      onError(error);
      return 1 as const;
    }
  );

  try {
    return await Promise.race([attempt, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type ShutdownLogger = {
  info: (msg: string) => void;
  error: (obj: { error: unknown }, msg: string) => void;
};

/** Wire SIGTERM/SIGINT to a bounded shutdown; `exit` is injectable for tests. */
export function installSignalHandlers(
  log: ShutdownLogger,
  cleanup: () => Promise<void>,
  exit: (code: 0 | 1) => void = (code) => process.exit(code)
): void {
  const handle = async (signal: string) => {
    log.info(`Received ${signal}, shutting down gracefully`);
    exit(
      await shutdownWithDeadline(cleanup, SHUTDOWN_DEADLINE_MS, (error) =>
        log.error({ error }, 'Error during shutdown')
      )
    );
  };
  process.on('SIGTERM', () => handle('SIGTERM'));
  process.on('SIGINT', () => handle('SIGINT'));
}
