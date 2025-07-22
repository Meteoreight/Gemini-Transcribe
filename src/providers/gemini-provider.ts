import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  STTProvider, 
  ProviderCapabilities, 
  ProviderConfig, 
  AudioChunk, 
  TranscriptionOptions, 
  TranscriptionResult, 
  UsageMetrics,
  GeminiConfig,
  STTError 
} from '../shared/types';

export class GeminiProvider implements STTProvider {
  readonly name = 'Gemini';
  readonly capabilities: ProviderCapabilities = {
    supportedFormats: ['wav', 'mp3', 'm4a', 'flac', 'aac', 'ogg'],
    maxFileSize: 15 * 1024 * 1024, // 15MB
    maxDuration: 25 * 60, // 25 minutes
    supportedLanguages: ['auto', 'en', 'ja', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ko', 'zh'],
    supportsRealtime: true,
    supportsTimestamps: true,
    supportsBatchProcessing: true
  };

  private client: GoogleGenerativeAI | null = null;
  private config: GeminiConfig;
  private usageMetrics: UsageMetrics = {
    requestCount: 0,
    tokensUsed: 0,
    processingTime: 0,
    audioDuration: 0
  };
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 500; // Minimum 500ms between requests
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue: boolean = false;
  private consecutiveErrors: number = 0;
  private lastErrorTime: number = 0;
  private connectionHealthy: boolean = true;

  constructor(config: ProviderConfig) {
    this.config = config as GeminiConfig;
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config } as GeminiConfig;
    
    if (!this.config.apiKey) {
      throw new STTError('Gemini API key is required', 'MISSING_API_KEY');
    }

    try {
      this.client = new GoogleGenerativeAI(this.config.apiKey);
      
      // Test the API key by making a simple request
      await this.validateApiKey();
    } catch (error: any) {
      throw new STTError(`Failed to initialize Gemini provider: ${error.message}`, 'INITIALIZATION_ERROR');
    }
  }

  private async validateApiKey(): Promise<void> {
    if (!this.client) {
      throw new STTError('Client not initialized', 'CLIENT_NOT_INITIALIZED');
    }

    try {
      const model = this.client.getGenerativeModel({ model: this.config.model });
      
      // Test with a minimal request
      await model.generateContent({
        contents: [{
          role: 'user',
          parts: [{
            text: 'Hello'
          }]
        }]
      });
    } catch (error: any) {
      if (error.status === 401 || error.status === 403) {
        throw new STTError('Invalid Gemini API key', 'INVALID_API_KEY');
      }
      throw error;
    }
  }

  async transcribe(audioData: AudioChunk, options: TranscriptionOptions = {}): Promise<TranscriptionResult> {
    if (!this.client) {
      throw new STTError('Provider not initialized', 'NOT_INITIALIZED');
    }

    return this.transcribeWithRetry(audioData, options, 3);
  }

  private async transcribeWithRetry(audioData: AudioChunk, options: TranscriptionOptions, maxRetries: number): Promise<TranscriptionResult> {
    let lastError: STTError | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Validate audio data before processing
        this.validateAudioData(audioData);
        
        // Queue the request to prevent concurrent API calls
        const result = await this.queueRequest(() => this.performTranscription(audioData, options));
        
        // Success - reset error tracking
        this.consecutiveErrors = 0;
        this.connectionHealthy = true;
        
        return result;
        
      } catch (error: any) {
        this.consecutiveErrors++;
        this.lastErrorTime = Date.now();
        
        lastError = error instanceof STTError ? error : new STTError(`Transcription failed: ${error.message}`, 'TRANSCRIPTION_ERROR');
        
        console.log(`Transcription attempt ${attempt + 1} failed:`, lastError.message);
        console.log(`Consecutive errors: ${this.consecutiveErrors}`);
        
        // Mark connection as unhealthy after multiple consecutive errors
        if (this.consecutiveErrors >= 3) {
          this.connectionHealthy = false;
        }
        
        // Don't retry non-retryable errors
        if (!lastError.retryable || attempt >= maxRetries) {
          break;
        }
        
        // Enhanced backoff strategy based on error type and consecutive failures
        const delay = this.calculateRetryDelay(attempt, lastError, this.consecutiveErrors);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Reset client if connection appears unhealthy
        if (!this.connectionHealthy && this.config.apiKey) {
          console.log('Resetting client due to connection issues');
          await this.resetConnection();
        }
      }
    }
    
    throw lastError;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Dynamic rate limiting based on connection health
    let effectiveInterval = this.minRequestInterval;
    if (!this.connectionHealthy) {
      effectiveInterval = Math.min(this.minRequestInterval * 2, 2000); // Up to 2 seconds if unhealthy
    }
    
    // Additional delay if we've had recent errors
    if (this.consecutiveErrors > 0 && (now - this.lastErrorTime) < 5000) {
      effectiveInterval += this.consecutiveErrors * 200; // Add 200ms per consecutive error
    }
    
    if (timeSinceLastRequest < effectiveInterval) {
      const delay = effectiveInterval - timeSinceLastRequest;
      console.log(`Rate limiting: waiting ${delay}ms (health: ${this.connectionHealthy}, errors: ${this.consecutiveErrors})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }
  
  private validateAudioData(audioData: AudioChunk): void {
    if (!audioData || !audioData.data) {
      throw new STTError('Invalid audio data: missing data buffer', 'INVALID_AUDIO_DATA');
    }
    
    if (audioData.data.byteLength === 0) {
      throw new STTError('Invalid audio data: empty data buffer', 'EMPTY_AUDIO_DATA');
    }
    
    if (!audioData.format || audioData.format.trim() === '') {
      throw new STTError('Invalid audio data: missing or empty format', 'MISSING_AUDIO_FORMAT');
    }
    
    if (audioData.duration <= 0) {
      throw new STTError('Invalid audio data: invalid duration', 'INVALID_AUDIO_DURATION');
    }
    
    console.log(`Audio data validation passed: ${audioData.data.byteLength} bytes, ${audioData.duration}s, format: ${audioData.format}`);
  }
  
  private async queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          await this.enforceRateLimit();
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.processQueue();
    });
  }
  
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    try {
      while (this.requestQueue.length > 0) {
        const request = this.requestQueue.shift();
        if (request) {
          await request();
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }
  
  private calculateRetryDelay(attempt: number, error: STTError, consecutiveErrors: number): number {
    // Base exponential backoff
    let delay = Math.min(500 * Math.pow(2, attempt), 10000); // 500ms, 1s, 2s, 4s, max 10s
    
    // Adjust based on error type
    if (error.code === 'RATE_LIMIT') {
      // More aggressive backoff for rate limits
      delay = Math.min(2000 * Math.pow(2, attempt), 30000); // Up to 30 seconds
    } else if (error.code === 'SERVER_ERROR') {
      // Moderate backoff for server errors
      delay = Math.min(1000 * Math.pow(1.5, attempt), 15000); // Up to 15 seconds
    }
    
    // Additional penalty for consecutive errors
    if (consecutiveErrors > 1) {
      delay += (consecutiveErrors - 1) * 500; // Add 500ms per additional consecutive error
    }
    
    return Math.floor(delay);
  }
  
  private async resetConnection(): Promise<void> {
    console.log('Resetting Gemini API connection...');
    
    if (!this.config.apiKey) {
      throw new STTError('API key is required for connection reset', 'MISSING_API_KEY');
    }
    
    try {
      // Clear the old client
      this.client = null;
      
      // Create a new client instance
      this.client = new GoogleGenerativeAI(this.config.apiKey);
      
      // Test the new connection
      await this.validateApiKey();
      
      console.log('Connection reset successful');
      this.connectionHealthy = true;
      this.consecutiveErrors = 0;
      
    } catch (error: any) {
      console.error('Failed to reset connection:', error);
      this.connectionHealthy = false;
      throw new STTError(`Failed to reset connection: ${error.message}`, 'CONNECTION_RESET_FAILED');
    }
  }

  private async performTranscription(audioData: AudioChunk, options: TranscriptionOptions): Promise<TranscriptionResult> {
    const startTime = Date.now();

    try {
      // Validate audio size
      if (audioData.data.byteLength > this.capabilities.maxFileSize) {
        throw new STTError(
          `Audio size ${audioData.data.byteLength} exceeds maximum ${this.capabilities.maxFileSize}`,
          'AUDIO_TOO_LARGE'
        );
      }

      // Validate duration
      if (audioData.duration > this.capabilities.maxDuration) {
        throw new STTError(
          `Audio duration ${audioData.duration}s exceeds maximum ${this.capabilities.maxDuration}s`,
          'AUDIO_TOO_LONG'
        );
      }

      // Convert audio data to base64
      const base64Audio = this.arrayBufferToBase64(audioData.data);
      const mimeType = this.getMimeType(audioData.format);
      
      // Log audio information for debugging
      console.log('Gemini transcription request:', {
        audioSize: audioData.data.byteLength,
        duration: audioData.duration,
        format: audioData.format,
        mimeType: mimeType,
        base64Length: base64Audio.length
      });
      
      // Get the generative model
      const model = this.client!.getGenerativeModel({ 
        model: this.config.model,
        generationConfig: {
          temperature: this.config.temperature ?? 0.1,
          topP: this.config.topP ?? 0.8,
          topK: this.config.topK ?? 40,
          maxOutputTokens: 8192,
        }
      });

      // Build the prompt
      const prompt = this.buildPrompt(options);

      // Create the request
      const request = {
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio
              }
            }
          ]
        }]
      };

      // Make the API request
      const result = await model.generateContent(request);
      const response = result.response;
      
      // Enhanced debugging information
      console.log('Gemini API response:', {
        hasResponse: !!response,
        hasText: !!response?.text,
        candidates: response?.candidates?.length || 0,
        finishReason: response?.candidates?.[0]?.finishReason,
        usageMetadata: response?.usageMetadata
      });
      
      if (!response) {
        throw new STTError('No response from Gemini API', 'NO_RESPONSE');
      }

      const text = response?.text();
      if (!text || text.trim().length === 0) {
        // Log more detailed response info for debugging
        console.error('Empty response details:', {
          text: text,
          candidates: response.candidates,
          finishReason: response.candidates?.[0]?.finishReason,
          safetyRatings: response.candidates?.[0]?.safetyRatings
        });
        
        // Check if response was blocked by safety filters
        if (response.candidates?.[0]?.finishReason === 'SAFETY') {
          throw new STTError('Audio content was blocked by safety filters', 'CONTENT_BLOCKED');
        }
        
        // Check if response was too short
        if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
          throw new STTError('Response truncated due to token limit', 'TOKEN_LIMIT');
        }
        
        throw new STTError('No text in response - audio may be silent or unsupported format', 'NO_TEXT');
      }

      // Process the response
      const transcriptionResult = this.processResponse(text, options);
      
      // Update usage metrics
      const processingTime = Date.now() - startTime;
      this.updateUsageMetrics(processingTime, audioData.duration, response?.usageMetadata);

      return {
        ...transcriptionResult,
        usage: {
          processingTime,
          audioDuration: audioData?.duration || 0,
          tokensUsed: response?.usageMetadata?.totalTokenCount || 0,
          requestCount: 1
        }
      };

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      this.usageMetrics.processingTime = (this.usageMetrics.processingTime || 0) + processingTime;
      
      if (error instanceof STTError) {
        throw error;
      }
      
      // Handle Gemini API specific errors
      if (error.status) {
        switch (error.status) {
          case 400:
            throw new STTError('Invalid request format', 'INVALID_REQUEST');
          case 401:
          case 403:
            throw new STTError('Authentication failed', 'AUTH_ERROR');
          case 429:
            throw new STTError('Rate limit exceeded', 'RATE_LIMIT', true);
          case 500:
          case 502:
          case 503:
          case 504:
            throw new STTError('Server error', 'SERVER_ERROR', true);
          default:
            throw new STTError(`API error: ${error.message}`, 'API_ERROR');
        }
      }
      
      throw new STTError(`Transcription failed: ${error.message}`, 'TRANSCRIPTION_ERROR');
    }
  }

  private buildPrompt(options: TranscriptionOptions): string {
    let prompt = 'Please transcribe the following audio accurately. ';
    
    if (options.outputLanguage && options.outputLanguage !== 'auto') {
      const languageMap: Record<string, string> = {
        'en': 'English',
        'ja': 'Japanese',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'ru': 'Russian',
        'ko': 'Korean',
        'zh': 'Chinese'
      };
      const language = languageMap[options.outputLanguage] || options.outputLanguage;
      prompt += `Provide the transcription in ${language}. `;
    }
    
    if (options.includeTimestamps) {
      prompt += 'Include approximate timestamps in the format [HH:MM:SS] for key sentences or phrases. ';
    }
    
    if (options.customPrompt) {
      prompt += options.customPrompt + ' ';
    }
    
    prompt += 'Return only the transcribed text without additional commentary or explanations.';
    
    return prompt;
  }

  private processResponse(text: string, options: TranscriptionOptions): TranscriptionResult {
    // Clean up the response text
    let cleanedText = text
      .replace(/^\*\*(.*?)\*\*$/gm, '$1') // Remove bold formatting
      .replace(/\n+/g, ' ') // Replace multiple newlines with spaces
      .trim();

    // Extract timestamps if requested
    const timestamps = options.includeTimestamps ? this.extractTimestamps(cleanedText) : [];
    
    // Remove timestamp markers from the final text
    if (timestamps.length > 0) {
      cleanedText = cleanedText.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').replace(/\s+/g, ' ').trim();
    }

    return {
      text: cleanedText,
      confidence: this.estimateConfidence(cleanedText),
      language: this.detectLanguage(cleanedText),
      timestamps
    };
  }

  private extractTimestamps(text: string): Array<{time: number, position: number, text?: string}> {
    const timestampRegex = /\[(\d{2}):(\d{2}):(\d{2})\]/g;
    const timestamps: Array<{time: number, position: number, text?: string}> = [];
    let match;

    while ((match = timestampRegex.exec(text)) !== null) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const seconds = parseInt(match[3], 10);
      const timeInSeconds = hours * 3600 + minutes * 60 + seconds;

      timestamps.push({
        time: timeInSeconds,
        position: match.index
      });
    }

    return timestamps;
  }

  private estimateConfidence(text: string): number {
    // Simple heuristic based on text characteristics
    if (!text || text.length < 5) return 0.3;
    
    const hasProperCapitalization = /^[A-Z]/.test(text.trim());
    const hasReasonableLength = text.length > 10 && text.length < 2000;
    const hasWords = /\w+/.test(text);
    const hasMinimalRepeats = !/((.{2,})\2{3,})/.test(text);
    
    let confidence = 0.5;
    if (hasProperCapitalization) confidence += 0.1;
    if (hasReasonableLength) confidence += 0.2;
    if (hasWords) confidence += 0.1;
    if (hasMinimalRepeats) confidence += 0.1;
    
    return Math.min(confidence, 0.95);
  }

  private detectLanguage(text: string): string {
    // Simple language detection based on character patterns
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) return 'ja';
    if (/[а-яё]/i.test(text)) return 'ru';
    if (/[가-힣]/.test(text)) return 'ko';
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
    return 'en'; // Default to English
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      'wav': 'audio/wav',
      'mp3': 'audio/mpeg',
      'm4a': 'audio/m4a',
      'flac': 'audio/flac',
      'aac': 'audio/aac',
      'ogg': 'audio/ogg',
      'webm': 'audio/webm', // WebM audio format
      'opus': 'audio/ogg' // Opus is often in OGG container
    };
    
    const lowerFormat = format.toLowerCase();
    
    // Handle WebM with specific codecs
    if (lowerFormat.includes('webm')) {
      return 'audio/webm';
    }
    
    // Handle audio/webm MIME type passed from MediaRecorder
    if (lowerFormat.startsWith('audio/')) {
      return lowerFormat;
    }
    
    return mimeTypes[lowerFormat] || 'audio/wav';
  }

  private updateUsageMetrics(processingTime: number, audioDuration: number, usageMetadata?: any): void {
    this.usageMetrics.requestCount = (this.usageMetrics.requestCount || 0) + 1;
    this.usageMetrics.processingTime = (this.usageMetrics.processingTime || 0) + processingTime;
    this.usageMetrics.audioDuration = (this.usageMetrics.audioDuration || 0) + audioDuration;
    
    if (usageMetadata?.totalTokenCount) {
      this.usageMetrics.tokensUsed = (this.usageMetrics.tokensUsed || 0) + usageMetadata.totalTokenCount;
    }
  }

  async getUsageMetrics(): Promise<UsageMetrics> {
    return { ...this.usageMetrics };
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.model);
  }

  async cleanup(): Promise<void> {
    // Clear the request queue
    this.requestQueue = [];
    this.isProcessingQueue = false;
    
    // Reset error tracking
    this.consecutiveErrors = 0;
    this.connectionHealthy = true;
    this.lastErrorTime = 0;
    
    // Clear client
    this.client = null;
    
    // Reset usage metrics
    this.usageMetrics = {
      requestCount: 0,
      tokensUsed: 0,
      processingTime: 0,
      audioDuration: 0
    };
  }
}

