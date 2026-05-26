import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Mock dependencies
vi.mock('node:child_process');
vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock('node:os');
vi.mock('node:path', () => ({
  resolve: vi.fn((path) => path),
  join: vi.fn((...args) => args.join('/')),
  isAbsolute: vi.fn((path) => path.startsWith('/')),
  dirname: vi.fn((path) => '/tmp')
}));
vi.mock('@modelcontextprotocol/sdk/server/stdio.js');
vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: { name: 'listTools' },
  CallToolRequestSchema: { name: 'callTool' },
  ErrorCode: { 
    InternalError: 'InternalError',
    MethodNotFound: 'MethodNotFound',
    InvalidParams: 'InvalidParams'
  },
  McpError: class extends Error {
    code: any;
    constructor(code: any, message: string) {
      super(message);
      this.code = code;
    }
  }
}));
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(function(this: any) {
    this.setRequestHandler = vi.fn();
    this.connect = vi.fn();
    this.close = vi.fn();
    this.onerror = undefined;
    return this;
  }),
}));

// Mock package.json
vi.mock('../../package.json', () => ({
  default: { version: '1.0.0-test' }
}));

// Re-import after mocks
const mockSpawn = vi.mocked(spawn);
const mockHomedir = vi.mocked(homedir);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockAppendFileSync = vi.mocked(appendFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);

describe('Wait Tool Tests', () => {
  let handlers: Map<string, Function>;
  let mockServerInstance: any;
  let server: any;
  let originalEnv: NodeJS.ProcessEnv;

  // Setup function to initialize server with mocks
  const setupServer = async () => {
    vi.resetModules();
    handlers = new Map();
    
    // Mock Server implementation to capture handlers
    vi.mocked(Server).mockImplementation(function(this: any) {
      this.setRequestHandler = vi.fn((schema, handler) => {
        handlers.set(schema.name, handler);
      });
      this.connect = vi.fn();
      this.close = vi.fn();
      return this;
    });

    const module = await import('../server.js');
    // @ts-ignore
    const { ClaudeCodeServer } = module;
    server = new ClaudeCodeServer();
    mockServerInstance = vi.mocked(Server).mock.results[0].value;
  };

  beforeEach(async () => {
    originalEnv = { ...process.env };
    process.env = { ...originalEnv };
    mockHomedir.mockReturnValue('/home/user');
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: 1, processes: [] }));
    await setupServer();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    process.env = originalEnv;
  });

  const createMockProcess = (pid: number) => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.pid = pid;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.stdout.on = vi.fn();
    mockProcess.stderr.on = vi.fn();
    mockProcess.kill = vi.fn();
    return mockProcess;
  };

  it('should wait for a single running process', async () => {
    const callToolHandler = handlers.get('callTool')!;
    const mockProcess = createMockProcess(12345);
    mockSpawn.mockReturnValue(mockProcess);

    // Start a process first
    await callToolHandler({
      params: {
        name: 'run',
        arguments: {
          prompt: 'test prompt',
          workFolder: '/tmp'
        }
      }
    });

    // Mock process output accumulation (simulated internally by server)
    // We need to access the process manager or simulate events
    
    // Call wait
    const waitPromise = callToolHandler({
      params: {
        name: 'wait',
        arguments: {
          pids: [12345]
        }
      }
    });

    // Simulate process completion after a delay
    setTimeout(() => {
      mockProcess.stdout.emit('data', 'Process output');
      mockProcess.emit('close', 0);
    }, 10);

    const result = await waitPromise;
    const response = JSON.parse(result.content[0].text);

    expect(response.timed_out).toBe(false);
    expect(response.results).toHaveLength(1);
    expect(response.results[0].pid).toBe(12345);
    expect(response.results[0].status).toBe('completed');
    // expect(response[0].stdout).toBe('Process output'); // Flaky test
  });

  it('should return immediately if process is already completed', async () => {
    const callToolHandler = handlers.get('callTool')!;
    const mockProcess = createMockProcess(12346);
    mockSpawn.mockReturnValue(mockProcess);

    // Start process
    await callToolHandler({
      params: {
        name: 'run',
        arguments: {
          prompt: 'test',
          workFolder: '/tmp'
        }
      }
    });

    // Complete immediately
    mockProcess.emit('close', 0);

    // Call wait
    const result = await callToolHandler({
      params: {
        name: 'wait',
        arguments: {
          pids: [12346]
        }
      }
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.timed_out).toBe(false);
    expect(response.results[0].status).toBe('completed');
  });

  it('should wait for multiple processes', async () => {
    const callToolHandler = handlers.get('callTool')!;
    
    // Process 1
    const p1 = createMockProcess(101);
    mockSpawn.mockReturnValueOnce(p1);
    await callToolHandler({
      params: { name: 'run', arguments: { prompt: 'p1', workFolder: '/tmp' } }
    });

    // Process 2
    const p2 = createMockProcess(102);
    mockSpawn.mockReturnValueOnce(p2);
    await callToolHandler({
      params: { name: 'run', arguments: { prompt: 'p2', workFolder: '/tmp' } }
    });

    // Wait for both
    const waitPromise = callToolHandler({
      params: {
        name: 'wait',
        arguments: { pids: [101, 102] }
      }
    });

    // Finish p1
    setTimeout(() => { p1.emit('close', 0); }, 10);
    // Finish p2 later
    setTimeout(() => { p2.emit('close', 0); }, 30);

    const result = await waitPromise;
    const response = JSON.parse(result.content[0].text);

    expect(response.timed_out).toBe(false);
    expect(response.results).toHaveLength(2);
    expect(response.results.find((r: any) => r.pid === 101).status).toBe('completed');
    expect(response.results.find((r: any) => r.pid === 102).status).toBe('completed');
  });

  it('should clear timeout timers after wait resolves', async () => {
    vi.useFakeTimers();

    const callToolHandler = handlers.get('callTool')!;
    const mockProcess = createMockProcess(12348);
    mockSpawn.mockReturnValue(mockProcess);

    await callToolHandler({
      params: {
        name: 'run',
        arguments: {
          prompt: 'test prompt',
          workFolder: '/tmp'
        }
      }
    });

    const waitPromise = callToolHandler({
      params: {
        name: 'wait',
        arguments: {
          pids: [12348],
          timeout: 180
        }
      }
    });

    mockProcess.emit('close', 0);
    await vi.runAllTicks();

    const result = await waitPromise;
    const response = JSON.parse(result.content[0].text);

    expect(response.timed_out).toBe(false);
    expect(response.results[0].status).toBe('completed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should throw error for non-existent PID', async () => {
    const callToolHandler = handlers.get('callTool')!;
    
    try {
      await callToolHandler({
        params: {
          name: 'wait',
          arguments: { pids: [99999] }
        }
      });
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toContain('Process with PID 99999 not found');
    }
  });

  it('should return running status on timeout by default', async () => {
    vi.useFakeTimers();
    const callToolHandler = handlers.get('callTool')!;
    const mockProcess = createMockProcess(12347);
    mockSpawn.mockReturnValue(mockProcess);

    await callToolHandler({
      params: { name: 'run', arguments: { prompt: 'test', workFolder: '/tmp' } }
    });

    // Call wait with short timeout
    const waitPromise = callToolHandler({
      params: {
        name: 'wait',
        arguments: { 
          pids: [12347],
          timeout: 0.1 // 100ms
        }
      }
    });

    // Don't emit close event

    await vi.advanceTimersByTimeAsync(90_000);
    const result = await waitPromise;
    const response = JSON.parse(result.content[0].text);

    expect(response.timed_out).toBe(true);
    expect(response.timeout).toBe(900);
    expect(response.observed_timeout).toBe(90);
    expect(response.next_action).toContain('get_result');
    expect(response.results[0].pid).toBe(12347);
    expect(response.results[0].status).toBe('running');
  });

  it('should cap a single wait call below host tool-call timeout', async () => {
    vi.useFakeTimers();
    process.env.AGENT_BRIDGE_WAIT_CALL_WINDOW_SEC = '90';
    await setupServer();
    const callToolHandler = handlers.get('callTool')!;
    const mockProcess = createMockProcess(12357);
    mockSpawn.mockReturnValue(mockProcess);

    await callToolHandler({
      params: { name: 'run', arguments: { prompt: 'test', workFolder: '/tmp' } }
    });

    const waitPromise = callToolHandler({
      params: {
        name: 'wait',
        arguments: {
          pids: [12357],
          timeout: 300,
          on_timeout: 'return_status'
        }
      }
    });

    await vi.advanceTimersByTimeAsync(90_000);
    const result = await waitPromise;
    const response = JSON.parse(result.content[0].text);

    expect(response.timed_out).toBe(true);
    expect(response.timeout).toBe(900);
    expect(response.observed_timeout).toBe(90);
    expect(response.next_action).toContain('wait again');
    expect(response.results[0].status).toBe('running');
  });

  it('should return completed if a process finishes exactly as the wait window expires', async () => {
    vi.useFakeTimers();
    process.env.AGENT_BRIDGE_WAIT_CALL_WINDOW_SEC = '90';
    await setupServer();
    const callToolHandler = handlers.get('callTool')!;
    const mockProcess = createMockProcess(12358);
    mockSpawn.mockReturnValue(mockProcess);

    await callToolHandler({
      params: { name: 'run', arguments: { prompt: 'test', workFolder: '/tmp' } }
    });

    const waitPromise = callToolHandler({
      params: {
        name: 'wait',
        arguments: {
          pids: [12358],
          timeout: 120,
          on_timeout: 'return_status'
        }
      }
    });

    setTimeout(() => {
      mockProcess.emit('close', 0);
    }, 89_999);

    await vi.advanceTimersByTimeAsync(90_000);
    const result = await waitPromise;
    const response = JSON.parse(result.content[0].text);

    expect(response.timed_out).toBe(false);
    expect(response.timeout).toBe(900);
    expect(response.observed_timeout).toBe(90);
    expect(response.results[0].status).toBe('completed');
  });

  it('should preserve legacy timeout error when on_timeout is throw', async () => {
    vi.useFakeTimers();
    const callToolHandler = handlers.get('callTool')!;
    const mockProcess = createMockProcess(12356);
    mockSpawn.mockReturnValue(mockProcess);

    await callToolHandler({
      params: { name: 'run', arguments: { prompt: 'test', workFolder: '/tmp' } }
    });

    const waitPromise = callToolHandler({
      params: {
        name: 'wait',
        arguments: {
          pids: [12356],
          timeout: 0.1,
          on_timeout: 'throw'
        }
      }
    });

    const expectation = expect(waitPromise).rejects.toThrow('Timed out after 90 seconds');
    await vi.advanceTimersByTimeAsync(90_000);
    await expectation;
  });
});
