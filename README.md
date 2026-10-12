# Simpan

**Simpan** (Indonesian for *"save" / "keep"*) is a personal study vault. Save the learning materials you come across — articles, videos, practice sets, notes — organize them by category and tags, track what you're still learning, and find anything again in seconds.

It runs entirely in your browser. No account, no server: your vault lives in `localStorage`.

## Features

- **Materials** with a title, description, category, tags, optional resource link, status, and date added. Each one gets a catalog number (`No. 001`, `No. 002`, …).
- **Overview dashboard**: a time-based greeting, stats (total, learning, completed, categories in use), overall completion, *Continue learning*, *Recently added*, and category shelves with counts and progress.
- **Library**: every material as a card, with status filters (All / Learning / Done), a category filter, and sorting (recently added, oldest, alphabetical).
- **Instant search** across titles, descriptions, categories, and tags. Multiple words narrow the results; `#tag` works too.
- **Add, edit, and delete**, plus marking materials *Done* or back to *Learning* from cards or the detail view.
- **Validation**: a title is required. The URL is optional, but if you add one it must be a valid `http(s)` address (if you leave out the scheme, `https://` is added for you). Exact duplicates are caught.
- **Feedback & safety**: toast confirmations, a confirmation step before deleting, and protection against submitting twice.
- **Persistence**: saved to `localStorage`, so it survives refreshes and browser restarts, and stays in sync across tabs.
- **Useful empty states**, including an option to load sample materials so you can try things out.
- **Keyboard friendly**: `/` or `Ctrl/⌘ + K` focuses search, `Esc` clears search or closes a dialog, `Ctrl/⌘ + Enter` saves the form, and focus goes back to a sensible place after every action.
- **Accessible**: semantic landmarks, native `<dialog>` modals, labelled controls, visible focus states, and colour contrast that meets WCAG AA.
- **Responsive**: a sidebar on desktop, and on mobile a tab strip, full-width search, touch-sized controls, and dialogs that open as bottom sheets.

## Tech Stack

- HTML
- CSS
- JavaScript (vanilla, no frameworks or build step)
- localStorage

## Project Structure

```
/
├── index.html   # App shell, views, dialogs
├── style.css    # Visual design and responsive layout
├── script.js    # State, storage, rendering, interactions
└── README.md
```

## Running Locally

You don't need to install anything.

**Option 1: open the file**

Double-click `index.html` to open it in a modern browser (Chrome, Edge, Firefox, Safari).

**Option 2: use a local server (recommended)**

Some browsers handle `localStorage` for `file://` pages differently, so a local server is more reliable:

```bash
# Python 3
python -m http.server 8000

# or Node.js
npx serve .
```

Then go to <http://localhost:8000>.

> Your data is tied to the browser and address you use. Clearing site data removes your vault.

## Future Improvements

- **Cloud sync** so your vault is available on every device
- **Authentication** for private, per-user vaults
- **File uploads** for PDFs, slides, and images
- **Markdown notes** attached to each material
- **AI-generated summaries** of linked articles and videos
- **Spaced repetition** reminders for review
- **Study analytics**, like learning streaks and time per category
- JSON export/import for backups
- Custom categories and a dark theme
