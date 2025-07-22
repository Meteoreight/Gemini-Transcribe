import { contextBridge, ipcRenderer } from 'electron';

// Define the API interface
interface ElectronAPI {
  // App info
  getAppInfo: () => Promise<{
    name: string;
    version: string;
    platform: string;
  }>;

  // Environment variables
  getEnvVar: (key: string) => Promise<string | undefined>;
  getAllEnvVars: () => Promise<Record<string, string>>;

  // File operations
  showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
  showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;

  // Transcription
  startTranscription: (config: any) => Promise<{ success: boolean }>;
  stopTranscription: () => Promise<{ success: boolean }>;
  transcribeAudio: (provider: string, audioData: any, options: any, config: any) => Promise<any>;

  // Audio permissions
  requestAudioPermission: () => Promise<{ granted: boolean }>;

  // Desktop capture
  getDesktopSources: (options: { types: string[] }) => Promise<Array<{
    id: string;
    name: string;
    display_id: string;
    appIcon: string | null;
    thumbnail: string | null;
  }>>;
  getDisplayMediaWithSource: (sourceId: string, options?: any) => Promise<{ success: boolean; sourceId: string }>;

  // Event listeners
  onFilesSelected: (callback: (filePaths: string[]) => void) => void;
  onOpenSettings: (callback: () => void) => void;
  removeAllListeners: (channel: string) => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  
  // Environment variables
  getEnvVar: (key: string) => ipcRenderer.invoke('get-env-var', key),
  getAllEnvVars: () => ipcRenderer.invoke('get-all-env-vars'),
  
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  
  startTranscription: (config) => ipcRenderer.invoke('start-transcription', config),
  stopTranscription: () => ipcRenderer.invoke('stop-transcription'),
  transcribeAudio: (provider, audioData, options, config) => ipcRenderer.invoke('transcribe-audio', provider, audioData, options, config),
  
  requestAudioPermission: () => ipcRenderer.invoke('request-audio-permission'),
  
  getDesktopSources: (options) => ipcRenderer.invoke('get-desktop-sources', options),
  getDisplayMediaWithSource: (sourceId, options) => ipcRenderer.invoke('get-display-media-with-source', sourceId, options),
  
  onFilesSelected: (callback) => {
    ipcRenderer.on('files-selected', (_, filePaths) => callback(filePaths));
  },
  
  onOpenSettings: (callback) => {
    ipcRenderer.on('open-settings', () => callback());
  },
  
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}