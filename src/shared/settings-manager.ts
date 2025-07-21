import { AppSettings, ProviderType, GeminiConfig, OpenAIConfig, LocalWhisperConfig } from './types';

export class SettingsManager {
  private static readonly STORAGE_KEY = 'transcribe-settings';
  private settings: AppSettings;

  constructor() {
    this.settings = this.getDefaultSettings();
  }

  private getDefaultSettings(): AppSettings {
    return {
      currentProvider: ProviderType.GEMINI,
      providers: {
        [ProviderType.GEMINI]: {
          apiKey: '',
          model: 'gemini-2.5-flash',
          temperature: 0.1,
          topP: 0.8,
          topK: 40,
          timeout: 30000,
          maxRetries: 3,
          rateLimit: {
            requestsPerMinute: 300,
            concurrentRequests: 5
          }
        },
        [ProviderType.OPENAI]: {
          apiKey: '',
          model: 'whisper-1',
          temperature: 0,
          responseFormat: 'json',
          timeout: 30000,
          maxRetries: 3,
          rateLimit: {
            requestsPerMinute: 50,
            concurrentRequests: 3
          }
        },
        [ProviderType.LOCAL_WHISPER]: {
          modelSize: 'base',
          language: 'auto',
          device: 'cpu',
          threads: 4,
          timeout: 60000,
          maxRetries: 1,
          rateLimit: {
            requestsPerMinute: 60,
            concurrentRequests: 1
          }
        }
      },
      chunkDuration: 5,
      outputDirectory: '',
      outputFormat: 'vtt',
      autoSave: true,
      includeTimestamps: true
    };
  }

  async loadSettings(): Promise<void> {
    try {
      // Load from localStorage (for renderer process)
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(SettingsManager.STORAGE_KEY);
        if (saved) {
          this.settings = { ...this.getDefaultSettings(), ...JSON.parse(saved) };
        }
      }
      
      // Load legacy settings for backward compatibility
      await this.migrateLegacySettings();
    } catch (error) {
      console.error('Error loading settings:', error);
      this.settings = this.getDefaultSettings();
    }
  }

  async saveSettings(): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SettingsManager.STORAGE_KEY, JSON.stringify(this.settings));
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  private async migrateLegacySettings(): Promise<void> {
    try {
      const legacy = localStorage.getItem('transcribe-settings');
      if (legacy) {
        const legacySettings = JSON.parse(legacy);
        
        // Migrate old settings to new structure
        if (legacySettings.apiKey && !this.settings.providers.gemini.apiKey) {
          this.settings.providers.gemini.apiKey = legacySettings.apiKey;
        }
        
        if (legacySettings.model && !this.settings.providers.gemini.model) {
          this.settings.providers.gemini.model = legacySettings.model;
        }
        
        if (legacySettings.chunkDuration !== undefined) {
          this.settings.chunkDuration = legacySettings.chunkDuration;
        }
        
        if (legacySettings.outputDirectory !== undefined) {
          this.settings.outputDirectory = legacySettings.outputDirectory;
        }
        
        if (legacySettings.outputFormat !== undefined) {
          this.settings.outputFormat = legacySettings.outputFormat;
        }
        
        if (legacySettings.autoSave !== undefined) {
          this.settings.autoSave = legacySettings.autoSave;
        }
        
        if (legacySettings.includeTimestamps !== undefined) {
          this.settings.includeTimestamps = legacySettings.includeTimestamps;
        }
      }
    } catch (error) {
      console.warn('Failed to migrate legacy settings:', error);
    }
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  updateSettings(newSettings: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }

  getCurrentProvider(): ProviderType {
    return this.settings.currentProvider;
  }

  setCurrentProvider(provider: ProviderType): void {
    this.settings.currentProvider = provider;
  }

  getProviderConfig(provider: ProviderType): GeminiConfig | OpenAIConfig | LocalWhisperConfig {
    return this.settings.providers[provider];
  }

  updateProviderConfig(provider: ProviderType, config: any): void {
    this.settings.providers[provider] = { ...this.settings.providers[provider], ...config };
  }

  isProviderConfigured(provider: ProviderType): boolean {
    const config = this.settings.providers[provider];
    
    switch (provider) {
      case ProviderType.GEMINI:
        return !!(config as GeminiConfig).apiKey;
      case ProviderType.OPENAI:
        return !!(config as OpenAIConfig).apiKey;
      case ProviderType.LOCAL_WHISPER:
        return true; // Local whisper doesn't require API key
      default:
        return false;
    }
  }

  getChunkDuration(): number {
    return this.settings.chunkDuration;
  }

  setChunkDuration(duration: number): void {
    this.settings.chunkDuration = Math.max(1, Math.min(60, duration)); // 1-60 seconds
  }

  getOutputDirectory(): string {
    return this.settings.outputDirectory;
  }

  setOutputDirectory(directory: string): void {
    this.settings.outputDirectory = directory;
  }

  getOutputFormat(): string {
    return this.settings.outputFormat;
  }

  setOutputFormat(format: string): void {
    this.settings.outputFormat = format;
  }

  getAutoSave(): boolean {
    return this.settings.autoSave;
  }

  setAutoSave(autoSave: boolean): void {
    this.settings.autoSave = autoSave;
  }

  getIncludeTimestamps(): boolean {
    return this.settings.includeTimestamps;
  }

  setIncludeTimestamps(includeTimestamps: boolean): void {
    this.settings.includeTimestamps = includeTimestamps;
  }

  exportSettings(): string {
    return JSON.stringify(this.settings, null, 2);
  }

  importSettings(settingsJson: string): void {
    try {
      const imported = JSON.parse(settingsJson);
      this.settings = { ...this.getDefaultSettings(), ...imported };
    } catch (error) {
      throw new Error('Invalid settings format');
    }
  }

  resetToDefaults(): void {
    this.settings = this.getDefaultSettings();
  }
}