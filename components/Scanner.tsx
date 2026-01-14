
import React, { useEffect, useRef, useState } from 'react';

interface ScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
}

const Scanner: React.FC<ScannerProps> = ({ onDetected, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setError('Tidak dapat mengakses kamera. Pastikan izin diberikan.');
        console.error(err);
      }
    };

    startCamera();

    // In a real production app, we would use a library like quagga2 or html5-qrcode.
    // For this prototype, we simulate a scan or use a text input fallback for manual "mock" scanning.
    
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleMockScan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const code = formData.get('code') as string;
    if (code) onDetected(code);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-lg">Scan Barcode (1D)</h3>
          <button onClick={onClose} className="text-gray-500 p-2"><i className="fas fa-times"></i></button>
        </div>
        
        <div className="relative aspect-video bg-gray-200">
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center text-center p-6 text-red-500">
              {error}
            </div>
          ) : (
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 border-2 border-dashed border-red-500 opacity-50 m-12 pointer-events-none"></div>
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-500 mb-4 text-center">
            Arahkan barcode ke kotak merah atau ketik manual jika scanner bermasalah.
          </p>
          <form onSubmit={handleMockScan} className="flex gap-2">
            <input 
              name="code"
              type="text" 
              autoFocus
              placeholder="Masukkan SKU/Barcode..." 
              className="flex-1 border rounded-lg px-4 py-3 focus:ring-2 focus:ring-black outline-none"
            />
            <button type="submit" className="bg-black text-white px-6 py-3 rounded-lg font-bold">
              Cari
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Scanner;
