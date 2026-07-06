# Real-Time State Synchronization Rules

## Client-Side Real-Time Updates
- **Avoid Unnecessary Server Fetches**: Once a client component or page has subscribed to a real-time room/channel (e.g., via WebSockets/Socket.io), any data updates broadcasted by the server must be handled by **directly merging or setting the event payload data** into the local state.
- **Do Not Refetch**: Do not perform a backend query/refetch upon receiving a change notification, unless a specific reconnection event or connection recovery occurs. This keeps network traffic minimal and utilizes the real-time push mechanism as intended.

# UI Notification & Dialog Rules

## Custom Modals and UI Alerts
- **Always Prefer Custom Overlay Modals**: Never use platform-native alert components like React Native's `Alert.alert` or default browser popups (`alert`, `confirm`) for confirmation prompts or actions. Always design and render custom, premium overlay modals (using `Modal` or inline styled layouts) for a consistent user experience.
- **Web Runtime Cross-Compatibility**: Because system default popups and native alert shims can fail silently or get blocked on web browsers, custom overlay modals must be used to ensure interactive delete/save workflows are fully functional across both mobile and web runtimes.

# Card List UI/UX Layout Rules

## Consistent Card Layouts in Lists
- **Avoid Large Bottom Buttons**: Any card lists within the application (including organization administration panels, public views, and all future list implementations) must never use full-width action buttons at the bottom of the card.
- **Prefer Right-Aligned Compact Actions**: Actions must always be placed on the right side of the card to ensure consistency across the entire application. Use:
  - For admin cards: Small square icon buttons (e.g. `w-7 h-7` pencil/edit and trash buttons) in a horizontal row next to the metadata.
  - For public cards: A compact secondary button (e.g. `Roster` or `View` with `px-4 py-1.5` padding and shadow-sm) aligned on the right.
- **Universal Application**: This design pattern applies universally to all existing lists (e.g., teams, sites, facilities, leagues, seasons, divisions) as well as any new lists created in the future.

# Centralized Styling & Color Rules

## Theme and Color Policy
- **No Hardcoded Hex Colors**: Hardcoded color strings (e.g., `#FF3E00`, `#94A3B8`, `#475569`) must never be used inline or in custom style configurations. All colors must be centralized.
- **Centralizing Inline Style Colors**: For inline styling objects (e.g., where React Native's `style` prop is necessary), import and use the central constants from [Colors.ts](file:///c:/Fred/Coding/SK/expo-app/constants/Colors.ts) via the `COLORS` object or the `getThemeColor` utility function.
- **Centralizing Utility Class Colors (Tailwind)**: For utility-class based styles (Tailwind/NativeWind `className` strings), always extend the theme variables inside [tailwind.config.js](file:///c:/Fred/Coding/SK/expo-app/tailwind.config.js) under the `extend.colors` block. Use these semantic variables (e.g., `text-brand-orange`, `text-textSecondary`, `bg-surface`) instead of arbitrary colors.
- **Theme-Awareness**: Ensure all labels and texts adapt correctly to light/dark themes by referencing the centralized light/dark palettes rather than styling for a single mode.

