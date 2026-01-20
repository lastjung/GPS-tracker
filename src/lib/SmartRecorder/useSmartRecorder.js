import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useSmartRecorder - A standalone hook to orchestrate screen recording and app actions.
 * 
 * @param {Object} options
 * @param {Function} options.onAction - Callback triggered when recording officially starts (after countdown).
 * @param {boolean} options.stopCondition - Boolean condition that triggers automatic stop.
 * @param {number} options.autoStopDelay - Delay in ms after stopCondition is met (default 1500).
 * @param {string} options.filename - Name of the downloaded file.
 */
export const useSmartRecorder = ({
  onAction,
  stopCondition,
  autoStopDelay = 1500,
  filename = 'web-capture'
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false); // Bridaging gap between countdown & record
  const [countdown, setCountdown] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const pendingStreamRef = useRef(null);

  // Download logic
  const downloadVideo = useCallback(() => {
    if (recordedChunksRef.current.length > 0) {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }
    recordedChunksRef.current = [];
    pendingStreamRef.current = null;
  }, [filename]);

  // Main flow trigger: Request Tab -> Wait for User to be ready -> Start Countdown
  const startFlow = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        selfBrowserSurface: 'include',
        systemAudio: 'include'
      });

      pendingStreamRef.current = stream;
      recordedChunksRef.current = [];
      setIsPreparing(true);
      setCountdown(3);
    } catch (err) {
      console.error('SmartRecorder: Failed to start flow', err);
      setIsPreparing(false);
    }
  }, []);

  // Stop recording manually
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsPreparing(false);
  }, []);

  // Countdown Processor
  useEffect(() => {
    if (countdown === 0) {
      setCountdown(null);
      
      if (pendingStreamRef.current) {
        setIsRecording(true);
        const stream = pendingStreamRef.current;
        const recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 5000000
        });
        
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
        };
        
        recorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
          downloadVideo();
        };

        recorder.start(100); // Small slices for reliability
        
        // Trigger the actual app action simultaneously
        if (onAction) onAction();
        
        // Final safety delay for UI flickering
        setTimeout(() => setIsPreparing(false), 200);
      }
    } else if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, onAction, downloadVideo]);

  // Auto-stop monitor
  useEffect(() => {
    if (isRecording && stopCondition) {
      const timer = setTimeout(() => {
        stopRecording();
      }, autoStopDelay);
      return () => clearTimeout(timer);
    }
  }, [isRecording, stopCondition, stopRecording, autoStopDelay]);

  return {
    startFlow,
    stopRecording,
    isRecording,
    isPreparing,
    countdown
  };
};
