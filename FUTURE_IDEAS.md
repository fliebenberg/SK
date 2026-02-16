# Future Ideas

This document is a space to jot down brilliant ideas for the application while working on other tasks. You can refer to this list later to plan and prioritize new features.

## Ideas Bucket

- [ ] Add the ability to set up an ongoing "ladder" tournament where players can challenge each other to move up teh ladder. It could have rules like how many places above you you can challenge and how often a peson can be challenged (you dont want one player being challenged by several different players in a short period of time). It could facilitate the scheduling of matches etc.
- [ ] Add venue scheduling functionality to avoid multiple games being scheduled at the same venue at the same time. It could also allow for venues to be booked for private events etc.
- [ ] Add functionality to merge organizations and teams, to handle duplicates created as placeholders during event setup.
- [ ] Add the ability to create sub-rooms for specific regions (e.g., `games-za`, `games-usa`) to further optimize data usage.

- [ ] Build a user notification system for in-app notifications (e.g., claim invitations, report updates, org activity). This would replace the need for custom per-feature notification handling and provide a unified notification inbox.
- [ ] Set up a dedicated ScoreKeeper mail service for production email sending (transactional emails, notifications, password resets, etc.)
- [ ] Optimize organization caching and search:
    - Limit the number of organizations cached on the client (e.g., closest 1000).
    - Implement a hybrid search strategy where the autocomplete first searches the client cache.
    - Provide an option to "Expand search to all organizations" which triggers a full fuzzy search on the backend.
    - Ensure fuzzy search logic (like Levenshtein) is implemented on both frontend and backend for a consistent experience.


---
*Note: You can ask me to update this list, add details to ideas, or promote them to the main [TODO.md](file:///c:/Fred/Coding/SK/TODO.md) when you're ready to start working on them.*
