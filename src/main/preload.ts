import { contextBridge, ipcRenderer } from 'electron';

// Define the API interface
interface ElectronAPI {
  // App info
  getAppInfo: () => Promise<{
    name: string;
    version: string;
    platform: string;
  }>;

  // File operations
  showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
  showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;

  // Transcription
  startTranscription: (config: any) => Promise<{ success: boolean }>;
  stopTranscription: () => Promise<{ success: boolean }>;

  // Audio permissions
  requestAudioPermission: () => Promise<{ granted: boolean }>;

  // Event listeners
  onFilesSelected: (callback: (filePaths: string[]) => void) => void;
  onOpenSettings: (callback: () => void) => void;
  removeAllListeners: (channel: string) => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  
  startTranscription: (config) => ipcRenderer.invoke('start-transcription', config),
  stopTranscription: () => ipcRenderer.invoke('stop-transcription'),
  
  requestAudioPermission: () => ipcRenderer.invoke('request-audio-permission'),
  
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