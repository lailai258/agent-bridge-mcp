import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentType, ProcessStatus } from './process-service.js';

export const PROCESS_REGISTRY_DIR_ENV = 'AGENT_BRIDGE_PROCESS_REGISTRY_DIR';

export interface ProcessRegistryRecord {
  pid: number;
  agent: AgentType;
  status: ProcessStatus;
  startTime: string;
  endTime?: string;
  workFolder: string;
  prompt: string;
  model?: string;
  command: string;
  args: string[];
  stdoutPath: string;
  stderrPath: string;
  exitCode?: number;
}

interface ProcessRegistryPayload {
  version: 1;
  processes: ProcessRegistryRecord[];
}

export class ProcessRegistry {
  private readonly baseDir: string;
  private readonly logsDir: string;
  private readonly registryPath: string;

  constructor(baseDir = process.env[PROCESS_REGISTRY_DIR_ENV] || join(homedir(), '.agent-bridge-mcp')) {
    this.baseDir = baseDir;
    this.logsDir = join(baseDir, 'logs');
    this.registryPath = join(baseDir, 'processes.json');
  }

  ensureDirectories(): void {
    mkdirSync(this.logsDir, { recursive: true });
  }

  buildLogPaths(pid: number): { stdoutPath: string; stderrPath: string } {
    this.ensureDirectories();
    return {
      stdoutPath: join(this.logsDir, `${pid}.stdout.log`),
      stderrPath: join(this.logsDir, `${pid}.stderr.log`),
    };
  }

  readAll(): ProcessRegistryRecord[] {
    if (!existsSync(this.registryPath)) {
      return [];
    }

    try {
      const parsed = JSON.parse(readFileSync(this.registryPath, 'utf-8')) as Partial<ProcessRegistryPayload>;
      if (!Array.isArray(parsed.processes)) {
        return [];
      }

      return parsed.processes.filter((record): record is ProcessRegistryRecord => {
        return typeof record?.pid === 'number'
          && typeof record.agent === 'string'
          && typeof record.status === 'string'
          && typeof record.startTime === 'string'
          && typeof record.workFolder === 'string'
          && typeof record.prompt === 'string'
          && typeof record.command === 'string'
          && Array.isArray(record.args)
          && typeof record.stdoutPath === 'string'
          && typeof record.stderrPath === 'string';
      });
    } catch {
      return [];
    }
  }

  upsert(record: ProcessRegistryRecord): void {
    this.writeAll([
      ...this.readAll().filter((existing) => existing.pid !== record.pid),
      record,
    ]);
  }

  update(pid: number, patch: Partial<ProcessRegistryRecord>): void {
    const records = this.readAll();
    let changed = false;
    const updated = records.map((record) => {
      if (record.pid !== pid) {
        return record;
      }

      changed = true;
      return { ...record, ...patch };
    });

    if (changed) {
      this.writeAll(updated);
    }
  }

  remove(pid: number): void {
    this.writeAll(this.readAll().filter((record) => record.pid !== pid));
  }

  private writeAll(processes: ProcessRegistryRecord[]): void {
    this.ensureDirectories();
    const payload: ProcessRegistryPayload = {
      version: 1,
      processes,
    };
    writeFileSync(this.registryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  }
}
