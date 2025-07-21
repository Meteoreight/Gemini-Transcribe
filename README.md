# Gemini Transcribe

A real-time speech-to-text transcription application using Google's Gemini API. This Electron-based desktop application supports multiple transcription modes including real-time desktop audio capture, microphone input, and batch file processing.

**English** | [日本語](README_ja.md)

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

Before installing Gemini Transcribe, ensure you have the following installed on your system:

#### Required Software
- **Node.js** (v16 or higher) - [Download from nodejs.org](https://nodejs.org/)
- **npm** (comes with Node.js) or **yarn** (optional)
- **Git** - [Download from git-scm.com](https://git-scm.com/)

#### Google Gemini API Access
- A Google Cloud Platform account
- Gemini API access and API key

**To verify your prerequisites:**
```bash
# Check Node.js version
node --version  # Should be v16.0.0 or higher

# Check npm version
npm --version   # Should be 8.0.0 or higher

# Check Git installation
git --version
```

### Step-by-Step Installation Guide

#### 1. Clone the Repository
```bash
# Clone from GitHub (replace with actual repository URL)
git clone https://github.com/your-username/gemini-transcribe.git

# Navigate to the project directory
cd gemini-transcribe

# Verify you're in the correct directory
ls -la  # Should show package.json, src/, docs/, etc.
```

#### 2. Install Dependencies
```bash
# Install all required Node.js packages
npm install

# This may take a few minutes as it downloads Electron and other dependencies
# You should see "added XXX packages" when complete
```

#### 3. Configure Environment Variables
```bash
# Copy the example environment file
cp .env.example .env

# Open the .env file in your preferred text editor
# For example:
nano .env
# or
code .env  # if using VS Code
```

Edit the `.env` file and configure your settings:
```env
# Required: Your Gemini API key
GEMINI_API_KEY=your_actual_api_key_here

# Optional: Customize other settings
GEMINI_MODEL=gemini-2.5-flash
DEFAULT_CHUNK_DURATION=5
DEFAULT_OUTPUT_FORMAT=vtt
```

#### 4. Build the Application
```bash
# Compile TypeScript and prepare assets
npm run build

# You should see output indicating successful compilation
# dist/ directory will be created with compiled files
```

#### 5. Test the Installation
```bash
# Start the application in development mode
npm run dev

# The Gemini Transcribe window should open
# If successful, you'll see the application interface with tabs
```

### First Launch Setup

#### Initial Configuration
1. **Application Launch**: When you first run `npm run dev`, the Gemini Transcribe window will open
2. **Settings Configuration**: 
   - Click on the "Settings" tab
   - Enter your Gemini API key if not already configured
   - Select your preferred model (Gemini 2.5 Flash recommended for beginners)
   - Set your output directory (defaults to ~/Documents/Transcriptions)
   - Choose output format (VTT, SRT, or Plain Text)
3. **Permission Setup**:
   - **macOS**: Grant screen recording permission for desktop audio capture
   - **Windows/Linux**: Ensure microphone permissions are enabled
   - **All platforms**: Allow the application to access your microphone when prompted

#### Verify Everything Works
1. **Test Microphone**: 
   - Go to "Speech-to-Text" tab
   - Click "Test" next to the microphone selection
   - You should see audio level bars moving when you speak
2. **Test Settings**: 
   - Go to "Settings" tab
   - Click "Save Settings"
   - You should see "Settings saved" confirmation

### Quick Start Commands

```bash
# Development workflow
npm run dev          # Start application in development mode
npm run build        # Build TypeScript to JavaScript
npm run clean        # Clean build artifacts

# Code quality
npm run lint         # Check code for errors
npm run format       # Format code with Prettier

# Production
npm run dist         # Build distributable application
```

### Troubleshooting Installation

#### Common Issues and Solutions

**❌ "node: command not found"**
- Install Node.js from [nodejs.org](https://nodejs.org/)
- Restart your terminal after installation

**❌ "npm install" fails with permission errors**
- On macOS/Linux: Use `sudo npm install` (not recommended) or set up npm properly
- Better solution: Use nvm (Node Version Manager) to install Node.js

**❌ "Cannot find module 'electron'"**
- Run `npm install` to ensure all dependencies are installed
- Delete `node_modules/` and run `npm install` again if needed

**❌ Application window doesn't open**
- Check the terminal for error messages
- Ensure you ran `npm run build` before `npm run dev`
- Try `npm run clean && npm run build && npm run dev`

**❌ "API key invalid" error**
- Verify your API key is correct in the `.env` file
- Check that Gemini API is enabled in your Google Cloud project
- Ensure there are no extra spaces or quotes around the API key

#### Getting Help
If you encounter issues not covered here:
1. Check the [Troubleshooting](#troubleshooting) section below
2. Look at the terminal output for specific error messages
3. Ensure all prerequisites are properly installed
4. Try the installation steps again from a clean directory

### Development vs Production

#### Development Mode (`npm run dev`)
- Uses source files with hot reload
- Shows developer tools
- Detailed error messages
- Suitable for testing and development

#### Production Build (`npm run dist`)
- Creates optimized, packaged application
- Smaller file size and better performance
- Includes auto-updater functionality
- Ready for distribution to end users

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