import { forwardRef, useState } from 'react';
import { TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = Omit<TextInputProps, 'secureTextEntry'> & {
  /** 'current' for sign-in, 'new' when the user is choosing a password — drives password-manager autofill. */
  purpose?: 'current' | 'new';
};

/**
 * Password field with a show/hide toggle. Masked by default; the toggle never clears or
 * submits the value, and it is labelled for screen readers.
 */
export const PasswordInput = forwardRef<TextInput, Props>(
  ({ purpose = 'current', className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <View className="relative justify-center">
        <TextInput
          ref={ref}
          {...props}
          className={`${className ?? ''} pr-12`}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={purpose === 'new' ? 'new-password' : 'current-password'}
          textContentType={purpose === 'new' ? 'newPassword' : 'password'}
        />
        <TouchableOpacity
          onPress={() => setVisible(v => !v)}
          className="absolute right-0 h-full px-4 justify-center"
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={8}
        >
          <Ionicons name={visible ? 'eye-off' : 'eye'} size={20} color="#64748B" />
        </TouchableOpacity>
      </View>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
