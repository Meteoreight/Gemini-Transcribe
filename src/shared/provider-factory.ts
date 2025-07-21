import { STTProvider, ProviderType, ProviderConfig } from './types';

// Dynamic imports to avoid circular dependencies
export class STTProviderFactory {
  private static providers: Map<ProviderType, () => Promise<new (config: ProviderConfig) => STTProvider>> = new Map();

  static registerProvider(
    type: ProviderType, 
    loader: () => Promise<new (config: ProviderConfig) => STTProvider>
  ): void {
    this.providers.set(type, loader);
  }

  static async createProvider(type: ProviderType, config: ProviderConfig): Promise<STTProvider> {
    const loader = this.providers.get(type);
    if (!loader) {
      throw new Error(`Provider ${type} not found. Make sure it's registered.`);
    }

    try {
      const ProviderClass = await loader();
      return new ProviderClass(config);
    } catch (error: any) {
      throw new Error(`Failed to create provider ${type}: ${error.message}`);
    }
  }

  static getAvailableProviders(): ProviderType[] {
    return Array.from(this.providers.keys());
  }

  static isProviderAvailable(type: ProviderType): boolean {
    return this.providers.has(type);
  }

  // Initialize all providers
  static initialize(): void {
    // Register Gemini Provider
    this.registerProvider(ProviderType.GEMINI, async () => {
      const { GeminiProvider } = await import('../providers/gemini-provider');
      return GeminiProvider;
    });

    // Register OpenAI Provider
    this.registerProvider(ProviderType.OPENAI, async () => {
      const { OpenAIProvider } = await import('../providers/openai-provider');
      return OpenAIProvider;
    });

    // Register Local Whisper Provider
    this.registerProvider(ProviderType.LOCAL_WHISPER, async () => {
      const { LocalWhisperProvider } = await import('../providers/local-whisper-provider');
      return LocalWhisperProvider;
    });
  }
}