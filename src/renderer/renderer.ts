// Application state management
interface AppState {
  currentTab: string;
  isRecording: boolean;
  selectedFiles: File[];
  settings: {
    apiKey: string;
    model: string;
    chunkDuration: number;
    outputDirectory: string;
    outputFormat: string;
    autoSave: boolean;
    includeTimestamps: boolean;
  };
}

class TranscribeRenderer {
  private state: AppState = {
    currentTab: 'realtime',
    isRecording: false,
    selectedFiles: [],
    settings: {
      apiKey: '',
      model: 'gemini-2.5-flash',
      chunkDuration: 5,
      outputDirectory: '',
      outputFormat: 'vtt',
      autoSave: true,
      includeTimestamps: true,
    },
  };

  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private recordingStartTime: number = 0;
  private durationUpdateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    await this.loadSettings();
    this.setupEventListeners();
    this.setupTabNavigation();
    this.setupFileHandling();
    this.setupAudioDevices();
    this.updateUI();
    
    // Listen for IPC events
    this.setupIPC();
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

    // API key toggle
    const toggleApiKeyBtn = document.getElementById('toggle-api-key');
    toggleApiKeyBtn?.addEventListener('click', () => this.toggleApiKeyVisibility());

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
    } catch (error) {
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

      this.mediaRecorder.start(this.state.settings.chunkDuration * 1000);
      this.startDurationTimer();
      this.updateRecordingUI(true);
      this.updateStatus('Recording desktop audio...');

    } catch (error) {
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

      this.mediaRecorder.start(this.state.settings.chunkDuration * 1000);
      this.startDurationTimer();
      this.updateRecordingUI(true);
      this.updateStatus('Recording from microphone...');
      this.startAudioLevelMonitoring(stream);

    } catch (error) {
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
    
    if (this.state.settings.autoSave) {
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
      // Convert blob to base64 for API transmission
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      // Get current settings
      const inputLanguage = (document.getElementById('input-language') as HTMLSelectElement)?.value || 'auto';
      const outputLanguage = (document.getElementById('output-language') as HTMLSelectElement)?.value || 'auto';

      // TODO: Send to transcription service
      const result = await this.transcribeAudio(base64Audio, {
        inputLanguage,
        outputLanguage,
        includeTimestamps: this.state.settings.includeTimestamps,
      });

      this.appendTranscription(result.text);
      this.updateChunkCount();

    } catch (error) {
      console.error('Error processing audio chunk:', error);
    }
  }

  private async transcribeAudio(_audioData: string, options: any): Promise<{text: string}> {
    // Placeholder for actual Gemini API integration
    // This will be implemented in the next phase
    console.log('Transcribing audio with options:', options);
    
    // Simulate API response
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          text: `[${new Date().toLocaleTimeString()}] Transcribed text from audio chunk...`
        });
      }, 1000);
    });
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
      } catch (error) {
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
      
    } catch (error) {
      console.error('Microphone test failed:', error);
      alert('Microphone test failed. Please check your permissions.');
    }
  }

  private toggleApiKeyVisibility(): void {
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const toggleBtn = document.getElementById('toggle-api-key');
    
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
          this.state.settings.outputDirectory = result.filePaths[0];
        }
      }
    } catch (error) {
      console.error('Error browsing for directory:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    // Collect settings from form
    const apiKey = (document.getElementById('api-key') as HTMLInputElement)?.value || '';
    const model = (document.getElementById('model-select') as HTMLSelectElement)?.value || 'gemini-2.5-flash';
    const chunkDuration = parseInt((document.getElementById('chunk-duration') as HTMLInputElement)?.value || '5');
    const outputFormat = (document.getElementById('output-format') as HTMLSelectElement)?.value || 'vtt';
    const autoSave = (document.getElementById('auto-save') as HTMLInputElement)?.checked || false;
    const includeTimestamps = (document.getElementById('include-timestamps') as HTMLInputElement)?.checked || true;

    this.state.settings = {
      ...this.state.settings,
      apiKey,
      model,
      chunkDuration,
      outputFormat,
      autoSave,
      includeTimestamps,
    };

    // Save to local storage
    localStorage.setItem('transcribe-settings', JSON.stringify(this.state.settings));
    
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
  }

  private async resetSettings(): Promise<void> {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      this.state.settings = {
        apiKey: '',
        model: 'gemini-2.5-flash',
        chunkDuration: 5,
        outputDirectory: '',
        outputFormat: 'vtt',
        autoSave: true,
        includeTimestamps: true,
      };

      localStorage.removeItem('transcribe-settings');
      this.updateSettingsUI();
      this.updateStatus('Settings reset to defaults');
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const saved = localStorage.getItem('transcribe-settings');
      if (saved) {
        this.state.settings = { ...this.state.settings, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  private updateSettingsUI(): void {
    (document.getElementById('api-key') as HTMLInputElement).value = this.state.settings.apiKey;
    (document.getElementById('model-select') as HTMLSelectElement).value = this.state.settings.model;
    (document.getElementById('chunk-duration') as HTMLInputElement).value = this.state.settings.chunkDuration.toString();
    (document.getElementById('output-directory') as HTMLInputElement).value = this.state.settings.outputDirectory;
    (document.getElementById('output-format') as HTMLSelectElement).value = this.state.settings.outputFormat;
    (document.getElementById('auto-save') as HTMLInputElement).checked = this.state.settings.autoSave;
    (document.getElementById('include-timestamps') as HTMLInputElement).checked = this.state.settings.includeTimestamps;
  }

  private updateUI(): void {
    this.updateSettingsUI();
    this.updateStatus('Ready');
    
    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus) {
      connectionStatus.textContent = this.state.settings.apiKey ? 'Connected' : 'Not configured';
    }
  }

  private async saveTranscription(): Promise<void> {
    // TODO: Implement transcription saving
    console.log('Saving transcription...');
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