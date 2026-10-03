import React from 'react';
import { View, ViewProps } from 'react-native';

/**
 * A card: the `card` surface with a `line` border, unless `className` names its own background or
 * border colour (a `bg-danger-soft` error panel). Classes only — an inline colour here used to
 * override every caller's tint (`UI-24`).
 */
export const GlassCard: React.FC<ViewProps> = ({ children, className = '', ...props }) => {
  const hasCustomPadding = /\bp[xyabtlr]?-\d+/.test(className);
  const hasBg = /(^|\s)bg-/.test(className);
  const hasBorderColour = /(^|\s)border-(?![trblxy](\s|$|-\d)|\d)[a-z]/.test(className);

  return (
    <View
      className={`${hasBg ? '' : 'bg-card'} rounded-xl ${hasCustomPadding ? '' : 'p-4'} overflow-hidden border ${hasBorderColour ? '' : 'border-line'} ${className}`}
      {...props}
    >
      {children}
    </View>
  );
};
