import React from 'react';
import { Label as TamaguiLabel, LabelProps as TamaguiLabelProps } from 'tamagui';

export interface LabelProps extends TamaguiLabelProps {}

export const Label = React.forwardRef<any, LabelProps>(
  (props, ref) => {
    return (
      <TamaguiLabel
        ref={ref}
        fontFamily="$body"
        fontSize={14}
        fontWeight="500"
        color="$color"
        {...props as any}
      />
    );
  }
);

Label.displayName = 'Label';
