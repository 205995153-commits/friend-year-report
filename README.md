# 好友年报 · Friend Year Report

把两个人的聊天记录变成一份有温度的「年度报告」：谁更话痨、几点最活跃、高频关键词、亲密瞬间、年度称号，一键生成分享海报。

> 🔒 所有分析都在**本地**完成（浏览器 / 手机端），聊天内容不会上传到任何服务器。

## 在线体验

网页版已部署到 GitHub Pages：**<https://205995153-commits.github.io/friend-year-report/>**

没有聊天记录？打开后点「🎲 用演示数据试试」，内置 45 天 × 780 条示例数据。

## 项目组成

| 目录 | 说明 |
| --- | --- |
| [`web/`](web/) | **网页版**（单文件 `index.html`，纯前端零依赖，任何人打开就能用） |
| [`friend-year-report/`](friend-year-report/) | **微信小程序版**源码（原生开发，与网页版共用同一套分析引擎） |
| [`scripts/`](scripts/) | 构建脚本（见下） |

两版共用 [`friend-year-report/utils/analyzer.js`](friend-year-report/utils/analyzer.js) 分析引擎，结果完全一致。

## 功能

- 📂 导入聊天记录：微信电脑版导出的 JSON / TXT，自动识别双方身份
- 📝 手填问答：没有聊天记录也能生成趣味版报告
- 📊 七页报告：数字总览 / 24 小时活跃图 / 高频词 / 亲密瞬间 / 年度称号 / 总评语
- 🎁 Canvas 分享海报：一键生成并下载 640×1000 海报

## 聊天记录格式

- **JSON**：微信电脑版导出（`create_time` / `sender_id` / `text` 字段）或任意 `[{text, sender, time}]` 数组
- **TXT**：微信导出 TXT（`———— 2026-10-24 ————` 日期行 + `01:02 昵称：内容`）

导出方法：微信电脑版 → 好友聊天窗口 → 右上角「···」→ 聊天记录 → 导出。

## 部署网页版

网页版就是一个 HTML 文件，托管到任何静态空间即可：

- **GitHub Pages**：Settings → Pages → Source 选 `main` 分支、目录 `/web` → 获得 `https://用户名.github.io/仓库名/`
- **Vercel / Netlify**：把 `web/` 目录拖进去即可
- **本地**：直接双击打开 `web/index.html`

## 微信小程序

小程序源码见 [`friend-year-report/`](friend-year-report/)，导入微信开发者工具即可运行；发布流程见 [friend-year-report/README.md](friend-year-report/README.md) 的「发布流程」一节。

## 本地构建

```bash
# 修改 web/index.template.html 或分析引擎后，重新生成网页版：
python3 scripts/build_web.py

# （可选）对某份聊天记录生成 HTML 预览 + 海报 PNG（macOS）：
python3 scripts/build_demo.py 聊天记录.json --me 我的昵称 --friend TA的昵称
```

分析引擎是单一来源：改 [`friend-year-report/utils/analyzer.js`](friend-year-report/utils/analyzer.js) 会同时作用于网页版与小程序版。

## 隐私

- 不采集、不上传、不存储任何聊天内容
- 网页版无任何外部请求，完全离线可用
- 聊天记录需要用户**主动导入**（微信官方不开放聊天记录读取 API，这是唯一合规方案）

## License

[MIT](LICENSE)
