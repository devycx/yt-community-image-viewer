// ==UserScript==
// @name         YouTube Mobile Community Image Viewer - Fullscreen Gallery
// @name:en      YouTube Mobile Community Image Viewer - Fullscreen Gallery
// @name:zh-CN   YouTube 移动版社区图片全屏查看器
// @namespace    https://github.com/devycx/yt-community-image-viewer
// @version      4.4.1
// @description  Turn images in m.youtube.com community posts into a full-screen mobile gallery: browse across posts, pinch to zoom, use the thumbnail strip, long-press to download the original image, and avoid YouTube SPA hijacking download taps.
// @description:en  Turn images in m.youtube.com community posts into a full-screen mobile gallery: browse across posts, pinch to zoom, use the thumbnail strip, long-press to download the original image, and avoid YouTube SPA hijacking download taps.
// @description:zh-CN  把 m.youtube.com 社区帖图片变成全屏画廊：跨帖无限连播、底部缩略图轨、双指缩放、长按下载原图，并修掉点下载被 SPA 路由劫持跳走的问题
// @author       ycx
// @license      MIT
// @homepageURL  https://github.com/devycx/yt-community-image-viewer
// @supportURL   https://github.com/devycx/yt-community-image-viewer/issues
// @match        *://m.youtube.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const MESSAGES = {
        en: {
            crossPost: 'All posts',
            gallery: 'Gallery',
            original: '⬇ Original',
            saving: 'Saving original image…',
            downloadStarted: 'Original image download started',
            crossOn: 'Cross-post browsing on',
            crossOff: 'Cross-post browsing off',
            galleryOn: 'Thumbnail gallery on',
            galleryOff: 'Thumbnail gallery off',
        },
        'zh-CN': {
            crossPost: '跨帖',
            gallery: '画廊',
            original: '⬇ 原图',
            saving: '正在保存高清原图...',
            downloadStarted: '已触发原图下载',
            crossOn: '已开启：跨帖子无限连播',
            crossOff: '已关闭：仅浏览当前帖子',
            galleryOn: '已开启：底部缩略图画廊',
            galleryOff: '已隐藏：底部缩略图画廊',
        },
    };

    function detectLocale() {
        const languages = Array.isArray(navigator.languages) && navigator.languages.length
            ? navigator.languages
            : [navigator.language || 'en'];
        for (const language of languages) {
            const normalized = String(language).toLowerCase();
            if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';
            if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
        }
        return 'en';
    }

    const UI_LOCALE = detectLocale();
    const t = MESSAGES[UI_LOCALE] || MESSAGES.en;

    // 0. At the earliest point (document-start), install the top-level capture listener first:
    // Stop YouTube's (Polymer/c3) global SPA router from intercepting clicks on <a> tags with download or blob: URLs
    window.addEventListener('click', (e) => {
        const a = e.target && typeof e.target.closest === 'function' ? e.target.closest('a') : null;
        if (a && (a.hasAttribute('data-yt-viewer-dl') || a.hasAttribute('download') || (a.href && a.href.startsWith('blob:')))) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            // Important: never call e.preventDefault(); keep the browser's native download behavior
        }
    }, true);

    const initViewer = () => {
        if (document.getElementById('yt-mobile-img-viewer-overlay')) return;

        // 1. Load and save user preferences (cross-post browsing and the horizontal gallery are on by default)
        const CONFIG_KEY = 'yt_mobile_img_viewer_cfg_v4';
        let config = {
            crossPost: true,
            showGalleryBar: true
        };
        try {
            const saved = JSON.parse(localStorage.getItem(CONFIG_KEY));
            if (saved && typeof saved === 'object') {
                config = { ...config, ...saved };
            }
        } catch (e) {}

        const saveConfig = () => {
            try {
                localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
            } catch (e) {}
        };

        // 2. Inject global styles
        const style = document.createElement('style');
        style.textContent = `
            ytm-backstage-post-renderer img,
            ytm-post-multi-image-renderer img,
            ytm-backstage-image-renderer img,
            .post-image-container img {
                -webkit-tap-highlight-color: transparent !important;
                user-select: none !important;
                -webkit-user-select: none !important;
            }
            .yt-viewer-overlay {
                overflow: hidden !important;
                overflow: clip !important;
                overscroll-behavior: none !important;
            }
            .yt-viewer-thumb-strip::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
            }
            .yt-viewer-pill {
                padding: 5px 11px;
                border-radius: 16px;
                font-size: 12px;
                font-weight: 500;
                color: rgba(255, 255, 255, 0.85);
                background: rgba(35, 35, 35, 0.72);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.14);
                transition: all 0.18s ease;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .yt-viewer-pill.active {
                color: #fff;
                background: rgba(255, 255, 255, 0.24);
                border-color: rgba(255, 255, 255, 0.45);
            }
            .yt-viewer-pill:active {
                transform: scale(0.93);
            }
        `;
        (document.head || document.documentElement).appendChild(style);

        // 3. Build the persistent GPU-composited full-screen container
        const overlay = document.createElement('div');
        overlay.id = 'yt-mobile-img-viewer-overlay';
        overlay.className = 'yt-viewer-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            width: '100vw',
            height: '100dvh',
            zIndex: '2147483647',
            visibility: 'hidden',
            pointerEvents: 'none',
            touchAction: 'none',
            userSelect: 'none',
            webkitUserSelect: 'none'
        });

        // Fallback: pin the overlay's own scroll offsets to zero so a left swipe can never reveal the page underneath
        overlay.addEventListener('scroll', () => {
            if (overlay.scrollLeft !== 0 || overlay.scrollTop !== 0) {
                overlay.scrollLeft = 0;
                overlay.scrollTop = 0;
            }
        }, { passive: true });

        const backdrop = document.createElement('div');
        Object.assign(backdrop.style, {
            position: 'absolute',
            inset: '0',
            width: '100%',
            height: '100%',
            backgroundColor: '#000',
            opacity: '0',
            willChange: 'opacity',
            backfaceVisibility: 'hidden',
            webkitBackfaceVisibility: 'hidden'
        });

        const sliderViewport = document.createElement('div');
        Object.assign(sliderViewport.style, {
            position: 'absolute',
            inset: '0',
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            pointerEvents: 'none'
        });

        const sliderTrack = document.createElement('div');
        Object.assign(sliderTrack.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            height: '100%',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            webkitBackfaceVisibility: 'hidden'
        });
        sliderViewport.appendChild(sliderTrack);

        // Top control bar
        const topBar = document.createElement('div');
        Object.assign(topBar.style, {
            position: 'absolute',
            top: 'max(14px, env(safe-area-inset-top, 14px))',
            left: '16px',
            right: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: '10',
            opacity: '0',
            transition: 'opacity 0.18s ease',
            pointerEvents: 'auto'
        });

        const counter = document.createElement('div');
        counter.className = 'yt-viewer-pill';

        const actionGroup = document.createElement('div');
        Object.assign(actionGroup.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        });

        const crossPostBtn = document.createElement('div');
        crossPostBtn.className = `yt-viewer-pill ${config.crossPost ? 'active' : ''}`;
        crossPostBtn.textContent = t.crossPost;

        const galleryToggleBtn = document.createElement('div');
        galleryToggleBtn.className = `yt-viewer-pill ${config.showGalleryBar ? 'active' : ''}`;
        galleryToggleBtn.textContent = t.gallery;

        const downloadBtn = document.createElement('div');
        downloadBtn.className = 'yt-viewer-pill';
        downloadBtn.textContent = t.original;

        actionGroup.appendChild(crossPostBtn);
        actionGroup.appendChild(galleryToggleBtn);
        actionGroup.appendChild(downloadBtn);
        topBar.appendChild(counter);
        topBar.appendChild(actionGroup);

        // Bottom horizontal thumbnail gallery
        const thumbStrip = document.createElement('div');
        thumbStrip.className = 'yt-viewer-thumb-strip';
        Object.assign(thumbStrip.style, {
            position: 'absolute',
            bottom: 'max(18px, env(safe-area-inset-bottom, 18px))',
            left: '12px',
            right: '12px',
            height: '58px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 12px',
            overflowX: 'auto',
            overflowY: 'hidden',
            overscrollBehaviorX: 'contain',
            touchAction: 'pan-x',
            zIndex: '10',
            opacity: '0',
            transition: 'opacity 0.18s ease',
            pointerEvents: 'auto'
        });

        // Lightweight toast
        const toast = document.createElement('div');
        Object.assign(toast.style, {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) scale(0.9)',
            backgroundColor: 'rgba(20, 20, 20, 0.85)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: '500',
            backdropFilter: 'blur(8px)',
            zIndex: '20',
            opacity: '0',
            pointerEvents: 'none',
            transition: 'opacity 0.18s ease, transform 0.18s ease'
        });

        // Dedicated hidden download sandbox iframe: isolates every router listener in the YouTube document; even if a browser opens the blob as a page, it only happens inside this hidden iframe and never changes the current URL
        const dlIframe = document.createElement('iframe');
        Object.assign(dlIframe.style, {
            position: 'fixed',
            width: '0',
            height: '0',
            border: '0',
            left: '-9999px',
            top: '-9999px',
            visibility: 'hidden',
            pointerEvents: 'none'
        });

        overlay.appendChild(backdrop);
        overlay.appendChild(sliderViewport);
        overlay.appendChild(topBar);
        overlay.appendChild(thumbStrip);
        overlay.appendChild(toast);
        document.body.appendChild(overlay);
        document.body.appendChild(dlIframe);

        // 4. State
        let galleryItems = []; // [{ src, el, postEl, slideImg, thumbEl }]
        let seenUrls = new Set(); // dedupe set for incrementally appending images from new posts
        let originClickedEl = null;
        let currentIndex = 0;
        let isViewerOpen = false;
        let isClosing = false;
        let isFetchingMore = false;
        let domObserver = null;
        let observerDebounceTimer = null;

        let gestureMode = 'none';
        let scale = 1, lastScale = 1;
        let posX = 0, posY = 0, lastPosX = 0, lastPosY = 0;
        let trackOffsetX = 0;
        let startX = 0, startY = 0;
        let lastMoveX = 0, lastMoveTime = 0, velocityX = 0;
        let initialPinchDist = 0;
        let hasMoved = false;
        let lastTapTime = 0;
        let singleTapTimer = null;
        let longPressTimer = null;
        let longPressTriggered = false;
        let toastTimer = null;

        const getVw = () => window.innerWidth || document.documentElement.clientWidth;
        const getVh = () => window.innerHeight || document.documentElement.clientHeight;
        const getActiveImg = () => galleryItems[currentIndex]?.slideImg || null;

        // Scroll the underlying page vertically only; never trigger horizontal scrolling or container scrollIntoView bubbling
        const scrollPageVerticallyToElement = (el, align = 'center') => {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const vh = getVh();
            const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
            let targetY = scrollY + rect.top - (vh / 2) + (rect.height / 2);
            if (align === 'end') {
                targetY = scrollY + rect.bottom - vh;
            }
            window.scrollTo({
                top: Math.max(0, targetY),
                left: 0,
                behavior: 'instant'
            });
        };

        const showToast = (msg, duration = 1500) => {
            clearTimeout(toastTimer);
            toast.textContent = msg;
            toast.style.opacity = '1';
            toast.style.transform = 'translate(-50%, -50%) scale(1)';
            toastTimer = setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translate(-50%, -50%) scale(0.9)';
            }, duration);
        };

        // 5. Download engine: trigger the download inside an isolated hidden iframe plus the top-level capture guard, so YouTube's SPA router cannot hijack it to a blob: URL
        const getLosslessUrl = (src) => {
            if (!src) return '';
            if (src.includes('ggpht.com') || src.includes('googleusercontent.com')) {
                return src.replace(/=s\d+.*$/, '=s0').replace(/=w\d+.*$/, '=s0');
            }
            return src;
        };

        const triggerDownloadCurrent = async () => {
            const item = galleryItems[currentIndex];
            if (!item || !item.src) return;

            if (navigator.vibrate) {
                try { navigator.vibrate(35); } catch (e) {}
            }

            const highResUrl = getLosslessUrl(item.src);
            showToast(t.saving);

            try {
                const response = await fetch(highResUrl, { mode: 'cors', credentials: 'omit' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const rawBlob = await response.blob();
                const mime = rawBlob.type || '';
                const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
                const fileName = `YT_Post_${Date.now()}.${ext}`;

                // application/octet-stream forces mobile browsers to open the download manager instead of previewing the image in a tab
                const octetBlob = new Blob([rawBlob], { type: 'application/octet-stream' });
                const blobUrl = URL.createObjectURL(octetBlob);

                // Prefer triggering the download in the isolated hidden iframe document, fully bypassing the main YouTube document's router listeners
                const targetDoc = dlIframe.contentDocument || document;
                const targetContainer = targetDoc.body || targetDoc.documentElement || document.body;

                const a = targetDoc.createElement('a');
                a.href = blobUrl;
                a.download = fileName;
                a.setAttribute('data-yt-viewer-dl', '1');
                a.style.display = 'none';
                a.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }, true);

                targetContainer.appendChild(a);
                a.click();
                setTimeout(() => {
                    a.remove();
                }, 300);

                // Keep the object URL alive for 60s so mobile background download managers have time to read the stream
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                showToast(t.downloadStarted);
            } catch (err) {
                // If cross-origin fetch fails, open the original image in a new tab (prevents YouTube's <a> router from taking over the current page)
                window.open(highResUrl, '_blank', 'noopener,noreferrer');
            }
        };

        // 6. Isolate events on the top and bottom bars
        [topBar, thumbStrip].forEach(bar => {
            ['touchstart', 'touchmove', 'touchend', 'click'].forEach(evt => {
                bar.addEventListener(evt, (e) => e.stopPropagation(), { passive: true });
            });
        });

        downloadBtn.addEventListener('click', () => triggerDownloadCurrent());

        crossPostBtn.addEventListener('click', () => {
            config.crossPost = !config.crossPost;
            crossPostBtn.classList.toggle('active', config.crossPost);
            saveConfig();
            showToast(config.crossPost ? t.crossOn : t.crossOff);

            const currentActiveEl = galleryItems[currentIndex]?.el || originClickedEl;
            if (currentActiveEl) {
                const { items, clickedIndex } = extractGalleryItems(currentActiveEl);
                rebuildTrackAndThumbs(items, clickedIndex);
            }
        });

        galleryToggleBtn.addEventListener('click', () => {
            config.showGalleryBar = !config.showGalleryBar;
            galleryToggleBtn.classList.toggle('active', config.showGalleryBar);
            saveConfig();
            updateThumbStripVisibility();
            showToast(config.showGalleryBar ? t.galleryOn : t.galleryOff);
        });

        // 7. Matrix transforms and UI state updates
        const applyTrackTransform = (dx = 0, withTransition = false) => {
            const vw = getVw();
            sliderTrack.style.transition = withTransition
                ? 'transform 0.22s cubic-bezier(0.18, 0.89, 0.32, 1)'
                : 'none';
            trackOffsetX = -currentIndex * vw + dx;
            sliderTrack.style.transform = `translate3d(${trackOffsetX}px, 0, 0)`;
        };

        const applyImageTransform = (imgEl, x, y, s, withTransition = false, fadeOut = false) => {
            if (!imgEl) return;
            if (withTransition) {
                imgEl.style.transition = fadeOut
                    ? 'transform 0.22s cubic-bezier(0.2, 0.85, 0.3, 1), opacity 0.18s ease 0.03s'
                    : 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.15s ease';
            } else {
                imgEl.style.transition = 'none';
            }
            imgEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
            imgEl.style.opacity = fadeOut ? '0' : '1';
        };

        const setBackdropOpacity = (val, withTransition = false) => {
            backdrop.style.transition = withTransition
                ? 'opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1)'
                : 'none';
            backdrop.style.opacity = String(Math.max(0, Math.min(1, val)));
        };

        const setHudVisible = (visible) => {
            topBar.style.opacity = visible ? '1' : '0';
            topBar.style.pointerEvents = visible ? 'auto' : 'none';
            if (!visible) {
                thumbStrip.style.opacity = '0';
                thumbStrip.style.pointerEvents = 'none';
            } else {
                updateThumbStripVisibility();
            }
        };

        const updateThumbStripVisibility = () => {
            const shouldShow = isViewerOpen && !isClosing && config.showGalleryBar && galleryItems.length > 1;
            thumbStrip.style.opacity = shouldShow ? '1' : '0';
            thumbStrip.style.pointerEvents = shouldShow ? 'auto' : 'none';
        };

        // 8. Build one main image node and its thumbnail (reused for the initial build and incremental appends)
        const mountSingleSlideAndThumb = (item, idx) => {
            const vw = getVw();

            // 1) Main image track node
            const slideWrap = document.createElement('div');
            Object.assign(slideWrap.style, {
                width: `${vw}px`,
                height: '100%',
                flexShrink: '0',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden'
            });

            const img = document.createElement('img');
            img.src = item.src;
            Object.assign(img.style, {
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                transformOrigin: 'center center',
                willChange: 'transform, opacity',
                backfaceVisibility: 'hidden',
                webkitBackfaceVisibility: 'hidden',
                pointerEvents: 'none'
            });

            item.slideImg = img;
            slideWrap.appendChild(img);
            sliderTrack.appendChild(slideWrap);

            // 2) Bottom thumbnail node
            const thumb = document.createElement('img');
            thumb.src = item.src;
            Object.assign(thumb.style, {
                width: '42px',
                height: '42px',
                objectFit: 'cover',
                borderRadius: '8px',
                flexShrink: '0',
                border: '1px solid rgba(255,255,255,0.25)',
                opacity: '0.52',
                transition: 'transform 0.18s ease, opacity 0.18s ease, border 0.18s ease',
                cursor: 'pointer'
            });

            thumb.addEventListener('click', () => {
                if (currentIndex === idx) return;
                const prevImg = getActiveImg();
                scale = 1; posX = 0; posY = 0;
                applyImageTransform(prevImg, 0, 0, 1, false, false);

                currentIndex = idx;
                applyTrackTransform(0, true);
                syncActiveSlideState();
            });

            item.thumbEl = thumb;
            thumbStrip.appendChild(thumb);
        };

        // 9. Incremental scan and auto-load-more-posts engine
        const appendNewDiscoveredItems = () => {
            if (!isViewerOpen || isClosing || !config.crossPost) return 0;

            const roots = Array.from(document.querySelectorAll(
                'ytm-backstage-post-renderer, ytm-post-multi-image-renderer, ytm-shared-post-renderer'
            ));

            let addedCount = 0;

            const tryAdd = (src, el, postEl) => {
                if (!src || seenUrls.has(src)) return;
                seenUrls.add(src);
                const newItem = { src, el: el || postEl, postEl, slideImg: null, thumbEl: null };
                const newIdx = galleryItems.length;
                galleryItems.push(newItem);
                mountSingleSlideAndThumb(newItem, newIdx);
                addedCount++;
            };

            roots.forEach(postRoot => {
                const imageRenderers = postRoot.querySelectorAll('ytm-backstage-image-renderer, .post-image-container');
                imageRenderers.forEach(renderer => {
                    const img = renderer.querySelector('img');
                    let src = img ? (img.currentSrc || img.src || img.getAttribute('src') || img.dataset?.src) : '';
                    if (!src && renderer.data?.image?.thumbnails?.length) {
                        const thumbs = renderer.data.image.thumbnails;
                        src = thumbs[thumbs.length - 1].url;
                    }
                    if (src) tryAdd(src, img || renderer, postRoot);
                });

                const allImgs = postRoot.querySelectorAll('img');
                allImgs.forEach(img => {
                    const isAvatar = img.closest(
                        'ytm-profile-icon, .channel-thumbnail, #author-thumbnail, .slim-owner-icon-and-title, .post-header, ytm-comment-renderer'
                    );
                    if (isAvatar) return;
                    const src = img.currentSrc || img.src || img.getAttribute('src');
                    if (src && (src.includes('ggpht.com') || src.includes('googleusercontent.com'))) {
                        tryAdd(src, img, postRoot);
                    }
                });
            });

            if (addedCount > 0) {
                const vw = getVw();
                sliderTrack.style.width = `${galleryItems.length * vw}px`;
                counter.textContent = `${currentIndex + 1} / ${galleryItems.length}`;
                updateThumbStripVisibility();
            }

            return addedCount;
        };

        // Scroll the underlying page down to wake YouTube's infinite loader
        const triggerUnderlyingInfiniteScroll = () => {
            if (!isViewerOpen || isClosing || !config.crossPost || isFetchingMore) return;
            isFetchingMore = true;

            const continuationEl = document.querySelector(
                'ytm-continuation-item-renderer, .continuation-item, c3-next-continuation'
            );
            if (continuationEl) {
                scrollPageVerticallyToElement(continuationEl, 'end');
            } else {
                window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: 'instant' });
            }

            window.dispatchEvent(new Event('scroll'));

            [200, 600, 1200, 2000].forEach((delay, idx) => {
                setTimeout(() => {
                    if (!isViewerOpen || isClosing || !config.crossPost) {
                        isFetchingMore = false;
                        return;
                    }
                    const allPosts = document.querySelectorAll('ytm-backstage-post-renderer');
                    if (allPosts.length > 0) {
                        const lastPost = allPosts[allPosts.length - 1];
                        scrollPageVerticallyToElement(lastPost, 'center');
                        window.dispatchEvent(new Event('scroll'));
                    }

                    appendNewDiscoveredItems();

                    if (idx === 3) {
                        isFetchingMore = false;
                    }
                }, delay);
            });
        };

        // Start/stop the underlying DOM observer
        const startDomObserver = () => {
            stopDomObserver();
            domObserver = new MutationObserver(() => {
                if (!isViewerOpen || isClosing || !config.crossPost) return;
                clearTimeout(observerDebounceTimer);
                observerDebounceTimer = setTimeout(() => {
                    appendNewDiscoveredItems();
                }, 120);
            });
            domObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src']
            });
        };

        const stopDomObserver = () => {
            clearTimeout(observerDebounceTimer);
            if (domObserver) {
                domObserver.disconnect();
                domObserver = null;
            }
        };

        // 10. Sync the selected image state
        const syncActiveSlideState = () => {
            counter.textContent = `${currentIndex + 1} / ${galleryItems.length}`;

            galleryItems.forEach((item, idx) => {
                if (!item.thumbEl) return;
                const isActive = idx === currentIndex;
                item.thumbEl.style.border = isActive ? '2px solid #fff' : '1px solid rgba(255,255,255,0.25)';
                item.thumbEl.style.opacity = isActive ? '1' : '0.52';
                item.thumbEl.style.transform = isActive ? 'scale(1.12)' : 'scale(1)';
                if (isActive && config.showGalleryBar) {
                    const targetLeft = item.thumbEl.offsetLeft - (thumbStrip.clientWidth - item.thumbEl.offsetWidth) / 2;
                    thumbStrip.scrollTo({
                        left: Math.max(0, targetLeft),
                        behavior: 'smooth'
                    });
                }
            });

            if (config.crossPost && currentIndex >= Math.max(0, galleryItems.length - 2)) {
                triggerUnderlyingInfiniteScroll();
            } else {
                const activeItem = galleryItems[currentIndex];
                const anchor = activeItem?.postEl || activeItem?.el;
                if (anchor) {
                    const rect = anchor.getBoundingClientRect();
                    const vh = getVh();
                    if (rect.top < 60 || rect.bottom > vh - 60) {
                        scrollPageVerticallyToElement(anchor, 'center');
                    }
                }
            }
        };

        const rebuildTrackAndThumbs = (items, activeIdx) => {
            galleryItems = items;
            currentIndex = activeIdx;
            seenUrls = new Set(items.map(i => i.src));
            const vw = getVw();

            sliderTrack.innerHTML = '';
            thumbStrip.innerHTML = '';
            sliderTrack.style.width = `${items.length * vw}px`;

            items.forEach((item, idx) => {
                mountSingleSlideAndThumb(item, idx);
            });

            applyTrackTransform(0, false);
            updateThumbStripVisibility();
            syncActiveSlideState();
        };

        // 11. Compute the FLIP geometry from the original thumbnail
        const computeMorphDelta = (item) => {
            const vw = getVw();
            const vh = getVh();
            let targetEl = item?.el;

            if (targetEl) {
                const r = targetEl.getBoundingClientRect();
                if (r.width === 0 || r.right < 0 || r.left > vw) {
                    targetEl = item?.postEl || originClickedEl;
                }
            } else {
                targetEl = item?.postEl || originClickedEl;
            }

            if (!targetEl) return { dx: 0, dy: 0, s: 0.45 };

            const rect = targetEl.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return { dx: 0, dy: 0, s: 0.45 };

            const dx = (rect.left + rect.width / 2) - vw / 2;
            const dy = (rect.top + rect.height / 2) - vh / 2;

            const natW = item?.el?.naturalWidth || item?.slideImg?.naturalWidth || rect.width;
            const natH = item?.el?.naturalHeight || item?.slideImg?.naturalHeight || rect.height;
            const imgAspect = natW / Math.max(1, natH);
            const screenAspect = vw / Math.max(1, vh);

            let fullRenderW, fullRenderH;
            if (imgAspect > screenAspect) {
                fullRenderW = vw;
                fullRenderH = vw / imgAspect;
            } else {
                fullRenderH = vh;
                fullRenderW = vh * imgAspect;
            }

            const scaleX = rect.width / Math.max(1, fullRenderW);
            const scaleY = rect.height / Math.max(1, fullRenderH);
            const s = Math.min(0.92, Math.max(0.15, Math.min(scaleX, scaleY)));

            return { dx, dy, s };
        };

        // 12. Open and smoothly shrink back to the original image
        const openViewer = (items, startIndex, clickedEl) => {
            if (isViewerOpen || items.length === 0) return;
            isViewerOpen = true;
            isClosing = false;
            isFetchingMore = false;
            originClickedEl = clickedEl;

            scale = 1; lastScale = 1;
            posX = 0; posY = 0; lastPosX = 0; lastPosY = 0;
            overlay.scrollLeft = 0;
            overlay.scrollTop = 0;

            rebuildTrackAndThumbs(items, startIndex);
            startDomObserver();

            const activeItem = galleryItems[currentIndex];
            const { dx, dy, s } = computeMorphDelta(activeItem);
            applyImageTransform(activeItem.slideImg, dx, dy, s, false, false);
            setBackdropOpacity(0, false);

            overlay.style.visibility = 'visible';
            overlay.style.pointerEvents = 'auto';

            requestAnimationFrame(() => {
                applyImageTransform(activeItem.slideImg, 0, 0, 1, true, false);
                setBackdropOpacity(0.96, true);
                setHudVisible(true);
            });
        };

        const closeViewerWithMorph = () => {
            if (!isViewerOpen || isClosing) return;
            isClosing = true;
            clearTimeout(singleTapTimer);
            clearTimeout(longPressTimer);
            stopDomObserver();

            setHudVisible(false);

            const activeItem = galleryItems[currentIndex];
            const anchor = activeItem?.postEl || activeItem?.el;
            if (anchor) {
                const r = anchor.getBoundingClientRect();
                const vh = getVh();
                if (r.top < 40 || r.bottom > vh - 40) {
                    scrollPageVerticallyToElement(anchor, 'center');
                }
            }

            const { dx, dy, s } = computeMorphDelta(activeItem);
            const finalScale = scale < 0.98 ? Math.min(s, scale * 0.9) : s;

            applyImageTransform(activeItem?.slideImg, dx, dy, finalScale, true, true);
            setBackdropOpacity(0, true);

            setTimeout(() => {
                overlay.style.visibility = 'hidden';
                overlay.style.pointerEvents = 'none';
                sliderTrack.innerHTML = '';
                thumbStrip.innerHTML = '';
                galleryItems = [];
                seenUrls.clear();
                isViewerOpen = false;
                isClosing = false;
                isFetchingMore = false;
                scale = 1; posX = 0; posY = 0;
            }, 230);
        };

        window.addEventListener('resize', () => {
            if (!isViewerOpen) return;
            const vw = getVw();
            sliderTrack.style.width = `${galleryItems.length * vw}px`;
            Array.from(sliderTrack.children).forEach(child => {
                child.style.width = `${vw}px`;
            });
            applyTrackTransform(0, false);
        });

        // 13. Touch gesture engine
        const getDistance = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

        overlay.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            if (isClosing) return;

            hasMoved = false;
            longPressTriggered = false;
            velocityX = 0;
            clearTimeout(longPressTimer);

            if (e.touches.length === 2) {
                gestureMode = 'pinch';
                initialPinchDist = getDistance(e.touches[0], e.touches[1]);
                lastScale = scale;
            } else if (e.touches.length === 1) {
                gestureMode = scale > 1.05 ? 'pan' : 'none';
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                lastMoveX = startX;
                lastMoveTime = performance.now();
                lastPosX = posX;
                lastPosY = posY;

                longPressTimer = setTimeout(() => {
                    if (!hasMoved && gestureMode !== 'pinch' && isViewerOpen && !isClosing) {
                        longPressTriggered = true;
                        triggerDownloadCurrent();
                    }
                }, 450);
            }
        }, { passive: false });

        overlay.addEventListener('touchmove', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isClosing) return;

            const activeImg = getActiveImg();
            if (!activeImg) return;

            if (gestureMode === 'pinch' && e.touches.length === 2) {
                clearTimeout(longPressTimer);
                hasMoved = true;
                const dist = getDistance(e.touches[0], e.touches[1]);
                scale = Math.min(Math.max(0.75, lastScale * (dist / initialPinchDist)), 5);
                applyImageTransform(activeImg, posX, posY, scale, false, false);
                return;
            }

            if (e.touches.length === 1 && gestureMode !== 'pinch') {
                const curX = e.touches[0].clientX;
                const curY = e.touches[0].clientY;
                const dx = curX - startX;
                const dy = curY - startY;

                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    clearTimeout(longPressTimer);
                }

                const now = performance.now();
                const dt = now - lastMoveTime;
                if (dt > 4) {
                    velocityX = (curX - lastMoveX) / dt;
                    lastMoveX = curX;
                    lastMoveTime = now;
                }

                if (!hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
                    hasMoved = true;
                    if (scale > 1.05) {
                        gestureMode = 'pan';
                    } else if (Math.abs(dx) >= Math.abs(dy) * 0.8) {
                        gestureMode = 'horizontal-gallery';
                    } else {
                        gestureMode = 'vertical-dismiss';
                        setHudVisible(false);
                    }
                }

                if (!hasMoved || longPressTriggered) return;

                if (gestureMode === 'pan') {
                    posX = lastPosX + dx;
                    posY = lastPosY + dy;
                    applyImageTransform(activeImg, posX, posY, scale, false, false);
                } else if (gestureMode === 'horizontal-gallery') {
                    let effectiveDx = dx * 1.18;
                    if ((currentIndex === 0 && effectiveDx > 0) || (currentIndex === galleryItems.length - 1 && effectiveDx < 0)) {
                        effectiveDx *= 0.28;
                    }
                    applyTrackTransform(effectiveDx, false);
                } else if (gestureMode === 'vertical-dismiss') {
                    posX = dx * 0.5;
                    posY = dy;
                    const distance = Math.abs(dy);
                    scale = Math.max(0.55, 1 - distance / 750);
                    const bgAlpha = 0.96 * Math.max(0, 1 - distance / 320);

                    applyImageTransform(activeImg, posX, posY, scale, false, false);
                    setBackdropOpacity(bgAlpha, false);
                }
            }
        }, { passive: false });

        overlay.addEventListener('touchend', (e) => {
            e.stopPropagation();
            clearTimeout(longPressTimer);
            if (isClosing) return;

            if (longPressTriggered) {
                if (e.touches.length === 0) longPressTriggered = false;
                return;
            }

            const activeImg = getActiveImg();

            if (gestureMode === 'pinch') {
                if (e.touches.length === 1) {
                    gestureMode = scale > 1.05 ? 'pan' : 'none';
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                    lastPosX = posX;
                    lastPosY = posY;
                } else if (e.touches.length === 0) {
                    gestureMode = 'none';
                    if (scale < 1) {
                        scale = 1; posX = 0; posY = 0;
                        applyImageTransform(activeImg, 0, 0, 1, true, false);
                    }
                }
                return;
            }

            if (e.touches.length > 0) return;

            if (gestureMode === 'horizontal-gallery') {
                const vw = getVw();
                const movedX = trackOffsetX - (-currentIndex * vw);
                const distThreshold = vw * 0.09;
                const isFastFlickLeft = velocityX < -0.22 && movedX < -12;
                const isFastFlickRight = velocityX > 0.22 && movedX > 12;

                if ((movedX < -distThreshold || isFastFlickLeft) && currentIndex < galleryItems.length - 1) {
                    currentIndex++;
                } else if ((movedX > distThreshold || isFastFlickRight) && currentIndex > 0) {
                    currentIndex--;
                } else if ((movedX < -distThreshold || isFastFlickLeft) && currentIndex === galleryItems.length - 1 && config.crossPost) {
                    triggerUnderlyingInfiniteScroll();
                }

                applyTrackTransform(0, true);
                syncActiveSlideState();
                gestureMode = 'none';
                return;
            }

            if (gestureMode === 'vertical-dismiss') {
                gestureMode = 'none';
                if (Math.abs(posY) > 55) {
                    closeViewerWithMorph();
                } else {
                    scale = 1; posX = 0; posY = 0;
                    applyImageTransform(activeImg, 0, 0, 1, true, false);
                    setBackdropOpacity(0.96, true);
                    setHudVisible(true);
                }
                return;
            }

            gestureMode = 'none';

            if (!hasMoved) {
                const now = Date.now();
                if (now - lastTapTime < 250) {
                    clearTimeout(singleTapTimer);
                    lastTapTime = 0;
                    if (scale > 1.05) {
                        scale = 1; posX = 0; posY = 0; lastPosX = 0; lastPosY = 0;
                    } else {
                        scale = 2.5; posX = 0; posY = 0; lastPosX = 0; lastPosY = 0;
                    }
                    applyImageTransform(activeImg, posX, posY, scale, true, false);
                } else {
                    lastTapTime = now;
                    singleTapTimer = setTimeout(() => {
                        closeViewerWithMorph();
                    }, 250);
                }
            }
        });

        // 14. Initial image queue scan
        const extractGalleryItems = (targetImg) => {
            const singlePostRoot = targetImg.closest(
                'ytm-backstage-post-renderer, ytm-post-multi-image-renderer, ytm-shared-post-renderer, ytm-backstage-post-thread-renderer, article'
            ) || targetImg.closest(
                'ytm-post-attachment-renderer, .post-image-container, ytm-backstage-image-renderer'
            );

            const roots = config.crossPost
                ? Array.from(document.querySelectorAll('ytm-backstage-post-renderer, ytm-post-multi-image-renderer, ytm-shared-post-renderer'))
                : (singlePostRoot ? [singlePostRoot] : []);

            if (roots.length === 0 && singlePostRoot) {
                roots.push(singlePostRoot);
            }

            const targetSrc = targetImg.currentSrc || targetImg.src || targetImg.getAttribute('src');
            const items = [];
            const localSeen = new Set();
            let clickedIndex = 0;

            const addCandidate = (src, el, postEl) => {
                if (!src || localSeen.has(src)) return;
                localSeen.add(src);
                if (el === targetImg || src === targetSrc) {
                    clickedIndex = items.length;
                }
                items.push({ src, el: el || targetImg, postEl: postEl || singlePostRoot, slideImg: null, thumbEl: null });
            };

            roots.forEach(postRoot => {
                const imageRenderers = postRoot.querySelectorAll('ytm-backstage-image-renderer, .post-image-container');
                if (imageRenderers.length > 0) {
                    imageRenderers.forEach(renderer => {
                        const img = renderer.querySelector('img');
                        let src = img ? (img.currentSrc || img.src || img.getAttribute('src') || img.dataset?.src) : '';
                        if (!src && renderer.data?.image?.thumbnails?.length) {
                            const thumbs = renderer.data.image.thumbnails;
                            src = thumbs[thumbs.length - 1].url;
                        }
                        if (src) addCandidate(src, img || renderer, postRoot);
                    });
                }

                const allImgs = postRoot.querySelectorAll('img');
                allImgs.forEach(img => {
                    const isAvatar = img.closest(
                        'ytm-profile-icon, .channel-thumbnail, #author-thumbnail, .slim-owner-icon-and-title, .post-header, ytm-comment-renderer'
                    );
                    if (isAvatar) return;
                    const src = img.currentSrc || img.src || img.getAttribute('src');
                    if (src && (src.includes('ggpht.com') || src.includes('googleusercontent.com') || img === targetImg)) {
                        addCandidate(src, img, postRoot);
                    }
                });
            });

            if (items.length === 0 && targetSrc) {
                addCandidate(targetSrc, targetImg, singlePostRoot);
            }

            return { items, clickedIndex };
        };

        // 15. Global click capture
        document.addEventListener('click', (e) => {
            if (isViewerOpen) return;

            const target = e.target;
            if (!target || target.tagName !== 'IMG') return;

            const isAvatar = target.closest(
                'ytm-profile-icon, .channel-thumbnail, #author-thumbnail, .slim-owner-icon-and-title, .post-header'
            );
            if (isAvatar) return;

            const inPost = target.closest(
                'ytm-backstage-post-renderer, ytm-post-multi-image-renderer, ytm-post-attachment-renderer, .post-image-container, ytm-backstage-image-renderer'
            );
            const src = target.currentSrc || target.src;
            const isFeedImg = src && (src.includes('ggpht.com') || src.includes('googleusercontent.com')) && target.clientWidth > 120;

            if (inPost || isFeedImg) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const { items, clickedIndex } = extractGalleryItems(target);
                openViewer(items, clickedIndex, target);
            }
        }, true);
    };

    if (document.body) {
        initViewer();
    } else {
        window.addEventListener('DOMContentLoaded', initViewer, { once: true });
    }
})();