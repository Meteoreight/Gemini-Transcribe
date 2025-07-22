import OpenAI, { toFile } from 'openai';
import { 
  STTProvider, 
  ProviderCapabilities, 
  ProviderConfig, 
  AudioChunk, 
  TranscriptionOptions, 
  TranscriptionResult, 
  UsageMetrics,
  OpenAIConfig,
  STTError 
} from '../shared/types';

export class OpenAIProvider implements STTProvider {
  readonly name = 'OpenAI Whisper';
  readonly capabilities: ProviderCapabilities = {
    supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
    maxFileSize: 25 * 1024 * 1024, // 25MB
    maxDuration: 30 * 60, // 30 minutes (estimated)
    supportedLanguages: ['auto', 'en', 'ja', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ko', 'zh', 'ar', 'hi', 'tr', 'pl', 'nl'],
    supportsRealtime: true,
    supportsTimestamps: true,
    supportsBatchProcessing: true
  };

  private client: OpenAI | null = null;
  private config: OpenAIConfig;
  private usageMetrics: UsageMetrics = {
    requestCount: 0,
    tokensUsed: 0,
    processingTime: 0,
    audioDuration: 0
  };

  constructor(config: ProviderConfig) {
    this.config = config as OpenAIConfig;
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config } as OpenAIConfig;
    
    if (!this.config.apiKey) {
      throw new STTError('OpenAI API key is required', 'MISSING_API_KEY');
    }

    try {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl,
        timeout: this.config.timeout || 30000,
        maxRetries: this.config.maxRetries || 3
      });
      
      // Test the API key
      await this.validateApiKey();
    } catch (error: any) {
      throw new STTError(`Failed to initialize OpenAI provider: ${error?.message || 'Unknown error'}`, 'INITIALIZATION_ERROR');
    }
  }

  private async validateApiKey(): Promise<void> {
    if (!this.client) {
      throw new STTError('Client not initialized', 'CLIENT_NOT_INITIALIZED');
    }

    try {
      // Test with a simple API call to verify the key
      await this.client.models.list();
    } catch (error: any) {
      if (error?.status === 401) {
        throw new STTError('Invalid OpenAI API key', 'INVALID_API_KEY');
      }
      // Don't throw for other errors as they might be temporary
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

      // Validate audio format
      const format = audioData.format?.toLowerCase() || 'wav';
      if (!this.capabilities.supportedFormats.includes(format)) {
        throw new STTError(
          `Audio format '${format}' is not supported. Supported formats: ${this.capabilities.supportedFormats.join(', ')}`,
          'UNSUPPORTED_FORMAT'
        );
      }

      // Validate audio data
      if (!audioData.data || audioData.data.byteLength === 0) {
        throw new STTError('Audio data is empty or invalid', 'INVALID_AUDIO_DATA');
      }

      // Create a File-like object from the audio data using OpenAI's toFile utility
      const audioFile = await toFile(
        new Uint8Array(audioData.data), 
        `audio.${audioData.format || 'wav'}`,
        { 
          type: this.getMimeType(audioData.format || 'wav')
        }
      );

      // Build transcription parameters
      const transcriptionParams: OpenAI.Audio.TranscriptionCreateParams = {
        file: audioFile,
        model: this.config.model || 'whisper-1',
        response_format: this.getResponseFormat(options),
        temperature: this.config.temperature || 0,
      };

      // Add language if specified
      if (options.language && options.language !== 'auto') {
        transcriptionParams.language = this.mapLanguageCode(options.language) as any;
      }

      // Add prompt if specified
      if (options.customPrompt) {
        transcriptionParams.prompt = options.customPrompt;
      }

      // Add timestamp granularity for supported formats
      if (options.includeTimestamps && transcriptionParams.response_format && ['verbose_json', 'srt', 'vtt'].includes(transcriptionParams.response_format)) {
        (transcriptionParams as any).timestamp_granularities = ['segment'];
      }

      // Log request details for debugging
      console.log('OpenAI transcription request details:', {
        model: transcriptionParams.model,
        fileSize: audioData.data.byteLength,
        format: audioData.format,
        mimeType: this.getMimeType(audioData.format || 'wav'),
        duration: audioData.duration,
        responseFormat: transcriptionParams.response_format,
        temperature: transcriptionParams.temperature,
        hasPrompt: !!transcriptionParams.prompt,
        hasLanguage: !!transcriptionParams.language
      });

      // Make the API request
      const response = await this.client.audio.transcriptions.create(transcriptionParams);
      
      // Process the response based on format
      const result = this.processResponse(response, options);
      
      // Update usage metrics
      const processingTime = Date.now() - startTime;
      this.updateUsageMetrics(processingTime, audioData?.duration || 0);

      return {
        ...result,
        usage: {
          processingTime,
          audioDuration: audioData?.duration || 0,
          requestCount: 1
        }
      };

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      this.usageMetrics.processingTime = (this.usageMetrics.processingTime || 0) + processingTime;
      
      if (error instanceof STTError) {
        throw error;
      }
      
      // Handle OpenAI API specific errors
      if (error?.status) {
        console.error('OpenAI API Error Details:', {
          status: error.status,
          code: error.code,
          type: error.type,
          message: error.message,
          param: error.param,
          error: error.error
        });

        switch (error.status) {
          case 400:
            const detailedMessage = error?.error?.message || error?.message || 'Invalid request format or file';
            throw new STTError(`Invalid request: ${detailedMessage}`, 'INVALID_REQUEST');
          case 401:
            throw new STTError('Authentication failed - check API key', 'AUTH_ERROR');
          case 413:
            throw new STTError('File too large - maximum 25MB supported', 'AUDIO_TOO_LARGE');
          case 429:
            throw new STTError('Rate limit exceeded - please try again later', 'RATE_LIMIT', true);
          case 500:
          case 502:
          case 503:
          case 504:
            throw new STTError(`Server error (${error.status}) - please try again`, 'SERVER_ERROR', true);
          default:
            throw new STTError(`API error (${error.status}): ${error?.message || 'Unknown error'}`, 'API_ERROR');
        }
      }
      
      throw new STTError(`Transcription failed: ${error?.message || 'Unknown error'}`, 'TRANSCRIPTION_ERROR');
    }
  }

  private getResponseFormat(options: TranscriptionOptions): 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt' {
    if (options.includeTimestamps) {
      return this.config.responseFormat === 'srt' || this.config.responseFormat === 'vtt' 
        ? this.config.responseFormat 
        : 'verbose_json';
    }
    return this.config.responseFormat || 'json';
  }

  private processResponse(response: any, options: TranscriptionOptions): TranscriptionResult {
    const format = this.getResponseFormat(options);
    
    switch (format) {
      case 'text':
        return {
          text: response,
          confidence: 0.8 // OpenAI doesn't provide confidence scores
        };
        
      case 'json':
        return {
          text: response.text || '',
          confidence: 0.8,
          language: response.language
        };
        
      case 'verbose_json':
        return {
          text: response.text || '',
          confidence: 0.8,
          language: response.language,
          timestamps: this.extractTimestampsFromVerbose(response)
        };
        
      case 'srt':
      case 'vtt':
        return {
          text: this.extractTextFromSubtitles(response),
          confidence: 0.8,
          timestamps: this.extractTimestampsFromSubtitles(response, format)
        };
        
      default:
        return {
          text: typeof response === 'string' ? response : response.text || '',
          confidence: 0.8
        };
    }
  }

  private extractTimestampsFromVerbose(response: any): Array<{time: number, position: number, text?: string}> {
    if (!response.segments) return [];
    
    return response.segments.map((segment: any, index: number) => ({
      time: segment.start || 0,
      position: index,
      text: segment.text?.trim()
    }));
  }

  private extractTextFromSubtitles(subtitles: string): string {
    // Extract plain text from SRT/VTT format
    return subtitles
      .replace(/^\d+$/gm, '') // Remove sequence numbers
      .replace(/\d{2}:\d{2}:\d{2}[,\.]\d{3} --> \d{2}:\d{2}:\d{2}[,\.]\d{3}/g, '') // Remove timestamps
      .replace(/WEBVTT/g, '') // Remove VTT header
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();
  }

  private extractTimestampsFromSubtitles(subtitles: string, format: string): Array<{time: number, position: number, text?: string}> {
    const timestamps: Array<{time: number, position: number, text?: string}> = [];
    const separator = format === 'srt' ? ',' : '.';
    const timestampRegex = new RegExp(`(\\d{2}:\\d{2}:\\d{2})[${separator}](\\d{3}) --> (\\d{2}:\\d{2}:\\d{2})[${separator}](\\d{3})`, 'g');
    
    let match;
    while ((match = timestampRegex.exec(subtitles)) !== null) {
      const startTime = this.parseTimestamp(match[1], match[2]);
      timestamps.push({
        time: startTime,
        position: match.index
      });
    }
    
    return timestamps;
  }

  private parseTimestamp(timeStr: string, millisStr: string): number {
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    const milliseconds = Number(millisStr);
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  }

  private mapLanguageCode(language: string): string {
    // Map some common language codes to OpenAI's expected format
    const languageMap: Record<string, string> = {
      'ja': 'japanese',
      'en': 'english',
      'es': 'spanish',
      'fr': 'french',
      'de': 'german',
      'it': 'italian',
      'pt': 'portuguese',
      'ru': 'russian',
      'ko': 'korean',
      'zh': 'chinese',
      'ar': 'arabic',
      'hi': 'hindi',
      'tr': 'turkish',
      'pl': 'polish',
      'nl': 'dutch'
    };
    
    return languageMap[language] || language;
  }

  private getMimeType(format: string): string {
    if (!format || format.trim() === '') {
      return 'audio/wav';
    }
    
    const mimeTypes: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'mp4': 'audio/mp4',
      'mpeg': 'audio/mpeg',
      'mpga': 'audio/mpeg',
      'm4a': 'audio/m4a',
      'wav': 'audio/wav',
      'webm': 'audio/webm'
    };
    
    const lowerFormat = format.toLowerCase().trim();
    
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

  private updateUsageMetrics(processingTime: number, audioDuration: number): void {
    this.usageMetrics.requestCount = (this.usageMetrics.requestCount || 0) + 1;
    this.usageMetrics.processingTime = (this.usageMetrics.processingTime || 0) + processingTime;
    this.usageMetrics.audioDuration = (this.usageMetrics.audioDuration || 0) + audioDuration;
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