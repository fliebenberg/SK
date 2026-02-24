---
name: Client-Side Rendering Strategy
description: Enforces purely client-side rendering for all dynamic components and bypasses Next.js server actions.
---

# Client-Side Rendering (CSR) Strategy

In this application, we favor a purely client-side rendering approach. Follow these rules for all future additions and modifications:

1. **Client Components by Default:** Always make components client-side rendered (using `"use client";` at the top of the file) unless they are truly static, non-interactive pages with no dynamic data dependencies.
2. **Bypass Next.js Server Actions:** Do not use Next.js Server Actions (e.g., functions defined in `actions.ts` with `"use server";`) for data fetching or mutations.
3. **Direct Store Usage:** Client components should directly interact with the centralized `store.ts` (which handles state and WebSocket communication with the backend).
   - E.g., Use `await store.updateOrganization(id, data)` directly in your `onClick` or `onSubmit` event handlers.
   - You do not need to use `revalidatePath` from `next/cache`. Instead, wait for the socket response or allow the store's reactive local state updates to trigger standard React component re-renders.
4. **Data Fetching:** Fetch initial data by retrieving from the store (e.g., `store.getOrganization()`) while making sure the store is connected and synced. React `useEffect` hooks paired with `store.subscribe` should be used to listen for real-time updates.
