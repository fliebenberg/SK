import React from 'react';
import { View, Text, Modal } from 'react-native';
import { useActiveTheme } from '../store/settingsStore';
import { GlassCard } from './GlassCard';
import { Button } from './Button';
import { Ionicons } from '@expo/vector-icons';
import { themeColor } from '../constants/Colors';


interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary' | 'secondary';
  isProcessing?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  onConfirm,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isProcessing = false,
}) => {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';

  return (
    <Modal
      transparent
      visible={isOpen}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-overlay/75 items-center justify-center p-6">
        <GlassCard 
          className="w-full max-w-sm border border-line p-6 space-y-4 shadow-lg"
          style={{ backgroundColor: themeColor(isDark, 'popover') }}
        >
          <View className="items-center justify-center mb-2">
            <View className={`w-12 h-12 rounded-full items-center justify-center mb-3 ${variant === 'danger' ? 'bg-danger-soft' : 'bg-primary-soft'}`}>
              <Ionicons 
                name={variant === 'danger' ? "warning-outline" : "information-circle-outline"} 
                size={24} 
                color={themeColor(isDark, variant === 'danger' ? 'danger-ink' : 'primary-ink')} 
              />
            </View>
            <Text className="font-orbitron-bold text-base text-ink uppercase tracking-wider text-center">
              {title}
            </Text>
            <Text className="font-inter text-xs text-ink-muted text-center mt-2 leading-relaxed">
              {description}
            </Text>
          </View>

          <View className="flex-row gap-3 pt-2">
            <Button
              title={cancelText}
              variant="ghost"
              onPress={onClose}
              disabled={isProcessing}
              className="flex-1 min-h-[40px] py-2"
            />
            <Button
              title={confirmText}
              variant={variant === 'danger' ? 'danger' : 'primary'}
              onPress={onConfirm}
              isLoading={isProcessing}
              disabled={isProcessing}
              className="flex-1 min-h-[40px] py-2"
            />
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
};
