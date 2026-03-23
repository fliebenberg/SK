---
name: Performance & Efficiency
description: Best practices for avoiding infinite loops, redundant fetches, and excessive store notifications.
---

# Performance & Efficiency Standards

In a complex real-time application with a "chatty" store-listener architecture, it is critical to minimize redundant work and prevent circular request loops.

## 1. Batching Store Notifications
When merging multiple items into a store (e.g., merging a list of facilities or events), always avoid triggering a notification for each individual item.

### The Correct Pattern:
Update `merge` methods to accept an optional `notify` parameter, and only call `notifyListeners()` once at the end of the batch operation.

```typescript
// Good
fetchItems(groupId: string) {
    socket.emit('get_data', { type: 'items', groupId }, (items: Item[]) => {
        if (items) {
            items.forEach(item => this.mergeItem(item, false));
            this.notifyListeners();
        }
    });
}
```

## 2. Component Fetch Deduplication ("The Fetch Guard")
Components that listen to the store and conditionally fetch missing data must deduplicate their requests to avoid a flood of socket emits during loading or during unrelated store updates.

### The Correct Pattern:
Use a `useRef` to track the last ID fetched. **Only set the ref when triggering a fetch.** This ensures that subsequent store updates (for the same ID) still flow into the component correctly.

```typescript
// Good
const lastFetchedId = useRef<string | null>(null);

useEffect(() => {
    const update = () => {
        const data = store.getData(id);
        
        // 1. Sync local state (Handles all future updates)
        if (data) {
            setLocalData(data);
        } 
        
        // 2. ONLY fetch if data is missing AND we haven't tried for this ID yet
        if (!data && id && lastFetchedId.current !== id) {
            store.fetchData(id);
            lastFetchedId.current = id;
        }
    };
    update();
    const unsub = store.subscribe(update);
    return unsub;
}, [id]);
```

## 3. Server-Side ID Validation
Always ensure server-side `get_data` handlers gracefully handle missing or undefined IDs to prevent database errors or broad unplanned queries.
```typescript
// Good
case 'facilities':
    callback(await dataManager.getFacilities(id || request.siteId));
    break;
```
