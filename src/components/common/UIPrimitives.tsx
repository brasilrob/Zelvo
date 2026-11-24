import React from 'react';
import {
  CheckCircle2,
  CloudOff,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { ToastMessage } from '../../store/ZelvoContext';

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  variant = 'primary',
  fullWidth = false,
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}) => {
  const base =
    'inline-flex items-center justify-center gap-2 min-h-12 px-4 py-2.5 rounded-[10px] text-[16px] font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]';

  const styles: Record<NonNullable<PrimaryButtonProps['variant']>, string> = {
    primary:
      'bg-[#10B981] text-white hover:bg-[#059669] active:bg-[#059669] focus-visible:ring-[#10B981]',
    secondary:
      'bg-white text-[#0F172A] border border-[#CBD5E1] hover:bg-slate-50 active:bg-slate-100 focus-visible:ring-slate-400',
    danger:
      'bg-[#DC2626] text-white hover:bg-[#B91C1C] active:bg-[#B91C1C] focus-visible:ring-[#DC2626]',
    ghost:
      'bg-transparent text-[#475569] hover:bg-slate-100 hover:text-[#0F172A] focus-visible:ring-slate-400',
  };

  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${styles[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin shrink-0" /> : icon}
      <span>{children}</span>
    </button>
  );
};

export type SemanticTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'teal';

interface StatusBadgeProps {
  tone: SemanticTone;
  label: string;
  icon?: React.ReactNode;
}

const BADGE_CLASSES: Record<SemanticTone, string> = {
  success: 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]',
  warning: 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]',
  danger: 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]',
  info: 'bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]',
  teal: 'bg-[#CCFBF1] text-[#0F766E] border-[#99F6E4]',
  neutral: 'bg-slate-100 text-[#475569] border-slate-200',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ tone, label, icon }) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[13px] font-medium leading-[18px] whitespace-nowrap shrink-0 ${BADGE_CLASSES[tone]}`}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
};

interface SyncStatusBannerProps {
  isOffline: boolean;
  isSyncing: boolean;
  syncJustCompleted: boolean;
  pendingCount: number;
  onSyncNow: () => void;
}

export const SyncStatusBanner: React.FC<SyncStatusBannerProps> = ({
  isOffline,
  isSyncing,
  syncJustCompleted,
  pendingCount,
  onSyncNow,
}) => {
  if (!isOffline && !isSyncing && !syncJustCompleted && pendingCount === 0) {
    return null;
  }

  if (isSyncing) {
    return (
      <div className="bg-[#E0F2FE] text-[#0369A1] border-b border-[#BAE6FD] px-4 py-2 text-[14px] font-medium flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
        <span>A sincronizar alterações locais com o servidor…</span>
      </div>
    );
  }

  if (syncJustCompleted) {
    return (
      <div className="bg-[#DCFCE7] text-[#15803D] border-b border-[#BBF7D0] px-4 py-2 text-[14px] font-medium flex items-center justify-center gap-2">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>Tudo sincronizado</span>
      </div>
    );
  }

  return (
    <div className="bg-[#FEF3C7] text-[#92400E] border-b border-[#FDE68A] px-4 py-1.5 text-[13px] font-medium no-print">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CloudOff className="w-4 h-4 shrink-0 text-[#B45309]" />
          <span className="truncate">
            Modo Offline •{' '}
            <strong className="tabular-nums">
              {pendingCount}{' '}
              {pendingCount === 1 ? 'alteração guardada' : 'alterações guardadas'}
            </strong>{' '}
            localmente
          </span>
        </div>
        <button
          type="button"
          onClick={onSyncNow}
          className="inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-lg bg-[#92400E]/10 hover:bg-[#92400E]/20 text-[#92400E] border border-[#92400E]/20 text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Sincronizar</span>
        </button>
      </div>
    </div>
  );
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}) => {
  if (!open) return null;

  const maxWidth =
    size === 'xl' ? 'max-w-3xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`w-full ${maxWidth} bg-white rounded-t-2xl sm:rounded-2xl border border-[#E2E8F0] shadow-2xl max-h-[92vh] flex flex-col overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#E2E8F0] shrink-0">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold text-[#0F172A] leading-tight">{title}</h2>
            {subtitle && (
              <p className="text-[14px] text-[#475569] mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-1 flex items-center justify-center rounded-lg text-[#475569] hover:bg-slate-100 hover:text-[#0F172A] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">{children}</div>

        {footer && (
          <div className="px-5 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-xl bg-white rounded-t-3xl border-t border-x border-[#E2E8F0] shadow-2xl max-h-[90vh] flex flex-col overflow-hidden pb-safe">
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-1 border-b border-[#E2E8F0]">
          <div>
            <h2 className="text-[18px] font-bold text-[#0F172A]">{title}</h2>
            {subtitle && (
              <p className="text-[14px] text-[#475569] mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-lg text-[#475569] hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">{children}</div>
      </div>
    </div>
  );
};

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => (
  <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center flex flex-col items-center">
    <div className="w-12 h-12 rounded-xl bg-slate-100 text-[#475569] flex items-center justify-center mb-3">
      {icon}
    </div>
    <h3 className="text-[18px] font-semibold text-[#0F172A]">{title}</h3>
    <p className="text-[15px] text-[#475569] mt-1 max-w-sm">{description}</p>
    {actionLabel && onAction && (
      <div className="mt-5">
        <PrimaryButton onClick={onAction}>{actionLabel}</PrimaryButton>
      </div>
    )}
  </div>
);

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  const toneBg: Record<ToastMessage['tone'], string> = {
    success: 'bg-[#0F172A] text-white border-[#10B981]',
    info: 'bg-[#0F172A] text-white border-[#0369A1]',
    warning: 'bg-[#78350F] text-white border-[#F59E0B]',
    danger: 'bg-[#991B1B] text-white border-[#F87171]',
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 flex flex-col items-center gap-2 pointer-events-none no-print">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto w-full max-w-md rounded-xl border-l-4 px-4 py-3 shadow-lg flex items-center justify-between gap-3 ${toneBg[toast.tone]}`}
        >
          <span className="text-[14px] font-medium leading-snug">{toast.message}</span>
          <div className="flex items-center gap-2 shrink-0">
            {toast.undoLabel && toast.onUndo && (
              <button
                type="button"
                onClick={() => {
                  toast.onUndo?.();
                  onDismiss(toast.id);
                }}
                className="px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 text-white text-[13px] font-semibold cursor-pointer"
              >
                {toast.undoLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Fechar notificação"
              className="p-1 rounded hover:bg-white/15 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

interface PhotoLightboxProps {
  src: string | null;
  caption?: string;
  onClose: () => void;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({ src, caption, onClose }) => {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950/90 flex flex-col items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar pré-visualização"
        className="absolute top-4 right-4 min-h-12 min-w-12 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 cursor-pointer"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={src}
        alt={caption || 'Fotografia ampliada'}
        referrerPolicy="no-referrer"
        className="max-w-full max-h-[82vh] rounded-xl object-contain border border-white/20"
        onClick={(e) => e.stopPropagation()}
      />
      {caption && <p className="text-white text-[15px] mt-3 font-medium">{caption}</p>}
    </div>
  );
};
