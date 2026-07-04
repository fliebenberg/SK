import React from 'react';
import { View, Text, Modal } from 'react-native';
import { useActiveTheme } from '../store/settingsStore';
import { GlassCard } from './GlassCard';
import { Button } from './Button';
import { Ionicons } from '@expo/vector-icons';

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
      <View className="flex-1 bg-slate-950/75 items-center justify-center p-6">
        <GlassCard 
          className="w-full max-w-sm border border-slate-200 dark:border-white/10 p-6 space-y-4 shadow-2xl"
          style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
        >
          <View className="items-center justify-center mb-2">
            <View className={`w-12 h-12 rounded-full items-center justify-center mb-3 ${variant === 'danger' ? 'bg-red-500/10' : 'bg-brand-orange/10'}`}>
              <Ionicons 
                name={variant === 'danger' ? "warning-outline" : "information-circle-outline"} 
                size={24} 
                color={variant === 'danger' ? "#EF4444" : "#FF3E00"} 
              />
            </View>
            <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider text-center">
              {title}
            </Text>
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 text-center mt-2 leading-relaxed">
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
