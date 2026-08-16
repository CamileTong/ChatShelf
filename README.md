# ChatShelf

A private, mobile-first journal that feels like instant messaging. ChatShelf is an offline-capable PWA: all chats, avatars, preferences, and messages stay in the browser's IndexedDB.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
```

## Message shortcuts

- In a chat, start a message with `/c` to display it from that chat's other-side profile.
- In Console, use one or more channel aliases: `/fitness /reading Message`.
- Console also accepts `/c`: `/fitness /reading /c Weekly summary`.

Console has no history. It writes independent messages to the selected chats under one dispatch group.

## Backups and privacy

Settings can export all chats, one chat, or one chat within an inclusive month range. The versioned JSON contains profile avatars and can be merged or restored over current data.

Browser storage can still be erased by clearing site data. Request persistent storage in Settings and export JSON backups regularly. The app has no account, analytics, cloud storage, or sync.

## Deploy

Deploy the `dist` output from `npm run build` to any HTTPS static host. Configure unknown routes to serve `index.html` so direct links such as `/settings` work. Once opened over HTTPS, the browser can install ChatShelf to the home screen and cache the application shell for offline use.
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
