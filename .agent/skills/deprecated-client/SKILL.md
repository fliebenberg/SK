---
name: Deprecated Client Reference
description: Enforces that the client folder is deprecated, read-only, and only for reference. AI agents must not make changes to it.
---

# Deprecated Client Reference

The `client/` directory contains an older, web-only version of the application. 
This folder is now **deprecated** and is kept strictly for **reference purposes**.

It is being replaced by the multi-platform Expo application located in the `expo-app/` directory.

### Instructions for AI Agents:
1. **DO NOT MODIFY** any files in the `client/` directory. No edits, additions, or deletions are allowed there.
2. **DO NOT DEVELOP** any new features, styling, or bug fixes in the `client/` directory.
3. All new client-side features, styling, logic, and multi-platform views must be implemented within `expo-app/`.
4. You may read files in `client/` strictly to reference old implementations, API structures, styling choices, or business logic.
