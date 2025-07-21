# API Integration Specification

## Overview

This document outlines the integration strategy for speech-to-text providers, with primary focus on Google's Gemini API. The design emphasizes provider abstraction for future extensibility while optimizing for Gemini's specific capabilities and constraints.

## Gemini API Integration

### API Endpoint Configuration
The Gemini API provides speech-to-text capabilities through its generative AI platform with audio processing features.

#### Base Configuration
```typescript
interface GeminiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;                    // Default: 'gemini-2.5-flash'
  maxRequestSize: number;          // 15MB limit
  maxDuration: number;             // 25 minutes per request
  supportedFormats: string[];      // ['wav', 'mp3', 'm4a', 'flac', 'aac']
  rateLimit: RateLimitConfig;
}

interface RateLimitConfig {
  requestsPerMinute: number;       // 300 RPM for standard tier
  requestsPerDay: number;          // 50,000 RPD for standard tier
  tokensPerMinute: number;         // 32,000 TPM for standard tier
  concurrentRequests: number;      // 5 concurrent requests
}
```

### Authentication Flow

#### API Key Management
```typescript
class GeminiAuthManager {
  private apiKey: string;
  private keychain: KeychainManager;
  
  async initialize(): Promise<void> {
    this.apiKey = await this.keychain.getSecureKey('gemini_api_key');
    if (!this.apiKey) {
      throw new Error('Gemini API key not found');
    }
    await this.validateApiKey();
  }
  
  async validateApiKey(): Promise<boolean> {
    try {
      const response = await this.testRequest();
      return response.status === 200;
    } catch (error) {
      throw new AuthenticationError('Invalid API key');
    }
  }
  
  getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': this.apiKey
    };
  }
}
```

#### Secure Storage Implementation
```typescript
interface KeychainManager {
  storeSecureKey(keyId: string, value: string): Promise<void>;
  getSecureKey(keyId: string): Promise<string | null>;
  deleteSecureKey(keyId: string): Promise<void>;
  rotateKey(keyId: string, newValue: string): Promise<void>;
}

// Platform-specific implementations
class MacOSKeychain implements KeychainManager {
  // Uses macOS Keychain Services
}

class WindowsCredentialManager implements KeychainManager {
  // Uses Windows Credential Manager
}

class LinuxSecretService implements KeychainManager {
  // Uses libsecret/gnome-keyring
}
```

### Request Processing

#### Audio Data Preparation
Gemini API requires specific audio formatting and encoding for optimal results.

```typescript
class GeminiAudioProcessor {
  async prepareAudioForAPI(audioBuffer: ArrayBuffer): Promise<PreparedAudio> {
    // Convert to supported format
    const convertedAudio = await this.convertToSupportedFormat(audioBuffer);
    
    // Validate size constraints
    this.validateAudioSize(convertedAudio);
    
    // Encode for transmission
    const encodedAudio = await this.encodeAudio(convertedAudio);
    
    return {
      data: encodedAudio,
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      duration: this.calculateDuration(convertedAudio),
      size: convertedAudio.byteLength
    };
  }
  
  private validateAudioSize(audio: ArrayBuffer): void {
    const maxSize = 15 * 1024 * 1024; // 15MB limit
    if (audio.byteLength > maxSize) {
      throw new Error(`Audio size ${audio.byteLength} exceeds maximum ${maxSize}`);
    }
  }
}
```

#### Request Structure
```typescript
interface GeminiTranscriptionRequest {
  contents: Array<{
    parts: Array<{
      text?: string;
      inline_data?: {
        mime_type: string;
        data: string; // Base64 encoded audio
      };
    }>;
  }>;
  generation_config: {
    temperature: number;
    top_p: number;
    top_k: number;
    max_output_tokens: number;
  };
  safety_settings: SafetySetting[];
}

class GeminiRequestBuilder {
  buildTranscriptionRequest(
    audioData: string, 
    options: TranscriptionOptions
  ): GeminiTranscriptionRequest {
    return {
      contents: [{
        parts: [{
          text: this.buildPrompt(options),
          inline_data: {
            mime_type: 'audio/wav',
            data: audioData
          }
        }]
      }],
      generation_config: {
        temperature: 0.1,
        top_p: 0.8,
        top_k: 40,
        max_output_tokens: 8192
      },
      safety_settings: this.getSafetySettings()
    };
  }
  
  private buildPrompt(options: TranscriptionOptions): string {
    let prompt = 'Please transcribe the following audio accurately. ';
    
    if (options.outputLanguage !== 'auto') {
      prompt += `Provide the transcription in ${options.outputLanguage}. `;
    }
    
    if (options.includeTimestamps) {
      prompt += 'Include approximate timestamps for each sentence. ';
    }
    
    prompt += 'Return only the transcribed text without additional commentary.';
    
    return prompt;
  }
}
```

### Response Processing

#### Response Structure Handling
```typescript
interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finish_reason: string;
    safety_ratings: SafetyRating[];
  }>;
  usage_metadata: {
    prompt_token_count: number;
    candidates_token_count: number;
    total_token_count: number;
  };
}

class GeminiResponseProcessor {
  processTranscriptionResponse(response: GeminiResponse): TranscriptionResult {
    const candidate = response.candidates[0];
    if (!candidate || candidate.finish_reason !== 'STOP') {
      throw new Error('Transcription request did not complete successfully');
    }
    
    const transcribedText = candidate.content.parts[0]?.text;
    if (!transcribedText) {
      throw new Error('No transcription text found in response');
    }
    
    return {
      text: this.cleanTranscriptionText(transcribedText),
      confidence: this.estimateConfidence(candidate),
      language: this.detectLanguage(transcribedText),
      timestamps: this.extractTimestamps(transcribedText),
      usage: response.usage_metadata
    };
  }
  
  private cleanTranscriptionText(text: string): string {
    // Remove markdown formatting, extra whitespace, etc.
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove bold formatting
      .replace(/\n+/g, ' ')             // Replace newlines with spaces
      .trim();
  }
  
  private extractTimestamps(text: string): Timestamp[] {
    // Extract timestamp information if present in response
    const timestampRegex = /\[(\d{2}:\d{2}:\d{2})\]/g;
    const timestamps: Timestamp[] = [];
    let match;
    
    while ((match = timestampRegex.exec(text)) !== null) {
      timestamps.push({
        time: this.parseTimestamp(match[1]),
        position: match.index
      });
    }
    
    return timestamps;
  }
}
```

### Rate Limiting & Connection Management

#### Rate Limiter Implementation
```typescript
class RateLimiter {
  private requests: number[] = [];
  private readonly windowSize: number = 60000; // 1 minute
  private readonly maxRequests: number;
  
  constructor(maxRequestsPerMinute: number) {
    this.maxRequests = maxRequestsPerMinute;
  }
  
  async waitForSlot(): Promise<void> {
    this.cleanOldRequests();
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowSize - (Date.now() - oldestRequest);
      
      if (waitTime > 0) {
        await this.sleep(waitTime);
        return this.waitForSlot();
      }
    }
    
    this.requests.push(Date.now());
  }
  
  private cleanOldRequests(): void {
    const cutoff = Date.now() - this.windowSize;
    this.requests = this.requests.filter(time => time > cutoff);
  }
}
```

#### Connection Pool Management
```typescript
class ConnectionPool {
  private pool: AxiosInstance[] = [];
  private available: AxiosInstance[] = [];
  private inUse: Set<AxiosInstance> = new Set();
  private readonly maxConnections: number;
  
  constructor(maxConnections: number = 5) {
    this.maxConnections = maxConnections;
    this.initializePool();
  }
  
  async getConnection(): Promise<AxiosInstance> {
    if (this.available.length === 0) {
      if (this.pool.length < this.maxConnections) {
        return this.createConnection();
      } else {
        // Wait for connection to become available
        return new Promise((resolve) => {
          const checkAvailable = () => {
            if (this.available.length > 0) {
              resolve(this.acquireConnection());
            } else {
              setTimeout(checkAvailable, 100);
            }
          };
          checkAvailable();
        });
      }
    }
    
    return this.acquireConnection();
  }
  
  releaseConnection(connection: AxiosInstance): void {
    this.inUse.delete(connection);
    this.available.push(connection);
  }
  
  private createConnection(): AxiosInstance {
    const connection = axios.create({
      baseURL: 'https://generativelanguage.googleapis.com',
      timeout: 30000,
      headers: this.getDefaultHeaders()
    });
    
    this.pool.push(connection);
    this.inUse.add(connection);
    
    return connection;
  }
}
```

### Error Handling

#### Error Classification
```typescript
enum GeminiErrorType {
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  INVALID_REQUEST = 'invalid_request',
  SERVER_ERROR = 'server_error',
  NETWORK_ERROR = 'network_error',
  AUDIO_FORMAT = 'audio_format',
  QUOTA_EXCEEDED = 'quota_exceeded'
}

class GeminiErrorHandler {
  classifyError(error: any): GeminiErrorType {
    if (error.response) {
      switch (error.response.status) {
        case 401:
        case 403:
          return GeminiErrorType.AUTHENTICATION;
        case 429:
          return GeminiErrorType.RATE_LIMIT;
        case 400:
          return this.analyzeClientError(error.response.data);
        case 500:
        case 502:
        case 503:
        case 504:
          return GeminiErrorType.SERVER_ERROR;
        default:
          return GeminiErrorType.SERVER_ERROR;
      }
    } else if (error.request) {
      return GeminiErrorType.NETWORK_ERROR;
    } else {
      return GeminiErrorType.INVALID_REQUEST;
    }
  }
  
  async handleError(error: any, context: RequestContext): Promise<TranscriptionResult> {
    const errorType = this.classifyError(error);
    
    switch (errorType) {
      case GeminiErrorType.RATE_LIMIT:
        return this.handleRateLimit(error, context);
      case GeminiErrorType.AUTHENTICATION:
        return this.handleAuthError(error, context);
      case GeminiErrorType.SERVER_ERROR:
        return this.handleServerError(error, context);
      default:
        throw new TranscriptionError(errorType, error.message);
    }
  }
}
```

#### Retry Strategy
```typescript
class RetryManager {
  private readonly maxRetries: number = 3;
  private readonly baseDelay: number = 1000;
  
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: RequestContext
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (!this.shouldRetry(error, attempt)) {
          break;
        }
        
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }
  
  private shouldRetry(error: any, attempt: number): boolean {
    if (attempt >= this.maxRetries) return false;
    
    const errorType = this.errorHandler.classifyError(error);
    
    return [
      GeminiErrorType.RATE_LIMIT,
      GeminiErrorType.SERVER_ERROR,
      GeminiErrorType.NETWORK_ERROR
    ].includes(errorType);
  }
  
  private calculateDelay(attempt: number): number {
    return this.baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
  }
}
```

## Provider Abstraction Layer

### Generic STT Interface
Design a provider-agnostic interface for future extensibility.

```typescript
interface STTProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  
  initialize(config: ProviderConfig): Promise<void>;
  transcribe(audioData: AudioChunk, options: TranscriptionOptions): Promise<TranscriptionResult>;
  getUsageMetrics(): Promise<UsageMetrics>;
  cleanup(): Promise<void>;
}

interface ProviderCapabilities {
  supportedFormats: string[];
  maxFileSize: number;
  maxDuration: number;
  supportedLanguages: string[];
  supportsRealtime: boolean;
  supportsTimestamps: boolean;
  supportsBatchProcessing: boolean;
}

interface TranscriptionOptions {
  language?: string;
  outputLanguage?: string;
  includeTimestamps?: boolean;
  confidenceThreshold?: number;
  customPrompt?: string;
}
```

### Provider Factory
```typescript
class STTProviderFactory {
  private providers: Map<string, STTProvider> = new Map();
  
  registerProvider(name: string, provider: STTProvider): void {
    this.providers.set(name, provider);
  }
  
  createProvider(name: string, config: ProviderConfig): STTProvider {
    const ProviderClass = this.providers.get(name);
    if (!ProviderClass) {
      throw new Error(`Provider ${name} not found`);
    }
    
    return new ProviderClass(config);
  }
  
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Usage
const factory = new STTProviderFactory();
factory.registerProvider('gemini', GeminiProvider);
factory.registerProvider('openai', OpenAIProvider);
factory.registerProvider('whisper', LocalWhisperProvider);

const provider = factory.createProvider('gemini', config);
```

### Provider Implementation

#### Gemini Provider Implementation
```typescript
class GeminiProvider implements STTProvider {
  readonly name = 'gemini';
  readonly capabilities: ProviderCapabilities = {
    supportedFormats: ['wav', 'mp3', 'm4a', 'flac', 'aac'],
    maxFileSize: 15 * 1024 * 1024,
    maxDuration: 25 * 60,
    supportedLanguages: ['en', 'ja', 'auto'],
    supportsRealtime: true,
    supportsTimestamps: true,
    supportsBatchProcessing: true
  };
  
  private client: GeminiClient;
  private rateLimiter: RateLimiter;
  private connectionPool: ConnectionPool;
  
  async initialize(config: ProviderConfig): Promise<void> {
    this.client = new GeminiClient(config);
    this.rateLimiter = new RateLimiter(config.rateLimit.requestsPerMinute);
    this.connectionPool = new ConnectionPool(config.maxConnections);
    
    await this.client.authenticate();
  }
  
  async transcribe(
    audioData: AudioChunk, 
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    await this.rateLimiter.waitForSlot();
    
    const connection = await this.connectionPool.getConnection();
    
    try {
      const preparedAudio = await this.prepareAudio(audioData);
      const request = this.buildRequest(preparedAudio, options);
      const response = await this.client.transcribe(request);
      
      return this.processResponse(response);
    } finally {
      this.connectionPool.releaseConnection(connection);
    }
  }
}
```

## Performance Optimization

### Caching Strategy
Implement intelligent caching to reduce API calls and improve response times.

```typescript
class TranscriptionCache {
  private cache: Map<string, CachedResult> = new Map();
  private readonly maxSize: number = 1000;
  private readonly ttl: number = 24 * 60 * 60 * 1000; // 24 hours
  
  generateKey(audioData: AudioChunk, options: TranscriptionOptions): string {
    const audioHash = this.hashAudioData(audioData);
    const optionsHash = this.hashOptions(options);
    return `${audioHash}-${optionsHash}`;
  }
  
  async get(key: string): Promise<TranscriptionResult | null> {
    const cached = this.cache.get(key);
    
    if (!cached || this.isExpired(cached)) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.result;
  }
  
  set(key: string, result: TranscriptionResult): void {
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      accessCount: 1
    });
  }
}
```

### Batch Processing Optimization
Optimize batch operations for file processing mode.

```typescript
class BatchProcessor {
  private readonly maxBatchSize: number = 5;
  private readonly batchTimeout: number = 2000;
  
  async processBatch(audioChunks: AudioChunk[]): Promise<TranscriptionResult[]> {
    const batches = this.createBatches(audioChunks);
    const results: TranscriptionResult[] = [];
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(chunk => this.processChunk(chunk))
      );
      results.push(...batchResults);
    }
    
    return results;
  }
  
  private createBatches(chunks: AudioChunk[]): AudioChunk[][] {
    const batches: AudioChunk[][] = [];
    
    for (let i = 0; i < chunks.length; i += this.maxBatchSize) {
      batches.push(chunks.slice(i, i + this.maxBatchSize));
    }
    
    return batches;
  }
}
```

## Monitoring & Analytics

### Usage Tracking
Monitor API usage and performance metrics.

```typescript
interface UsageMetrics {
  requestCount: number;
  totalAudioDuration: number;
  averageLatency: number;
  errorRate: number;
  quotaUsage: QuotaUsage;
}

interface QuotaUsage {
  requestsUsed: number;
  requestsRemaining: number;
  tokensUsed: number;
  tokensRemaining: number;
  resetTime: Date;
}

class UsageTracker {
  private metrics: UsageMetrics;
  private metricsHistory: MetricsSnapshot[] = [];
  
  recordRequest(duration: number, latency: number, success: boolean): void {
    this.metrics.requestCount++;
    this.metrics.totalAudioDuration += duration;
    this.updateAverageLatency(latency);
    
    if (!success) {
      this.updateErrorRate();
    }
    
    this.saveSnapshot();
  }
  
  async getQuotaStatus(): Promise<QuotaUsage> {
    // Query API for current quota status
    return this.client.getQuotaUsage();
  }
  
  generateReport(): UsageReport {
    return {
      currentMetrics: this.metrics,
      trends: this.analyzeTrends(),
      recommendations: this.generateRecommendations()
    };
  }
}
```

### Health Monitoring
Monitor system health and API connectivity.

```typescript
class HealthMonitor {
  private readonly checkInterval: number = 30000; // 30 seconds
  private healthStatus: HealthStatus;
  
  startMonitoring(): void {
    setInterval(() => {
      this.performHealthCheck();
    }, this.checkInterval);
  }
  
  async performHealthCheck(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkAPIConnectivity(),
      this.checkQuotaStatus(),
      this.checkSystemResources()
    ]);
    
    this.healthStatus = this.aggregateResults(checks);
    this.notifyHealthStatusChange();
    
    return this.healthStatus;
  }
  
  private async checkAPIConnectivity(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      return false;
    }
  }
}