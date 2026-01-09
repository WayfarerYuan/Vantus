import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Play, Pause, Loader2, Disc, Mic } from 'lucide-react';

interface AudioPlayerProps {
  base64Audio: string | null;
  isLoading: boolean;
  onGenerate: () => void;
  script: string[];
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ base64Audio, isLoading, onGenerate, script }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  // activeParagraphIndex logic
  const activeParagraphIndex = useMemo(() => {
    if (!duration || duration === 0) return 0;
    const progress = currentTime / duration;
    
    // Calculate total chars
    const totalChars = script.reduce((acc, p) => acc + p.length, 0);
    
    let charCountSoFar = 0;
    for (let i = 0; i < script.length; i++) {
      const pLen = script[i].length;
      const pEndRatio = (charCountSoFar + pLen) / totalChars;
      if (progress <= pEndRatio) {
        return i;
      }
      charCountSoFar += pLen;
    }
    return script.length - 1;
  }, [currentTime, duration, script]);


  // Initialize Audio Logic
  useEffect(() => {
    if (base64Audio) {
      const initAudio = async () => {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
          audioContextRef.current = ctx;

          const binaryString = atob(base64Audio);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const dataInt16 = new Int16Array(bytes.buffer);
          const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
          const channelData = buffer.getChannelData(0);
          for (let i = 0; i < dataInt16.length; i++) {
            channelData[i] = dataInt16[i] / 32768.0;
          }
          setAudioBuffer(buffer);
          setDuration(buffer.duration);
        } catch (e) {
          console.error("Audio Decode Error", e);
        }
      };
      initAudio();
    }
    return () => {
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
    }
  }, [base64Audio]);

  // Timer loop for progress
  useEffect(() => {
    let animationFrame: number;
    const updateProgress = () => {
      if (isPlaying && audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        const elapsed = now - startTimeRef.current; 
        
        if (elapsed <= duration) {
             setCurrentTime(Math.min(elapsed, duration));
             animationFrame = requestAnimationFrame(updateProgress);
        } else {
            setIsPlaying(false);
            setCurrentTime(duration);
        }
      }
    };

    if (isPlaying) {
      animationFrame = requestAnimationFrame(updateProgress);
    }

    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, duration]);


  const handlePlay = async () => {
    if (!audioBuffer || !audioContextRef.current) return;

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    // Resume from paused time
    const offset = currentTime >= duration ? 0 : currentTime;
    source.start(0, offset);
    
    startTimeRef.current = audioContextRef.current.currentTime - offset;

    audioSourceRef.current = source;
    setIsPlaying(true);
  };

  const handlePause = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    if (!base64Audio && !isLoading) {
      onGenerate();
      return;
    }
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-2xl border border-zinc-800 shadow-lg overflow-hidden">
        {/* Header / Controls */}
        <div className="p-6 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between relative z-10 shrink-0">
            <div className="flex items-center space-x-4">
                 <button
                    onClick={togglePlay}
                    disabled={isLoading}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                        isLoading ? 'bg-zinc-800 cursor-wait' : 
                        isPlaying ? 'bg-blue-600 text-white shadow-md hover:bg-blue-500' : 'bg-zinc-100 text-zinc-900 shadow-md hover:scale-105'
                    }`}
                >
                    {isLoading ? <Loader2 className="animate-spin text-zinc-400" size={20} /> : 
                     isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1"/>}
                </button>
                <div>
                    <h3 className="font-bold text-zinc-100 text-sm">AI Podcast</h3>
                    <p className="text-xs text-zinc-500">{base64Audio ? `${Math.floor(currentTime/60)}:${Math.floor(currentTime%60).toString().padStart(2,'0')} / ${Math.floor(duration/60)}:${Math.floor(duration%60).toString().padStart(2,'0')}` : "Click play to generate"}</p>
                </div>
            </div>
            
            {/* Fake Visualizer */}
            <div className="flex items-center space-x-1 h-8">
                {[...Array(5)].map((_, i) => (
                    <div 
                        key={i} 
                        className={`w-1 bg-blue-500 rounded-full transition-all duration-300 ${isPlaying ? 'animate-pulse' : 'h-2 opacity-20'}`}
                        style={{ height: isPlaying ? `${Math.random() * 20 + 10}px` : '4px', animationDelay: `${i * 100}ms` }}
                    ></div>
                ))}
            </div>
        </div>

        {/* Script Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4 bg-zinc-900 relative">
            <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-zinc-900 to-transparent z-10 pointer-events-none"></div>
            {script.map((line, idx) => (
                <div 
                    key={idx} 
                    className={`transition-all duration-500 px-4 py-3 rounded-xl border ${idx === activeParagraphIndex && isPlaying ? 'bg-zinc-800 border-zinc-700 scale-[1.02] shadow-sm' : 'border-transparent text-zinc-500'}`}
                >
                    <div className="flex items-start space-x-3">
                         <div className={`mt-0.5 shrink-0 ${idx % 2 === 0 ? 'text-blue-400' : 'text-emerald-400'}`}>
                            <span className="text-[10px] font-bold uppercase tracking-wider">{idx % 2 === 0 ? 'Alex' : 'Sam'}</span>
                         </div>
                         <p className={`text-sm leading-relaxed ${idx === activeParagraphIndex && isPlaying ? 'text-zinc-100 font-medium' : ''}`}>
                             {line}
                         </p>
                    </div>
                </div>
            ))}
            {script.length === 0 && (
                <div className="flex flex-col items-center justify-center h-40 text-zinc-600 space-y-2">
                    <Disc size={24} className="opacity-50"/>
                    <span className="text-xs">Script Ready for Audio Generation</span>
                </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-zinc-900 to-transparent z-10 pointer-events-none"></div>
        </div>
    </div>
  );
};