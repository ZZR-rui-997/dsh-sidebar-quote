# Asset licenses（素材权利声明）

本插件（`dsh-sidebar-quote`）的**代码**以 MIT 许可发布（见根目录 LICENSE）。
图形素材的权利**独立于代码许可**，逐项声明如下。

## 1. `icon.svg` — 插件卡片图标（原创，MIT）

手写 SVG（简笔蓝鲸 + 浅蓝圆角底），由本仓库作者原创绘制，
随代码一同以 MIT 许可分发。

## 1b. `icon.png` / `avatar.png` / `icon-avatar.png` — 位图图标与鲸鱼按钮头像（AI 二创，CC BY-NC-SA 4.0）

- 形象来源：社区为 DeepSeek Harness 创作的"鲸鱼女仆"非官方同人形象
  （俗称"大肥鱼"）。该同人形象是 DeepSeek 鲸标的非官方二创；
  **DeepSeek 名称与鲸标商标归 DeepSeek（深度求索）所有**，本项目与其无隶属或背书关系。
- `icon.png`、`avatar.png`、`icon-avatar.png` 是**同一张 128px 图**（客户端内嵌
  `AVATAR_DATA_URL` 的源文件）：以一张社区流传的鲸鱼女仆参考图（原始画师不详）为输入，
  经 AI 图像编辑模型二次创作生成（新增比 V 手势与构图调整），
  再经裁切、羽化圆形遮罩与缩放处理。
- `icon.png` 因此**不是原创素材**：包内代码/手写 SVG 的 MIT 许可不覆盖这三个位图。
  这三个位图按 **CC BY-NC-SA 4.0** 处理（与同类社区插件的既有声明一致）：
  - BY — 分发时须保留本声明与来源说明；
  - NC — 不得将本头像单独用于商业用途（插件代码的 MIT 不延伸覆盖它）；
  - SA — 基于本头像的二次创作须以相同许可共享。
- 本仓库**不主张**对该底层角色设计拥有任何权利；原始参考图不随本包分发。

## 3. `preview.svg` — 详情页预览图（原创，MIT）

手写 SVG 示意图（文档选区 → 引用按钮 → 输入框），随代码以 MIT 分发。

## 权利一览

| 文件 | 类型 | 许可 |
| --- | --- | --- |
| `index.js` / `client.js` 等代码 | 原创代码 | MIT |
| `icon.svg` | 原创手绘 SVG | MIT |
| `icon.png` / `avatar.png` / `icon-avatar.png` | 社区同人形象的 AI 二创 | CC BY-NC-SA 4.0 |
| `preview.svg` | 原创手绘 SVG | MIT |

---

若你是上述同人形象的作者且希望更改这份声明的许可或署名方式，
请提 issue，我们会尽快配合调整。
