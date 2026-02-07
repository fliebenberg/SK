---
description: Standards for handling dates and times to ensure correct local timezone display and proper backend storage.
---

# Date and Time Handling Standards

To ensure a consistent user experience where times are input in local time, stored in UTC, and displayed back in local time:

## 1. Displaying Dates and Times
**NEVER** display raw ISO strings directly from the database (e.g., `2024-02-01T07:00:00.000Z`).
**NEVER** use string manipulation like `.split('T')[1]` to extract time, as this ignores timezone offsets and displays the raw UTC time.

**ALWAYS** use `date-fns` to parse and format the date object, which inherently respects the user's local system timezone.

### Correct Pattern:
```tsx
import { format } from "date-fns";

// ...
<span>{game.startTime ? format(new Date(game.startTime), "HH:mm") : "TBD"}</span>
```

### Incorrect Pattern:
```tsx
// DO NOT DO THIS
<span>{game.startTime ? game.startTime.split('T')[1].substring(0, 5) : "TBD"}</span>
```

## 2. Handling "TBD" or Empty Times
When a time is optional or "TBD":
**NEVER** send an empty string `""` to the backend for a Date/Timestamp field. This often causes `invalid input syntax` database errors.

**ALWAYS** send `undefined` (for new records) or `null` (for updates) to explicitly clear or omit the value.

### Correct Pattern:
```tsx
// Inside handleSubmit or similar
startTime: formData.isTbd ? undefined : constructIsoString(formData.startTime)
// OR for updates
startTime: formData.isTbd ? null as any : constructIsoString(formData.startTime)
```

## 3. Constructing ISO Strings for Saving
When constructing an ISO string from a date part and a time input usage:
Ensure the constructed string follows `YYYY-MM-DDTHH:mm:00` format. Browse/JS `Date` parsing usually treats this as local time (if no Z suffix), which is often what is intended before sending to a backend that might normalize it.
