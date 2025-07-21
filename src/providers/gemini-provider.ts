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
      
      // Get the generative model
      const model = this.client.getGenerativeModel({ 
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
                mimeType: this.getMimeType(audioData.format),
                data: base64Audio
              }
            }
          ]
        }]
      };

      // Make the API request
      const result = await model.generateContent(request);
      const response = result.response;
      
      if (!response) {
        throw new STTError('No response from Gemini API', 'NO_RESPONSE');
      }

      const text = response?.text();
      if (!text) {
        throw new STTError('No text in response', 'NO_TEXT');
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
      'ogg': 'audio/ogg'
    };
    return mimeTypes[format.toLowerCase()] || 'audio/wav';
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
    this.client = null;
    this.usageMetrics = {
      requestCount: 0,
      tokensUsed: 0,
      processingTime: 0,
      audioDuration: 0
    };
  }
}

