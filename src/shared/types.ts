// Common types and interfaces for the application

export interface AudioChunk {
  data: ArrayBuffer;
  duration: number;
  timestamp: number;
  format: string;
  sampleRate: number;
  channels: number;
}

export interface TranscriptionOptions {
  language?: string;
  outputLanguage?: string;
  includeTimestamps?: boolean;
  confidenceThreshold?: number;
  customPrompt?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
  timestamps?: Timestamp[];
  usage?: UsageMetrics;
}

export interface Timestamp {
  time: number;
  position: number;
  text?: string;
}

export interface UsageMetrics {
  requestCount?: number;
  tokensUsed?: number;
  processingTime?: number;
  audioDuration?: number;
}

export interface ProviderCapabilities {
  supportedFormats: string[];
  maxFileSize: number;
  maxDuration: number;
  supportedLanguages: string[];
  supportsRealtime: boolean;
  supportsTimestamps: boolean;
  supportsBatchProcessing: boolean;
}

export interface ProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  rateLimit?: RateLimitConfig;
  [key: string]: any;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerDay?: number;
  tokensPerMinute?: number;
  concurrentRequests: number;
}

// STT Provider Interface
export interface STTProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  
  initialize(config: ProviderConfig): Promise<void>;
  transcribe(audioData: AudioChunk, options: TranscriptionOptions): Promise<TranscriptionResult>;
  getUsageMetrics(): Promise<UsageMetrics>;
  cleanup(): Promise<void>;
  isConfigured(): boolean;
}

export enum ProviderType {
  GEMINI = 'gemini',
  OPENAI = 'openai',
  LOCAL_WHISPER = 'local_whisper'
}

export interface AppSettings {
  currentProvider: ProviderType;
  providers: {
    [ProviderType.GEMINI]: GeminiConfig;
    [ProviderType.OPENAI]: OpenAIConfig;
    [ProviderType.LOCAL_WHISPER]: LocalWhisperConfig;
  };
  chunkDuration: number;
  outputDirectory: string;
  outputFormat: string;
  autoSave: boolean;
  includeTimestamps: boolean;
}

export interface GeminiConfig extends ProviderConfig {
  model: string;
  temperature?: number;
  topP?: number;
  topK?: number;
}

export interface OpenAIConfig extends ProviderConfig {
  model: string;
  temperature?: number;
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
}

export interface LocalWhisperConfig extends ProviderConfig {
  modelSize: 'tiny' | 'base' | 'small' | 'medium' | 'large' | 'large-v2' | 'large-v3';
  language?: string;
  device?: 'cpu' | 'cuda';
  threads?: number;
}

export class STTError extends Error {
  type: string;
  code?: string;
  retryable?: boolean;
  provider?: string;

  constructor(message: string, type: string, retryable: boolean = false, code?: string) {
    super(message);
    this.name = 'STTError';
    this.type = type;
    this.code = code;
    this.retryable = retryable;
  }
}