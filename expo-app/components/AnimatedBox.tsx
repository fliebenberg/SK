import React from 'react';
import { Animated, View, StyleProp, ViewStyle } from 'react-native';

/**
 * The one way to render an animated box in this app. Use it instead of `Animated.View`.
 *
 * **Why this exists.** A `className` on an `Animated.View` does nothing — silently, on web and
 * native alike. NativeWind's interop swaps components by *type*
 * (`interopComponents.get(type) ?? type` in `react-native-css-interop/runtime/wrap-jsx.js`), and
 * no `Animated.*` component is in its map, so the classes are never compiled to styles;
 * `react-native-web` does not forward a raw `className` to the DOM either, because it overwrites
 * it with its own compiled class from `style`. Nothing warns. The failure looks like the
 * animation being broken — a panel that loses `position: absolute`, its background and its
 * padding does not read as "the classes were dropped" (`UI-7`, and see the toast it cost us).
 *
 * **The shape.** The animated node carries the animation and nothing else; a plain `<View>`
 * inside it carries the classes, where the interop can see them. Pass the animation as `style`,
 * the classes as `className`, and any static styles that belong with the classes rather than the
 * animation as `innerStyle`:
 *
 * ```tsx
 * <AnimatedBox
 *   style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
 *   className="rounded-lg p-3.5 flex-row items-center gap-3"
 *   innerStyle={{ backgroundColor: surface }}
 * >
 * ```
 *
 * With no `className` and no `innerStyle` this renders a bare `Animated.View`, so it is also
 * correct for the inline-styled case — the nav rail's hover fly-out positions children against
 * the animated node itself and must not gain a wrapper. That means "never write `Animated.View`
 * directly" holds with no exceptions to remember, and is greppable.
 *
 * **Do not** register `Animated.View` with `cssInterop` to avoid all this. On web that would work;
 * on native the interop's upgrade path replaces `props.style` with `useAnimatedStyle(...)` and
 * wraps the component in Reanimated's, and its `flattenAnimatedProps` only unwraps Reanimated
 * shared values — an RN `Animated.Value` is not one. `UI-7` records the full reasoning.
 *
 * @see okf/design_system.md — "No `className` on `Animated` components"
 * @see okf/architecture.md rule 2 — animate with RN `Animated`, not Reanimated
 */

type AnimatedViewProps = React.ComponentProps<typeof Animated.View>;

export interface AnimatedBoxProps extends Omit<AnimatedViewProps, 'style' | 'children'> {
  /**
   * The animated style. Interpolations and `Animated.Value`s go here, and only here — this is the
   * prop that reaches the animated node untouched.
   *
   * Keep to `opacity` and `transform` where you can; anything driving layout (width, height,
   * margins) forces `useNativeDriver: false` on the driving timing.
   */
  style?: AnimatedViewProps['style'];
  /** Tailwind classes. Applied to a plain `<View>` inside, never to the animated node. */
  className?: string;
  /** Static styles belonging with the classes — colours, borders — rather than the animation. */
  innerStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function AnimatedBox({ className, innerStyle, style, children, ...rest }: AnimatedBoxProps) {
  // No classes to place, so no wrapper: the caller's children stay direct children of the
  // animated node, which absolute positioning and `overflow: hidden` both depend on.
  if (!className && !innerStyle) {
    return (
      <Animated.View style={style} {...rest}>
        {children}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={style} {...rest}>
      <View className={className} style={innerStyle}>
        {children}
      </View>
    </Animated.View>
  );
}
