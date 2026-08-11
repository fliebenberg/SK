# Expo HAS CHANGED

This app runs **Expo SDK 55** (`expo@55.0.26`, `expo-router@55.0.16`, `react-native@0.83.6`,
`react@19.2.0`). Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/
before writing any code — the API moves between SDKs and older answers are usually wrong.

The declared range in `package.json` is the source of truth for which docs to read. If it no
longer says `~55.0.0`, update the version above and the docs link with it.

## Verify against the installed package, not just the docs

The docs describe the latest patch of an SDK; the tree may differ. When an API matters, check
what is actually exported:

```sh
grep -n "Redirect\|usePathname" node_modules/expo-router/build/exports.d.ts
```

Known gotcha: **`expo-router` 55 does not export a `Redirect` component.** Route guards use the
imperative API (`useRouter().replace(...)` from an effect) — see
[components/AuthGuard.tsx](components/AuthGuard.tsx).

## Checking your work

`npx tsc --noEmit -p tsconfig.json` from `expo-app/` typechecks the app. To confirm a file
actually compiles through Metro, ask the running dev server to bundle it (note `curl -g` for
paths containing `[orgId]`-style brackets):

```sh
curl -g -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:8081/components/AuthGuard.bundle?platform=web&dev=true"
```

Metro returns 500 with a JSON error body when a module fails to compile.
