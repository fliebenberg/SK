# Real-Time State Synchronization Rules

## Client-Side Real-Time Updates
- **Avoid Unnecessary Server Fetches**: Once a client component or page has subscribed to a real-time room/channel (e.g., via WebSockets/Socket.io), any data updates broadcasted by the server must be handled by **directly merging or setting the event payload data** into the local state.
- **Do Not Refetch**: Do not perform a backend query/refetch upon receiving a change notification, unless a specific reconnection event or connection recovery occurs. This keeps network traffic minimal and utilizes the real-time push mechanism as intended.

# UI Notification & Dialog Rules

## Custom Modals and UI Alerts
- **Always Prefer Custom Overlay Modals**: Never use platform-native alert components like React Native's `Alert.alert` or default browser popups (`alert`, `confirm`) for confirmation prompts or actions. Always design and render custom, premium overlay modals (using `Modal` or inline styled layouts) for a consistent user experience.
- **Web Runtime Cross-Compatibility**: Because system default popups and native alert shims can fail silently or get blocked on web browsers, custom overlay modals must be used to ensure interactive delete/save workflows are fully functional across both mobile and web runtimes.
