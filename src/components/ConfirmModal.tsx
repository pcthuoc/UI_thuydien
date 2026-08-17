import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent } from './Card';
import { Button } from './Button';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  cancelVariant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  cardClassName?: string;
  // Tailwind z-index utility applied to the fixed overlay. Defaults to
  // ``z-50``. Use a higher value (e.g. ``z-[110]``) when this confirm
  // dialog is rendered from inside another modal that uses ``z-[100]`` —
  // without it the confirm dialog sits behind its parent (#1336 follow-up).
  overlayZIndex?: string;
  variant?: 'danger' | 'warning' | 'default';
  isLoading?: boolean;
  loadingText?: string;
  // Disable the confirm button without a loading spinner. Used when an
  // external precondition forbids the action (e.g. #1734 — a related queue
  // item is mid-print, so the archive delete must be blocked at the UI
  // layer too even though the backend will 409 anyway).
  confirmDisabled?: boolean;
  // Optional extra content rendered between the message and the buttons —
  // used for opt-in checkboxes (e.g. the "Also remove from statistics"
  // toggle in the archive delete confirmation, #1343).
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmText,
  cancelText,
  cancelVariant,
  cardClassName,
  overlayZIndex,
  variant = 'default',
  isLoading = false,
  loadingText,
  confirmDisabled = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const resolvedConfirmText = confirmText ?? t('common.confirm');
  const resolvedCancelText = cancelText ?? t('common.cancel');
  const resolvedLoadingText = loadingText ?? t('common.loading');
  // Close on Escape key (but not while loading)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isLoading]);

  const variantStyles = {
    danger: {
      icon: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/50',
      button: 'bg-red-600 hover:bg-red-700 text-white',
    },
    warning: {
      icon: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-950/50',
      button: 'bg-yellow-500 hover:bg-yellow-600 text-gray-900',
    },
    default: {
      icon: 'text-bambu-green bg-green-100 dark:bg-green-950/50',
      button: 'bg-bambu-green hover:bg-bambu-green-dark text-white',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      className={`fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 ${overlayZIndex ?? 'z-50'}`}
      onClick={isLoading ? undefined : onCancel}
    >
      <Card
        className={`w-full max-w-md ${cardClassName ?? ''}`}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-2.5 rounded-full shrink-0 ${styles.icon}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
              <p className="text-gray-600 dark:text-bambu-gray text-sm whitespace-pre-line leading-relaxed">{message}</p>
              {children && <div className="mt-4">{children}</div>}
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button
              variant={cancelVariant ?? 'secondary'}
              onClick={onCancel}
              className="flex-1"
              disabled={isLoading}
            >
              {resolvedCancelText}
            </Button>
            <Button
              onClick={onConfirm}
              className={`flex-1 ${styles.button}`}
              disabled={isLoading || confirmDisabled}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {resolvedLoadingText}
                </>
              ) : (
                resolvedConfirmText
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
