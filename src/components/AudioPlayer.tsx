'use client';

import { useRef, useState, useEffect } from 'react';

interface AudioPlayerProps {
  url: string;
}

export default function AudioPlayer({ url }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => { setIsLoading(false); setDuration(audio.duration); };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => setIsPlaying(false);
    const onError = () => { setError(true); setIsLoading(false); };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const t = Number(e.target.value);
    audio.currentTime = t;
    setCurrentTime(t);
  }

  function formatTime(s: number): string {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  if (error) {
    return (
      <p className="text-sm text-zinc-400 italic">Recording unavailable.</p>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <audio ref={audioRef} src={url} preload="metadata" />

      <button
        onClick={togglePlay}
        disabled={isLoading}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white disabled:opacity-40 hover:bg-zinc-700 transition-colors"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isLoading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : isPlaying ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 translate-x-0.5">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-1">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="audio-range w-full"
          aria-label="Seek"
        />
        <div className="flex justify-between text-xs text-zinc-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
