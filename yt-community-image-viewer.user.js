// ==UserScript==
// @name         YouTube Mobile Community Image Viewer - Fullscreen Gallery
// @name:en      YouTube Mobile Community Image Viewer - Fullscreen Gallery
// @name:zh-CN   YouTube 移动版社区图片全屏查看器
// @namespace    https://github.com/devycx/yt-community-image-viewer
// @version      4.6.1
// @description  Turn community-post images on m.youtube.com into a full-screen gallery: like, dislike and jump to comments from the thumb zone, expandable post captions, thumbnail strip, pinch and double-tap zoom, cross-post browsing, and a download path YouTube's SPA router cannot hijack.
// @description:en  Turn community-post images on m.youtube.com into a full-screen gallery: like, dislike and jump to comments from the thumb zone, expandable post captions, thumbnail strip, pinch and double-tap zoom, cross-post browsing, and a download path YouTube's SPA router cannot hijack.
// @description:zh-CN  把 m.youtube.com 社区帖图片变成全屏画廊：拇指区点赞/点踩/评论跳转、帖子文案展开、跨帖无限连播、底部缩略图轨、双指焦点缩放与双击放大、单击切换沉浸看图、安卓返回手势防误退，并修掉点下载被 SPA 路由劫持跳走的问题
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
            allPosts: 'All posts',
            gallery: 'Gallery',
            original: '⬇ Original',
            rotate: '↻ Rotate',
            comments: 'Comments',
            like: 'Like',
            dislike: 'Dislike',
            crossOn: 'All posts: on',
            crossOff: 'All posts: off — current post only',
            galleryOn: 'Thumbnail gallery: on',
            galleryOff: 'Thumbnail gallery: off',
            saving: 'Saving full-resolution image…',
            downloadStarted: 'Full-resolution download started',
            noVote: 'Could not find this post’s native like button',
            immersiveOn: 'Immersive view: tap to exit',
            immersiveOff: 'Exited immersive view'
        },
        'zh-CN': {
            allPosts: '跨帖',
            gallery: '画廊',
            original: '⬇ 原图',
            rotate: '↻ 旋转',
            comments: '评论',
            like: '赞',
            dislike: '点踩',
            crossOn: '已开启：跨帖子无限连播',
            crossOff: '已关闭：仅浏览当前帖子',
            galleryOn: '已开启：底部缩略图画廊',
            galleryOff: '已隐藏：底部缩略图画廊',
            saving: '正在保存高清原图...',
            downloadStarted: '已触发原图下载',
            noVote: '未找到当前帖子的原生互动按钮',
            immersiveOn: '沉浸看图：单击切换',
            immersiveOff: '已退出沉浸模式'
        }
    };

    const detectLocale = () => {
        const languages = navigator.languages && navigator.languages.length
            ? navigator.languages
            : [navigator.language || 'en'];
        for (const language of languages) {
            const normalized = String(language).toLowerCase();
            if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';
            if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
        }
        return 'en';
    };

    const t = MESSAGES[detectLocale()] || MESSAGES.en;

    // 0. 最早期（document-start）抢先注册顶层捕获监听器：
    // 阻止 YouTube (Polymer/c3) 的全局 SPA 路由拦截带有 download 属性或 blob: 协议的 <a> 标签点击事件
    window.addEventListener('click', (e) => {
        const a = e.target && typeof e.target.closest === 'function' ? e.target.closest('a') : null;
        if (a && (a.hasAttribute('data-yt-viewer-dl') || a.hasAttribute('download') || (a.href && a.href.startsWith('blob:')))) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            // 注意：绝不调用 e.preventDefault()，保留浏览器原生下载默认行为
        }
    }, true);

    const initViewer = () => {
        if (document.getElementById('yt-mobile-img-viewer-overlay')) return;

        // 1. 读取与保存用户偏好设置（默认开启跨帖浏览、水平画廊、文案展示）
        const CONFIG_KEY = 'yt_mobile_img_viewer_cfg_v4';
        let config = {
            crossPost: true,
            showGalleryBar: true,
            showCaption: true
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

        // 2. 注入全局样式
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
            .yt-viewer-thumb-strip::-webkit-scrollbar,
            .yt-viewer-caption-box::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
            }
            .yt-viewer-pill {
                padding: 6px 12px;
                border-radius: 18px;
                font-size: 12px;
                font-weight: 500;
                line-height: 1.2;
                color: rgba(255, 255, 255, 0.88);
                background: rgba(32, 32, 32, 0.76);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                transition: transform 0.15s ease, background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                cursor: pointer;
                -webkit-tap-highlight-color: transparent;
                white-space: nowrap;
            }
            .yt-viewer-pill svg {
                width: 16px;
                height: 16px;
                fill: currentColor;
                flex-shrink: 0;
            }
            .yt-viewer-pill.bottom-btn {
                min-height: 38px;
                padding: 0 15px;
                border-radius: 20px;
                font-size: 13px;
            }
            .yt-viewer-pill.like-primary {
                min-height: 40px;
                padding: 0 18px;
                border-radius: 21px;
                font-size: 13.5px;
                font-weight: 600;
                border-color: rgba(255, 255, 255, 0.22);
            }
            .yt-viewer-pill.like-primary svg {
                width: 17px;
                height: 17px;
            }
            .yt-viewer-pill.active {
                color: #fff;
                background: rgba(255, 255, 255, 0.24);
                border-color: rgba(255, 255, 255, 0.48);
            }
            .yt-viewer-pill.liked {
                color: #3ea6ff;
                background: rgba(62, 166, 255, 0.20);
                border-color: rgba(62, 166, 255, 0.60);
            }
            .yt-viewer-pill.disliked {
                color: #ff6b6b;
                background: rgba(255, 107, 107, 0.18);
                border-color: rgba(255, 107, 107, 0.5);
            }
            .yt-viewer-pill:active {
                transform: scale(0.92);
            }
            .yt-viewer-caption-box {
                background: rgba(24, 24, 24, 0.72);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 14px;
                padding: 8px 12px;
                color: rgba(255, 255, 255, 0.9);
                font-size: 12.5px;
                line-height: 1.45;
                max-height: 26px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                transition: max-height 0.22s ease, background 0.2s ease;
                pointer-events: auto;
                cursor: pointer;
            }
            .yt-viewer-caption-box.expanded {
                white-space: pre-wrap;
                word-break: break-word;
                max-height: 32vh;
                overflow-y: auto;
                overscroll-behavior: contain;
                touch-action: pan-y;
                background: rgba(18, 18, 18, 0.88);
            }
            .yt-viewer-caption-author {
                font-weight: 600;
                color: #3ea6ff;
                margin-right: 6px;
            }
        `;
        (document.head || document.documentElement).appendChild(style);

        // SVG 图标定义
        const ICONS = {
            likeOutline: 'M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11H3v10h4h1h9.43 c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z M7,20H4v-8h3V20z M19.98,13.17l-1.34,6 C18.54,19.65,18.03,20,17.43,20H8v-8.61l5.6-6.06C13.79,5.12,14.08,5,14.38,5c0.26,0,0.5,0.11,0.63,0.3 c0.07,0.1,0.15,0.26,0.09,0.47l-1.52,4.94L13.18,12h1.35h4.23c0.41,0,0.8,0.17,1.03,0.46C19.92,12.61,20.05,12.86,19.98,13.17z',
            likeFilled: 'M3,11h3v10H3V11z M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11v10h10.43 c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z',
            dislikeOutline: 'M17,4h-1H6.57C5.5,4,4.59,4.67,4.38,5.61l-1.34,6C2.77,12.85,3.82,14,5.23,14h4.23l-1.52,4.94C7.62,19.97,8.46,21,9.62,21 c0.58,0,1.14-0.24,1.52-0.65L17,14h4V4H17z M10.4,19.67C10.21,19.88,9.92,20,9.62,20c-0.26,0-0.5-0.11-0.63-0.3 c-0.07-0.1,0.15-0.26-0.09-0.47l1.52-4.94l0.4-1.29H9.46H5.23c-0.41,0-0.8-0.17-1.03-0.46c-0.12-0.15-0.25-0.4-0.18-0.72l1.34-6 C5.46,5.35,5.97,5,6.57,5H16v8.61L10.4,19.67z M20,13h-3V5h3V13z',
            dislikeFilled: 'M18,4h3v10h-3V4z M5.23,14h4.23l-1.52,4.94C7.62,19.97,8.46,21,9.62,21c0.58,0,1.14-0.24,1.52-0.65L17,14V4H6.57 C5.5,4,4.59,4.67,4.38,5.61l-1.34,6C2.77,12.85,3.82,14,5.23,14z',
            comment: 'M8,11.5c0-0.83,0.67-1.5,1.5-1.5s1.5,0.67,1.5,1.5S10.33,13,9.5,13S8,12.33,8,11.5z M14.5,10c-0.83,0-1.5,0.67-1.5,1.5 s0.67,1.5,1.5,1.5s1.5-0.67,1.5-1.5S15.33,10,14.5,10z M12,3C6.48,3,2,6.81,2,11.5c0,2.13,0.93,4.08,2.47,5.57L3.03,20.5 c-0.14,0.33,0.18,0.67,0.52,0.54l3.99-1.53C8.92,20.14,10.42,20.5,12,20.5c5.52,0,10-3.81,10-8.5S17.52,3,12,3z M12,19.5 c-1.48,0-2.91-0.35-4.18-1.01l-0.31-0.16l-0.33,0.13l-2.63,1.01l0.95-2.26l0.15-0.36l-0.29-0.26C3.9,15.22,3,13.43,3,11.5 C3,7.36,7.03,4,12,4s9,3.36,9,7.5S16.97,19.5,12,19.5z'
        };

        // 用 DOM API 构建图标，避免 innerHTML 在 YouTube 的 Trusted Types 策略下被拦截
        const createIcon = (pathData) => {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', pathData);
            svg.appendChild(path);
            return svg;
        };

        const setPillContent = (pill, pathData, label) => {
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            pill.replaceChildren(createIcon(pathData), labelEl);
        };

        const setPillIcon = (pill, pathData) => {
            pill.replaceChildren(createIcon(pathData));
        };

        // 3. 构建常驻 GPU 合成层全屏容器
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

        // 兜底锁死 overlay 自身任何潜在的编程式滚动偏移，彻底杜绝左滑露底
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

        // 顶部控制栏
        const topBar = document.createElement('div');
        Object.assign(topBar.style, {
            position: 'absolute',
            top: 'max(14px, env(safe-area-inset-top, 14px))',
            left: '14px',
            right: '14px',
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
            gap: '7px'
        });

        const crossPostBtn = document.createElement('div');
        crossPostBtn.className = `yt-viewer-pill ${config.crossPost ? 'active' : ''}`;
        crossPostBtn.textContent = t.allPosts;

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

        // 底部综合 HUD 容器（包含：帖子文案框、缩略图轨道、人体工学居中偏右互动操作栏）
        const bottomHud = document.createElement('div');
        Object.assign(bottomHud.style, {
            position: 'absolute',
            bottom: 'max(20px, calc(env(safe-area-inset-bottom, 14px) + 8px))',
            left: '14px',
            right: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            zIndex: '10',
            opacity: '0',
            transition: 'opacity 0.18s ease',
            pointerEvents: 'none'
        });

        // 1) 帖子文案与作者预览框（点击可展开/收起全文）
        const captionBox = document.createElement('div');
        captionBox.className = 'yt-viewer-caption-box';
        captionBox.style.display = 'none';

        // 2) 底部水平画廊缩略图栏
        const thumbStrip = document.createElement('div');
        thumbStrip.className = 'yt-viewer-thumb-strip';
        Object.assign(thumbStrip.style, {
            height: '50px',
            display: 'none',
            alignItems: 'center',
            gap: '8px',
            padding: '0 4px',
            overflowX: 'auto',
            overflowY: 'hidden',
            overscrollBehaviorX: 'contain',
            touchAction: 'pan-x',
            pointerEvents: 'auto'
        });

        // 3) 底部人体工学互动栏：
        // 采用居中聚合布局，并将最高频的“👍 点赞”置于右侧大号胶囊位（右手单手握持时拇指自然落点黄金区，彻底告别伸手去按左下角）
        const bottomActionBar = document.createElement('div');
        Object.assign(bottomActionBar.style, {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
            pointerEvents: 'auto'
        });

        const rotateBtnPill = document.createElement('div');
        rotateBtnPill.className = 'yt-viewer-pill bottom-btn';
        rotateBtnPill.textContent = t.rotate;

        const commentBtnPill = document.createElement('div');
        commentBtnPill.className = 'yt-viewer-pill bottom-btn';
        setPillContent(commentBtnPill, ICONS.comment, t.comments);

        const dislikeBtnPill = document.createElement('div');
        dislikeBtnPill.className = 'yt-viewer-pill bottom-btn';
        dislikeBtnPill.setAttribute('aria-label', t.dislike);
        setPillIcon(dislikeBtnPill, ICONS.dislikeOutline);

        const likeBtnPill = document.createElement('div');
        likeBtnPill.className = 'yt-viewer-pill like-primary';
        setPillContent(likeBtnPill, ICONS.likeOutline, t.like);

        // 从左到右依次为：[↻ 旋转] [💬 评论] [👎 点踩] [👍 点赞(大号主按钮)]
        bottomActionBar.appendChild(rotateBtnPill);
        bottomActionBar.appendChild(commentBtnPill);
        bottomActionBar.appendChild(dislikeBtnPill);
        bottomActionBar.appendChild(likeBtnPill);

        bottomHud.appendChild(captionBox);
        bottomHud.appendChild(thumbStrip);
        bottomHud.appendChild(bottomActionBar);

        // 轻提示 Toast
        const toast = document.createElement('div');
        Object.assign(toast.style, {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) scale(0.9)',
            backgroundColor: 'rgba(20, 20, 20, 0.88)',
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

        // 专用隐藏下载沙盒 iframe：隔离 YouTube 主文档的所有路由监听器
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
        overlay.appendChild(bottomHud);
        overlay.appendChild(toast);
        document.body.appendChild(overlay);
        document.body.appendChild(dlIframe);

        // 4. 状态管理变量
        let galleryItems = []; // [{ src, key, el, postEl, slideImg, thumbEl }]
        let seenKeys = new Set(); // 归一化图片主键集合，防止懒加载改尺寸参数造成重复追加
        let originClickedEl = null;
        let currentIndex = 0;
        let isViewerOpen = false;
        let isClosing = false;
        let isFetchingMore = false;
        let hasPushedHistory = false;
        let closingFromPopState = false;
        let domObserver = null;
        let observerDebounceTimer = null;
        let actionSyncTimers = [];

        let gestureMode = 'none';
        let scale = 1, lastScale = 1;
        let posX = 0, posY = 0, lastPosX = 0, lastPosY = 0;
        let rotation = 0;
        let trackOffsetX = 0;
        let startX = 0, startY = 0;
        let pinchMidX = 0, pinchMidY = 0;
        let lastMoveX = 0, lastMoveTime = 0, velocityX = 0;
        let initialPinchDist = 0;
        let hasMoved = false;
        let lastTapTime = 0;
        let lastTapX = 0, lastTapY = 0;
        let singleTapTimer = null;
        let longPressTimer = null;
        let longPressTriggered = false;
        let toastTimer = null;
        let isImmersive = false; // 沉浸看图模式

        const getVw = () => window.innerWidth || document.documentElement.clientWidth;
        const getVh = () => window.innerHeight || document.documentElement.clientHeight;
        const getActiveImg = () => galleryItems[currentIndex]?.slideImg || null;

        // 归一化图片唯一 Key：剥离 googleusercontent / ggpht 的尺寸与裁剪后缀（如 =s640-c-fcrop64...），防止同一张图因分辨率变化被重复收录
        const getCanonicalImgKey = (src) => {
            if (!src) return '';
            if (src.includes('ggpht.com') || src.includes('googleusercontent.com')) {
                return src.replace(/=[^/&?#]+$/, '');
            }
            return src.split('?')[0];
        };

        // 获取用于保存下载的未裁剪无损原图 URL（=s0）
        const getLosslessUrl = (src) => {
            if (!src) return '';
            if (src.includes('ggpht.com') || src.includes('googleusercontent.com')) {
                if (/=[^/&?#]+$/.test(src)) {
                    return src.replace(/=[^/&?#]+$/, '=s0');
                }
                return `${src}=s0`;
            }
            return src;
        };

        // 仅在垂直方向滚动底层页面，严禁触发任何横向滚动或容器 scrollIntoView 冒泡
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

        // 5. 安卓物理返回键 / 边缘返回手势拦截防误退（退出查看器）
        window.addEventListener('popstate', (e) => {
            if (isViewerOpen && !isClosing) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                hasPushedHistory = false;
                closingFromPopState = true;
                closeViewerWithMorph();
            }
        }, true);

        // 6. 原帖 DOM 互动解析与同步引擎（点赞 / 点赞数 / 点踩 / 评论 / 作者文案）
        const resolvePostContainer = (item) => {
            if (!item) return null;
            const candidate = item.postEl || item.el;
            if (!candidate || typeof candidate.closest !== 'function') return candidate;
            return candidate.closest(
                'ytm-backstage-post-renderer, ytm-shared-post-renderer, ytm-backstage-post-thread-renderer, article'
            ) || candidate;
        };

        const extractPostInteractionDom = (postRoot) => {
            if (!postRoot || typeof postRoot.querySelectorAll !== 'function') {
                return { likeBtn: null, dislikeBtn: null, commentBtn: null };
            }

            const isNotInComment = (el) => !el.closest('ytm-comment-renderer, ytm-comment-thread-renderer');

            // 1) 优先匹配新版 ViewModel / Toggle Renderer 结构
            let likeBtn = Array.from(postRoot.querySelectorAll(
                'like-button-view-model button, ytm-like-button-renderer button'
            )).find(isNotInComment) || null;

            let dislikeBtn = Array.from(postRoot.querySelectorAll(
                'dislike-button-view-model button, ytm-dislike-button-renderer button'
            )).find(isNotInComment) || null;

            // 2) 兼容 ytm-toggle-button-renderer 或通用按钮列表
            const toggleButtons = Array.from(postRoot.querySelectorAll(
                'ytm-backstage-post-actions-renderer ytm-toggle-button-renderer button, .backstage-post-actions ytm-toggle-button-renderer button, ytm-toggle-button-renderer button'
            )).filter(isNotInComment);

            if (!likeBtn && toggleButtons.length >= 1) {
                likeBtn = toggleButtons[0];
            }
            if (!dislikeBtn && toggleButtons.length >= 2) {
                dislikeBtn = toggleButtons[1];
            }

            // 3) aria-label 兜底识别
            const allButtons = Array.from(postRoot.querySelectorAll('button, [role="button"], a.yt-spec-button-shape-next')).filter(isNotInComment);
            if (!likeBtn) {
                likeBtn = allButtons.find(b => {
                    const label = (b.getAttribute('aria-label') || '').toLowerCase();
                    return (label.includes('赞') || label.includes('like')) && !label.includes('不') && !label.includes('踩') && !label.includes('dislike');
                }) || null;
            }
            if (!dislikeBtn) {
                dislikeBtn = allButtons.find(b => {
                    const label = (b.getAttribute('aria-label') || '').toLowerCase();
                    return label.includes('踩') || label.includes('不喜欢') || label.includes('dislike');
                }) || null;
            }

            // 4) 评论按钮识别：优先当前移动端结构（…CommentButtonText），再按 aria-label 兜底。
            //    不能先抓 /post/ 链接，否则会误把帖子时间戳当成评论按钮。
            let commentBtn = Array.from(postRoot.querySelectorAll(
                'ytCommentActionButtonsRendererHostCommentButtonText a, ytm-comment-action-buttons-renderer ytm-button-renderer a[aria-label], .backstage-post-actions a[href*="/post/"]'
            )).find(el => isNotInComment(el) && el !== likeBtn && el !== dislikeBtn) || null;

            if (!commentBtn) {
                commentBtn = allButtons.find(b => {
                    if (b === likeBtn || b === dislikeBtn) return false;
                    if (b.closest('yt-post-header, ytPostHeader, .ytPostHeaderHost')) return false;
                    const label = (b.getAttribute('aria-label') || '').toLowerCase();
                    return label.includes('评论') || label.includes('comment') || label.includes('reply') ||
                        label.includes('コメント') || label.includes('回應');
                }) || null;
            }

            return { likeBtn, dislikeBtn, commentBtn };
        };

        const readButtonPressedState = (btn) => {
            if (!btn) return false;
            const aria = btn.getAttribute('aria-pressed');
            if (aria === 'true') return true;
            if (aria === 'false') return false;
            const parentAria = btn.closest('[aria-pressed]');
            if (parentAria) return parentAria.getAttribute('aria-pressed') === 'true';
            const toggleRenderer = btn.closest('ytm-toggle-button-renderer');
            if (toggleRenderer && toggleRenderer.data && typeof toggleRenderer.data.isToggled === 'boolean') {
                return toggleRenderer.data.isToggled;
            }
            if (btn.classList.contains('yt-spec-button-shape-next--filled')) return true;
            return false;
        };

        const extractLikeCountText = (likeBtn, postRoot) => {
            if (likeBtn) {
                const textEl = likeBtn.querySelector(
                    '.yt-spec-button-shape-next__button-text-content, .button-renderer-text, .yt-core-attributed-string'
                );
                if (textEl && textEl.textContent.trim()) {
                    return textEl.textContent.trim();
                }
                const directText = (likeBtn.textContent || '').trim();
                if (directText && !/^(赞|点赞|like)$/i.test(directText)) {
                    return directText;
                }
                const wrapper = likeBtn.closest('like-button-view-model, ytm-toggle-button-renderer, .backstage-post-actions');
                if (wrapper) {
                    const countSpan = wrapper.querySelector('.vote-count-middle, .like-count, #vote-count-middle');
                    if (countSpan && countSpan.textContent.trim()) {
                        return countSpan.textContent.trim();
                    }
                }
                const aria = likeBtn.getAttribute('aria-label') || '';
                const numMatch = aria.match(/(\d+(?:[.,]\d+)?\s*[万亿kKmM]?)/);
                if (numMatch && numMatch[1]) {
                    return numMatch[1].trim();
                }
            }
            const data = postRoot?.data;
            const runsText = data?.voteCount?.runs?.[0]?.text || data?.voteCount?.simpleText;
            if (runsText) return String(runsText).trim();
            return '';
        };

        const extractCommentCountText = (commentBtn) => {
            if (!commentBtn) return '';
            const textEl = commentBtn.querySelector(
                '.yt-spec-button-shape-next__button-text-content, .button-renderer-text, .yt-core-attributed-string'
            );
            const raw = (textEl ? textEl.textContent : commentBtn.textContent || '').trim();
            if (raw && !/^(评论|comments?)$/i.test(raw)) return raw;
            const aria = commentBtn.getAttribute('aria-label') || '';
            const numMatch = aria.match(/(\d+(?:[.,]\d+)?\s*[万亿kKmM]?)/);
            return numMatch ? numMatch[1].trim() : '';
        };

        const extractPostAuthorAndCaption = (postRoot) => {
            if (!postRoot) return { author: '', text: '' };
            let author = '';
            let text = '';

            const authorEl = postRoot.querySelector(
                '#author-text, .slim-owner-icon-and-title, .post-header a, ytm-backstage-post-renderer .channel-name'
            );
            if (authorEl && authorEl.textContent) {
                author = authorEl.textContent.trim().replace(/\s+/g, ' ');
            } else if (postRoot.data?.authorText) {
                author = postRoot.data.authorText.simpleText ||
                    (postRoot.data.authorText.runs || []).map(r => r.text).join('').trim();
            }

            const textEl = postRoot.querySelector(
                '.backstage-post-text, .post-content-text, .user-text, ytm-backstage-post-renderer ytm-attributed-string'
            );
            if (textEl && textEl.textContent) {
                text = textEl.textContent.trim();
            } else if (postRoot.data?.contentText) {
                text = postRoot.data.contentText.simpleText ||
                    (postRoot.data.contentText.runs || []).map(r => r.text).join('').trim();
            }

            return { author, text };
        };

        // 同步更新底部 HUD 的点赞、点踩、评论数与文案展示
        const syncPostHudState = (optimisticOverride = null) => {
            const activeItem = galleryItems[currentIndex];
            const postRoot = resolvePostContainer(activeItem);
            const { likeBtn, dislikeBtn, commentBtn } = extractPostInteractionDom(postRoot);

            let isLiked = readButtonPressedState(likeBtn);
            let isDisliked = readButtonPressedState(dislikeBtn);
            let likeCount = extractLikeCountText(likeBtn, postRoot);
            const commentCount = extractCommentCountText(commentBtn);

            if (optimisticOverride) {
                if (typeof optimisticOverride.isLiked === 'boolean') isLiked = optimisticOverride.isLiked;
                if (typeof optimisticOverride.isDisliked === 'boolean') isDisliked = optimisticOverride.isDisliked;
                if (typeof optimisticOverride.likeCount === 'string') likeCount = optimisticOverride.likeCount;
            }

            likeBtnPill.classList.toggle('liked', isLiked);
            setPillContent(likeBtnPill, isLiked ? ICONS.likeFilled : ICONS.likeOutline, likeCount || t.like);

            dislikeBtnPill.classList.toggle('disliked', isDisliked);
            setPillIcon(dislikeBtnPill, isDisliked ? ICONS.dislikeFilled : ICONS.dislikeOutline);

            setPillContent(commentBtnPill, ICONS.comment, commentCount || t.comments);
            commentBtnPill.style.display = commentBtn || postRoot ? 'inline-flex' : 'none';

            // 同步帖子文案与作者
            const { author, text } = extractPostAuthorAndCaption(postRoot);
            if (config.showCaption && (author || text)) {
                captionBox.style.display = 'block';
                captionBox.replaceChildren();
                if (author) {
                    const authorSpan = document.createElement('span');
                    authorSpan.className = 'yt-viewer-caption-author';
                    authorSpan.textContent = `@${author}`;
                    captionBox.appendChild(authorSpan);
                }
                const contentSpan = document.createElement('span');
                contentSpan.textContent = text || '';
                captionBox.appendChild(contentSpan);
            } else {
                captionBox.style.display = 'none';
                captionBox.classList.remove('expanded');
            }
        };

        // 辅助计算纯数字点赞数的乐观增减（如 "128" -> "129"）
        const adjustNumericCountString = (countStr, delta) => {
            if (!countStr) return delta > 0 ? '1' : '';
            const clean = countStr.replace(/,/g, '').trim();
            if (/^\d+$/.test(clean)) {
                const next = Math.max(0, parseInt(clean, 10) + delta);
                return next > 0 ? next.toLocaleString() : '';
            }
            return countStr;
        };

        // 触发原帖点赞 / 点踩
        const triggerPostVote = (type) => {
            const activeItem = galleryItems[currentIndex];
            const postRoot = resolvePostContainer(activeItem);
            const { likeBtn, dislikeBtn } = extractPostInteractionDom(postRoot);
            const targetBtn = type === 'like' ? likeBtn : dislikeBtn;

            if (!targetBtn) {
                showToast(t.noVote);
                return;
            }

            if (navigator.vibrate) {
                try { navigator.vibrate(20); } catch (e) {}
            }

            const wasLiked = readButtonPressedState(likeBtn);
            const wasDisliked = readButtonPressedState(dislikeBtn);
            const prevCount = extractLikeCountText(likeBtn, postRoot);

            let nextLiked = wasLiked;
            let nextDisliked = wasDisliked;
            let nextCount = prevCount;

            if (type === 'like') {
                nextLiked = !wasLiked;
                if (nextLiked && wasDisliked) nextDisliked = false;
                nextCount = adjustNumericCountString(prevCount, nextLiked ? 1 : -1);
            } else {
                nextDisliked = !wasDisliked;
                if (nextDisliked && wasLiked) {
                    nextLiked = false;
                    nextCount = adjustNumericCountString(prevCount, -1);
                }
            }

            // 1) 立即进行乐观 UI 渲染反馈
            syncPostHudState({
                isLiked: nextLiked,
                isDisliked: nextDisliked,
                likeCount: nextCount
            });

            // 2) 触发底层 YouTube 原生按钮点击以发起官方 InnerTube 请求
            targetBtn.click();

            // 3) 多阶段回读 DOM 真实状态
            actionSyncTimers.forEach(t => clearTimeout(t));
            actionSyncTimers = [90, 260, 650].map(delay =>
                setTimeout(() => {
                    if (!isViewerOpen) return;
                    const nowLiked = readButtonPressedState(likeBtn);
                    const nowDisliked = readButtonPressedState(dislikeBtn);
                    const domCount = extractLikeCountText(likeBtn, postRoot);
                    syncPostHudState({
                        isLiked: nowLiked,
                        isDisliked: nowDisliked,
                        likeCount: domCount === prevCount && nowLiked !== wasLiked ? nextCount : domCount
                    });
                }, delay)
            );
        };

        // 7. 下载引擎：在独立隐藏 iframe 内触发下载 + 顶层捕获拦截，杜绝 YouTube SPA 路由劫持跳转到 blob: 地址
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

                // 使用 application/octet-stream 强制移动端浏览器唤起下载器而非在标签页内预览图片
                const octetBlob = new Blob([rawBlob], { type: 'application/octet-stream' });
                const blobUrl = URL.createObjectURL(octetBlob);

                // 优先在隔离的隐藏 iframe 文档内触发下载，完全绕开 YouTube 主文档的路由监听器
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

                // 延长释放时间至 60 秒，确保移动端后台下载管理器有充足时间读取流
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                showToast(t.downloadStarted);
            } catch (err) {
                // 若跨域获取失败，通过 window.open 新标签页打开原图（避免被 YouTube <a> 路由接管当前页）
                window.open(highResUrl, '_blank', 'noopener,noreferrer');
            }
        };

        // 8. 顶栏与底栏事件隔离与绑定
        [topBar, bottomHud].forEach(bar => {
            ['touchstart', 'touchmove', 'touchend', 'click'].forEach(evt => {
                bar.addEventListener(evt, (e) => e.stopPropagation(), { passive: true });
            });
        });

        downloadBtn.addEventListener('click', () => triggerDownloadCurrent());

        likeBtnPill.addEventListener('click', () => triggerPostVote('like'));
        dislikeBtnPill.addEventListener('click', () => triggerPostVote('dislike'));

        commentBtnPill.addEventListener('click', () => {
            const activeItem = galleryItems[currentIndex];
            const postRoot = resolvePostContainer(activeItem);
            const { commentBtn } = extractPostInteractionDom(postRoot);
            closeViewerWithMorph();
            setTimeout(() => {
                if (commentBtn) {
                    commentBtn.click();
                } else if (postRoot) {
                    scrollPageVerticallyToElement(postRoot, 'center');
                }
            }, 240);
        });

        rotateBtnPill.addEventListener('click', () => {
            const activeImg = getActiveImg();
            if (!activeImg) return;
            rotation = (rotation + 90) % 360;
            scale = 1; posX = 0; posY = 0; lastPosX = 0; lastPosY = 0;
            applyImageTransform(activeImg, 0, 0, 1, true, false, rotation);
        });

        captionBox.addEventListener('click', () => {
            captionBox.classList.toggle('expanded');
        });

        crossPostBtn.addEventListener('click', () => {
            config.crossPost = !config.crossPost;
            crossPostBtn.classList.toggle('active', config.crossPost);
            saveConfig();
            showToast(config.crossPost ? t.crossOn : t.crossOff);

            const currentActiveEl = galleryItems[currentIndex]?.el || originClickedEl;
            if (currentActiveEl) {
                const { items, clickedIndex } = extractGalleryItems(currentActiveEl);
                rebuildTrackAndThumbs(items, clickedIndex, true);
            }
        });

        galleryToggleBtn.addEventListener('click', () => {
            config.showGalleryBar = !config.showGalleryBar;
            galleryToggleBtn.classList.toggle('active', config.showGalleryBar);
            saveConfig();
            updateThumbStripVisibility();
            showToast(config.showGalleryBar ? t.galleryOn : t.galleryOff);
        });

        // 9. 矩阵变换、平移边界约束与 UI 状态更新
        const clampPanOffsets = (x, y, s) => {
            if (s <= 1.02) return { x: 0, y: 0 };
            const vw = getVw();
            const vh = getVh();
            const maxX = ((s - 1) * vw) / 2;
            const maxY = ((s - 1) * vh) / 2;
            return {
                x: Math.min(maxX, Math.max(-maxX, x)),
                y: Math.min(maxY, Math.max(-maxY, y))
            };
        };

        const applyTrackTransform = (dx = 0, withTransition = false) => {
            const vw = getVw();
            sliderTrack.style.transition = withTransition
                ? 'transform 0.22s cubic-bezier(0.18, 0.89, 0.32, 1)'
                : 'none';
            trackOffsetX = -currentIndex * vw + dx;
            sliderTrack.style.transform = `translate3d(${trackOffsetX}px, 0, 0)`;
        };

        const applyImageTransform = (imgEl, x, y, s, withTransition = false, fadeOut = false, customRot = rotation) => {
            if (!imgEl) return;
            if (withTransition) {
                imgEl.style.transition = fadeOut
                    ? 'transform 0.22s cubic-bezier(0.2, 0.85, 0.3, 1), opacity 0.18s ease 0.03s'
                    : 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.15s ease';
            } else {
                imgEl.style.transition = 'none';
            }
            imgEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s}) rotate(${customRot}deg)`;
            imgEl.style.opacity = fadeOut ? '0' : '1';
        };

        const setBackdropOpacity = (val, withTransition = false) => {
            backdrop.style.transition = withTransition
                ? 'opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1)'
                : 'none';
            backdrop.style.opacity = String(Math.max(0, Math.min(1, val)));
        };

        const setHudVisible = (visible) => {
            // 淡出时延迟 0.18s 再隐藏 visibility，确保过渡动画完整；
            // 淡入时 visibility 立即生效，避免 UI 延迟 0.18s 才可点击
            const trans = visible
                ? 'opacity 0.18s ease, visibility 0s linear 0s'
                : 'opacity 0.18s ease, visibility 0s linear 0.18s';
            topBar.style.transition = trans;
            bottomHud.style.transition = trans;
            topBar.style.opacity = visible ? '1' : '0';
            topBar.style.pointerEvents = visible ? 'auto' : 'none';
            topBar.style.visibility = visible ? 'visible' : 'hidden';
            bottomHud.style.opacity = visible ? '1' : '0';
            bottomHud.style.visibility = visible ? 'visible' : 'hidden';
            if (!visible) {
                thumbStrip.style.display = 'none';
            } else {
                updateThumbStripVisibility();
            }
        };

        // 沉浸看图模式切换：隐藏全部 HUD，仅留主图；再次调用即恢复
        const setImmersiveMode = (on) => {
            if (!isViewerOpen || isClosing || isImmersive === on) return;
            isImmersive = on;
            setHudVisible(!on);
        };

        const updateThumbStripVisibility = () => {
            const shouldShow = isViewerOpen && !isClosing && config.showGalleryBar && galleryItems.length > 1;
            thumbStrip.style.display = shouldShow ? 'flex' : 'none';
        };

        // 10. 构建单个主图节点与缩略图节点
        // 丝滑零闪变设计：
        // 1) 首屏点击图直接克隆已解码的 DOM <img> 节点（共享浏览器底层已解码位图内存），并保持与信息流完全一致的 src，杜绝首帧解码闪烁与长宽比跳变；
        // 2) 远端非可视图片采用异步解码，避免多图挂载阻塞开场 FLIP 动画主线程。
        const mountSingleSlideAndThumb = (item, idx) => {
            const vw = getVw();

            // 1) 主图轨道节点
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

            let img;
            if (idx === currentIndex && item.el && item.el.tagName === 'IMG') {
                // 直接浅克隆原页面已解码完成的 <img> 节点，零重解码延迟
                img = item.el.cloneNode(false);
                img.removeAttribute('class');
                img.removeAttribute('id');
                img.removeAttribute('width');
                img.removeAttribute('height');
                img.removeAttribute('style');
                img.src = item.src;
                img.decoding = 'sync';
                img.loading = 'eager';
            } else {
                img = document.createElement('img');
                img.src = item.src;
                const isNearby = Math.abs(idx - currentIndex) <= 1;
                img.decoding = isNearby ? 'sync' : 'async';
                img.loading = isNearby ? 'eager' : 'lazy';
            }

            Object.assign(img.style, {
                width: 'auto',
                height: 'auto',
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

            // 2) 底部缩略图节点
            const thumb = document.createElement('img');
            thumb.src = item.src;
            thumb.decoding = 'async';
            thumb.loading = 'lazy';
            Object.assign(thumb.style, {
                width: '40px',
                height: '40px',
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
                scale = 1; posX = 0; posY = 0; rotation = 0;
                applyImageTransform(prevImg, 0, 0, 1, false, false, 0);

                currentIndex = idx;
                applyTrackTransform(0, true);
                syncActiveSlideState(false);
            });

            item.thumbEl = thumb;
            thumbStrip.appendChild(thumb);
        };

        // 11. 增量扫描与自动触底加载更多帖子引擎
        const collectPostImagesFromRoot = (postRoot, callback) => {
            const imageRenderers = postRoot.querySelectorAll('ytm-backstage-image-renderer, .post-image-container');
            imageRenderers.forEach(renderer => {
                const img = renderer.querySelector('img');
                let src = img ? (img.currentSrc || img.src || img.getAttribute('src') || img.dataset?.src) : '';
                if (!src && renderer.data?.image?.thumbnails?.length) {
                    const thumbs = renderer.data.image.thumbnails;
                    src = thumbs[thumbs.length - 1].url;
                }
                if (src) callback(src, img || renderer, postRoot);
            });

            const allImgs = postRoot.querySelectorAll('img');
            allImgs.forEach(img => {
                const isAvatar = img.closest(
                    'ytm-profile-icon, .channel-thumbnail, #author-thumbnail, .slim-owner-icon-and-title, .post-header, ytm-comment-renderer, ytm-comment-thread-renderer'
                );
                if (isAvatar) return;
                const src = img.currentSrc || img.src || img.getAttribute('src') || img.dataset?.src;
                if (src && (src.includes('ggpht.com') || src.includes('googleusercontent.com'))) {
                    callback(src, img, postRoot);
                }
            });
        };

        const appendNewDiscoveredItems = () => {
            if (!isViewerOpen || isClosing || !config.crossPost) return 0;

            const roots = Array.from(document.querySelectorAll(
                'ytm-backstage-post-renderer, ytm-post-multi-image-renderer, ytm-shared-post-renderer'
            ));

            let addedCount = 0;

            const tryAdd = (src, el, postEl) => {
                const key = getCanonicalImgKey(src);
                if (!key || seenKeys.has(key)) return;
                seenKeys.add(key);
                const newItem = { src, key, el: el || postEl, postEl, slideImg: null, thumbEl: null };
                const newIdx = galleryItems.length;
                galleryItems.push(newItem);
                mountSingleSlideAndThumb(newItem, newIdx);
                addedCount++;
            };

            roots.forEach(postRoot => {
                collectPostImagesFromRoot(postRoot, tryAdd);
            });

            if (addedCount > 0) {
                const vw = getVw();
                sliderTrack.style.width = `${galleryItems.length * vw}px`;
                counter.textContent = `${currentIndex + 1} / ${galleryItems.length}`;
                updateThumbStripVisibility();
            }

            return addedCount;
        };

        // 触发底层网页向下滚动以唤醒 YouTube 无限加载
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

        // 启动/停止底层 DOM 变动观察器
        const startDomObserver = () => {
            stopDomObserver();
            domObserver = new MutationObserver(() => {
                if (!isViewerOpen || isClosing || !config.crossPost) return;
                clearTimeout(observerDebounceTimer);
                observerDebounceTimer = setTimeout(() => {
                    appendNewDiscoveredItems();
                }, 140);
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

        // 12. 同步当前选中图片状态与刷新帖子互动栏
        // 注意：isInitialOpen 为 true 时严禁触发任何底层页面滚动或提前触底加载，防止点开瞬间底层页面跳动与 FLIP 坐标偏移！
        const syncActiveSlideState = (isInitialOpen = false) => {
            counter.textContent = `${currentIndex + 1} / ${galleryItems.length}`;
            captionBox.classList.remove('expanded');

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
                        behavior: isInitialOpen ? 'instant' : 'smooth'
                    });
                }
            });

            // 同步当前帖子的点赞/点赞数/点踩/评论与文案
            syncPostHudState();

            // 仅在已经进入画廊后横滑切换图片时，才同步底层页面位置或触发触底加载
            if (!isInitialOpen) {
                if (config.crossPost && currentIndex >= Math.max(0, galleryItems.length - 2)) {
                    triggerUnderlyingInfiniteScroll();
                } else {
                    const activeItem = galleryItems[currentIndex];
                    const anchor = activeItem?.el || activeItem?.postEl;
                    if (anchor) {
                        const rect = anchor.getBoundingClientRect();
                        const vh = getVh();
                        if (rect.bottom < 40 || rect.top > vh - 40) {
                            scrollPageVerticallyToElement(anchor, 'center');
                        }
                    }
                }
            }
        };

        const rebuildTrackAndThumbs = (items, activeIdx, isInitialOpen = false) => {
            galleryItems = items;
            currentIndex = activeIdx;
            seenKeys = new Set(items.map(i => i.key));
            const vw = getVw();

            sliderTrack.replaceChildren();
            thumbStrip.replaceChildren();
            sliderTrack.style.width = `${items.length * vw}px`;

            items.forEach((item, idx) => {
                mountSingleSlideAndThumb(item, idx);
            });

            applyTrackTransform(0, false);
            updateThumbStripVisibility();
            syncActiveSlideState(isInitialOpen);
        };

        // 13. 计算 FLIP 原图几何变换矩阵
        const computeMorphDelta = (item, fallbackRect = null) => {
            const vw = getVw();
            const vh = getVh();
            let rect = fallbackRect;

            if (!rect || rect.width === 0 || rect.height === 0) {
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
                rect = targetEl.getBoundingClientRect();
            }

            if (!rect || rect.width === 0 || rect.height === 0) return { dx: 0, dy: 0, s: 0.45 };

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
            const s = Math.min(0.95, Math.max(0.15, Math.min(scaleX, scaleY)));

            return { dx, dy, s };
        };

        // 14. 打开与丝滑缩回原图
        const openViewer = (items, startIndex, clickedEl) => {
            if (isViewerOpen || items.length === 0) return;
            isViewerOpen = true;
            isClosing = false;
            isFetchingMore = false;
            closingFromPopState = false;
            originClickedEl = clickedEl;
            isImmersive = false;

            // 在任何 DOM 变动前先锁死原图在视口中的精确几何坐标
            const initialClickedRect = clickedEl ? clickedEl.getBoundingClientRect() : null;

            scale = 1; lastScale = 1;
            posX = 0; posY = 0; lastPosX = 0; lastPosY = 0;
            rotation = 0;
            overlay.scrollLeft = 0;
            overlay.scrollTop = 0;

            // 推入轻量历史栈状态，使手机边缘返回手势仅关闭看图器而不退出社区页面
            try {
                history.pushState({ ytImgViewer: true }, '');
                hasPushedHistory = true;
            } catch (e) {
                hasPushedHistory = false;
            }

            rebuildTrackAndThumbs(items, startIndex, true);
            startDomObserver();

            const activeItem = galleryItems[currentIndex];
            const activeImg = activeItem?.slideImg;
            const { dx, dy, s } = computeMorphDelta(activeItem, initialClickedRect);

            // 第一步：无过渡设置初始缩略图位置与透明背景
            applyImageTransform(activeImg, dx, dy, s, false, false, 0);
            setBackdropOpacity(0, false);

            overlay.style.visibility = 'visible';
            overlay.style.pointerEvents = 'auto';

            // 强制浏览器同步提交初始帧布局（Reflow Commit），彻底杜绝首帧动画被合并导致的瞬移闪变
            if (activeImg) {
                void activeImg.offsetWidth;
            }

            // 第二步：下一合成帧启动丝滑展开过渡
            requestAnimationFrame(() => {
                if (!isViewerOpen || isClosing) return;
                applyImageTransform(activeImg, 0, 0, 1, true, false, 0);
                setBackdropOpacity(0.96, true);
                setHudVisible(true);
            });
        };

        const closeViewerWithMorph = () => {
            if (!isViewerOpen || isClosing) return;
            isClosing = true;
            isImmersive = false;
            clearTimeout(singleTapTimer);
            clearTimeout(longPressTimer);
            actionSyncTimers.forEach(t => clearTimeout(t));
            stopDomObserver();

            if (hasPushedHistory && !closingFromPopState) {
                hasPushedHistory = false;
                try { history.back(); } catch (e) {}
            }

            setHudVisible(false);

            const activeItem = galleryItems[currentIndex];
            const anchor = activeItem?.el || activeItem?.postEl;
            if (anchor) {
                const r = anchor.getBoundingClientRect();
                const vh = getVh();
                if (r.bottom < 40 || r.top > vh - 40) {
                    scrollPageVerticallyToElement(anchor, 'center');
                }
            }

            const { dx, dy, s } = computeMorphDelta(activeItem);
            const finalScale = scale < 0.98 ? Math.min(s, scale * 0.9) : s;

            applyImageTransform(activeItem?.slideImg, dx, dy, finalScale, true, true, 0);
            setBackdropOpacity(0, true);

            setTimeout(() => {
                overlay.style.visibility = 'hidden';
                overlay.style.pointerEvents = 'none';
                sliderTrack.replaceChildren();
                thumbStrip.replaceChildren();
                galleryItems = [];
                seenKeys.clear();
                isViewerOpen = false;
                isClosing = false;
                isFetchingMore = false;
                closingFromPopState = false;
                scale = 1; posX = 0; posY = 0; rotation = 0;
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

        // 15. 触控手势引擎（支持双指中心点跟随缩放、双击指哪放哪 + 再次双击丝滑还原、平移边界回弹、横滑切图、竖滑退出、单击循环切换沉浸）
        const getDistance = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const getMidpoint = (t1, t2) => ({
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2
        });

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
                const mid = getMidpoint(e.touches[0], e.touches[1]);
                pinchMidX = mid.x;
                pinchMidY = mid.y;
                lastScale = scale;
                lastPosX = posX;
                lastPosY = posY;
            } else if (e.touches.length === 1) {
                // 注意：单指按下时初始必须保持 gestureMode = 'none'，绝不能在 touchstart 直接设为 'pan'，
                // 否则放大状态下双击（未发生位移）会在 touchend 被当成 pan 提前拦截，导致无法双击还原！
                gestureMode = 'none';
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
                const mid = getMidpoint(e.touches[0], e.touches[1]);
                const newScale = Math.min(Math.max(0.75, lastScale * (dist / Math.max(1, initialPinchDist))), 5);

                const vw = getVw();
                const vh = getVh();
                const focalX = pinchMidX - vw / 2;
                const focalY = pinchMidY - vh / 2;
                const scaleRatio = newScale / Math.max(0.1, lastScale);

                posX = (mid.x - pinchMidX) + focalX - (focalX - lastPosX) * scaleRatio;
                posY = (mid.y - pinchMidY) + focalY - (focalY - lastPosY) * scaleRatio;
                scale = newScale;

                applyImageTransform(activeImg, posX, posY, scale, false, false);
                return;
            }

            if (e.touches.length === 1 && gestureMode !== 'pinch') {
                const curX = e.touches[0].clientX;
                const curY = e.touches[0].clientY;
                const dx = curX - startX;
                const dy = curY - startY;
                const moveDist = Math.hypot(dx, dy);

                if (moveDist > 7) {
                    clearTimeout(longPressTimer);
                }

                const now = performance.now();
                const dt = now - lastMoveTime;
                if (dt > 4) {
                    velocityX = (curX - lastMoveX) / dt;
                    lastMoveX = curX;
                    lastMoveTime = now;
                }

                // 留出 8px 防抖容差，防止手机屏幕快速双击时拇指微小抖动被误判为拖拽
                if (!hasMoved && moveDist > 8) {
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
                    if (scale <= 1.02) {
                        scale = 1; posX = 0; posY = 0;
                    } else {
                        const clamped = clampPanOffsets(posX, posY, scale);
                        posX = clamped.x;
                        posY = clamped.y;
                    }
                    applyImageTransform(activeImg, posX, posY, scale, true, false);
                }
                return;
            }

            if (e.touches.length > 0) return;

            if (gestureMode === 'pan' && hasMoved) {
                gestureMode = 'none';
                const clamped = clampPanOffsets(posX, posY, scale);
                posX = clamped.x;
                posY = clamped.y;
                applyImageTransform(activeImg, posX, posY, scale, true, false);
                return;
            }

            if (gestureMode === 'horizontal-gallery') {
                const vw = getVw();
                const movedX = trackOffsetX - (-currentIndex * vw);
                const distThreshold = vw * 0.09;
                const isFastFlickLeft = velocityX < -0.22 && movedX < -12;
                const isFastFlickRight = velocityX > 0.22 && movedX > 12;

                const prevIdx = currentIndex;
                if ((movedX < -distThreshold || isFastFlickLeft) && currentIndex < galleryItems.length - 1) {
                    currentIndex++;
                } else if ((movedX > distThreshold || isFastFlickRight) && currentIndex > 0) {
                    currentIndex--;
                } else if ((movedX < -distThreshold || isFastFlickLeft) && currentIndex === galleryItems.length - 1 && config.crossPost) {
                    triggerUnderlyingInfiniteScroll();
                }

                if (currentIndex !== prevIdx) {
                    const prevSlideImg = galleryItems[prevIdx]?.slideImg;
                    scale = 1; posX = 0; posY = 0; rotation = 0;
                    applyImageTransform(prevSlideImg, 0, 0, 1, false, false, 0);
                }

                applyTrackTransform(0, true);
                syncActiveSlideState(false);
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
                    setHudVisible(!isImmersive);
                }
                return;
            }

            gestureMode = 'none';

            // 单击：在「普通看图」与「沉浸看图」之间循环切换；退出查看器请使用手机系统侧滑返回
            if (!hasMoved) {
                const now = Date.now();
                const tapDist = Math.hypot(startX - lastTapX, startY - lastTapY);
                if (now - lastTapTime < 280 && tapDist < 55) {
                    clearTimeout(singleTapTimer);
                    lastTapTime = 0;
                    if (scale > 1.05 || rotation !== 0) {
                        // 已处于放大或旋转状态 -> 双击直接丝滑还原默认视图
                        scale = 1; lastScale = 1;
                        posX = 0; posY = 0; lastPosX = 0; lastPosY = 0;
                        rotation = 0;
                    } else {
                        // 默认状态 -> 以双击坐标为焦点放大 2.5 倍
                        const targetScale = 2.5;
                        const vw = getVw();
                        const vh = getVh();
                        const tapOffsetX = startX - vw / 2;
                        const tapOffsetY = startY - vh / 2;
                        const rawX = -tapOffsetX * (targetScale - 1);
                        const rawY = -tapOffsetY * (targetScale - 1);
                        const clamped = clampPanOffsets(rawX, rawY, targetScale);
                        scale = targetScale;
                        lastScale = targetScale;
                        posX = clamped.x;
                        posY = clamped.y;
                        lastPosX = posX;
                        lastPosY = posY;
                    }
                    applyImageTransform(activeImg, posX, posY, scale, true, false);
                } else {
                    lastTapTime = now;
                    lastTapX = startX;
                    lastTapY = startY;
                    singleTapTimer = setTimeout(() => {
                        // 单击循环切换沉浸模式
                        if (isImmersive) {
                            setImmersiveMode(false);
                            showToast(t.immersiveOff, 900);
                        } else {
                            setImmersiveMode(true);
                            showToast(t.immersiveOn, 900);
                        }
                    }, 260);
                }
            }
        });

        // 16. 初始扫描图片队列
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
            const targetKey = getCanonicalImgKey(targetSrc);
            const items = [];
            const localSeen = new Set();
            let clickedIndex = 0;

            const addCandidate = (src, el, postEl) => {
                const key = getCanonicalImgKey(src);
                if (!key || localSeen.has(key)) return;
                localSeen.add(key);
                if (el === targetImg || src === targetSrc || key === targetKey) {
                    clickedIndex = items.length;
                }
                items.push({
                    src,
                    key,
                    el: el || targetImg,
                    postEl: postEl || singlePostRoot,
                    slideImg: null,
                    thumbEl: null
                });
            };

            roots.forEach(postRoot => {
                collectPostImagesFromRoot(postRoot, addCandidate);
            });

            if (items.length === 0 && targetSrc) {
                addCandidate(targetSrc, targetImg, singlePostRoot);
            }

            return { items, clickedIndex };
        };

        // 17. 全局捕获点击
        document.addEventListener('click', (e) => {
            if (isViewerOpen) return;

            const target = e.target;
            if (!target || target.tagName !== 'IMG') return;

            const isAvatar = target.closest(
                'ytm-profile-icon, .channel-thumbnail, #author-thumbnail, .slim-owner-icon-and-title, .post-header, ytm-comment-renderer, ytm-comment-thread-renderer'
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