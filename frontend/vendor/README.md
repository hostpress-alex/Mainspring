# vendor/

Third-party files that are **not** allowed into the repository.

## Font Awesome Pro

The Pro licence is per seat and forbids redistribution, so the files are
kept out of git. Anyone cloning this repository automatically gets the free
version instead — the app works either way, only the icon *styles* differ.

### Installing

1. Unzip `fontawesome-pro-7.x.x-web.zip`.
2. Copy the **contents** of the unzipped folder into
   `frontend/vendor/fontawesome-pro/`, so that these two paths exist:

   ```
   frontend/vendor/fontawesome-pro/css/all.min.css
   frontend/vendor/fontawesome-pro/webfonts/
   ```

   (`js/`, `less/`, `scss/`, `sprites/`, `svgs/` may stay, nothing uses them.)
3. Restart the dev server. `vite.config.js` checks for the file above at
   startup and switches the alias `app-icons` over to it.

Which one is active is printed by Vite on startup:
`[icons] Font Awesome Pro` or `[icons] Font Awesome Free`.

### Rule for writing code

Only use icons that also exist in the **free** set, otherwise a clone
without the Pro files shows an empty box. Pro is a style upgrade
(`fa-light`, `fa-thin`, `fa-duotone`, `fa-sharp-*`), not a licence to use
icons that are not there for everyone else. The style is set in one place:
`ICON_STYLE` in `src/cmps/icon.jsx`.
