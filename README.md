# YouTube 移动网页版社区图片全屏查看器

YouTube 移动网页版 (`m.youtube.com`) 的社区帖图片点开后体验很粗糙：不能缩放、没有画廊、下载会被 SPA 路由劫持。这个油猴脚本把社区帖图片升级成完整的移动端相册查看器。

- 安装（Greasy Fork）：发布后补充链接
- 直接装（GitHub）：https://raw.githubusercontent.com/devycx/yt-community-image-viewer/main/yt-community-image-viewer.user.js
- 适用范围：`m.youtube.com`（移动浏览器 + 油猴），桌面浏览器也可用
- 版本：4.3.0

## 手势操作

| 手势 | 效果 |
| --- | --- |
| 单击 | 丝滑缩回原图位置并关闭（FLIP 动画） |
| 双击 | 放大 2.5 倍 / 复位，带缓动 |
| 双指捏合 | 0.75x – 5x 缩放，可单指平移 |
| 单指横向滑动 | 切换图片；贴边时的阻尼回弹 |
| 单指纵向滑动 | 跟手缩小 + 背景变暗，超过阈值即关闭 |
| 长按 450ms | 震动反馈并保存当前图片的无损原图 |
| 快速甩动 | 依速度判定翻页，不用滑到一半 |

## 核心功能

- **跨帖无限连播**：滑到最后一张附近会自动驱动底层页面继续无限加载，新帖子的图片增量追加进画廊；顶栏「跨帖」开关可切换为仅浏览当前帖。偏好存 localStorage，下次自动恢复。
- **底部缩略图轨**：当前图片高亮并自动居中滚动，点击任意缩略图直达；「画廊」开关可隐藏。
- **无损原图下载**：`ggpht/googleusercontent` 地址自动重写到 `=s0` 拿最大分辨率。

## 下载防跳转（v4.3 重点修复）

YouTube (Polymer/c3) 的全局路由会劫持带 `download` 属性或 `blob:` 地址的 `<a>` 点击，把页面跳到 blob 地址后无法返回。三层修复：

1. `run-at document-start` 就注册顶层捕获监听器，抢在 YouTube 路由之前 `stopImmediatePropagation`，且故意不 `preventDefault`，保留浏览器原生下载行为。
2. 下载在专用隐藏 iframe 的独立文档里触发，主文档路由监听器完全接触不到。
3. Blob 以 `application/octet-stream` 提供，避免移动端浏览器在标签页内预览而不是下载。

跨域取图失败时兜底 `window.open` 新标签页，绝不劫持当前页地址。

## 技术要点

- 常驻 GPU 合成层（`translate3d` + `will-change` + `backface-visibility`），横滑/缩放全程不掉帧；overlay 自带 scroll 归零兜底，杜绝左滑露底。
- FLIP 原图几何计算：打开时从缩略图位置平滑放大，关闭时若原图已滚出视口，先把底层页面锚定回帖子所在位置，再缩回去，动画永远"缩向你点的那张图"。
- 图片按 `ggpht.com`/`googleusercontent.com` 域名收集，头像、评论区图片一律排除。
- 顶栏/底栏事件隔离，触摸操作不会穿透或误触发底层页面。

## 已知边界

- 依赖 YouTube 当前的移动端 DOM 结构（`ytm-backstage-post-renderer` 等自定义元素），YouTube 改版可能需要更新选择器。
- `@grant none`：下载走页面级 `fetch`，若 YouTube 调整图片域头的 CORS 策略，下载会走新标签页兜底，仍不会劫持页面。

MIT License，详见 [LICENSE](LICENSE)。
