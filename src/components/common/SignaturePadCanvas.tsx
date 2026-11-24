import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eraser, PenTool } from 'lucide-react';
import { PrimaryButton } from './UIPrimitives';

interface SignaturePadCanvasProps {
  existingDataUrl?: string | null;
  onSave: (dataUrl: string | null) => void;
  disabled?: boolean;
}

export const SignaturePadCanvas: React.FC<SignaturePadCanvasProps> = ({
  existingDataUrl = null,
  onSave,
  disabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const [hasStrokes, setHasStrokes] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(!existingDataUrl);

  useEffect(() => {
    if (!existingDataUrl) {
      setIsEditing(true);
    }
  }, [existingDataUrl]);

  useEffect(() => {
    if (!isEditing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle baseline guide
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 32);
    ctx.lineTo(canvas.width - 20, canvas.height - 32);
    ctx.stroke();

    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [isEditing]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    canvas.setPointerCapture(e.pointerId);
    const pt = getPoint(e);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    isDrawingRef.current = true;
    setHasStrokes(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pt = getPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was already released
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 32);
    ctx.lineTo(canvas.width - 20, canvas.height - 32);
    ctx.stroke();
    setHasStrokes(false);
  };

  const handleConfirmSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
    setIsEditing(false);
  };

  if (existingDataUrl && !isEditing) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#15803D]">
              <CheckCircle2 className="w-4 h-4" />
              Assinatura do cliente registada
            </span>
            {!disabled && (
              <button
                type="button"
                onClick={() => {
                  setHasStrokes(false);
                  setIsEditing(true);
                }}
                className="text-[13px] font-semibold text-[#0F172A] underline hover:text-[#059669] cursor-pointer"
              >
                Refazer assinatura
              </button>
            )}
          </div>
          <img
            src={existingDataUrl}
            alt="Assinatura digital do cliente"
            className="w-full max-h-36 object-contain bg-white rounded-lg border border-[#E2E8F0]"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="relative rounded-xl border-2 border-dashed border-[#CBD5E1] bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={640}
          height={210}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="w-full h-40 touch-none cursor-crosshair block"
        />
        {!hasStrokes && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-[#94A3B8]">
            <PenTool className="w-5 h-5 mb-1" />
            <span className="text-[13px] font-medium">
              Peça ao cliente para assinar com o dedo ou rato aqui
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <PrimaryButton
          type="button"
          variant="secondary"
          onClick={handleClear}
          disabled={!hasStrokes || disabled}
          icon={<Eraser className="w-4 h-4" />}
          className="flex-1"
        >
          Limpar
        </PrimaryButton>
        <PrimaryButton
          type="button"
          onClick={handleConfirmSave}
          disabled={!hasStrokes || disabled}
          icon={<CheckCircle2 className="w-4 h-4" />}
          className="flex-1"
        >
          Guardar Assinatura
        </PrimaryButton>
      </div>
    </div>
  );
};
