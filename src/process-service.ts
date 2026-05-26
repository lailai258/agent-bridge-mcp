import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { buildCliCommand, type BuildCliCommandOptions } from './cli-builder.js';
import { parseClaudeOutput, parseCodexOutput, parseForgeOutput, parseGeminiOutput, parseOpenCodeOutput, PeekEventExtractor } from './parsers.js';
import {
  appendPeekEvents,
  buildNotFoundPeekProcess,
  observedDurationSec,
  validatePeekPids,
  validatePeekTimeSec,
  type PeekProcessResult,
  type PeekResponse,
} from './peek.js';
import { ProcessRegistry, type ProcessRegistryRecord } from './process-registry.js';
import { buildProcessResult } from './process-result.js';
import { getWaitTimeoutConfig, type WaitTimeoutMode } from './wait-config.js';

export type AgentType = 'claude' | 'codex' | 'gemini' | 'forge' | 'opencode';
export type ProcessStatus = 'running' | 'completed' | 'failed';

interface TrackedProcess {
  pid: number;
  process: ChildProcess;
  prompt: string;
  workFolder: string;
  model?: string;
  toolType: AgentType;
  startTime: string;
  stdout: string;
  stderr: string;
  status: ProcessStatus;
  exitCode?: number;
  registryRecord?: ProcessRegistryRecord;
}

export interface ProcessListItem {
  pid: number;
  agent: AgentType;
  status: ProcessStatus;
}

export interface StartProcessResult {
  pid: number;
  status: 'started';
  agent: AgentType;
  message: string;
}

interface ProcessServiceOptions {
  cliPaths: BuildCliCommandOptions['cliPaths'];
  registry?: ProcessRegistry;
}

export interface WaitForProcessesResponse {
  timed_out: boolean;
  timeout: number;
  observed_timeout: number;
  results: any[];
  next_action?: string;
  message?: string;
}

function parseAgentOutput(agent: AgentType, stdout: string, stderr: string): any {
  if (agent === 'codex') {
    return parseCodexOutput(`${stdout || ''}\n${stderr || ''}`);
  }

  if (!stdout) {
    return null;
  }

  if (agent === 'claude') {
    return parseClaudeOutput(stdout);
  }
  if (agent === 'gemini') {
    return parseGeminiOutput(stdout);
  }
  if (agent === 'forge') {
    return parseForgeOutput(stdout);
  }
  if (agent === 'opencode') {
    return parseOpenCodeOutput(stdout);
  }

  return null;
}

export class ProcessService {
  private readonly processManager = new Map<number, TrackedProcess>();
  private readonly registry: ProcessRegistry;
  private readonly cliPaths: BuildCliCommandOptions['cliPaths'];

  constructor(options: ProcessServiceOptions) {
    this.cliPaths = options.cliPaths;
    this.registry = options.registry ?? new ProcessRegistry();
  }

  startProcess(options: Omit<BuildCliCommandOptions, 'cliPaths'>): StartProcessResult {
    const cmd = buildCliCommand({
      ...options,
      cliPaths: this.cliPaths,
    });

    const { cliPath, args: processArgs, cwd: effectiveCwd, agent, prompt } = cmd;
    const childProcess = spawn(cliPath, processArgs, {
      cwd: effectiveCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    const pid = childProcess.pid;
    if (!pid) {
      throw new Error(`Failed to start ${agent} CLI process`);
    }

    const logPaths = this.registry.buildLogPaths(pid);
    const processEntry: TrackedProcess = {
      pid,
      process: childProcess,
      prompt,
      workFolder: effectiveCwd,
      model: options.model,
      toolType: agent,
      startTime: new Date().toISOString(),
      stdout: '',
      stderr: '',
      status: 'running',
    };
    const registryRecord: ProcessRegistryRecord = {
      pid,
      agent,
      status: 'running',
      startTime: processEntry.startTime,
      workFolder: effectiveCwd,
      prompt,
      model: options.model,
      command: cliPath,
      args: processArgs,
      stdoutPath: logPaths.stdoutPath,
      stderrPath: logPaths.stderrPath,
    };
    processEntry.registryRecord = registryRecord;

    this.processManager.set(pid, processEntry);
    this.registry.upsert(registryRecord);

    childProcess.stdout.on('data', (data) => {
      const entry = this.processManager.get(pid);
      const chunk = data.toString();
      if (entry) {
        entry.stdout += chunk;
        this.appendProcessLog(entry.registryRecord?.stdoutPath, chunk);
      }
    });

    childProcess.stderr.on('data', (data) => {
      const entry = this.processManager.get(pid);
      const chunk = data.toString();
      if (entry) {
        entry.stderr += chunk;
        this.appendProcessLog(entry.registryRecord?.stderrPath, chunk);
      }
    });

    childProcess.on('close', (code) => {
      const entry = this.processManager.get(pid);
      if (entry) {
        entry.status = code === 0 ? 'completed' : 'failed';
        entry.exitCode = code !== null ? code : undefined;
        this.registry.update(pid, {
          status: entry.status,
          exitCode: entry.exitCode,
          endTime: new Date().toISOString(),
        });
      }
    });

    childProcess.on('error', (error) => {
      const entry = this.processManager.get(pid);
      if (entry) {
        entry.status = 'failed';
        entry.stderr += `\nProcess error: ${error.message}`;
        this.appendProcessLog(entry.registryRecord?.stderrPath, `\nProcess error: ${error.message}`);
        this.registry.update(pid, {
          status: 'failed',
          endTime: new Date().toISOString(),
        });
      }
    });

    return {
      pid,
      status: 'started',
      agent,
      message: `${agent} process started successfully`,
    };
  }

  listProcesses(): ProcessListItem[] {
    const processes: ProcessListItem[] = [];
    const seen = new Set<number>();

    for (const [pid, process] of this.processManager.entries()) {
      seen.add(pid);
      processes.push({
        pid,
        agent: process.toolType,
        status: process.status,
      });
    }

    for (const process of this.registry.readAll()) {
      if (seen.has(process.pid)) {
        continue;
      }

      processes.push({
        pid: process.pid,
        agent: process.agent,
        status: this.refreshRegistryStatus(process).status,
      });
    }

    return processes;
  }

  getProcessResult(pid: number, verbose = false): any {
    const process = this.getProcessSnapshot(pid);
    if (!process) {
      throw new Error(`Process with PID ${pid} not found`);
    }

    const agentOutput = parseAgentOutput(process.toolType, process.stdout, process.stderr);

    return buildProcessResult({
      pid,
      agent: process.toolType,
      status: process.status,
      exitCode: process.exitCode,
      startTime: process.startTime,
      workFolder: process.workFolder,
      prompt: process.prompt,
      model: process.model,
      stdout: process.stdout,
      stderr: process.stderr,
    }, agentOutput, verbose);
  }

  async waitForProcesses(
    pids: number[],
    timeoutSeconds = getWaitTimeoutConfig().defaultTimeoutSec,
    verbose = false,
    timeoutMode: WaitTimeoutMode = 'return_status',
    callWindowSeconds = getWaitTimeoutConfig().callWindowSec
  ): Promise<WaitForProcessesResponse> {
    for (const pid of pids) {
      if (!this.getProcessSnapshot(pid)) {
        throw new Error(`Process with PID ${pid} not found`);
      }
    }

    let stopPolling = false;
    const waitPromises = pids.map((pid) => {
      const processEntry = this.processManager.get(pid);

      if (processEntry && processEntry.status === 'running') {
        return new Promise<void>((resolve) => {
          processEntry.process.once('close', () => {
            resolve();
          });
        });
      }

      const persisted = this.registry.readAll().find((record) => record.pid === pid);
      if (persisted && this.refreshRegistryStatus(persisted).status === 'running') {
        return this.waitForPersistedProcessTerminal(persisted, () => stopPolling);
      }

      return Promise.resolve();
    });

    // MCP 客户端/宿主通常还有外层 tools/call 超时；单次阻塞窗口必须低于外层限制。
    const observedTimeoutSeconds = Math.min(timeoutSeconds, callWindowSeconds);
    const timeoutMs = observedTimeoutSeconds * 1000;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<'timed_out'>((resolve) => {
      timeoutHandle = setTimeout(() => {
        stopPolling = true;
        resolve('timed_out');
      }, timeoutMs);
      timeoutHandle.unref?.();
    });

    try {
      const raceResult = await Promise.race([
        Promise.all(waitPromises).then(() => 'completed' as const),
        timeoutPromise,
      ]);
      const results = pids.map((pid) => this.getProcessResult(pid, verbose));

      if (raceResult === 'timed_out') {
        const refreshedResults = pids.map((pid) => this.getProcessResult(pid, verbose));
        const stillRunning = refreshedResults.some((result) => result.status === 'running');

        if (!stillRunning) {
          return {
            timed_out: false,
            timeout: timeoutSeconds,
            observed_timeout: observedTimeoutSeconds,
            results: refreshedResults,
            message: `Processes completed while the wait call was returning after ${observedTimeoutSeconds} seconds`,
          };
        }

        if (timeoutMode === 'throw') {
          throw new Error(`Timed out after ${observedTimeoutSeconds} seconds waiting for processes`);
        }

        return {
          timed_out: true,
          timeout: timeoutSeconds,
          observed_timeout: observedTimeoutSeconds,
          results: refreshedResults,
          next_action: 'Call get_result for current output or call wait again to continue waiting.',
          message: `Wait call returned after ${observedTimeoutSeconds} seconds before the MCP tools/call deadline; processes may still be running`,
        };
      }

      return {
        timed_out: false,
        timeout: timeoutSeconds,
        observed_timeout: observedTimeoutSeconds,
        results,
      };
    } finally {
      stopPolling = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  async peekProcesses(pids: number[], peekTimeSec = 10, includeToolCalls = false): Promise<PeekResponse> {
    const targetPids = validatePeekPids(pids);
    const targetPeekTimeSec = validatePeekTimeSec(peekTimeSec);
    const processes: PeekProcessResult[] = [];
    const observers: Array<{
      entry: TrackedProcess;
      result: PeekProcessResult;
      stdoutExtractor: PeekEventExtractor;
      stderrExtractor: PeekEventExtractor;
      onStdout: (data: Buffer | string) => void;
      onStderr: (data: Buffer | string) => void;
    }> = [];

    for (const pid of targetPids) {
      const entry = this.processManager.get(pid);
      if (!entry) {
        const persisted = this.registry.readAll().find((record) => record.pid === pid);
        if (persisted) {
          const refreshed = this.refreshRegistryStatus(persisted);
          processes.push({
            pid,
            agent: persisted.agent,
            status: refreshed.status,
            events: [],
            truncated: false,
            error: 'process is not attached to this server instance; use get_result for persisted stdout/stderr',
          });
        } else {
          processes.push(buildNotFoundPeekProcess(pid));
        }
        continue;
      }

      const result: PeekProcessResult = {
        pid,
        agent: entry.toolType,
        status: entry.status,
        events: [],
        truncated: false,
        error: null,
      };
      processes.push(result);

      const stdoutExtractor = new PeekEventExtractor(entry.toolType, { includeToolCalls, source: 'stdout' });
      const stderrExtractor = new PeekEventExtractor(entry.toolType, { includeToolCalls, source: 'stderr' });
      const onStdout = (data: Buffer | string) => {
        appendPeekEvents(result, stdoutExtractor.push(data.toString(), new Date().toISOString()));
      };
      const onStderr = (data: Buffer | string) => {
        appendPeekEvents(result, stderrExtractor.push(data.toString(), new Date().toISOString()));
      };

      if (entry.status === 'running') {
        entry.process.stdout?.on('data', onStdout);
        entry.process.stderr?.on('data', onStderr);
      }

      observers.push({ entry, result, stdoutExtractor, stderrExtractor, onStdout, onStderr });
    }

    const startedAt = new Date();
    const startedAtMs = Date.now();
    const runningObservers = observers.filter((observer) => observer.entry.status === 'running');
    const terminalPromise = Promise.all(runningObservers.map((observer) => this.waitForProcessTerminal(observer.entry)));
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      timeoutHandle = setTimeout(resolve, targetPeekTimeSec * 1000);
      timeoutHandle.unref?.();
    });

    try {
      await Promise.race([terminalPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      const flushTs = new Date().toISOString();
      for (const observer of observers) {
        observer.entry.process.stdout?.off('data', observer.onStdout);
        observer.entry.process.stderr?.off('data', observer.onStderr);
        const terminal = observer.entry.status !== 'running';
        appendPeekEvents(observer.result, observer.stdoutExtractor.flush(flushTs, { terminal }));
        appendPeekEvents(observer.result, observer.stderrExtractor.flush(flushTs, { terminal }));
        observer.result.status = observer.entry.status;
      }
    }

    return {
      peek_started_at: startedAt.toISOString(),
      observed_duration_sec: observedDurationSec(startedAtMs),
      processes,
    };
  }

  private waitForProcessTerminal(processEntry: TrackedProcess): Promise<void> {
    if (processEntry.status !== 'running') {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const done = () => {
        processEntry.process.off('close', done);
        processEntry.process.off('error', done);
        resolve();
      };
      processEntry.process.once('close', done);
      processEntry.process.once('error', done);
    });
  }

  private waitForPersistedProcessTerminal(record: ProcessRegistryRecord, shouldStop: () => boolean): Promise<void> {
    if (this.refreshRegistryStatus(record).status !== 'running') {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (shouldStop()) {
          clearInterval(interval);
          resolve();
          return;
        }

        const latest = this.registry.readAll().find((entry) => entry.pid === record.pid) ?? record;
        if (this.refreshRegistryStatus(latest).status !== 'running') {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
      interval.unref?.();
    });
  }

  killProcess(pid: number): { pid: number; status: string; message: string } {
    const processEntry = this.processManager.get(pid);
    if (!processEntry) {
      throw new Error(`Process with PID ${pid} not found`);
    }

    if (processEntry.status !== 'running') {
      return {
        pid,
        status: processEntry.status,
        message: 'Process already terminated',
      };
    }

    processEntry.process.kill('SIGTERM');
    processEntry.status = 'failed';
    processEntry.stderr += '\nProcess terminated by user';
    this.appendProcessLog(processEntry.registryRecord?.stderrPath, '\nProcess terminated by user');
    this.registry.update(pid, {
      status: 'failed',
      endTime: new Date().toISOString(),
    });

    return {
      pid,
      status: 'terminated',
      message: 'Process terminated successfully',
    };
  }

  cleanupProcesses(): { removed: number; removedPids: number[]; message: string } {
    const removedPids: number[] = [];

    for (const [pid, process] of this.processManager.entries()) {
      if (process.status === 'completed' || process.status === 'failed') {
        removedPids.push(pid);
        this.processManager.delete(pid);
        this.registry.remove(pid);
      }
    }

    for (const process of this.registry.readAll()) {
      const refreshed = this.refreshRegistryStatus(process);
      if (refreshed.status === 'completed' || refreshed.status === 'failed') {
        removedPids.push(process.pid);
        this.registry.remove(process.pid);
      }
    }

    return {
      removed: removedPids.length,
      removedPids,
      message: `Cleaned up ${removedPids.length} finished process(es)`,
    };
  }

  private appendProcessLog(filePath: string | undefined, chunk: string): void {
    if (!filePath) {
      return;
    }

    try {
      appendFileSync(filePath, chunk, 'utf-8');
    } catch {
      // 日志持久化失败不应中断正在运行的模型进程。
    }
  }

  private getProcessSnapshot(pid: number): Omit<TrackedProcess, 'process' | 'registryRecord'> | TrackedProcess | null {
    const running = this.processManager.get(pid);
    if (running) {
      return running;
    }

    const persisted = this.registry.readAll().find((record) => record.pid === pid);
    if (!persisted) {
      return null;
    }

    const refreshed = this.refreshRegistryStatus(persisted);
    return {
      pid: refreshed.pid,
      prompt: refreshed.prompt,
      workFolder: refreshed.workFolder,
      model: refreshed.model,
      toolType: refreshed.agent,
      startTime: refreshed.startTime,
      stdout: this.readLogFile(refreshed.stdoutPath),
      stderr: this.readLogFile(refreshed.stderrPath),
      status: refreshed.status,
      exitCode: refreshed.exitCode,
    };
  }

  private readLogFile(filePath: string): string {
    try {
      return readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private refreshRegistryStatus(record: ProcessRegistryRecord): ProcessRegistryRecord {
    if (record.status !== 'running') {
      return record;
    }

    try {
      process.kill(record.pid, 0);
      return record;
    } catch {
      const refreshed: ProcessRegistryRecord = {
        ...record,
        status: 'failed',
        endTime: record.endTime ?? new Date().toISOString(),
      };
      this.registry.update(record.pid, {
        status: refreshed.status,
        endTime: refreshed.endTime,
      });
      return refreshed;
    }
  }
}
