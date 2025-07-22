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
    try {
      console.log('Starting app initialization...');
      
      // Initialize provider factory
      console.log('Initializing provider factory...');
      STTProviderFactory.initialize();
      
      // Load settings
      console.log('Loading settings...');
      await this.settingsManager.loadSettings();
      
      // Initialize current provider
      console.log('Initializing current provider...');
      await this.initializeCurrentProvider();
      
      console.log('Setting up event listeners...');
      this.setupEventListeners();
      this.setupTabNavigation();
      this.setupFileHandling();
      this.setupAudioDevices();
      this.updateUI();
      
      // Listen for IPC events
      console.log('Setting up IPC...');
      this.setupIPC();
      
      console.log('App initialization completed successfully!');
    } catch (error: any) {
      console.error('Failed to initialize app:', error);
      alert('Application initialization failed. Please check the console for details.');
    }
  }

  private validateProviderState(): { isValid: boolean; error?: string } {
    if (!this.state.currentProvider) {
      return { 
        isValid: false, 
        error: 'No STT provider is configured. Please select and configure a provider in settings.' 
      };
    }

    if (!this.state.currentProvider.isConfigured()) {
      return { 
        isValid: false, 
        error: `${this.state.currentProvider.name} is not properly configured. Please check your API key and settings.` 
      };
    }

    return { isValid: true };
  }

  private async initializeCurrentProvider(): Promise<void> {
    try {
      const currentProviderType = this.settingsManager.getCurrentProvider();
      console.log(`Current provider type: ${currentProviderType}`);
      
      const providerConfig = this.settingsManager.getProviderConfig(currentProviderType);
      console.log(`Provider config:`, providerConfig);
      
      console.log(`Creating provider: ${currentProviderType}`);
      this.state.currentProvider = await STTProviderFactory.createProvider(currentProviderType, providerConfig);
      
      console.log(`Initializing provider: ${currentProviderType}`);
      await this.state.currentProvider.initialize(providerConfig);
      
      console.log(`Provider ${currentProviderType} initialized successfully`);
      this.updateProviderStatus();
      
    } catch (error: any) {
      console.error('Failed to initialize provider:', error);
      console.error('Error details:', error.stack);
      
      // Reset currentProvider to null when initialization fails
      this.state.currentProvider = null;
      
      // Don't throw the error, just log it and continue with app initialization
      this.updateStatus(`Provider initialization failed: ${error.message}`);
      this.updateProviderStatus();
      console.log('Continuing app initialization without provider...');
    }
  }

  private setupEventListeners(): void {
    console.log('Setting up event listeners...');
    
    try {
      // Tab navigation
      console.log('Setting up tab navigation click listener...');
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        
        if (target.classList.contains('tab-btn')) {
          const tabName = target.getAttribute('data-tab');
          console.log(`Tab clicked: ${tabName}`);
          if (tabName) {
            this.switchTab(tabName);
          }
        }
      });

      // Real-time recording
      const realtimeStartBtn = document.getElementById('realtime-start-btn');
      if (realtimeStartBtn) {
        console.log('Found realtime start button, adding listener...');
        realtimeStartBtn.addEventListener('click', () => {
          console.log('Realtime start button clicked');
          this.toggleRealtimeRecording();
        });
      } else {
        console.warn('Realtime start button not found');
      }

      // File processing
      const processFilesBtn = document.getElementById('process-files-btn');
      if (processFilesBtn) {
        console.log('Found process files button, adding listener...');
        processFilesBtn.addEventListener('click', () => this.processSelectedFiles());
      } else {
        console.warn('Process files button not found');
      }

      // Speech recording
      const speechStartBtn = document.getElementById('speech-start-btn');
      if (speechStartBtn) {
        console.log('Found speech start button, adding listener...');
        speechStartBtn.addEventListener('click', () => this.toggleSpeechRecording());
      } else {
        console.warn('Speech start button not found');
      }

      // Settings
      const saveSettingsBtn = document.getElementById('save-settings');
      if (saveSettingsBtn) {
        console.log('Found save settings button, adding listener...');
        saveSettingsBtn.addEventListener('click', () => this.saveSettings());
      } else {
        console.warn('Save settings button not found');
      }

      const resetSettingsBtn = document.getElementById('reset-settings');
      if (resetSettingsBtn) {
        console.log('Found reset settings button, adding listener...');
        resetSettingsBtn.addEventListener('click', () => this.resetSettings());
      } else {
        console.warn('Reset settings button not found');
      }

      // Transcription controls
      const clearBtn = document.getElementById('clear-transcription');
      if (clearBtn) {
        console.log('Found clear transcription button, adding listener...');
        clearBtn.addEventListener('click', () => this.clearTranscription('transcription-area'));
      } else {
        console.warn('Clear transcription button not found');
      }

      const copyBtn = document.getElementById('copy-transcription');
      if (copyBtn) {
        console.log('Found copy transcription button, adding listener...');
        copyBtn.addEventListener('click', () => this.copyTranscription('transcription-area'));
      } else {
        console.warn('Copy transcription button not found');
      }

      // Provider selection
      const providerSelect = document.getElementById('stt-provider');
      if (providerSelect) {
        console.log('Found provider select, adding listener...');
        providerSelect.addEventListener('change', (e) => this.onProviderChange(e));
      } else {
        console.warn('Provider select not found');
      }

      // API key toggles
      const toggleGeminiApiKeyBtn = document.getElementById('toggle-gemini-api-key');
      if (toggleGeminiApiKeyBtn) {
        console.log('Found gemini API key toggle, adding listener...');
        toggleGeminiApiKeyBtn.addEventListener('click', () => this.toggleApiKeyVisibility('gemini'));
      } else {
        console.warn('Gemini API key toggle not found');
      }
      
      const toggleOpenAIApiKeyBtn = document.getElementById('toggle-openai-api-key');
      if (toggleOpenAIApiKeyBtn) {
        console.log('Found OpenAI API key toggle, adding listener...');
        toggleOpenAIApiKeyBtn.addEventListener('click', () => this.toggleApiKeyVisibility('openai'));
      } else {
        console.warn('OpenAI API key toggle not found');
      }

      // Browse output directory
      const browseOutputDirBtn = document.getElementById('browse-output-dir');
      if (browseOutputDirBtn) {
        console.log('Found browse output dir button, adding listener...');
        browseOutputDirBtn.addEventListener('click', () => this.browseOutputDirectory());
      } else {
        console.warn('Browse output dir button not found');
      }

      // Test microphone
      const testMicBtn = document.getElementById('test-microphone');
      if (testMicBtn) {
        console.log('Found test microphone button, adding listener...');
        testMicBtn.addEventListener('click', () => this.testMicrophone());
      } else {
        console.warn('Test microphone button not found');
      }
      
      console.log('Event listeners setup completed');
    } catch (error: any) {
      console.error('Error setting up event listeners:', error);
    }
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
    console.log(`Switching to tab: ${tabName}`);
    
    try {
      this.state.currentTab = tabName;

      // Update tab buttons
      const tabButtons = document.querySelectorAll('.tab-btn');
      console.log(`Found ${tabButtons.length} tab buttons`);
      
      tabButtons.forEach((btn) => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
          btn.classList.add('active');
          console.log(`Activated tab button for: ${tabName}`);
        }
      });

      // Update tab content
      const tabContents = document.querySelectorAll('.tab-content');
      console.log(`Found ${tabContents.length} tab contents`);
      
      tabContents.forEach((content) => {
        content.classList.remove('active');
      });

      const activeTab = document.getElementById(`${tabName}-tab`);
      if (activeTab) {
        activeTab.classList.add('active');
        console.log(`Activated tab content for: ${tabName}`);
      } else {
        console.warn(`Tab content not found for: ${tabName}-tab`);
      }
    } catch (error: any) {
      console.error('Error switching tab:', error);
    }
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
      // Validate provider state before starting recording
      const validation = this.validateProviderState();
      if (!validation.isValid) {
        alert(validation.error);
        return;
      }

      this.updateStatus('Getting desktop audio sources...');

      // Get available desktop sources using Electron's desktop capturer
      const sources = await window.electronAPI.getDesktopSources({ 
        types: ['screen', 'audio'] 
      });

      // Find suitable audio source
      let audioSource = sources.find(source => 
        source.name.toLowerCase().includes('audio') || 
        source.name.toLowerCase().includes('system') ||
        source.name.toLowerCase().includes('desktop')
      );

      // If no specific audio source found, try to use screen capture with audio
      if (!audioSource) {
        audioSource = sources.find(source => source.name.toLowerCase().includes('screen'));
      }

      if (!audioSource) {
        // Fallback to microphone recording
        console.warn('No desktop audio source found, falling back to microphone');
        this.updateStatus('No desktop audio available, using microphone...');
        await this.startSpeechRecording();
        return;
      }

      // Try to get the media stream using the source ID
      let stream: MediaStream;
      try {
        // Use Electron's enhanced getUserMedia with chromeMediaSourceId
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: audioSource.id
          } as any,
          video: false
        });
      } catch (getUserMediaError) {
        console.warn('Failed to get stream with source ID, trying getDisplayMedia:', getUserMediaError);
        
        // Fallback to standard getDisplayMedia (this might still fail, but worth trying)
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: false
          });
        } catch (displayMediaError) {
          console.error('Both desktop capture methods failed:', displayMediaError);
          this.updateStatus('Desktop audio not supported, using microphone...');
          await this.startSpeechRecording();
          return;
        }
      }

      // Configure MediaRecorder with better audio format
      const mimeType = this.getBestAudioMimeType();
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000 // 128 kbps for good quality
      });
      
      console.log(`Using MediaRecorder with MIME type: ${mimeType}`);
      this.recordingStartTime = Date.now();
      this.state.isRecording = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log(`Audio chunk received: ${event.data.size} bytes, type: ${event.data.type}`);
          this.processAudioChunk(event.data);
        } else {
          console.warn('Received empty audio chunk');
        }
      };

      // Use longer chunks to ensure meaningful audio content
      const chunkDuration = Math.max(this.settingsManager.getChunkDuration() * 1000, 3000); // minimum 3 seconds
      this.mediaRecorder.start(chunkDuration);
      this.startDurationTimer();
      this.updateRecordingUI(true);
      this.updateStatus('Recording desktop audio...');

    } catch (error: any) {
      console.error('Error starting recording:', error);
      this.updateStatus('Failed to start recording');
      
      // Provide more specific error messages
      let errorMessage = 'Failed to start desktop audio recording.';
      if (error.name === 'NotSupportedError') {
        errorMessage += ' Desktop audio capture is not supported on this system. Try using microphone recording instead.';
      } else if (error.name === 'NotAllowedError') {
        errorMessage += ' Please grant screen recording permissions in your system settings.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += ' No audio sources found. Try using microphone recording instead.';
      } else {
        errorMessage += ` Error: ${error.message}`;
      }
      
      alert(errorMessage);
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
      // Validate provider state before starting recording
      const validation = this.validateProviderState();
      if (!validation.isValid) {
        alert(validation.error);
        return;
      }

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

      // Configure MediaRecorder with better audio format
      const mimeType = this.getBestAudioMimeType();
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000 // 128 kbps for good quality
      });
      
      console.log(`Using MediaRecorder with MIME type: ${mimeType}`);
      this.recordingStartTime = Date.now();
      this.state.isRecording = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log(`Audio chunk received: ${event.data.size} bytes, type: ${event.data.type}`);
          this.processAudioChunk(event.data);
        } else {
          console.warn('Received empty audio chunk');
        }
      };

      // Use longer chunks to ensure meaningful audio content
      const chunkDuration = Math.max(this.settingsManager.getChunkDuration() * 1000, 3000); // minimum 3 seconds
      this.mediaRecorder.start(chunkDuration);
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
      // Validate audio blob
      if (!this.isValidAudioBlob(audioBlob)) {
        console.warn('Skipping invalid or empty audio chunk');
        return;
      }

      // Convert blob to ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Additional validation for audio content
      if (!this.hasAudioContent(arrayBuffer)) {
        console.warn('Skipping audio chunk with no meaningful content');
        return;
      }

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
      
      // Provide user-friendly error messages
      let userMessage = 'Transcription failed';
      if (error.message.includes('No STT provider is configured')) {
        userMessage = 'Please configure an STT provider in settings';
      } else if (error.message.includes('not properly configured')) {
        userMessage = 'Provider configuration incomplete - check API key';
      } else if (error.message.includes('Authentication failed') || error.message.includes('Invalid API key')) {
        userMessage = 'Invalid API key - please check your credentials';
      } else if (error.message.includes('Rate limit exceeded')) {
        userMessage = 'API rate limit exceeded - please wait and try again';
      } else if (error.message.includes('Network') || error.message.includes('timeout')) {
        userMessage = 'Network error - check your internet connection';
      } else if (error.message.includes('No text in response') || error.message.includes('NO_TEXT')) {
        userMessage = 'No speech detected in audio - try speaking louder or closer to microphone';
      } else if (error.message.includes('silent or empty')) {
        userMessage = 'Audio appears to be silent - check microphone or audio source';
      } else if (error.message.includes('Content blocked') || error.message.includes('CONTENT_BLOCKED')) {
        userMessage = 'Audio content was blocked by safety filters';
      } else if (error.message.includes('unsupported format')) {
        userMessage = 'Audio format not supported - try adjusting recording settings';
      } else {
        userMessage = `Transcription error: ${error.message}`;
      }
      
      this.updateStatus(userMessage);
    }
  }

  private async transcribeAudio(audioData: ArrayBuffer, options: TranscriptionOptions): Promise<{text: string}> {
    const validation = this.validateProviderState();
    if (!validation.isValid) {
      throw new Error(validation.error!);
    }

    try {
      // Create audio chunk with correct format detection
      const audioChunk: AudioChunk = {
        data: audioData,
        duration: this.estimateAudioDuration(audioData),
        timestamp: Date.now(),
        format: this.detectAudioFormat(), // Detect actual format from MediaRecorder
        sampleRate: 16000, // Standard sample rate
        channels: 1 // Mono
      };

      // Perform transcription
      const result = await this.state.currentProvider!.transcribe(audioChunk, options);
      
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
    if (connectionStatus) {
      if (!this.state.currentProvider) {
        connectionStatus.textContent = 'No provider available - Check settings';
        connectionStatus.style.color = '#F44336';
      } else if (this.state.currentProvider.isConfigured()) {
        connectionStatus.textContent = `Connected (${this.state.currentProvider.name})`;
        connectionStatus.style.color = '#4CAF50';
      } else {
        connectionStatus.textContent = `${this.state.currentProvider.name} - Configuration Required`;
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
    const providerSelect = document.getElementById('stt-provider') as HTMLSelectElement;
    if (providerSelect) {
      providerSelect.value = settings.currentProvider;
    }
    
    // Update provider-specific settings
    // Gemini settings
    const geminiApiKey = document.getElementById('gemini-api-key') as HTMLInputElement;
    if (geminiApiKey) {
      geminiApiKey.value = (settings.providers.gemini as any).apiKey || '';
    }
    
    const geminiModel = document.getElementById('gemini-model') as HTMLSelectElement;
    if (geminiModel) {
      geminiModel.value = (settings.providers.gemini as any).model || 'gemini-2.5-flash';
    }
    
    // OpenAI settings
    const openaiApiKey = document.getElementById('openai-api-key') as HTMLInputElement;
    if (openaiApiKey) {
      openaiApiKey.value = (settings.providers.openai as any).apiKey || '';
    }
    
    const openaiModel = document.getElementById('openai-model') as HTMLSelectElement;
    if (openaiModel) {
      openaiModel.value = (settings.providers.openai as any).model || 'whisper-1';
    }
    
    const openaiResponseFormat = document.getElementById('openai-response-format') as HTMLSelectElement;
    if (openaiResponseFormat) {
      openaiResponseFormat.value = (settings.providers.openai as any).responseFormat || 'json';
    }
    
    // Local Whisper settings
    const whisperModelSize = document.getElementById('whisper-model-size') as HTMLSelectElement;
    if (whisperModelSize) {
      whisperModelSize.value = (settings.providers.local_whisper as any).modelSize || 'base';
    }
    
    const whisperDevice = document.getElementById('whisper-device') as HTMLSelectElement;
    if (whisperDevice) {
      whisperDevice.value = (settings.providers.local_whisper as any).device || 'cpu';
    }
    
    const whisperThreads = document.getElementById('whisper-threads') as HTMLInputElement;
    if (whisperThreads) {
      whisperThreads.value = (settings.providers.local_whisper as any).threads?.toString() || '4';
    }
    
    // General settings
    const chunkDuration = document.getElementById('chunk-duration') as HTMLInputElement;
    if (chunkDuration) {
      chunkDuration.value = settings.chunkDuration.toString();
    }
    
    const outputDirectory = document.getElementById('output-directory') as HTMLInputElement;
    if (outputDirectory) {
      outputDirectory.value = settings.outputDirectory;
    }
    
    const outputFormat = document.getElementById('output-format') as HTMLSelectElement;
    if (outputFormat) {
      outputFormat.value = settings.outputFormat;
    }
    
    const autoSave = document.getElementById('auto-save') as HTMLInputElement;
    if (autoSave) {
      autoSave.checked = settings.autoSave;
    }
    
    const includeTimestamps = document.getElementById('include-timestamps') as HTMLInputElement;
    if (includeTimestamps) {
      includeTimestamps.checked = settings.includeTimestamps;
    }
    
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

  private getBestAudioMimeType(): string {
    // Try to use the best supported audio format for transcription
    const preferredTypes = [
      'audio/wav', // Best for transcription
      'audio/webm;codecs=pcm', // WAV in WebM container
      'audio/webm;codecs=opus', // Opus in WebM
      'audio/mp4', // MP4 audio
      'audio/webm', // Default WebM
    ];

    for (const type of preferredTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log(`Selected audio MIME type: ${type}`);
        return type;
      }
    }

    // Fallback to default
    console.warn('No preferred audio MIME types supported, using default');
    return '';
  }

  private isValidAudioBlob(blob: Blob): boolean {
    // Check basic blob validity
    if (!blob || blob.size === 0) {
      console.warn('Empty or null audio blob');
      return false;
    }

    // Check minimum size (at least 1KB for meaningful audio)
    if (blob.size < 1024) {
      console.warn(`Audio blob too small: ${blob.size} bytes`);
      return false;
    }

    // Check if blob type looks like audio
    if (blob.type && !blob.type.startsWith('audio/')) {
      console.warn(`Non-audio blob type: ${blob.type}`);
      return false;
    }

    return true;
  }

  private hasAudioContent(audioBuffer: ArrayBuffer): boolean {
    // Check minimum buffer size
    if (audioBuffer.byteLength < 1024) {
      return false;
    }

    // Simple check for non-zero audio data
    const view = new Uint8Array(audioBuffer);
    let nonZeroCount = 0;
    const sampleSize = Math.min(1000, view.length); // Check first 1000 bytes

    for (let i = 0; i < sampleSize; i++) {
      if (view[i] !== 0) {
        nonZeroCount++;
      }
    }

    // If more than 10% of sampled bytes are non-zero, likely contains audio
    const nonZeroRatio = nonZeroCount / sampleSize;
    const hasContent = nonZeroRatio > 0.1;
    
    if (!hasContent) {
      console.warn(`Audio buffer appears to be silent or empty (${(nonZeroRatio * 100).toFixed(1)}% non-zero)`);
    }

    return hasContent;
  }

  private detectAudioFormat(): string {
    // Return the MIME type that was actually used by MediaRecorder
    if (this.mediaRecorder) {
      const mimeType = this.mediaRecorder.mimeType;
      console.log(`Detected MediaRecorder MIME type: ${mimeType}`);
      
      // Return the MIME type directly for better format detection
      if (mimeType) {
        return mimeType;
      }
    }
    
    // Fallback to default
    return 'audio/webm'; // Most common default for MediaRecorder
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