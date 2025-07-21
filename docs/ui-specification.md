# User Interface Specification

## Overview

The Gemini-Transcribe application features a clean, tab-based interface designed for efficient speech-to-text processing across multiple modes. The UI prioritizes usability, accessibility, and real-time feedback.

## Application Layout

### Main Window Structure
```
┌─────────────────────────────────────────────────────────┐
│ [Menu Bar] [Window Controls]                           │
├─────────────────────────────────────────────────────────┤
│ [Real-time STT] [File STT] [Speech-to-Text] [Settings] │ ← Tab Navigation
├─────────────────────────────────────────────────────────┤
│                                                         │
│                   Tab Content Area                      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ [Status Bar] [Progress] [Connection Status]            │
└─────────────────────────────────────────────────────────┘
```

### Window Properties
- **Minimum Size**: 800x600px
- **Default Size**: 1200x800px
- **Resizable**: Yes, with content adaptation
- **Theme**: System-aware (light/dark mode support)

## Tab Navigation

### Tab Design
- **Active Tab**: Highlighted with accent color
- **Inactive Tabs**: Subtle background with hover effects
- **Tab Icons**: Mode-specific icons for visual identification
- **Tab Indicators**: Status dots for active processes

### Tab Organization
1. **Real-time STT** - Live desktop audio transcription
2. **File STT** - Batch audio file processing
3. **Speech-to-Text** - Microphone-based transcription
4. **Settings** - Configuration and preferences

## Real-time STT Mode

### Layout Components
```
┌─────────────────────────────────────────────────────────┐
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│ │ [🎵 START] │ │ Language:   │ │ Output: English ▼  │ │
│ │             │ │ Auto ▼      │ │                     │ │
│ └─────────────┘ └─────────────┘ └─────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │              Live Transcription Area                │ │
│ │                                                     │ │
│ │ [Real-time text appears here with timestamps]      │ │
│ │                                                     │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ Status: Recording... | Duration: 00:02:34 | Chunks: 15 │
└─────────────────────────────────────────────────────────┘
```

### Interactive Elements

#### Start/Stop Button
- **Start State**: Large green button with microphone icon
- **Recording State**: Red stop button with pulsing animation
- **Keyboard Shortcut**: Space bar (configurable)

#### Language Controls
- **Input Language**: Auto-detection with manual override
- **Output Language**: Dropdown (Auto, English, Japanese)
- **Visual Feedback**: Language confidence indicator

#### Transcription Display
- **Real-time Text**: Streams as speech is processed
- **Timestamp Markers**: Configurable visibility
- **Text Formatting**: Speaker changes, confidence levels
- **Auto-scroll**: Follows latest transcription
- **Text Selection**: Copy functionality

#### Progress Indicators
- **Recording Status**: Visual waveform display
- **Processing Queue**: Number of pending chunks
- **Connection Status**: API connectivity indicator

## File STT Mode

### Layout Components
```
┌─────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────┐ │
│ │          Drag & Drop File Area                      │ │
│ │     [📁] Drop audio files here or click to browse  │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ Selected Files:                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📄 audio_file_1.mp3    [Duration: 3:45]    [×]     │ │
│ │ 📄 audio_file_2.wav    [Duration: 12:32]   [×]     │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│ │ Language:   │ │ Output:     │ │    [🚀 PROCESS]    │ │
│ │ Auto ▼      │ │ English ▼   │ │                     │ │
│ └─────────────┘ └─────────────┘ └─────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ Processing Progress:                                    │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ audio_file_1.mp3  [████████████░░░] 80% Complete   │ │
│ │ audio_file_2.wav  [Queue Position: 2]              │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Interactive Elements

#### File Selection
- **Drag & Drop Zone**: Visual feedback for file hovering
- **File Browser**: Native OS file picker integration
- **Supported Formats**: MP3, WAV, M4A, FLAC, OGG display
- **File Validation**: Real-time format and size checking

#### File Management
- **File List**: Thumbnail, name, duration, remove option
- **Batch Operations**: Select all, clear all, remove selected
- **File Details**: Hover tooltip with metadata

#### Processing Controls
- **Process Button**: Disabled until files selected
- **Progress Tracking**: Individual file progress bars
- **Queue Management**: Processing order visualization
- **Cancel Processing**: Stop current operations

#### Results Management
- **Output Location**: Configurable save directory
- **File Naming**: Automatic naming with timestamps
- **Completion Notification**: System notifications
- **Open Results**: Quick access to output files

## Speech-to-Text Mode

### Layout Components
```
┌─────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Audio Source: [Built-in Microphone ▼]              │ │
│ │ Volume: [██████████░] [🔇] Test Microphone          │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│ │ [🎤 START] │ │ Language:   │ │ Output: Japanese ▼ │ │
│ │             │ │ Auto ▼      │ │                     │ │
│ └─────────────┘ └─────────────┘ └─────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │              Live Transcription Area                │ │
│ │                                                     │ │
│ │ [Microphone input transcribed here in real-time]   │ │
│ │                                                     │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ Input Level: [████████░░] | Recording: 00:01:23        │
└─────────────────────────────────────────────────────────┘
```

### Interactive Elements

#### Audio Source Selection
- **Device Dropdown**: All available microphones
- **Device Testing**: Real-time audio level monitoring
- **Permission Handling**: Microphone access requests
- **Device Switching**: Hot-swapping during recording

#### Volume Monitoring
- **Input Level Meter**: Real-time volume visualization
- **Silence Detection**: Visual feedback for voice activity
- **Gain Control**: Software volume adjustment
- **Clipping Warning**: Audio level alerts

#### Recording Controls
- **Start/Stop Button**: Similar to real-time mode
- **Pause/Resume**: Temporary recording suspension
- **Save Session**: Manual save of current session

## Settings Panel

### Layout Components
```
┌─────────────────────────────────────────────────────────┐
│ ┌─────────────┐ ┌─────────────────────────────────────┐ │
│ │ • General   │ │                                     │ │
│ │ • Audio     │ │            General Settings         │ │
│ │ • API       │ │                                     │ │
│ │ • Output    │ │ API Key: [******************] [👁] │ │
│ │ • Advanced  │ │ Model: [gemini-2.5-flash ▼]        │ │
│ │             │ │ Chunk Duration: [5] seconds         │ │
│ │             │ │ Output Directory: [Browse...]       │ │
│ │             │ │                                     │ │
│ │             │ │ ┌─────────────┐ ┌─────────────────┐ │ │
│ │             │ │ │   [TEST]    │ │     [SAVE]      │ │ │
│ │             │ │ └─────────────┘ └─────────────────┘ │ │
│ └─────────────┘ └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Settings Categories

#### General Settings
- **Default Language**: Input and output language preferences
- **Auto-save**: Automatic transcription saving
- **Notifications**: System notification preferences
- **Theme**: Light/dark mode selection

#### Audio Settings
- **Sample Rate**: Audio quality configuration
- **Chunk Size**: Balancing latency vs accuracy
- **Noise Reduction**: Audio preprocessing options
- **Volume Normalization**: Automatic level adjustment

#### API Configuration
- **Provider Selection**: Current and future STT providers
- **API Credentials**: Secure key management
- **Model Selection**: Available model options
- **Rate Limiting**: Request throttling settings

#### Output Settings
- **File Format**: VTT, SRT, TXT options
- **Naming Convention**: File naming patterns
- **Directory Structure**: Output organization
- **Timestamp Format**: Time display preferences

#### Advanced Settings
- **Processing Threads**: Performance tuning
- **Memory Limits**: Resource management
- **Debug Mode**: Logging and troubleshooting
- **Experimental Features**: Beta functionality

## Accessibility Features

### Keyboard Navigation
- **Tab Order**: Logical focus flow through interface
- **Keyboard Shortcuts**: All major functions accessible
- **Focus Indicators**: Clear visual focus states
- **Skip Links**: Quick navigation options

### Screen Reader Support
- **ARIA Labels**: Comprehensive labeling
- **Live Regions**: Real-time transcription announcements
- **Descriptive Text**: Context for visual elements
- **Status Announcements**: Process state changes

### Visual Accessibility
- **High Contrast**: System theme integration
- **Font Scaling**: Respect system font size preferences
- **Color Independence**: Information not color-dependent
- **Motion Reduction**: Respect motion preferences

### Audio Accessibility
- **Visual Feedback**: Visual representation of audio
- **Haptic Feedback**: Touch-based notifications (where supported)
- **Alternative Input**: Voice commands for control

## Responsive Design

### Window Resizing
- **Minimum Constraints**: Maintain usability at small sizes
- **Layout Adaptation**: Component reorganization
- **Content Scaling**: Text and element size adjustment
- **Overflow Handling**: Scrolling and truncation strategies

### Component Flexibility
- **Flexible Grid**: CSS Grid/Flexbox implementation
- **Breakpoint System**: Size-based layout changes
- **Component Priority**: Hide non-essential elements when space constrained

## Error States & Feedback

### Error Handling
- **Inline Validation**: Real-time input validation
- **Error Messages**: Clear, actionable error descriptions
- **Recovery Suggestions**: Helpful next steps
- **Retry Mechanisms**: Easy error recovery

### Loading States
- **Progress Indicators**: Clear progress communication
- **Skeleton Loading**: Placeholder content during loads
- **Cancellation**: User control over long operations
- **Timeout Handling**: Graceful timeout management

### Success Feedback
- **Completion Notifications**: Clear success indicators
- **Result Previews**: Quick access to output
- **Action Confirmations**: Verify destructive actions
- **Status Persistence**: Maintain state across sessions