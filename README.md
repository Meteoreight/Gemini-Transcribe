# Gemini Transcribe

A real-time speech-to-text transcription application using Google's Gemini API. This Electron-based desktop application supports multiple transcription modes including real-time desktop audio capture, microphone input, and batch file processing.

## Features

### 🎵 Real-time Desktop Audio Transcription
- Capture and transcribe desktop audio in real-time
- Support for system-wide audio monitoring
- Live transcription display with timestamps
- Configurable audio chunking and processing

### 🎤 Microphone Speech-to-Text
- Direct microphone input transcription
- Audio device selection and testing
- Real-time audio level monitoring
- Voice activity detection

### 📁 Batch File Processing
- Support for multiple audio formats (MP3, WAV, M4A, FLAC, OGG, AAC)
- Drag-and-drop file interface
- Batch processing with progress tracking
- Metadata extraction and validation

### ⚙️ Advanced Configuration
- Multiple output formats (VTT, SRT, Plain Text)
- Language detection and translation
- Configurable processing parameters
- Secure API key management

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google Gemini API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd gemini-transcribe
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Configure your API key in the `.env` file:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### Development

1. Build the TypeScript code:
```bash
npm run build
```

2. Start the development server:
```bash
npm run dev
```

### Production Build

1. Build the application:
```bash
npm run dist
```

The built application will be available in the `release` directory.

## Usage

### Real-time Desktop Audio Transcription

1. Navigate to the "Real-time STT" tab
2. Configure input and output languages
3. Click "Start Recording" to begin desktop audio capture
4. Grant screen recording permissions when prompted
5. Transcribed text will appear in real-time
6. Click "Stop Recording" to end the session

### Microphone Speech-to-Text

1. Navigate to the "Speech-to-Text" tab
2. Select your microphone from the audio source dropdown
3. Test your microphone using the "Test" button
4. Configure output language preferences
5. Click "Start Recording" to begin transcription
6. Speak into your microphone
7. View real-time transcription results

### File Processing

1. Navigate to the "File STT" tab
2. Drag and drop audio files or click to browse
3. Configure output language settings
4. Click "Process Files" to start batch transcription
5. Monitor processing progress
6. Access results in the configured output directory

### Settings Configuration

1. Navigate to the "Settings" tab
2. Enter your Gemini API key
3. Configure processing parameters:
   - Model selection (Gemini 2.5 Flash, Gemini 1.5 Pro)
   - Chunk duration for audio processing
   - Output directory and format
   - Auto-save preferences
4. Click "Save Settings" to apply changes

## API Configuration

The application uses Google's Gemini API for speech-to-text processing. You'll need to:

1. Create a Google Cloud Project
2. Enable the Gemini API
3. Generate an API key
4. Configure the key in the application settings

### Supported Models

- **Gemini 2.5 Flash**: Fast processing, good for real-time applications
- **Gemini 1.5 Pro**: Higher accuracy, suitable for batch processing

## Audio Requirements

### Supported Input Formats
- MP3
- WAV
- M4A
- FLAC
- OGG
- AAC

### Audio Quality Recommendations
- Sample rate: 16kHz or higher
- Bit depth: 16-bit minimum
- Clear audio with minimal background noise
- Maximum file size: 150MB per file

## Keyboard Shortcuts

- `Ctrl/Cmd + O`: Open audio files
- `Ctrl/Cmd + ,`: Open settings
- `Ctrl/Cmd + Q`: Quit application
- `Space`: Start/stop recording (configurable)

## Troubleshooting

### Permission Issues

**Desktop Audio Capture (macOS)**:
- Go to System Preferences > Security & Privacy > Privacy > Screen Recording
- Enable permissions for the application

**Microphone Access**:
- Ensure microphone permissions are granted in system settings
- Check that the correct audio device is selected

### API Issues

**Authentication Errors**:
- Verify your API key is correct
- Check that the Gemini API is enabled in your Google Cloud project
- Ensure you have sufficient API quota

**Rate Limiting**:
- Reduce chunk duration to decrease API call frequency
- Check your API usage in the Google Cloud console

### Audio Processing Issues

**No Audio Detected**:
- Check audio device connections
- Verify system audio is not muted
- Test with different audio sources

**Poor Transcription Quality**:
- Ensure clear audio input
- Reduce background noise
- Try different models (Gemini 1.5 Pro for better accuracy)

## Development

### Project Structure

```
src/
├── main/           # Electron main process
│   ├── main.ts     # Application entry point
│   └── preload.ts  # IPC bridge
├── renderer/       # Electron renderer process
│   ├── index.html  # Main UI
│   ├── styles.css  # Application styles
│   └── renderer.ts # UI logic
└── shared/         # Shared utilities and types
```

### Building

The application uses TypeScript for development and Electron Builder for packaging.

```bash
# Development build
npm run build

# Production build with packaging
npm run dist

# Clean build artifacts
npm run clean
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests for new functionality
5. Submit a pull request

## License

[License information]

## Support

For issues and questions:
- Check the troubleshooting section above
- Review the [project documentation](./docs/)
- Open an issue on GitHub

## Acknowledgments

- Google Gemini API for speech-to-text processing
- Electron framework for cross-platform desktop applications
- The open-source community for various dependencies and inspiration