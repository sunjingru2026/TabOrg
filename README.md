# TabOrg

TabOrg is a Chrome new-tab workspace. The extension is intentionally thin: it replaces the new tab page and uses Chrome's tab APIs to feed a full-page organizer UI.

## MVP

- Search every open tab by title, URL, or domain.
- Group open tabs by domain.
- Detect duplicate URLs.
- Focus or close a tab from the new-tab page.
- Save the current window as a named session.
- Reopen or delete saved sessions.

## Run Locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this folder: `/Users/bytedance/Documents/TabOrg`.
5. Open a new tab.

## Shape of the Product

The current implementation bundles the page inside the extension for the first MVP. The same UI can later become a standalone web app, with the extension acting as a bridge that sends tab/window/session data to it.
