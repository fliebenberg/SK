import React from 'react';
import { View, ViewProps } from 'react-native';
import { LAYOUT } from '../constants/layout';

/**
 * A page's content, held to the app's one width limit and centred (design_system.md, *Page width*).
 * `form` is for a page that is one column of fields or rows, which keeps a reading width instead.
 * Put it inside the page's scroll view, around everything the page shows.
 */
export function PageBody({ form, className, style, ...rest }: ViewProps & { form?: boolean; className?: string }) {
  return (
    <View
      className={`w-full self-center ${className ?? ''}`}
      style={[{ maxWidth: form ? LAYOUT.formMaxWidth : LAYOUT.pageMaxWidth }, style]}
      {...rest}
    />
  );
}
