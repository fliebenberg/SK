---
description: Ensure Next.js Client Components initialize state safely to avoid Hydration Mismatches.
---

# Hydration Safety
When creating or modifying Next.js Client Components (`"use client"`), you MUST avoid initializing `useState` with values that might differ between the Server (SSR) and the Client (Browser).

## Common Pitfalls
1.  **Direct Store Access**: `useState(store.getUsers())`
    - **Issue**: The store is likely empty on the server but populated on the client.
    - **Fix**: Initialize empty (`[]` or `null`) and populate in `useEffect`.

2.  **Date/Random Generation**: `useState(new Date())` or `useState(Math.random())`
    - **Issue**: Server time/randomness will not match Client time/randomness.
    - **Fix**: Initialize empty or deterministic value, then set in `useEffect`.

## Safe Pattern Example
```tsx
// ❌ WRONG
const [users, setUsers] = useState(store.getUsers());
const [date, setDate] = useState(new Date().toISOString());

// ✅ CORRECT
const [users, setUsers] = useState<User[]>([]);
const [date, setDate] = useState("");

useEffect(() => {
  setUsers(store.getUsers());
  setDate(new Date().toISOString());
}, []);
```
