/**
 * Phase 5: User Experience Enhancements - Notification System
 * Implements browser notifications, sound alerts, and in-app notifications
 * as specified in timeout.md Phase 5.3
 */

"use client";

import { useState, useEffect, useCallback } from 'react';
import type { CampaignGenerationJob, GenerationState } from '@/types/async-jobs';

interface NotificationSystemProps {
  generationState: GenerationState;
  job: CampaignGenerationJob | null;
  isPageVisible: boolean;
}

// Sound notification URLs - using data URIs for simple notification sounds
const NOTIFICATION_SOUNDS = {
  success: 'data:audio/wav;base64,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',
  error: 'data:audio/wav;base64,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'
};

// In-app notification types
export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface InAppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number; // Auto-dismiss after milliseconds (0 = persist)
  actions?: Array<{
    label: string;
    action: () => void;
    variant?: 'primary' | 'secondary';
  }>;
}

interface NotificationState {
  browserPermission: NotificationPermission;
  soundEnabled: boolean;
  inAppNotifications: InAppNotification[];
}

export function useNotificationSystem() {
  const [state, setState] = useState<NotificationState>({
    browserPermission: typeof window !== 'undefined' ? 
      (Notification?.permission || 'default') : 'default',
    soundEnabled: true,
    inAppNotifications: []
  });

  // Request browser notification permission
  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, browserPermission: permission }));
      return permission === 'granted';
    } catch (error) {
      console.error('[NOTIFICATIONS] Failed to request permission:', error);
      return false;
    }
  }, []);

  // Play notification sound
  const playNotificationSound = useCallback((type: 'success' | 'error' = 'success') => {
    if (!state.soundEnabled) return;

    try {
      const audio = new Audio(NOTIFICATION_SOUNDS[type]);
      audio.volume = 0.3; // Gentle volume
      audio.play().catch(err => {
        console.warn('[NOTIFICATIONS] Could not play sound:', err);
      });
    } catch (error) {
      console.warn('[NOTIFICATIONS] Sound playback failed:', error);
    }
  }, [state.soundEnabled]);

  // Show browser notification
  const showBrowserNotification = useCallback((
    title: string,
    message: string,
    options?: NotificationOptions
  ) => {
    if (state.browserPermission !== 'granted' || typeof window === 'undefined') {
      return null;
    }

    try {
      const notification = new Notification(title, {
        body: message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'campaign-generation',
        ...options
      });

      // Auto-close after 8 seconds
      setTimeout(() => {
        notification.close();
      }, 8000);

      return notification;
    } catch (error) {
      console.error('[NOTIFICATIONS] Browser notification failed:', error);
      return null;
    }
  }, [state.browserPermission]);

  // Add in-app notification
  const addInAppNotification = useCallback((notification: Omit<InAppNotification, 'id'>) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNotification: InAppNotification = {
      id,
      duration: 5000, // Default 5 seconds
      ...notification
    };

    setState(prev => ({
      ...prev,
      inAppNotifications: [...prev.inAppNotifications, newNotification]
    }));

    // Auto-remove notification if duration is set
    if (newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        removeInAppNotification(id);
      }, newNotification.duration);
    }

    return id;
  }, []);

  // Remove in-app notification
  const removeInAppNotification = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      inAppNotifications: prev.inAppNotifications.filter(n => n.id !== id)
    }));
  }, []);

  // Toggle sound notifications
  const toggleSound = useCallback(() => {
    setState(prev => ({ ...prev, soundEnabled: !prev.soundEnabled }));
  }, []);

  // Main notification function - handles all notification types
  const notify = useCallback((
    title: string,
    message: string,
    type: NotificationType = 'info',
    options?: {
      showBrowser?: boolean;
      playSound?: boolean;
      showInApp?: boolean;
      inAppDuration?: number;
      inAppActions?: InAppNotification['actions'];
    }
  ) => {
    const {
      showBrowser = true,
      playSound = true,
      showInApp = true,
      inAppDuration,
      inAppActions
    } = options || {};

    // Play sound notification
    if (playSound && (type === 'success' || type === 'error')) {
      playNotificationSound(type === 'success' ? 'success' : 'error');
    }

    // Show browser notification (only if page is not visible)
    if (showBrowser && !document.hasFocus()) {
      showBrowserNotification(title, message, {
        icon: type === 'success' ? '/success-icon.png' : 
              type === 'error' ? '/error-icon.png' : '/info-icon.png'
      });
    }

    // Show in-app notification
    if (showInApp) {
      addInAppNotification({
        type,
        title,
        message,
        duration: inAppDuration,
        actions: inAppActions
      });
    }
  }, [playNotificationSound, showBrowserNotification, addInAppNotification]);

  return {
    state,
    requestNotificationPermission,
    notify,
    addInAppNotification,
    removeInAppNotification,
    toggleSound,
    playNotificationSound
  };
}

// In-app notification display component
export function InAppNotificationContainer() {
  const { state, removeInAppNotification } = useNotificationSystem();

  if (state.inAppNotifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {state.inAppNotifications.map((notification) => (
        <InAppNotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={() => removeInAppNotification(notification.id)}
        />
      ))}
    </div>
  );
}

function InAppNotificationItem({ 
  notification, 
  onDismiss 
}: { 
  notification: InAppNotification; 
  onDismiss: () => void;
}) {
  const getNotificationStyles = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className={`
      border rounded-lg p-4 shadow-lg backdrop-blur-sm animate-in slide-in-from-right duration-300
      ${getNotificationStyles(notification.type)}
    `}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {getIcon(notification.type)}
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-sm">{notification.title}</h4>
          <p className="text-sm opacity-90 mt-1">{notification.message}</p>
          
          {notification.actions && notification.actions.length > 0 && (
            <div className="flex space-x-2 mt-3">
              {notification.actions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.action}
                  className={`
                    px-3 py-1 text-xs rounded-md font-medium transition-colors
                    ${action.variant === 'primary' 
                      ? 'bg-current text-white hover:opacity-80' 
                      : 'bg-white bg-opacity-20 hover:bg-opacity-30'
                    }
                  `}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Hook for campaign-specific notifications
export function useCampaignNotifications({ generationState, job, isPageVisible }: NotificationSystemProps) {
  const { notify, requestNotificationPermission } = useNotificationSystem();
  const [hasRequestedPermission, setHasRequestedPermission] = useState(false);
  const [previousState, setPreviousState] = useState<GenerationState>('idle');

  // Request notification permission when first job starts
  useEffect(() => {
    if (generationState === 'processing' && !hasRequestedPermission) {
      requestNotificationPermission();
      setHasRequestedPermission(true);
    }
  }, [generationState, hasRequestedPermission, requestNotificationPermission]);

  // Handle state change notifications
  useEffect(() => {
    if (previousState === generationState) return;

    switch (generationState) {
      case 'processing':
        if (previousState === 'submitting') {
          notify(
            'Campaign Generation Started',
            `Your campaign "${job?.campaign_name || 'campaign'}" is now being generated. This may take 2-3 minutes.`,
            'info',
            {
              showBrowser: !isPageVisible,
              playSound: false, // Don't play sound for start
              inAppDuration: 8000
            }
          );
        }
        break;

      case 'completed':
        notify(
          'Campaign Ready! 🎉',
          `Your campaign "${job?.campaign_name || 'campaign'}" has been generated successfully. Click to view results.`,
          'success',
          {
            showBrowser: !isPageVisible,
            playSound: true,
            inAppDuration: 0, // Persist until dismissed
            inAppActions: [
              {
                label: 'View Results',
                action: () => window.location.reload(),
                variant: 'primary'
              }
            ]
          }
        );
        break;

      case 'failed':
        notify(
          'Campaign Generation Failed',
          `There was an error generating your campaign. Please try again or contact support if the issue persists.`,
          'error',
          {
            showBrowser: !isPageVisible,
            playSound: true,
            inAppDuration: 0, // Persist until dismissed
            inAppActions: [
              {
                label: 'Retry',
                action: () => window.location.reload(),
                variant: 'primary'
              }
            ]
          }
        );
        break;
    }

    setPreviousState(generationState);
  }, [generationState, previousState, job, isPageVisible, notify]);

  return {
    notify,
    requestNotificationPermission
  };
}
