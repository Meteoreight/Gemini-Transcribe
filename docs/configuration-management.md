# Configuration Management Specification

## Overview

The configuration management system handles application settings, environment variables, user preferences, and API configurations. It provides a secure, validated, and user-friendly approach to managing all configurable aspects of the Gemini-Transcribe application.

## Environment Configuration

### .env File Structure
The application uses environment variables for sensitive and deployment-specific configuration.

```env
# API Configuration
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com

# Audio Processing
DEFAULT_CHUNK_DURATION=5
DEFAULT_SAMPLE_RATE=16000
MAX_AUDIO_FILE_SIZE=157286400

# Output Configuration
DEFAULT_OUTPUT_DIR=~/Documents/Transcriptions
DEFAULT_OUTPUT_FORMAT=vtt
DEFAULT_OUTPUT_LANGUAGE=auto

# Performance
MAX_CONCURRENT_REQUESTS=3
PROCESSING_THREADS=4
MEMORY_LIMIT=512

# Debug and Logging
LOG_LEVEL=info
DEBUG_MODE=false
TELEMETRY_ENABLED=true

# Security
ENCRYPTION_KEY_ID=app_encryption_key
AUTO_CLEANUP_TEMP_FILES=true
SECURE_STORAGE_ENABLED=true
```

### Environment Variable Management
```typescript
interface EnvironmentConfig {
  // API Configuration
  geminiApiKey: string;
  geminiModel: string;
  geminiBaseUrl: string;
  
  // Audio Processing
  defaultChunkDuration: number;
  defaultSampleRate: number;
  maxAudioFileSize: number;
  
  // Output Configuration
  defaultOutputDir: string;
  defaultOutputFormat: string;
  defaultOutputLanguage: string;
  
  // Performance
  maxConcurrentRequests: number;
  processingThreads: number;
  memoryLimit: number;
  
  // Debug and Logging
  logLevel: LogLevel;
  debugMode: boolean;
  telemetryEnabled: boolean;
  
  // Security
  encryptionKeyId: string;
  autoCleanupTempFiles: boolean;
  secureStorageEnabled: boolean;
}

class EnvironmentManager {
  private config: EnvironmentConfig;
  private readonly defaultConfig: Partial<EnvironmentConfig>;
  
  constructor() {
    this.defaultConfig = {
      geminiModel: 'gemini-2.5-flash',
      geminiBaseUrl: 'https://generativelanguage.googleapis.com',
      defaultChunkDuration: 5,
      defaultSampleRate: 16000,
      maxAudioFileSize: 150 * 1024 * 1024, // 150MB
      defaultOutputFormat: 'vtt',
      defaultOutputLanguage: 'auto',
      maxConcurrentRequests: 3,
      processingThreads: 4,
      memoryLimit: 512,
      logLevel: LogLevel.INFO,
      debugMode: false,
      telemetryEnabled: true,
      autoCleanupTempFiles: true,
      secureStorageEnabled: true
    };
  }
  
  async loadConfiguration(): Promise<EnvironmentConfig> {
    const envVars = await this.loadEnvironmentVariables();
    const validated = await this.validateConfiguration(envVars);
    
    this.config = { ...this.defaultConfig, ...validated };
    return this.config;
  }
  
  private async loadEnvironmentVariables(): Promise<Partial<EnvironmentConfig>> {
    return {
      geminiApiKey: process.env.GEMINI_API_KEY,
      geminiModel: process.env.GEMINI_MODEL,
      geminiBaseUrl: process.env.GEMINI_BASE_URL,
      defaultChunkDuration: this.parseNumber(process.env.DEFAULT_CHUNK_DURATION),
      defaultSampleRate: this.parseNumber(process.env.DEFAULT_SAMPLE_RATE),
      maxAudioFileSize: this.parseNumber(process.env.MAX_AUDIO_FILE_SIZE),
      defaultOutputDir: process.env.DEFAULT_OUTPUT_DIR,
      defaultOutputFormat: process.env.DEFAULT_OUTPUT_FORMAT as OutputFormat,
      defaultOutputLanguage: process.env.DEFAULT_OUTPUT_LANGUAGE,
      maxConcurrentRequests: this.parseNumber(process.env.MAX_CONCURRENT_REQUESTS),
      processingThreads: this.parseNumber(process.env.PROCESSING_THREADS),
      memoryLimit: this.parseNumber(process.env.MEMORY_LIMIT),
      logLevel: this.parseLogLevel(process.env.LOG_LEVEL),
      debugMode: this.parseBoolean(process.env.DEBUG_MODE),
      telemetryEnabled: this.parseBoolean(process.env.TELEMETRY_ENABLED),
      encryptionKeyId: process.env.ENCRYPTION_KEY_ID,
      autoCleanupTempFiles: this.parseBoolean(process.env.AUTO_CLEANUP_TEMP_FILES),
      secureStorageEnabled: this.parseBoolean(process.env.SECURE_STORAGE_ENABLED)
    };
  }
}
```

## User Preferences Management

### Configuration Schema
```typescript
interface UserPreferences {
  // UI Preferences
  theme: 'light' | 'dark' | 'system';
  language: string;
  fontSize: number;
  autoSave: boolean;
  
  // Audio Preferences
  defaultInputDevice: string;
  defaultOutputDevice: string;
  inputGain: number;
  noiseReduction: boolean;
  
  // Transcription Preferences
  defaultInputLanguage: string;
  defaultOutputLanguage: string;
  includeTimestamps: boolean;
  confidenceThreshold: number;
  
  // File Management
  outputDirectory: string;
  outputFormat: OutputFormat;
  fileNamingPattern: string;
  autoOpenResults: boolean;
  
  // Performance Preferences
  processingQuality: 'fast' | 'balanced' | 'quality';
  maxConcurrentJobs: number;
  enableBackgroundProcessing: boolean;
  
  // Privacy & Security
  rememberApiKey: boolean;
  enableTelemetry: boolean;
  autoDeleteTempFiles: boolean;
  
  // Advanced Settings
  customPrompts: Record<string, string>;
  keyboardShortcuts: Record<string, string>;
  pluginSettings: Record<string, any>;
}

enum OutputFormat {
  VTT = 'vtt',
  SRT = 'srt',
  TXT = 'txt',
  JSON = 'json'
}

enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}
```

### Preferences Storage
```typescript
class PreferencesManager {
  private preferences: UserPreferences;
  private readonly configPath: string;
  private readonly defaultPreferences: UserPreferences;
  
  constructor() {
    this.configPath = path.join(this.getConfigDirectory(), 'preferences.json');
    this.defaultPreferences = this.getDefaultPreferences();
  }
  
  async loadPreferences(): Promise<UserPreferences> {
    try {
      if (await this.configFileExists()) {
        const fileContent = await fs.readFile(this.configPath, 'utf-8');
        const storedPreferences = JSON.parse(fileContent);
        
        // Merge with defaults to handle new settings
        this.preferences = this.mergeWithDefaults(storedPreferences);
        
        // Validate and migrate if necessary
        await this.validateAndMigrate();
      } else {
        // First run - use defaults
        this.preferences = { ...this.defaultPreferences };
        await this.savePreferences();
      }
    } catch (error) {
      console.warn('Failed to load preferences, using defaults:', error);
      this.preferences = { ...this.defaultPreferences };
    }
    
    return this.preferences;
  }
  
  async savePreferences(newPreferences?: Partial<UserPreferences>): Promise<void> {
    if (newPreferences) {
      this.preferences = { ...this.preferences, ...newPreferences };
    }
    
    // Validate before saving
    const validationResult = await this.validatePreferences(this.preferences);
    if (!validationResult.isValid) {
      throw new Error(`Invalid preferences: ${validationResult.errors.join(', ')}`);
    }
    
    await this.ensureConfigDirectoryExists();
    await fs.writeFile(this.configPath, JSON.stringify(this.preferences, null, 2));
  }
  
  private getConfigDirectory(): string {
    const os = require('os');
    const platform = process.platform;
    
    switch (platform) {
      case 'win32':
        return path.join(os.homedir(), 'AppData', 'Roaming', 'GeminiTranscribe');
      case 'darwin':
        return path.join(os.homedir(), 'Library', 'Application Support', 'GeminiTranscribe');
      default:
        return path.join(os.homedir(), '.config', 'gemini-transcribe');
    }
  }
}
```

## Configuration Validation

### Validation System
```typescript
interface ValidationRule<T> {
  field: keyof T;
  validate: (value: any) => boolean;
  message: string;
  sanitize?: (value: any) => any;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitized?: any;
}

class ConfigurationValidator {
  private rules: ValidationRule<UserPreferences>[] = [
    {
      field: 'theme',
      validate: (value) => ['light', 'dark', 'system'].includes(value),
      message: 'Theme must be light, dark, or system'
    },
    {
      field: 'fontSize',
      validate: (value) => typeof value === 'number' && value >= 10 && value <= 24,
      message: 'Font size must be between 10 and 24',
      sanitize: (value) => Math.max(10, Math.min(24, Number(value) || 14))
    },
    {
      field: 'inputGain',
      validate: (value) => typeof value === 'number' && value >= 0 && value <= 100,
      message: 'Input gain must be between 0 and 100',
      sanitize: (value) => Math.max(0, Math.min(100, Number(value) || 50))
    },
    {
      field: 'confidenceThreshold',
      validate: (value) => typeof value === 'number' && value >= 0 && value <= 1,
      message: 'Confidence threshold must be between 0 and 1',
      sanitize: (value) => Math.max(0, Math.min(1, Number(value) || 0.7))
    },
    {
      field: 'outputDirectory',
      validate: (value) => typeof value === 'string' && value.length > 0,
      message: 'Output directory must be a non-empty string'
    },
    {
      field: 'outputFormat',
      validate: (value) => Object.values(OutputFormat).includes(value),
      message: 'Output format must be one of: vtt, srt, txt, json'
    }
  ];
  
  async validatePreferences(preferences: UserPreferences): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitized: Partial<UserPreferences> = {};
    
    for (const rule of this.rules) {
      const value = preferences[rule.field];
      
      if (!rule.validate(value)) {
        if (rule.sanitize) {
          const sanitizedValue = rule.sanitize(value);
          sanitized[rule.field] = sanitizedValue;
          warnings.push(`${String(rule.field)} was adjusted: ${rule.message}`);
        } else {
          errors.push(rule.message);
        }
      }
    }
    
    // Additional custom validations
    await this.validateDirectoryPath(preferences.outputDirectory, errors);
    await this.validateApiKey(preferences, errors);
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitized: Object.keys(sanitized).length > 0 ? sanitized : undefined
    };
  }
  
  private async validateDirectoryPath(directory: string, errors: string[]): Promise<void> {
    try {
      const stats = await fs.stat(directory);
      if (!stats.isDirectory()) {
        errors.push('Output directory path is not a directory');
      }
      
      // Check write permissions
      await fs.access(directory, fs.constants.W_OK);
    } catch (error) {
      // Try to create directory
      try {
        await fs.mkdir(directory, { recursive: true });
      } catch (createError) {
        errors.push('Cannot create or access output directory');
      }
    }
  }
  
  private async validateApiKey(preferences: UserPreferences, errors: string[]): Promise<void> {
    if (preferences.rememberApiKey) {
      try {
        const keychain = new KeychainManager();
        const apiKey = await keychain.getSecureKey('gemini_api_key');
        
        if (!apiKey || apiKey.length < 10) {
          errors.push('Invalid or missing API key');
        }
      } catch (error) {
        errors.push('Cannot access stored API key');
      }
    }
  }
}
```

## Configuration Migration

### Schema Versioning
```typescript
interface ConfigurationMigration {
  fromVersion: string;
  toVersion: string;
  migrate: (oldConfig: any) => any;
  validate: (config: any) => boolean;
}

class ConfigurationMigrator {
  private migrations: ConfigurationMigration[] = [
    {
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      migrate: (config) => ({
        ...config,
        // Add new fields with defaults
        enableBackgroundProcessing: true,
        customPrompts: {},
        // Rename old fields
        outputLanguage: config.targetLanguage || 'auto'
      }),
      validate: (config) => 'outputLanguage' in config
    },
    {
      fromVersion: '1.1.0',
      toVersion: '1.2.0',
      migrate: (config) => ({
        ...config,
        keyboardShortcuts: {
          startRecording: 'Space',
          stopRecording: 'Space',
          openSettings: 'Ctrl+,',
          openFile: 'Ctrl+O'
        },
        processingQuality: config.highQuality ? 'quality' : 'balanced'
      }),
      validate: (config) => 'keyboardShortcuts' in config
    }
  ];
  
  async migrateConfiguration(config: any, currentVersion: string): Promise<any> {
    let migratedConfig = { ...config };
    let version = currentVersion;
    
    // Apply migrations in sequence
    for (const migration of this.migrations) {
      if (this.shouldApplyMigration(version, migration)) {
        try {
          migratedConfig = migration.migrate(migratedConfig);
          
          if (!migration.validate(migratedConfig)) {
            throw new Error(`Migration validation failed: ${migration.fromVersion} -> ${migration.toVersion}`);
          }
          
          version = migration.toVersion;
        } catch (error) {
          console.error(`Migration failed: ${migration.fromVersion} -> ${migration.toVersion}`, error);
          throw error;
        }
      }
    }
    
    // Update version in config
    migratedConfig.configVersion = version;
    
    return migratedConfig;
  }
  
  private shouldApplyMigration(currentVersion: string, migration: ConfigurationMigration): boolean {
    return this.compareVersions(currentVersion, migration.fromVersion) === 0;
  }
  
  private compareVersions(a: string, b: string): number {
    const parseVersion = (v: string) => v.split('.').map(Number);
    const [aMajor, aMinor, aPatch] = parseVersion(a);
    const [bMajor, bMinor, bPatch] = parseVersion(b);
    
    if (aMajor !== bMajor) return aMajor - bMajor;
    if (aMinor !== bMinor) return aMinor - bMinor;
    return aPatch - bPatch;
  }
}
```

## Security Considerations

### Secure Storage
```typescript
class SecureConfigurationManager {
  private keychain: KeychainManager;
  private encryption: EncryptionService;
  
  constructor() {
    this.keychain = new KeychainManager();
    this.encryption = new EncryptionService();
  }
  
  async storeSecureConfiguration(key: string, value: any): Promise<void> {
    const encrypted = await this.encryption.encrypt(JSON.stringify(value));
    await this.keychain.storeSecureKey(key, encrypted);
  }
  
  async retrieveSecureConfiguration<T>(key: string): Promise<T | null> {
    try {
      const encrypted = await this.keychain.getSecureKey(key);
      if (!encrypted) return null;
      
      const decrypted = await this.encryption.decrypt(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Failed to retrieve secure configuration:', error);
      return null;
    }
  }
  
  async deleteSecureConfiguration(key: string): Promise<void> {
    await this.keychain.deleteSecureKey(key);
  }
}
```

### Configuration Encryption
```typescript
class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private keyDerivation = 'pbkdf2';
  
  async encrypt(data: string, password?: string): Promise<string> {
    const key = await this.deriveKey(password);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, key);
    
    cipher.setAAD(Buffer.from('gemini-transcribe-config'));
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      iv: iv.toString('hex'),
      encrypted,
      authTag: authTag.toString('hex')
    });
  }
  
  async decrypt(encryptedData: string, password?: string): Promise<string> {
    const { iv, encrypted, authTag } = JSON.parse(encryptedData);
    const key = await this.deriveKey(password);
    
    const decipher = crypto.createDecipher(this.algorithm, key);
    decipher.setAAD(Buffer.from('gemini-transcribe-config'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  private async deriveKey(password?: string): Promise<Buffer> {
    const salt = Buffer.from('gemini-transcribe-salt');
    const userPassword = password || await this.getMachineId();
    
    return crypto.pbkdf2Sync(userPassword, salt, 100000, 32, 'sha256');
  }
}
```

## Settings UI Integration

### Configuration Service
```typescript
class ConfigurationService {
  private environmentManager: EnvironmentManager;
  private preferencesManager: PreferencesManager;
  private validator: ConfigurationValidator;
  private migrator: ConfigurationMigrator;
  private secureManager: SecureConfigurationManager;
  
  constructor() {
    this.environmentManager = new EnvironmentManager();
    this.preferencesManager = new PreferencesManager();
    this.validator = new ConfigurationValidator();
    this.migrator = new ConfigurationMigrator();
    this.secureManager = new SecureConfigurationManager();
  }
  
  async initialize(): Promise<void> {
    // Load environment configuration
    await this.environmentManager.loadConfiguration();
    
    // Load user preferences with migration
    await this.preferencesManager.loadPreferences();
    
    // Initialize secure storage
    await this.initializeSecureStorage();
  }
  
  async updatePreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ): Promise<void> {
    // Validate single preference
    const tempPreferences = { ...await this.getPreferences(), [key]: value };
    const validationResult = await this.validator.validatePreferences(tempPreferences);
    
    if (!validationResult.isValid) {
      throw new Error(`Invalid value for ${String(key)}: ${validationResult.errors.join(', ')}`);
    }
    
    // Apply sanitization if available
    const finalValue = validationResult.sanitized?.[key] ?? value;
    
    // Update and save
    await this.preferencesManager.savePreferences({ [key]: finalValue });
    
    // Notify listeners
    this.notifyConfigurationChange(key, finalValue);
  }
  
  async resetToDefaults(): Promise<void> {
    const defaultPreferences = this.preferencesManager.getDefaultPreferences();
    await this.preferencesManager.savePreferences(defaultPreferences);
    
    // Clear secure storage except API keys
    await this.clearNonEssentialSecureData();
  }
  
  async exportConfiguration(): Promise<string> {
    const preferences = await this.getPreferences();
    const environment = await this.environmentManager.getConfiguration();
    
    // Remove sensitive data
    const exportData = {
      preferences: this.sanitizeForExport(preferences),
      environment: this.sanitizeForExport(environment),
      version: await this.getConfigurationVersion()
    };
    
    return JSON.stringify(exportData, null, 2);
  }
  
  async importConfiguration(configData: string): Promise<void> {
    try {
      const importedData = JSON.parse(configData);
      
      // Validate import data
      if (!this.validateImportData(importedData)) {
        throw new Error('Invalid configuration data');
      }
      
      // Migrate if necessary
      const migratedData = await this.migrator.migrateConfiguration(
        importedData.preferences,
        importedData.version || '1.0.0'
      );
      
      // Validate migrated data
      const validationResult = await this.validator.validatePreferences(migratedData);
      if (!validationResult.isValid) {
        throw new Error(`Invalid configuration: ${validationResult.errors.join(', ')}`);
      }
      
      // Apply configuration
      await this.preferencesManager.savePreferences(migratedData);
      
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error.message}`);
    }
  }
}
```

### Configuration Events
```typescript
enum ConfigurationEvent {
  PREFERENCE_CHANGED = 'preference_changed',
  CONFIGURATION_RESET = 'configuration_reset',
  CONFIGURATION_IMPORTED = 'configuration_imported',
  VALIDATION_ERROR = 'validation_error'
}

interface ConfigurationEventData {
  event: ConfigurationEvent;
  key?: string;
  oldValue?: any;
  newValue?: any;
  error?: Error;
}

class ConfigurationEventEmitter extends EventEmitter {
  notifyPreferenceChange<K extends keyof UserPreferences>(
    key: K,
    oldValue: UserPreferences[K],
    newValue: UserPreferences[K]
  ): void {
    this.emit(ConfigurationEvent.PREFERENCE_CHANGED, {
      event: ConfigurationEvent.PREFERENCE_CHANGED,
      key: String(key),
      oldValue,
      newValue
    });
  }
  
  notifyValidationError(key: string, error: Error): void {
    this.emit(ConfigurationEvent.VALIDATION_ERROR, {
      event: ConfigurationEvent.VALIDATION_ERROR,
      key,
      error
    });
  }
}

// Usage in UI components
const configService = new ConfigurationService();

configService.on(ConfigurationEvent.PREFERENCE_CHANGED, (data) => {
  // Update UI to reflect configuration change
  updateSettingsUI(data.key, data.newValue);
});

configService.on(ConfigurationEvent.VALIDATION_ERROR, (data) => {
  // Show validation error in UI
  showValidationError(data.key, data.error.message);
});
```

## Default Configuration Values

### Complete Default Configuration
```typescript
const DEFAULT_CONFIGURATION: UserPreferences = {
  // UI Preferences
  theme: 'system',
  language: 'en',
  fontSize: 14,
  autoSave: true,
  
  // Audio Preferences
  defaultInputDevice: 'default',
  defaultOutputDevice: 'default',
  inputGain: 50,
  noiseReduction: true,
  
  // Transcription Preferences
  defaultInputLanguage: 'auto',
  defaultOutputLanguage: 'auto',
  includeTimestamps: true,
  confidenceThreshold: 0.7,
  
  // File Management
  outputDirectory: '~/Documents/Transcriptions',
  outputFormat: OutputFormat.VTT,
  fileNamingPattern: '{timestamp}_{duration}',
  autoOpenResults: false,
  
  // Performance Preferences
  processingQuality: 'balanced',
  maxConcurrentJobs: 3,
  enableBackgroundProcessing: true,
  
  // Privacy & Security
  rememberApiKey: true,
  enableTelemetry: true,
  autoDeleteTempFiles: true,
  
  // Advanced Settings
  customPrompts: {
    default: 'Please transcribe the following audio accurately.',
    meeting: 'Transcribe this meeting audio, including speaker identification if possible.',
    lecture: 'Transcribe this educational content with focus on technical terms.'
  },
  keyboardShortcuts: {
    startRecording: 'Space',
    stopRecording: 'Space',
    openSettings: 'Ctrl+,',
    openFile: 'Ctrl+O',
    toggleTheme: 'Ctrl+Shift+T'
  },
  pluginSettings: {}
};
```

This configuration management system provides a robust foundation for handling all application settings while maintaining security, validation, and user-friendly management capabilities.