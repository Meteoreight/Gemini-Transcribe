import { pipeline, Pipeline } from '@xenova/transformers';
import { 
  STTProvider, 
  ProviderCapabilities, 
  ProviderConfig, 
  AudioChunk, 
  TranscriptionOptions, 
  TranscriptionResult, 
  UsageMetrics,
  LocalWhisperConfig,
  STTError 
} from '../shared/types';

export class LocalWhisperProvider implements STTProvider {
  readonly name = 'Local Whisper';
  readonly capabilities: ProviderCapabilities = {
    supportedFormats: ['wav', 'mp3', 'm4a', 'flac', 'aac', 'ogg'],
    maxFileSize: 500 * 1024 * 1024, // 500MB (local processing)
    maxDuration: 60 * 60, // 1 hour
    supportedLanguages: ['auto', 'en', 'ja', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ko', 'zh', 'ar', 'hi', 'tr', 'pl', 'nl'],
    supportsRealtime: true,
    supportsTimestamps: true,
    supportsBatchProcessing: true
  };

  private pipeline: Pipeline | null = null;
  private config: LocalWhisperConfig;
  private usageMetrics: UsageMetrics = {
    requestCount: 0,
    tokensUsed: 0,
    processingTime: 0,
    audioDuration: 0
  };
  private isInitializing = false;
  private modelDownloaded = false;

  constructor(config: ProviderConfig) {
    this.config = config as LocalWhisperConfig;
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config } as LocalWhisperConfig;
    
    if (this.isInitializing) {
      throw new STTError('Provider is already initializing', 'ALREADY_INITIALIZING');
    }

    this.isInitializing = true;

    try {
      // Determine model name based on size
      const modelName = this.getModelName();
      
      console.log(`Initializing Local Whisper with model: ${modelName}`);
      
      // Create the transcription pipeline
      // This will download the model if it's not already cached
      this.pipeline = await pipeline('automatic-speech-recognition', modelName, {
        quantized: true, // Use quantized models for better performance
      } as any);
      
      this.modelDownloaded = true;
      console.log(`Local Whisper initialized successfully with model: ${modelName}`);
      
    } catch (error: any) {
      throw new STTError(`Failed to initialize Local Whisper: ${error.message}`, 'INITIALIZATION_ERROR');
    } finally {
      this.isInitializing = false;
    }
  }

  private getModelName(): string {
    const modelMap: Record<string, string> = {
      'tiny': 'Xenova/whisper-tiny',
      'base': 'Xenova/whisper-base',
      'small': 'Xenova/whisper-small',
      'medium': 'Xenova/whisper-medium',
      'large': 'Xenova/whisper-large-v2',
      'large-v2': 'Xenova/whisper-large-v2',
      'large-v3': 'Xenova/whisper-large-v3'
    };

    return modelMap[this.config.modelSize || 'base'] || 'Xenova/whisper-base';
  }

  async transcribe(audioData: AudioChunk, options: TranscriptionOptions = {}): Promise<TranscriptionResult> {
    if (!this.pipeline) {
      throw new STTError('Provider not initialized', 'NOT_INITIALIZED');
    }

    if (this.isInitializing) {
      throw new STTError('Provider is still initializing', 'STILL_INITIALIZING');
    }

    const startTime = Date.now();

    try {
      // Validate audio size (more lenient for local processing)
      if (audioData.data.byteLength > this.capabilities.maxFileSize) {
        throw new STTError(
          `Audio size ${audioData.data.byteLength} exceeds maximum ${this.capabilities.maxFileSize}`,
          'AUDIO_TOO_LARGE'
        );
      }

      // Convert ArrayBuffer to Float32Array for Transformers.js
      const audioFloat32 = await this.convertAudioData(audioData);

      // Build transcription options
      const transcribeOptions: any = {
        language: options.language !== 'auto' ? options.language : undefined,
        return_timestamps: options.includeTimestamps ? 'word' : false,
      };

      // Add task type for translation
      if (options.outputLanguage && options.outputLanguage !== 'auto' && options.outputLanguage !== options.language) {
        transcribeOptions.task = 'translate';
      }

      console.log('Starting local transcription...', transcribeOptions);

      // Perform transcription
      const result = await this.pipeline(audioFloat32, transcribeOptions);
      
      // Process the result
      const transcriptionResult = this.processResult(result, options);
      
      // Update usage metrics
      const processingTime = Date.now() - startTime;
      this.updateUsageMetrics(processingTime, audioData.duration);

      console.log(`Local transcription completed in ${processingTime}ms`);

      return {
        ...transcriptionResult,
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
      
      // Handle local processing errors
      if (error?.name === 'Error' && error?.message?.includes('CUDA')) {
        throw new STTError('CUDA not available, falling back to CPU', 'CUDA_NOT_AVAILABLE');
      }
      
      if (error?.name === 'Error' && error?.message?.includes('memory')) {
        throw new STTError('Insufficient memory for transcription', 'INSUFFICIENT_MEMORY');
      }
      
      throw new STTError(`Local transcription failed: ${error?.message || 'Unknown error'}`, 'TRANSCRIPTION_ERROR');
    }
  }

  private async convertAudioData(audioData: AudioChunk): Promise<Float32Array> {
    try {
      // If the data is already in the right format, use it
      if (audioData.sampleRate === 16000 && audioData.channels === 1) {
        // Convert ArrayBuffer to Float32Array
        return this.arrayBufferToFloat32Array(audioData.data);
      }

      // For more complex audio conversion, we might need additional processing
      // For now, assume the audio is already in the correct format
      return this.arrayBufferToFloat32Array(audioData.data);
      
    } catch (error: any) {
      throw new STTError(`Failed to convert audio data: ${error.message}`, 'AUDIO_CONVERSION_ERROR');
    }
  }

  private arrayBufferToFloat32Array(buffer: ArrayBuffer): Float32Array {
    // Assuming the audio is 16-bit PCM
    const int16Array = new Int16Array(buffer);
    const float32Array = new Float32Array(int16Array.length);
    
    // Convert 16-bit integers to floats (-1 to 1)
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    
    return float32Array;
  }

  private processResult(result: any, options: TranscriptionOptions): TranscriptionResult {
    let text = '';
    let timestamps: Array<{time: number, position: number, text?: string}> = [];
    
    if (typeof result === 'string') {
      text = result;
    } else if (result.text) {
      text = result.text;
      
      // Extract timestamps if available
      if (result.chunks && options.includeTimestamps) {
        timestamps = result.chunks.map((chunk: any, index: number) => ({
          time: chunk.timestamp ? chunk.timestamp[0] : 0,
          position: index,
          text: chunk.text?.trim()
        }));
      }
    } else {
      throw new STTError('Unexpected result format from local whisper', 'UNEXPECTED_RESULT_FORMAT');
    }

    return {
      text: text.trim(),
      confidence: 0.85, // Local Whisper generally has good confidence
      language: this.detectLanguage(text),
      timestamps
    };
  }

  private detectLanguage(text: string): string {
    // Simple language detection based on character patterns
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) return 'ja';
    if (/[а-яё]/i.test(text)) return 'ru';
    if (/[가-힣]/.test(text)) return 'ko';
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
    if (/[أ-ي]/.test(text)) return 'ar';
    if (/[अ-ह]/.test(text)) return 'hi';
    return 'en'; // Default to English
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
    return this.modelDownloaded && !!this.pipeline;
  }

  async cleanup(): Promise<void> {
    if (this.pipeline) {
      try {
        // Dispose of the pipeline to free memory
        await this.pipeline.dispose?.();
      } catch (error: any) {
        console.warn('Error disposing pipeline:', error);
      }
      this.pipeline = null;
    }
    
    this.modelDownloaded = false;
    this.usageMetrics = {
      requestCount: 0,
      tokensUsed: 0,
      processingTime: 0,
      audioDuration: 0
    };
  }

  // Additional methods specific to local whisper
  getModelSize(): string {
    return this.config.modelSize || 'base';
  }

  isModelDownloaded(): boolean {
    return this.modelDownloaded;
  }

  getEstimatedModelSize(): number {
    // Estimated model sizes in MB
    const sizes: Record<string, number> = {
      'tiny': 39,
      'base': 74,
      'small': 244,
      'medium': 769,
      'large': 1550,
      'large-v2': 1550,
      'large-v3': 1550
    };
    
    return sizes[this.config.modelSize || 'base'] || 74;
  }
}