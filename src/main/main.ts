import { app, BrowserWindow, ipcMain, Menu, dialog, desktopCapturer, session } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class TranscribeApp {
  private mainWindow: BrowserWindow | null = null;
  private isDev = process.env.NODE_ENV === 'development';
  private providerCache: Map<string, any> = new Map();
  private currentSessionId: string | null = null;

  constructor() {
    this.initializeApp();
  }

  private initializeApp(): void {
    // Handle app ready
    app.whenReady().then(() => {
      this.createMainWindow();
      this.setupMenu();
      this.setupIPC();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createMainWindow();
        }
      });
    });

    // Handle window closed
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Security: Prevent new window creation
    app.on('web-contents-created', (_, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        console.log('Blocked new window creation:', url);
        return { action: 'deny' };
      });
    });
  }

  private createMainWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      show: false,
      icon: this.isDev ? undefined : path.join(__dirname, '../../assets/icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: true,
        allowRunningInsecureContent: false,
        // Enable desktop capture features
        experimentalFeatures: true,
      },
      titleBarStyle: 'default',
    });

    // Setup display media request handler for desktop capture
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        console.log('Available desktop sources:', sources.map(s => ({ id: s.id, name: s.name })));
        
        // Find the best audio source for the platform
        let audioSource = sources.find(source => 
          source.name.toLowerCase().includes('system audio') ||
          source.name.toLowerCase().includes('desktop audio') ||
          source.name.toLowerCase().includes('speakers') ||
          source.name.toLowerCase().includes('output')
        );
        
        // Fallback to any audio source
        if (!audioSource) {
          audioSource = sources.find(source => source.id.includes('audio'));
        }
        
        // Find screen source for video
        const screenSource = sources.find(source => 
          source.id.includes('screen') || 
          source.name.toLowerCase().includes('entire screen') ||
          source.name.toLowerCase().includes('screen 1')
        );
        
        // Platform-specific handling
        const platform = process.platform;
        
        if (platform === 'darwin') { // macOS
          // On macOS, audio capture has limitations
          callback({ 
            video: screenSource,
            audio: 'loopback' // Use loopback for system audio
          });
        } else if (platform === 'win32') { // Windows
          // Windows supports system audio capture better
          callback({ 
            video: screenSource,
            audio: 'loopback'
          });
        } else { // Linux and others
          callback({ 
            video: screenSource,
            audio: 'loopback'
          });
        }
      }).catch((error) => {
        console.error('Error getting desktop sources:', error);
        callback({});
      });
    });

    // Load the app
    if (this.isDev) {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      
      if (this.isDev) {
        this.mainWindow?.webContents.openDevTools();
      }
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private setupMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Open Audio File',
            accelerator: 'CmdOrCtrl+O',
            click: async () => {
              const result = await dialog.showOpenDialog(this.mainWindow!, {
                title: 'Select Audio File',
                filters: [
                  {
                    name: 'Audio Files',
                    extensions: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac'],
                  },
                  { name: 'All Files', extensions: ['*'] },
                ],
                properties: ['openFile', 'multiSelections'],
              });

              if (!result.canceled && result.filePaths.length > 0) {
                this.mainWindow?.webContents.send('files-selected', result.filePaths);
              }
            },
          },
          { type: 'separator' },
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              this.mainWindow?.webContents.send('open-settings');
            },
          },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            },
          },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' },
        ],
      },
    ];

    if (process.platform === 'darwin') {
      template.unshift({
        label: app.getName(),
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private async handleTranscribeAudio(provider: string, audioData: any, options: any, config: any): Promise<any> {
    console.log(`Transcription request for provider: ${provider}`);
    
    // Create cache key based on session and provider
    const cacheKey = `${this.currentSessionId || 'default'}-${provider}`;
    
    let providerInstance = this.providerCache.get(cacheKey);
    
    if (!providerInstance) {
      console.log(`Creating new provider instance for: ${cacheKey}`);
      
      // Import the real provider factory from the compiled modules
      const { STTProviderFactory } = require('../shared/provider-factory');
      
      // Initialize if not already done
      STTProviderFactory.initialize();
      
      // Create the provider
      providerInstance = await STTProviderFactory.createProvider(provider, config);
      
      // Initialize the provider
      await providerInstance.initialize(config);
      
      // Cache the provider instance
      this.providerCache.set(cacheKey, providerInstance);
      console.log(`Cached provider instance for: ${cacheKey}`);
    } else {
      console.log(`Reusing cached provider instance for: ${cacheKey}`);
    }
    
    // Convert audioData back to proper format
    const audioChunk = {
      data: new Uint8Array(audioData.data).buffer,
      duration: audioData.duration,
      timestamp: audioData.timestamp,
      format: audioData.format,
      sampleRate: audioData.sampleRate,
      channels: audioData.channels
    };
    
    // Perform transcription
    const result = await providerInstance.transcribe(audioChunk, options);
    
    return result;
  }

  private setupIPC(): void {
    // Handle app info requests
    ipcMain.handle('get-app-info', () => {
      return {
        name: app.getName(),
        version: app.getVersion(),
        platform: process.platform,
      };
    });

    // Handle environment variable requests
    ipcMain.handle('get-env-var', (_, key: string) => {
      // Only expose specific environment variables for security
      const allowedVars = [
        'GEMINI_API_KEY',
        'OPENAI_API_KEY',
        'GEMINI_MODEL',
        'OPENAI_MODEL',
        'DEFAULT_CHUNK_DURATION',
        'DEFAULT_OUTPUT_DIR',
        'DEFAULT_OUTPUT_FORMAT',
        'DEFAULT_OUTPUT_LANGUAGE',
        'NODE_ENV'
      ];
      
      if (allowedVars.includes(key)) {
        return process.env[key];
      }
      return undefined;
    });

    ipcMain.handle('get-all-env-vars', () => {
      // Return only allowed environment variables
      const allowedVars = [
        'GEMINI_API_KEY',
        'OPENAI_API_KEY', 
        'GEMINI_MODEL',
        'OPENAI_MODEL',
        'DEFAULT_CHUNK_DURATION',
        'DEFAULT_OUTPUT_DIR',
        'DEFAULT_OUTPUT_FORMAT',
        'DEFAULT_OUTPUT_LANGUAGE'
      ];
      
      const envVars: Record<string, string> = {};
      allowedVars.forEach(key => {
        if (process.env[key]) {
          envVars[key] = process.env[key]!;
        }
      });
      
      return envVars;
    });

    // Handle file dialog
    ipcMain.handle('show-open-dialog', async (_, options) => {
      const result = await dialog.showOpenDialog(this.mainWindow!, options);
      return result;
    });

    // Handle save dialog
    ipcMain.handle('show-save-dialog', async (_, options) => {
      const result = await dialog.showSaveDialog(this.mainWindow!, options);
      return result;
    });

    // Handle transcription start/stop
    ipcMain.handle('start-transcription', async (_, config) => {
      console.log('Starting transcription with config:', config);
      // Generate new session ID for this transcription session
      this.currentSessionId = Date.now().toString();
      console.log('New transcription session:', this.currentSessionId);
      return { success: true, sessionId: this.currentSessionId };
    });

    ipcMain.handle('stop-transcription', async () => {
      console.log('Stopping transcription');
      // Clear provider cache for current session
      if (this.currentSessionId) {
        this.providerCache.delete(this.currentSessionId);
        console.log('Cleared provider cache for session:', this.currentSessionId);
        this.currentSessionId = null;
      }
      return { success: true };
    });

    // Handle audio transcription via real providers
    ipcMain.handle('transcribe-audio', async (_, provider, audioData, options, config) => {
      try {
        return await this.handleTranscribeAudio(provider, audioData, options, config);
      } catch (error: any) {
        console.error('Transcription error in main process:', error);
        
        // If error might be related to stale provider, remove from cache and retry once
        if (error.retryable && this.currentSessionId) {
          const cacheKey = `${this.currentSessionId}-${provider}`;
          if (this.providerCache.has(cacheKey)) {
            console.log(`Removing stale provider from cache and retrying: ${cacheKey}`);
            this.providerCache.delete(cacheKey);
            
            // Retry once with fresh provider
            try {
              return await this.handleTranscribeAudio(provider, audioData, options, config);
            } catch (retryError: any) {
              console.error('Retry also failed:', retryError);
              throw retryError;
            }
          }
        }
        
        throw error;
      }
    });

    // Handle audio permission requests
    ipcMain.handle('request-audio-permission', async () => {
      // TODO: Implement audio permission logic
      return { granted: true };
    });

    // Handle desktop sources enumeration
    ipcMain.handle('get-desktop-sources', async (_, options) => {
      try {
        const sources = await desktopCapturer.getSources(options);
        return sources.map(source => ({
          id: source.id,
          name: source.name,
          display_id: source.display_id,
          appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
          thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null
        }));
      } catch (error: any) {
        console.error('Error getting desktop sources:', error);
        throw error;
      }
    });

    // Handle display media request with specific source
    ipcMain.handle('get-display-media-with-source', async (_, sourceId, _options) => {
      try {
        // This will trigger the display media request handler we set up earlier
        return { success: true, sourceId };
      } catch (error: any) {
        console.error('Error requesting display media:', error);
        throw error;
      }
    });
  }
}

// Initialize the app
new TranscribeApp();