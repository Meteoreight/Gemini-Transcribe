const fs = require('fs');
const path = require('path');

const rendererPath = path.join(__dirname, 'dist', 'renderer', 'renderer.js');

if (fs.existsSync(rendererPath)) {
  let content = fs.readFileSync(rendererPath, 'utf8');
  
  // Wrap in IIFE and create global exports/require
  const wrappedContent = `
(function() {
  // Create a minimal CommonJS environment
  const global = window;
  const exports = {};
  const module = { exports: exports };
  
  // Simple require function for relative imports
  function require(modulePath) {
    // Return working implementations for browser compatibility
    if (modulePath.includes('provider-factory')) {
      return { 
        STTProviderFactory: { 
          providers: new Map(),
          initialize: function() {
            console.log('STTProviderFactory initialized');
            // Register providers
            this.registerProvider('gemini', () => Promise.resolve(require('../providers/gemini-provider').GeminiProvider));
            this.registerProvider('openai', () => Promise.resolve(require('../providers/openai-provider').OpenAIProvider));  
            this.registerProvider('local_whisper', () => Promise.resolve(require('../providers/local-whisper-provider').LocalWhisperProvider));
          },
          registerProvider: function(type, loader) {
            this.providers.set(type, loader);
          },
          createProvider: async function(type, config) {
            const loader = this.providers.get(type);
            if (!loader) {
              throw new Error('Provider ' + type + ' not found. Make sure it\\'s registered.');
            }
            try {
              const ProviderClass = await loader();
              return new ProviderClass(config);
            } catch (error) {
              throw new Error('Failed to create provider ' + type + ': ' + error.message);
            }
          },
          getAvailableProviders: function() {
            return Array.from(this.providers.keys());
          },
          isProviderAvailable: function(type) {
            return this.providers.has(type);
          }
        } 
      };
    }
    
    if (modulePath.includes('settings-manager')) {
      return { SettingsManager: class { 
        constructor() {
          this.settings = {
            currentProvider: 'gemini',
            providers: {
              gemini: { apiKey: '', model: 'gemini-2.5-flash' },
              openai: { apiKey: '', model: 'whisper-1' },
              local_whisper: { modelSize: 'base' }
            },
            chunkDuration: 5,
            outputDirectory: '.',
            outputFormat: 'vtt',
            autoSave: false,
            includeTimestamps: true
          };
        }
        async loadSettings() {
          console.log('SettingsManager stub loadSettings');
        }
        getCurrentProvider() { return this.settings.currentProvider; }
        getProviderConfig(provider) { 
          return this.settings.providers[provider] || {};
        }
        getChunkDuration() { return this.settings.chunkDuration; }
        getAutoSave() { return this.settings.autoSave; }
        getIncludeTimestamps() { return this.settings.includeTimestamps; }
        getOutputFormat() { return this.settings.outputFormat; }
        getSettings() { return this.settings; }
        setCurrentProvider(provider) { this.settings.currentProvider = provider; }
        updateProviderConfig(provider, config) { 
          this.settings.providers[provider] = { ...this.settings.providers[provider], ...config };
        }
        setChunkDuration(duration) { this.settings.chunkDuration = duration; }
        setOutputDirectory(dir) { this.settings.outputDirectory = dir; }
        setOutputFormat(format) { this.settings.outputFormat = format; }
        setAutoSave(autoSave) { this.settings.autoSave = autoSave; }
        setIncludeTimestamps(include) { this.settings.includeTimestamps = include; }
        async saveSettings() {
          console.log('SettingsManager stub saveSettings');
        }
        resetToDefaults() {
          console.log('SettingsManager stub resetToDefaults');
        }
      } };
    }
    
    if (modulePath.includes('types')) {
      return { 
        ProviderType: { 
          GEMINI: 'gemini', 
          OPENAI: 'openai', 
          LOCAL_WHISPER: 'local_whisper' 
        },
        STTError: class extends Error {
          constructor(message, type, retryable = false, code) {
            super(message);
            this.name = 'STTError';
            this.type = type;
            this.code = code;
            this.retryable = retryable;
          }
        }
      };
    }
    
    // Provider implementations
    if (modulePath.includes('gemini-provider')) {
      return {
        GeminiProvider: class {
          constructor(config) {
            this.name = 'Gemini';
            this.capabilities = {
              supportedFormats: ['wav', 'mp3', 'm4a', 'flac', 'aac', 'ogg'],
              maxFileSize: 15 * 1024 * 1024,
              maxDuration: 25 * 60,
              supportedLanguages: ['auto', 'en', 'ja', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ko', 'zh'],
              supportsRealtime: true,
              supportsTimestamps: true,
              supportsBatchProcessing: true
            };
            this.config = config;
            this.usageMetrics = { requestCount: 0, tokensUsed: 0, processingTime: 0, audioDuration: 0 };
          }
          
          async initialize(config) {
            this.config = { ...this.config, ...config };
            if (!this.config.apiKey) {
              const STTError = require('./types').STTError;
              throw new STTError('Gemini API key is required', 'MISSING_API_KEY');
            }
            console.log('Gemini provider initialized');
          }
          
          async transcribe(audioData, options) {
            // Use IPC to communicate with main process for actual transcription
            if (window.electronAPI) {
              // Convert ArrayBuffer to Array for IPC serialization
              const serializedAudioData = {
                ...audioData,
                data: Array.from(new Uint8Array(audioData.data))
              };
              return await window.electronAPI.transcribeAudio('gemini', serializedAudioData, options, this.config);
            }
            throw new Error('Electron API not available');
          }
          
          async getUsageMetrics() {
            return { ...this.usageMetrics };
          }
          
          isConfigured() {
            return !!(this.config.apiKey && this.config.model);
          }
          
          async cleanup() {
            this.usageMetrics = { requestCount: 0, tokensUsed: 0, processingTime: 0, audioDuration: 0 };
          }
        }
      };
    }
    
    if (modulePath.includes('openai-provider')) {
      return {
        OpenAIProvider: class {
          constructor(config) {
            this.name = 'OpenAI Whisper';
            this.capabilities = {
              supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
              maxFileSize: 25 * 1024 * 1024,
              maxDuration: 30 * 60,
              supportedLanguages: ['auto', 'en', 'ja', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ko', 'zh'],
              supportsRealtime: true,
              supportsTimestamps: true,
              supportsBatchProcessing: true
            };
            this.config = config;
            this.usageMetrics = { requestCount: 0, tokensUsed: 0, processingTime: 0, audioDuration: 0 };
          }
          
          async initialize(config) {
            this.config = { ...this.config, ...config };
            if (!this.config.apiKey) {
              const STTError = require('./types').STTError;
              throw new STTError('OpenAI API key is required', 'MISSING_API_KEY');
            }
            console.log('OpenAI provider initialized');
          }
          
          async transcribe(audioData, options) {
            if (window.electronAPI) {
              // Convert ArrayBuffer to Array for IPC serialization
              const serializedAudioData = {
                ...audioData,
                data: Array.from(new Uint8Array(audioData.data))
              };
              return await window.electronAPI.transcribeAudio('openai', serializedAudioData, options, this.config);
            }
            throw new Error('Electron API not available');
          }
          
          async getUsageMetrics() {
            return { ...this.usageMetrics };
          }
          
          isConfigured() {
            return !!(this.config.apiKey && this.config.model);
          }
          
          async cleanup() {
            this.usageMetrics = { requestCount: 0, tokensUsed: 0, processingTime: 0, audioDuration: 0 };
          }
        }
      };
    }
    
    if (modulePath.includes('local-whisper-provider')) {
      return {
        LocalWhisperProvider: class {
          constructor(config) {
            this.name = 'Local Whisper';
            this.capabilities = {
              supportedFormats: ['wav', 'mp3', 'm4a', 'flac', 'aac', 'ogg'],
              maxFileSize: 500 * 1024 * 1024,
              maxDuration: 60 * 60,
              supportedLanguages: ['auto', 'en', 'ja', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ko', 'zh'],
              supportsRealtime: true,
              supportsTimestamps: true,
              supportsBatchProcessing: true
            };
            this.config = config;
            this.usageMetrics = { requestCount: 0, tokensUsed: 0, processingTime: 0, audioDuration: 0 };
            this.modelDownloaded = false;
          }
          
          async initialize(config) {
            this.config = { ...this.config, ...config };
            // Local whisper doesn't need API key
            this.modelDownloaded = true;
            console.log('Local Whisper provider initialized');
          }
          
          async transcribe(audioData, options) {
            if (window.electronAPI) {
              // Convert ArrayBuffer to Array for IPC serialization
              const serializedAudioData = {
                ...audioData,
                data: Array.from(new Uint8Array(audioData.data))
              };
              return await window.electronAPI.transcribeAudio('local_whisper', serializedAudioData, options, this.config);
            }
            throw new Error('Electron API not available');
          }
          
          async getUsageMetrics() {
            return { ...this.usageMetrics };
          }
          
          isConfigured() {
            return this.modelDownloaded;
          }
          
          async cleanup() {
            this.usageMetrics = { requestCount: 0, tokensUsed: 0, processingTime: 0, audioDuration: 0 };
          }
        }
      };
    }
    
    return {};
  }
  
${content}

})();
`;
  
  fs.writeFileSync(rendererPath, wrappedContent);
  console.log('Renderer.js has been made browser-compatible');
} else {
  console.error('Renderer.js not found');
}