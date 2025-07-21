import { STTProviderFactory } from '../shared/provider-factory';
import { SettingsManager } from '../shared/settings-manager';
import { STTProvider, ProviderType, AudioChunk, TranscriptionOptions } from '../shared/types';

// Application state management
interface AppState {
  currentTab: string;
  isRecording: boolean;
  selectedFiles: File[];
  currentProvider: STTProvider | null;
}

class TranscribeRenderer {
  private state: AppState = {
    currentTab: 'realtime',
    isRecording: false,
    selectedFiles: [],
    currentProvider: null,
  };

  private settingsManager: SettingsManager;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private recordingStartTime: number = 0;
  private durationUpdateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.settingsManager = new SettingsManager();
    this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    // Initialize provider factory
    STTProviderFactory.initialize();
    
    // Load settings
    await this.settingsManager.loadSettings();
    
    // Initialize current provider
    await this.initializeCurrentProvider();
    
    this.setupEventListeners();
    this.setupTabNavigation();
    this.setupFileHandling();
    this.setupAudioDevices();
    this.updateUI();
    
    // Listen for IPC events
    this.setupIPC();
  }

  private async initializeCurrentProvider(): Promise<void> {
    try {
      const currentProviderType = this.settingsManager.getCurrentProvider();
      const providerConfig = this.settingsManager.getProviderConfig(currentProviderType);
      
      console.log(`Initializing provider: ${currentProviderType}`);
      
      this.state.currentProvider = await STTProviderFactory.createProvider(currentProviderType, providerConfig);
      await this.state.currentProvider.initialize(providerConfig);
      
      console.log(`Provider ${currentProviderType} initialized successfully`);
      this.updateProviderStatus();
      
    } catch (error: any) {
      console.error('Failed to initialize provider:', error);
      this.updateStatus(`Provider initialization failed: ${error.message}`);
    }
  }

  private setupEventListeners(): void {
    // Tab navigation
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      if (target.classList.contains('tab-btn')) {
        const tabName = target.getAttribute('data-tab');
        if (tabName) {
          this.switchTab(tabName);
        }
      }
    });

    // Real-time recording
    const realtimeStartBtn = document.getElementById('realtime-start-btn');
    realtimeStartBtn?.addEventListener('click', () => this.toggleRealtimeRecording());

    // File processing
    const processFilesBtn = document.getElementById('process-files-btn');
    processFilesBtn?.addEventListener('click', () => this.processSelectedFiles());

    // Speech recording
    const speechStartBtn = document.getElementById('speech-start-btn');
    speechStartBtn?.addEventListener('click', () => this.toggleSpeechRecording());

    // Settings
    const saveSettingsBtn = document.getElementById('save-settings');
    saveSettingsBtn?.addEventListener('click', () => this.saveSettings());

    const resetSettingsBtn = document.getElementById('reset-settings');
    resetSettingsBtn?.addEventListener('click', () => this.resetSettings());

    // Transcription controls
    const clearBtn = document.getElementById('clear-transcription');
    clearBtn?.addEventListener('click', () => this.clearTranscription('transcription-area'));

    const copyBtn = document.getElementById('copy-transcription');
    copyBtn?.addEventListener('click', () => this.copyTranscription('transcription-area'));

    // Provider selection
    const providerSelect = document.getElementById('stt-provider');
    providerSelect?.addEventListener('change', (e) => this.onProviderChange(e));

    // API key toggles
    const toggleGeminiApiKeyBtn = document.getElementById('toggle-gemini-api-key');
    toggleGeminiApiKeyBtn?.addEventListener('click', () => this.toggleApiKeyVisibility('gemini'));
    
    const toggleOpenAIApiKeyBtn = document.getElementById('toggle-openai-api-key');
    toggleOpenAIApiKeyBtn?.addEventListener('click', () => this.toggleApiKeyVisibility('openai'));

    // Browse output directory
    const browseOutputDirBtn = document.getElementById('browse-output-dir');
    browseOutputDirBtn?.addEventListener('click', () => this.browseOutputDirectory());

    // Test microphone
    const testMicBtn = document.getElementById('test-microphone');
    testMicBtn?.addEventListener('click', () => this.testMicrophone());
  }

  private setupIPC(): void {
    // Listen for file selection from menu
    window.electronAPI.onFilesSelected((filePaths: string[]) => {
      this.handleFileSelection(filePaths);
    });

    // Listen for settings menu
    window.electronAPI.onOpenSettings(() => {
      this.switchTab('settings');
    });
  }

  private setupTabNavigation(): void {
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        if (tabName) {
          this.switchTab(tabName);
        }
      });
    });
  }

  private switchTab(tabName: string): void {
    this.state.currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      }
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach((content) => {
      content.classList.remove('active');
    });

    const activeTab = document.getElementById(`${tabName}-tab`);
    activeTab?.classList.add('active');
  }

  private setupFileHandling(): void {
    const fileDropZone = document.getElementById('file-drop-zone');
    const fileInput = document.getElementById('file-input') as HTMLInputElement;

    if (fileDropZone && fileInput) {
      // Click to browse
      fileDropZone.addEventListener('click', () => {
        fileInput.click();
      });

      // File input change
      fileInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files) {
          this.addFiles(Array.from(target.files));
        }
      });

      // Drag and drop
      fileDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDropZone.classList.add('dragover');
      });

      fileDropZone.addEventListener('dragleave', () => {
        fileDropZone.classList.remove('dragover');
      });

      fileDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        fileDropZone.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer?.files || []);
        this.addFiles(files);
      });
    }
  }

  private async setupAudioDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      
      const microphoneSelect = document.getElementById('microphone-select') as HTMLSelectElement;
      if (microphoneSelect) {
        microphoneSelect.innerHTML = '';
        
        audioInputs.forEach(device => {
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.textContent = device.label || `Microphone ${device.deviceId.slice(0, 8)}`;
          microphoneSelect.appendChild(option);
        });
      }
    } catch (error: any) {
      console.error('Error enumerating audio devices:', error);
    }
  }

  private addFiles(files: File[]): void {
    const supportedFormats = ['audio/mp3', 'audio/wav', 'audio/m4a', 'audio/flac', 'audio/ogg', 'audio/aac'];
    const validFiles = files.filter(file => 
      supportedFormats.some(format => file.type.includes(format.split('/')[1]))
    );

    this.state.selectedFiles.push(...validFiles);
    this.updateFileList();
    this.showFileListSection();
  }

  private updateFileList(): void {
    const fileList = document.getElementById('file-list');
    if (!fileList) return;

    fileList.innerHTML = '';

    this.state.selectedFiles.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      
      fileItem.innerHTML = `
        <div class="file-info">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14,2 14,8 20,8"></polyline>
          </svg>
          <div>
            <div class="file-name">${file.name}</div>
            <div class="file-duration">Size: ${this.formatFileSize(file.size)}</div>
          </div>
        </div>
        <button class="file-remove" onclick="window.transcribeApp.removeFile(${index})">×</button>
      `;
      
      fileList.appendChild(fileItem);
    });
  }

  private showFileListSection(): void {
    const fileListSection = document.getElementById('file-list-section');
    if (fileListSection && this.state.selectedFiles.length > 0) {
      fileListSection.style.display = 'block';
    }
  }


  private async toggleRealtimeRecording(): Promise<void> {
    if (this.state.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRealtimeRecording();
    }
  }

  private async startRealtimeRecording(): Promise<void> {
    try {
      // Request desktop audio capture permission
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: false
      });

      this.mediaRecorder = new MediaRecorder(stream);
      this.recordingStartTime = Date.now();
      this.state.isRecording = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.processAudioChunk(event.data);
        }
      };

      this.mediaRecorder.start(this.settingsManager.getChunkDuration() * 1000);
      this.startDurationTimer();
      this.updateRecordingUI(true);
      this.updateStatus('Recording desktop audio...');

    } catch (error: any) {
      console.error('Error starting recording:', error);
      this.updateStatus('Failed to start recording');
      alert('Failed to start desktop audio recording. Please ensure you have granted screen recording permissions.');
    }
  }

  private async toggleSpeechRecording(): Promise<void> {
    if (this.state.isRecording) {
      await this.stopRecording();
    } else {
      await this.startSpeechRecording();
    }
  }

  private async startSpeechRecording(): Promise<void> {
    try {
      const microphoneSelect = document.getElementById('microphone-select') as HTMLSelectElement;
      const deviceId = microphoneSelect?.value || 'default';

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId !== 'default' ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      this.mediaRecorder = new MediaRecorder(stream);
      this.recordingStartTime = Date.now();
      this.state.isRecording = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.processAudioChunk(event.data);
        }
      };

      this.mediaRecorder.start(this.settingsManager.getChunkDuration() * 1000);
      this.startDurationTimer();
      this.updateRecordingUI(true);
      this.updateStatus('Recording from microphone...');
      this.startAudioLevelMonitoring(stream);

    } catch (error: any) {
      console.error('Error starting speech recording:', error);
      this.updateStatus('Failed to start microphone recording');
      alert('Failed to start microphone recording. Please ensure you have granted microphone permissions.');
    }
  }

  private async stopRecording(): Promise<void> {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      this.mediaRecorder = null;
    }

    this.state.isRecording = false;
    this.stopDurationTimer();
    this.updateRecordingUI(false);
    this.updateStatus('Ready');
    
    if (this.settingsManager.getAutoSave()) {
      await this.saveTranscription();
    }
  }

  private startDurationTimer(): void {
    this.durationUpdateInterval = setInterval(() => {
      const duration = Date.now() - this.recordingStartTime;
      const formatted = this.formatDuration(duration);
      
      const durationElements = document.querySelectorAll('#recording-duration, #speech-duration');
      durationElements.forEach(el => {
        if (el) el.textContent = formatted;
      });
    }, 1000);
  }

  private stopDurationTimer(): void {
    if (this.durationUpdateInterval) {
      clearInterval(this.durationUpdateInterval);
      this.durationUpdateInterval = null;
    }
  }

  private startAudioLevelMonitoring(stream: MediaStream): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    const analyser = this.audioContext.createAnalyser();
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateLevel = () => {
      if (this.state.isRecording) {
        analyser.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const level = (average / 255) * 100;

        const audioLevelBar = document.getElementById('audio-level-bar');
        if (audioLevelBar) {
          audioLevelBar.style.width = `${level}%`;
        }

        requestAnimationFrame(updateLevel);
      }
    };

    updateLevel();
  }

  private async processAudioChunk(audioBlob: Blob): Promise<void> {
    try {
      // Convert blob to ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Get current settings
      const inputLanguage = (document.getElementById('input-language') as HTMLSelectElement)?.value || 'auto';
      const outputLanguage = (document.getElementById('output-language') as HTMLSelectElement)?.value || 'auto';

      // Build transcription options
      const options: TranscriptionOptions = {
        language: inputLanguage,
        outputLanguage: outputLanguage,
        includeTimestamps: this.settingsManager.getIncludeTimestamps(),
      };

      // Transcribe audio
      const result = await this.transcribeAudio(arrayBuffer, options);

      this.appendTranscription(result.text);
      this.updateChunkCount();

    } catch (error: any) {
      console.error('Error processing audio chunk:', error);
      this.updateStatus(`Transcription error: ${error.message}`);
    }
  }

  private async transcribeAudio(audioData: ArrayBuffer, options: TranscriptionOptions): Promise<{text: string}> {
    if (!this.state.currentProvider) {
      throw new Error('No STT provider is configured');
    }

    try {
      // Create audio chunk
      const audioChunk: AudioChunk = {
        data: audioData,
        duration: this.estimateAudioDuration(audioData),
        timestamp: Date.now(),
        format: 'wav', // Assuming WAV format from MediaRecorder
        sampleRate: 16000, // Standard sample rate
        channels: 1 // Mono
      };

      // Perform transcription
      const result = await this.state.currentProvider.transcribe(audioChunk, options);
      
      return {
        text: result.text
      };
      
    } catch (error: any) {
      console.error('Transcription error:', error);
      
      // Check for STTError by type property instead of instanceof
      if (error.name === 'STTError') {
        throw new Error(`${error.provider || 'STT'} Error: ${error.message}`);
      }
      
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  private estimateAudioDuration(audioData: ArrayBuffer): number {
    // Simple estimation: assuming 16-bit mono at 16kHz
    const bytesPerSample = 2; // 16-bit = 2 bytes
    const sampleRate = 16000;
    const samples = audioData.byteLength / bytesPerSample;
    return samples / sampleRate;
  }

  private appendTranscription(text: string): void {
    const transcriptionArea = document.getElementById('transcription-area');
    const speechTranscriptionArea = document.getElementById('speech-transcription-area');
    
    const activeArea = this.state.currentTab === 'speech' ? speechTranscriptionArea : transcriptionArea;
    
    if (activeArea) {
      const placeholder = activeArea.querySelector('.placeholder');
      if (placeholder) {
        placeholder.remove();
      }
      
      const textContent = activeArea.textContent || '';
      activeArea.textContent = textContent + (textContent ? '\n' : '') + text;
      
      // Auto-scroll to bottom
      activeArea.scrollTop = activeArea.scrollHeight;
    }
  }

  private updateChunkCount(): void {
    const chunksElement = document.getElementById('chunks-processed');
    if (chunksElement) {
      const current = parseInt(chunksElement.textContent || '0');
      chunksElement.textContent = (current + 1).toString();
    }
  }

  private clearTranscription(areaId: string): void {
    const area = document.getElementById(areaId);
    if (area) {
      area.innerHTML = '<div class="placeholder">Transcribed text will appear here...</div>';
    }
  }

  private async copyTranscription(areaId: string): Promise<void> {
    const area = document.getElementById(areaId);
    if (area) {
      const text = area.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        // Show temporary success message
        const btn = document.getElementById(`copy-${areaId.split('-')[0]}`);
        if (btn) {
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
        }
      } catch (error: any) {
        console.error('Failed to copy text:', error);
      }
    }
  }

  private async processSelectedFiles(): Promise<void> {
    if (this.state.selectedFiles.length === 0) return;

    const processingSection = document.getElementById('processing-section');
    if (processingSection) {
      processingSection.style.display = 'block';
    }

    const processingList = document.getElementById('processing-list');
    if (!processingList) return;

    processingList.innerHTML = '';

    for (let i = 0; i < this.state.selectedFiles.length; i++) {
      const file = this.state.selectedFiles[i];
      const processingItem = this.createProcessingItem(file, i);
      processingList.appendChild(processingItem);

      // Simulate processing
      await this.processFile(file, i);
    }
  }

  private createProcessingItem(file: File, index: number): HTMLElement {
    const item = document.createElement('div');
    item.className = 'processing-item';
    item.innerHTML = `
      <div class="processing-header">
        <span>${file.name}</span>
        <span id="progress-${index}">0%</span>
      </div>
      <div class="processing-progress">
        <div id="progress-bar-${index}" class="processing-progress-bar" style="width: 0%"></div>
      </div>
    `;
    return item;
  }

  private async processFile(_file: File, index: number): Promise<void> {
    // Simulate file processing with progress updates
    for (let progress = 0; progress <= 100; progress += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const progressText = document.getElementById(`progress-${index}`);
      const progressBar = document.getElementById(`progress-bar-${index}`);
      
      if (progressText) progressText.textContent = `${progress}%`;
      if (progressBar) progressBar.style.width = `${progress}%`;
    }
  }

  private updateRecordingUI(isRecording: boolean): void {
    const buttons = document.querySelectorAll('#realtime-start-btn, #speech-start-btn');
    
    buttons.forEach(btn => {
      if (isRecording) {
        btn.textContent = 'Stop Recording';
        btn.classList.add('recording');
      } else {
        btn.textContent = 'Start Recording';
        btn.classList.remove('recording');
      }
    });

    const statusElements = document.querySelectorAll('#recording-status, #speech-status');
    statusElements.forEach(el => {
      if (el) el.textContent = isRecording ? 'Recording' : 'Ready';
    });
  }

  private updateStatus(status: string): void {
    const appStatus = document.getElementById('app-status');
    if (appStatus) {
      appStatus.textContent = status;
    }
  }

  private async testMicrophone(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.startAudioLevelMonitoring(stream);
      
      setTimeout(() => {
        stream.getTracks().forEach(track => track.stop());
      }, 5000);
      
    } catch (error: any) {
      console.error('Microphone test failed:', error);
      alert('Microphone test failed. Please check your permissions.');
    }
  }

  private async onProviderChange(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const newProviderType = select.value as ProviderType;
    
    try {
      // Update settings
      this.settingsManager.setCurrentProvider(newProviderType);
      await this.settingsManager.saveSettings();
      
      // Initialize new provider
      await this.initializeCurrentProvider();
      
      // Update UI
      this.updateProviderSettingsUI(newProviderType);
      this.updateStatus(`Switched to ${newProviderType} provider`);
      
    } catch (error: any) {
      console.error('Failed to change provider:', error);
      this.updateStatus(`Failed to switch provider: ${error.message}`);
    }
  }

  private updateProviderSettingsUI(providerType: ProviderType): void {
    // Hide all provider settings
    document.querySelectorAll('.provider-settings').forEach(element => {
      (element as HTMLElement).style.display = 'none';
    });
    
    // Show selected provider settings
    const settingsElement = document.getElementById(`${providerType.replace('_', '-')}-settings`);
    if (settingsElement) {
      settingsElement.style.display = 'block';
    }
  }

  private updateProviderStatus(): void {
    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus && this.state.currentProvider) {
      if (this.state.currentProvider.isConfigured()) {
        connectionStatus.textContent = `Connected (${this.state.currentProvider.name})`;
        connectionStatus.style.color = '#4CAF50';
      } else {
        connectionStatus.textContent = `${this.state.currentProvider.name} - Not Configured`;
        connectionStatus.style.color = '#FF9800';
      }
    }
  }

  private toggleApiKeyVisibility(provider: string): void {
    const apiKeyInput = document.getElementById(`${provider}-api-key`) as HTMLInputElement;
    const toggleBtn = document.getElementById(`toggle-${provider}-api-key`);
    
    if (apiKeyInput && toggleBtn) {
      if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleBtn.textContent = 'Hide';
      } else {
        apiKeyInput.type = 'password';
        toggleBtn.textContent = 'Show';
      }
    }
  }

  private async browseOutputDirectory(): Promise<void> {
    try {
      const result = await window.electronAPI.showOpenDialog({
        title: 'Select Output Directory',
        properties: ['openDirectory'],
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const outputDirInput = document.getElementById('output-directory') as HTMLInputElement;
        if (outputDirInput) {
          outputDirInput.value = result.filePaths[0];
          this.settingsManager.setOutputDirectory(result.filePaths[0]);
        }
      }
    } catch (error: any) {
      console.error('Error browsing for directory:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      // Get current provider type
      const providerType = this.settingsManager.getCurrentProvider();
      
      // Collect provider-specific settings
      switch (providerType) {
        case ProviderType.GEMINI: {
          const apiKey = (document.getElementById('gemini-api-key') as HTMLInputElement)?.value || '';
          const model = (document.getElementById('gemini-model') as HTMLSelectElement)?.value || 'gemini-2.5-flash';
          
          this.settingsManager.updateProviderConfig(ProviderType.GEMINI, {
            apiKey,
            model
          });
          break;
        }
        
        case ProviderType.OPENAI: {
          const apiKey = (document.getElementById('openai-api-key') as HTMLInputElement)?.value || '';
          const model = (document.getElementById('openai-model') as HTMLSelectElement)?.value || 'whisper-1';
          const responseFormat = (document.getElementById('openai-response-format') as HTMLSelectElement)?.value || 'json';
          
          this.settingsManager.updateProviderConfig(ProviderType.OPENAI, {
            apiKey,
            model,
            responseFormat
          });
          break;
        }
        
        case ProviderType.LOCAL_WHISPER: {
          const modelSize = (document.getElementById('whisper-model-size') as HTMLSelectElement)?.value || 'base';
          const device = (document.getElementById('whisper-device') as HTMLSelectElement)?.value || 'cpu';
          const threads = parseInt((document.getElementById('whisper-threads') as HTMLInputElement)?.value || '4');
          
          this.settingsManager.updateProviderConfig(ProviderType.LOCAL_WHISPER, {
            modelSize,
            device,
            threads
          });
          break;
        }
      }
      
      // Collect general settings
      const chunkDuration = parseInt((document.getElementById('chunk-duration') as HTMLInputElement)?.value || '5');
      const outputFormat = (document.getElementById('output-format') as HTMLSelectElement)?.value || 'vtt';
      const autoSave = (document.getElementById('auto-save') as HTMLInputElement)?.checked || false;
      const includeTimestamps = (document.getElementById('include-timestamps') as HTMLInputElement)?.checked || true;
      
      this.settingsManager.setChunkDuration(chunkDuration);
      this.settingsManager.setOutputFormat(outputFormat);
      this.settingsManager.setAutoSave(autoSave);
      this.settingsManager.setIncludeTimestamps(includeTimestamps);

      // Save settings
      await this.settingsManager.saveSettings();
      
      // Reinitialize current provider with new settings
      await this.initializeCurrentProvider();
      
      // Update status
      this.updateStatus('Settings saved');
      
      // Show success message
      const saveBtn = document.getElementById('save-settings');
      if (saveBtn) {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Saved!';
        setTimeout(() => {
          saveBtn.textContent = originalText;
        }, 2000);
      }
      
    } catch (error: any) {
      console.error('Error saving settings:', error);
      this.updateStatus(`Failed to save settings: ${error.message}`);
    }
  }

  private async resetSettings(): Promise<void> {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      try {
        this.settingsManager.resetToDefaults();
        await this.settingsManager.saveSettings();
        
        await this.initializeCurrentProvider();
        this.updateSettingsUI();
        this.updateStatus('Settings reset to defaults');
        
      } catch (error: any) {
        console.error('Error resetting settings:', error);
        this.updateStatus(`Failed to reset settings: ${error.message}`);
      }
    }
  }

  private updateSettingsUI(): void {
    const settings = this.settingsManager.getSettings();
    
    // Update provider selector
    (document.getElementById('stt-provider') as HTMLSelectElement).value = settings.currentProvider;
    
    // Update provider-specific settings
    // Gemini settings
    (document.getElementById('gemini-api-key') as HTMLInputElement).value = (settings.providers.gemini as any).apiKey || '';
    (document.getElementById('gemini-model') as HTMLSelectElement).value = (settings.providers.gemini as any).model || 'gemini-2.5-flash';
    
    // OpenAI settings
    (document.getElementById('openai-api-key') as HTMLInputElement).value = (settings.providers.openai as any).apiKey || '';
    (document.getElementById('openai-model') as HTMLSelectElement).value = (settings.providers.openai as any).model || 'whisper-1';
    (document.getElementById('openai-response-format') as HTMLSelectElement).value = (settings.providers.openai as any).responseFormat || 'json';
    
    // Local Whisper settings
    (document.getElementById('whisper-model-size') as HTMLSelectElement).value = (settings.providers.local_whisper as any).modelSize || 'base';
    (document.getElementById('whisper-device') as HTMLSelectElement).value = (settings.providers.local_whisper as any).device || 'cpu';
    (document.getElementById('whisper-threads') as HTMLInputElement).value = (settings.providers.local_whisper as any).threads?.toString() || '4';
    
    // General settings
    (document.getElementById('chunk-duration') as HTMLInputElement).value = settings.chunkDuration.toString();
    (document.getElementById('output-directory') as HTMLInputElement).value = settings.outputDirectory;
    (document.getElementById('output-format') as HTMLSelectElement).value = settings.outputFormat;
    (document.getElementById('auto-save') as HTMLInputElement).checked = settings.autoSave;
    (document.getElementById('include-timestamps') as HTMLInputElement).checked = settings.includeTimestamps;
    
    // Show current provider settings
    this.updateProviderSettingsUI(settings.currentProvider);
  }

  private updateUI(): void {
    this.updateSettingsUI();
    this.updateStatus('Ready');
    this.updateProviderStatus();
  }

  private async saveTranscription(): Promise<void> {
    try {
      const transcriptionArea = document.getElementById('transcription-area') as HTMLElement;
      if (!transcriptionArea) return;

      const text = transcriptionArea.textContent || '';
      if (!text || text.trim() === '') return;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `transcription-${timestamp}.${this.settingsManager.getOutputFormat()}`;

      // For now, just download as a file
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      this.updateStatus('Transcription saved');
      
    } catch (error: any) {
      console.error('Error saving transcription:', error);
      this.updateStatus(`Failed to save transcription: ${error.message}`);
    }
  }

  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  private formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  private handleFileSelection(filePaths: string[]): void {
    // TODO: Handle file selection from menu
    console.log('Files selected from menu:', filePaths);
    this.switchTab('file');
  }

  // Expose methods that need to be called from HTML
  public removeFile(index: number): void {
    this.state.selectedFiles.splice(index, 1);
    this.updateFileList();
    
    if (this.state.selectedFiles.length === 0) {
      const fileListSection = document.getElementById('file-list-section');
      if (fileListSection) {
        fileListSection.style.display = 'none';
      }
    }
  }
}

// Initialize the application
const transcribeApp = new TranscribeRenderer();

// Expose app instance to global scope for HTML event handlers
(window as any).transcribeApp = transcribeApp;