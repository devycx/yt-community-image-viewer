# YouTube Mobile Community Image Viewer

Opening an image in an `m.youtube.com` community post gives you one lonely picture: no zoom, no gallery, and saving the original can be hijacked by YouTube's SPA router to a `blob:` URL from which you cannot go back. This userscript turns it into a complete mobile gallery.

**English** | [简体中文](README.zh-CN.md)

- Install: [Greasy Fork](https://greasyfork.org/en/scripts/605153)
- Source: [GitHub](https://github.com/devycx/yt-community-image-viewer) · [direct .user.js](https://raw.githubusercontent.com/devycx/yt-community-image-viewer/main/yt-community-image-viewer.user.js)
- Works on: `*://m.youtube.com/*`
- Version: 4.4.2
- Chinese write-up: [Why it takes 1,000 lines, and the three-layer download fix](https://ycxdev.com/posts/m-youtube-community-image-gallery/)

## Screenshots

<p>
  <img src="https://raw.githubusercontent.com/devycx/yt-community-image-viewer/main/screenshots/youtube-community-posts-feed.jpg" width="330" alt="m.youtube.com community post feed with an image carousel labelled 1/2">
  <img src="https://raw.githubusercontent.com/devycx/yt-community-image-viewer/main/screenshots/youtube-community-image-gallery.jpg" width="330" alt="Full-screen gallery with a 5/15 cross-post counter, All posts / Gallery / Original controls, and a thumbnail strip">
</p>

Left: a community post in the `m.youtube.com` feed, images are a bare carousel. Right: after a tap, the script's full-screen gallery, with the `5 / 15` cross-post counter, the **All posts** / **Gallery** / **Original** controls, and the thumbnail strip. The labels are Chinese (`跨帖` / `画廊` / `原图`) because the phone locale is `zh-CN`; on an English device they read **All posts** / **Gallery** / **Original**.

## Gestures

| Gesture | Action |
| --- | --- |
| Single tap | If no second tap within 250ms, shrink back to the original thumbnail and close (FLIP animation) |
| Double tap | Toggle between 1x and 2.5x with easing |
| Pinch | 0.75x–5x zoom; below 1x springs back to 1x on release |
| One-finger drag while zoomed | Pan the image without changing pages |
| One-finger horizontal swipe | Change image; first/last image has resistance; a flick faster than 0.22 px/ms also changes images |
| One-finger vertical swipe | Image follows and shrinks, backdrop darkens; release past 55px closes |
| Long press 450ms | Haptic feedback and save the original image |
| Tap a thumbnail | Jump to that image; the thumbnail strip centers it |

## Core features

- **Cross-post infinite browsing**: by default, images from every community post on the page go into one gallery. Near the last image, the script scrolls the underlying page to `ytm-continuation-item-renderer` to trigger YouTube's own infinite loader; new post images are appended incrementally by a `MutationObserver` without rebuilding existing nodes.
- **Bottom thumbnail strip**: the current image is highlighted and auto-centered; the top-bar "Gallery" toggle hides the strip.
- **Original image download**: `ggpht` / `googleusercontent` URLs are rewritten to `=s0` for maximum resolution; long-press or tap "⬇ Original".
- **Persistent preferences**: the "All posts" and "Gallery" toggles are stored in `localStorage` under `yt_mobile_img_viewer_cfg_v4`.

## Download hijack fix (v4.3)

YouTube's global click router takes over `<a>` tags with a `download` attribute or a `blob:` URL, sends the current page to the blob URL, and back navigation cannot return to the post. The fix has three layers:

1. **Top-level capture at document-start**: the script registers a `click` capture listener before YouTube's router; when it sees a download link it calls `stopPropagation` + `stopImmediatePropagation` but **not** `preventDefault`, preserving the native download.
2. **Trigger inside a hidden iframe**: the download `<a>` lives in a dedicated iframe document, so the main document's router listeners never see the node.
3. **Wrap in octet-stream**: the fetched image blob is repackaged as `application/octet-stream`, so mobile browsers download it instead of previewing it in the current tab.

If cross-origin `fetch` fails, it falls back to `window.open` in a new tab and never hijacks the current page.

## Implementation notes

- **FLIP geometry**: on open, compute `dx / dy / scale` from the tapped thumbnail and the full-screen render size; place the large image at the thumbnail first, then animate it to the center. On close, if the thumbnail has scrolled out of view, scroll the underlying page back to the post first, then shrink.
- **Gesture state machine**: `pinch` / `pan` / `horizontal-gallery` / `vertical-dismiss`; the mode is chosen from the first movement direction and current zoom, so horizontal paging and vertical dismissal do not fight.
- **Composited layers**: the track and images stay on `translate3d`, `will-change`, and `backface-visibility: hidden`, so animation does not trigger layout.
- **Event isolation**: touch events on the top bar and thumbnail strip call `stopPropagation`, so they do not reach the gesture layer or the page below.
- **DOM dependencies**: only matches `ytm-backstage-post-renderer`, `ytm-backstage-image-renderer`, and `.post-image-container`; avatar and comment images are excluded with `closest()`.

## Known limits

- Only matches `m.youtube.com`; desktop `www.youtube.com` is not affected.
- Depends on YouTube's current mobile DOM and custom element names; a redesign may require selector updates.
- Cross-post browsing scrolls the underlying page to trigger loading; this is intentional. Turn off "All posts" to browse only the current post.
- In very long sessions the gallery only grows (it is cleared on close); browsing hundreds of images uses more memory.
- `@grant none`: downloads use page-level `fetch`. If YouTube changes the image domain's CORS policy, it falls back to a new tab.

## FAQ

**Does it work on desktop YouTube?**
No. It only matches `*://m.youtube.com/*`; `www.youtube.com` is untouched. A desktop user agent on `m.youtube.com` may also be redirected to the desktop site.

**How do I save the original image, not the feed thumbnail?**
Long-press for 450 ms, or tap **Original** in the top bar. `ggpht` / `googleusercontent` URLs are rewritten to `=s0` first, then fetched as a blob and handed to the browser as `application/octet-stream` so it downloads instead of opening.

**Why did a download open a new tab?**
The cross-origin `fetch` failed (CORS or network), so the script fell back to `window.open` with the original URL. The current page is never hijacked.

**Which script managers are supported?**
Tampermonkey, Violentmonkey, and the Safari / iOS userscript managers (`Userscripts`, `Orion`). `@grant none` is enough — no GM APIs required.

**Does it collect anything?**
No. There is no analytics and no remote code; the only network request is fetching the image you chose to download.

**Does it work inside the YouTube app?**
No. Userscripts only run in a browser, so open `m.youtube.com` in Chrome/Safari/Firefox on the phone.

## License

MIT, see [LICENSE](LICENSE).
