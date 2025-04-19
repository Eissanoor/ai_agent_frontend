import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { Send, MessageSquare, Mic, MicOff, Type, Volume2, Play, Pause, Check } from 'react-feather';
import WaveSurfer from 'wavesurfer.js';

const ChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    await sendMessage(input);
  };

  const sendMessage = async (message, source = 'text', audioBlob = null) => {
    const userMessage = { 
      type: 'user', 
      content: message, 
      source,
      audioBlob: source === 'voice' ? audioBlob : null,
      audioDuration: 0
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8000/api/text/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: message }),
      });

      const data = await response.json();
      const aiMessage = { type: 'ai', content: data.message };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage = { type: 'error', content: 'Error: ' + error.message };
      setMessages(prev => [...prev, errorMessage]);
    }

    setIsLoading(false);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        // Create audio blob with proper MIME type for better compatibility
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Store a copy of the audio blob for replay functionality
        const replayableAudioBlob = audioBlob.slice(0, audioBlob.size, audioBlob.type);
        const formData = new FormData();
        formData.append('audio', audioBlob);

        try {
          const response = await fetch('http://localhost:8000/api/voice/process', {
            method: 'POST',
            body: formData
          });
          console.log(response);
          const result = await response.json();
          if (result.success) {
            await sendMessage(result.message, 'voice', replayableAudioBlob);
          } else {
            const errorMessage = { type: 'error', content: result.message };
            setMessages(prev => [...prev, errorMessage]);
          }
        } catch (error) {
          const errorMessage = { type: 'error', content: `Error: ${error.message}` };
          setMessages(prev => [...prev, errorMessage]);
        }

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      const errorMessage = { type: 'error', content: `Error: ${error.message}` };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  return (
    <Container>
      <ChatHeader>
        <MessageSquare size={24} />
        <h1>AI Assistant</h1>
      </ChatHeader>

      <MessagesContainer>
        {messages.map((message, index) => (
          <Message key={index} $type={message.type}>
            {message.type === 'user' && (
              <MessageSourceIcon>
                {message.source === 'voice' ? <Volume2 size={16} /> : <Type size={16} />}
              </MessageSourceIcon>
            )}
            {message.source === 'voice' && message.type === 'user' ? (
              <VoiceMessageContent>
                <VoiceMessagePlayer messageId={index} audioBlob={message.audioBlob} />
                <p>{message.content}</p>
              </VoiceMessageContent>
            ) : (
              message.content
            )}
          </Message>
        ))}
        {isLoading && (
          <Message $type="ai">
            <TypingIndicator>
              <span></span>
              <span></span>
              <span></span>
            </TypingIndicator>
          </Message>
        )}
      </MessagesContainer>

      <InputForm onSubmit={handleSubmit}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={isRecording}
        />
        <VoiceButton 
          type="button" 
          onClick={toggleRecording}
          $isRecording={isRecording}
        >
          {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
        </VoiceButton>
        <SendButton type="submit" disabled={!input.trim() || isLoading}>
          <SendIconWrapper>
            <Send size={20} />
          </SendIconWrapper>
        </SendButton>
      </InputForm>
    </Container>
  );
};

// Styled Components
const SendIconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6e8efb, #a777e3);
  border-radius: 50%;
  padding: 8px;
  color: white;
  transition: all 0.2s ease-in-out;
  
  &:hover {
    transform: scale(1.05);
    box-shadow: 0 0 10px rgba(110, 142, 251, 0.5);
  }
`;
const Container = styled.div`
  max-width: 900px;
  margin: 0 auto;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
`;

const ChatHeader = styled.div`
  padding: 1rem;
  background: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  h1 {
    font-size: 1.2rem;
    color: #343a40;
    margin: 0;
  }
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

// Voice Message Player Component
const VoiceMessagePlayer = ({ messageId, audioBlob }) => {
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState('0:00');
  const [currentTime, setCurrentTime] = useState('0:00');
  const [audioUrl, setAudioUrl] = useState(null);
  
  // Create audio URL when component mounts or audioBlob changes
  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [audioBlob]);

  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;
    
    // Clean up previous wavesurfer instance if it exists
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
    }

    // Initialize WaveSurfer
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#a8d5ba',
      progressColor: '#4CAF50',
      cursorColor: 'transparent',
      barWidth: 2,
      barGap: 3,
      barRadius: 3,
      height: 50,
      responsive: true,
      normalize: true,
      partialRender: true,
    });

    wavesurfer.load(audioUrl);
    wavesurferRef.current = wavesurfer;

    wavesurfer.on('ready', () => {
      const audioDuration = wavesurfer.getDuration();
      setDuration(formatTime(audioDuration));
    });

    wavesurfer.on('audioprocess', () => {
      setCurrentTime(formatTime(wavesurfer.getCurrentTime()));
    });

    wavesurfer.on('finish', () => {
      setIsPlaying(false);
    });

    return () => {
      wavesurfer.destroy();
    };
  }, [audioUrl]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const togglePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <VoicePlayerContainer>
      <PlayButtonWrapper $isPlaying={isPlaying} onClick={togglePlayPause}>
        <PlayButtonIcon $isPlaying={isPlaying}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </PlayButtonIcon>
      </PlayButtonWrapper>
      <WaveformContainer>
        <WaveformWrapper ref={waveformRef} />
        <TimeDisplay>
          <CurrentTime>{currentTime}</CurrentTime>
          <TotalTime>{duration}</TotalTime>
        </TimeDisplay>
      </WaveformContainer>
    </VoicePlayerContainer>
  );
};

const MessageSourceIcon = styled.div`
  position: absolute;
  top: -10px;
  ${props => props.children.type.name === 'Volume2' ? 'right: -10px;' : 'right: -10px;'}
  background: ${props => props.children.type.name === 'Volume2' ? '#ff4b5c' : '#007bff'};
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
`;

const VoiceMessageContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  
  p {
    margin: 5px 0 0 0;
    font-style: italic;
    color: #666;
    font-size: 0.9em;
  }
`;

const VoicePlayerContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background-color: #006c4a;
  border-radius: 12px;
  padding: 10px;
  min-width: 250px;
`;

const PlayButtonWrapper = styled.button`
  background: ${props => props.$isPlaying ? 'linear-gradient(145deg, #ff4b5c, #dc3545)' : 'linear-gradient(145deg, #4CAF50, #2E7D32)'};
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  position: relative;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
  
  &:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.25);
  }
  
  &:active {
    transform: scale(0.95);
  }
`;

const PlayButtonIcon = styled.div`
  background-color: white;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.$isPlaying ? '#dc3545' : '#2E7D32'};
  transition: all 0.3s ease;
  
  svg {
    margin-left: ${props => props.$isPlaying ? '0' : '2px'};
  }
`;

const WaveformContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const WaveformWrapper = styled.div`
  width: 100%;
  height: 50px;
`;

const TimeDisplay = styled.div`
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-top: 4px;
  color: white;
  font-size: 0.75rem;
`;

const CurrentTime = styled.span``;

const TotalTime = styled.span``;

const Message = styled.div`
  padding: 0.8rem 1.2rem;
  border-radius: 1rem;
  max-width: 80%;
  animation: fadeIn 0.3s ease;
  position: relative;

  ${({ $type }) => {
    switch ($type) {
      case 'user':
        return `
          background: #007bff;
          color: white;
          align-self: flex-end;
          border-bottom-right-radius: 0.3rem;
        `;
      case 'ai':
        return `
          background: #f8f9fa;
          color: #343a40;
          align-self: flex-start;
          border-bottom-left-radius: 0.3rem;
        `;
      case 'error':
        return `
          background: #dc3545;
          color: white;
          align-self: center;
        `;
      default:
        return '';
    }
  }}

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const InputForm = styled.form`
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  background: #f8f9fa;
  border-top: 1px solid #e9ecef;
`;

const Input = styled.input`
  flex: 1;
  padding: 0.8rem 1rem;
  border: 1px solid #dee2e6;
  border-radius: 1.5rem;
  outline: none;
  font-size: 1rem;
  transition: border-color 0.2s;

  &:focus {
    border-color: #007bff;
  }
`;

const SendButton = styled.button`
  background: #007bff;
  color: white;
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #0056b3;
  }

  &:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }
`;

const VoiceButton = styled.button`
  background: ${props => props.$isRecording ? 'linear-gradient(145deg, #ff4b5c, #dc3545)' : 'linear-gradient(145deg, #7d8a97, #6c757d)'};
  color: white;
  border: none;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: ${props => props.$isRecording ? 
    '0 4px 15px rgba(220, 53, 69, 0.3)' : 
    '0 4px 15px rgba(108, 117, 125, 0.2)'};
  transform: translateY(0);

  svg {
    transition: transform 0.3s ease;
  }

  &:hover {
    background: ${props => props.$isRecording ? 
      'linear-gradient(145deg, #ff5c6c, #e84c55)' : 
      'linear-gradient(145deg, #8d9aa7, #7c858d)'};
    transform: translateY(-2px);
    box-shadow: ${props => props.$isRecording ? 
      '0 6px 20px rgba(220, 53, 69, 0.4)' : 
      '0 6px 20px rgba(108, 117, 125, 0.3)'};

    svg {
      transform: scale(1.1);
    }
  }

  &:active {
    transform: translateY(1px);
    box-shadow: ${props => props.$isRecording ? 
      '0 2px 10px rgba(220, 53, 69, 0.3)' : 
      '0 2px 10px rgba(108, 117, 125, 0.2)'};
  }

  animation: ${props => props.$isRecording ? 'pulse 2s infinite' : 'none'};

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 ${props => props.$isRecording ? 
        'rgba(220, 53, 69, 0.6)' : 
        'rgba(108, 117, 125, 0.6)'};
    }
    70% {
      box-shadow: 0 0 0 15px ${props => props.$isRecording ? 
        'rgba(220, 53, 69, 0)' : 
        'rgba(108, 117, 125, 0)'};
    }
    100% {
      box-shadow: 0 0 0 0 ${props => props.$isRecording ? 
        'rgba(220, 53, 69, 0)' : 
        'rgba(108, 117, 125, 0)'};
    }
  }
`;

const TypingIndicator = styled.div`
  display: flex;
  gap: 0.3rem;
  padding: 0.2rem;

  span {
    width: 8px;
    height: 8px;
    background: #6c757d;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out;

    &:nth-child(1) { animation-delay: -0.32s; }
    &:nth-child(2) { animation-delay: -0.16s; }
  }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }
`;

export default ChatInterface; 