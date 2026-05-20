import React from 'react';
import { Switch as TamaguiSwitch, SwitchProps as TamaguiSwitchProps } from 'tamagui';

export interface SwitchProps extends Omit<TamaguiSwitchProps, 'checked' | 'onCheckedChange'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const ThumbComponent = TamaguiSwitch.Thumb as any;

export const Switch = React.forwardRef<any, SwitchProps>(
  ({ checked, onCheckedChange, ...props }, ref) => {
    return (
      <TamaguiSwitch
        ref={ref}
        size="$3"
        checked={checked}
        onCheckedChange={onCheckedChange}
        backgroundColor={checked ? '$primary' : '$border'}
        {...props as any}
      >
        <ThumbComponent animation="quick" backgroundColor="$background" />
      </TamaguiSwitch>
    );
  }
);

Switch.displayName = 'Switch';
