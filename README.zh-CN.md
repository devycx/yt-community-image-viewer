# YouTube 移动版社区图片全屏查看器

`m.youtube.com` 的社区帖图片点开就是一张孤零零的图：不能缩放、没有画廊、想存原图还会被 YouTube 的 SPA 路由劫持到 `blob:` 地址回不来。这个脚本把它补成一个完整的移动端相册。

[English](README.md) | **简体中文**

- 安装：[Greasy Fork](https://greasyfork.org/zh-CN/scripts/605153)
- 源码：[GitHub](https://github.com/devycx/yt-community-image-viewer) · [直接安装 .user.js](https://raw.githubusercontent.com/devycx/yt-community-image-viewer/main/yt-community-image-viewer.user.js)
- 适用范围：`*://m.youtube.com/*`
- 版本：4.4.1

## 手势

| 手势 | 行为 |
| --- | --- |
| 单击 | 250ms 内没有第二次点击，缩回原图位置并关闭（FLIP 动画） |
| 双击 | 在 1x 和 2.5x 之间切换，带缓动 |
| 双指捏合 | 0.75x – 5x 缩放，松手后小于 1x 会回弹到 1x |
| 放大后单指拖动 | 平移图片，不触发翻页 |
| 单指横滑 | 切换图片；第一张/最后一张有阻尼；甩动速度超过 0.22 px/ms 也算翻页 |
| 单指纵滑 | 图片跟手缩小、背景变暗，超过 55px 松手即关闭 |
| 长按 450ms | 震动反馈并保存原图 |
| 点缩略图 | 直接跳到对应图片，缩略图轨自动居中 |

## 核心功能

- **跨帖无限连播**：默认把页面上所有社区帖的图片收进同一个画廊。滑到倒数第二张时开始驱动底层页面滚到 `ytm-continuation-item-renderer`，触发 YouTube 自己的无限加载；新帖图片由 `MutationObserver` 增量追加，不重建已有节点。
- **底部缩略图轨**：当前图片高亮并自动滚到中间；顶栏「画廊」开关可隐藏。
- **原图下载**：`ggpht` / `googleusercontent` 的地址重写成 `=s0` 拿最大分辨率，长按或点顶栏「⬇ 原图」都能存。
- **偏好持久化**：「跨帖」「画廊」两个开关存在 `localStorage` 的 `yt_mobile_img_viewer_cfg_v4` 里，刷新后恢复。

## 下载防跳转（v4.3）

YouTube 的全局点击路由会接管带 `download` 属性或 `blob:` 地址的 `<a>`，把当前页跳到 blob 地址，之后后退也回不到帖子。修复分三层：

1. **document-start 顶层捕获**：脚本在 YouTube 路由之前注册 `click` 捕获监听，命中下载链接就 `stopPropagation` + `stopImmediatePropagation`，但**不调用** `preventDefault`，保留浏览器原生下载。
2. **隐藏 iframe 里触发**：下载用的 `<a>` 建在专用 `iframe` 的文档里，主文档的路由监听器根本接触不到这个节点。
3. **octet-stream 包一层**：拿到的图片 blob 重新包成 `application/octet-stream`，避免移动端浏览器把 blob 当图片在当前标签页预览而不是下载。

跨域 `fetch` 失败时退回 `window.open` 新标签页打开原图，不会劫持当前页。

## 实现要点

- **FLIP 几何**：打开时按被点缩略图与全屏渲染尺寸算出 `dx / dy / scale`，先把大图放到缩略图位置再动画到中心；关闭时如果原图已滚出视口，先把底层页面滚回帖子位置，再缩回去。
- **手势状态机**：`pinch` / `pan` / `horizontal-gallery` / `vertical-dismiss` 四种模式，按首次移动的方向和当前缩放决定，避免横滑翻页和纵滑关闭打架。
- **合成层**：轨道和图片常驻 `translate3d`、`will-change`、`backface-visibility: hidden`，动画期间不触发布局。
- **事件隔离**：顶栏和缩略图轨上的触摸事件全部 `stopPropagation`，不会穿透到手势层或底层页面。
- **DOM 依赖**：只认 `ytm-backstage-post-renderer`、`ytm-backstage-image-renderer`、`.post-image-container` 这些 YouTube 移动端自定义元素；头像、评论区图片通过 `closest()` 排除。

## 已知边界

- 只匹配 `m.youtube.com`，桌面版 `www.youtube.com` 不生效。
- 依赖 YouTube 当前的移动端 DOM 结构和自定义元素名，改版可能需要更新选择器。
- 跨帖连播会滚动底层页面来触发加载，这是有意的；关掉「跨帖」后就只浏览当前帖子。
- 超长会话里画廊节点只增不减（关闭时清空），一次浏览几百张图会占用更多内存。
- `@grant none`，下载走页面级 `fetch`。YouTube 调整图片域 CORS 策略时会走新标签页兜底。

## License

MIT，见 [LICENSE](LICENSE)。
