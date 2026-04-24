# 配置驱动的个人主页系统

一个简单易用的个人主页系统，通过 Markdown 文件和 JSON 配置来管理网站内容，无需编写 HTML 代码。

## ✨ 特性

- 📝 **Markdown 驱动** - 用 Markdown 编写所有内容
- 📁 **文件夹组织** - 用文件夹结构管理页面层级
- ⚙️ **JSON 配置** - 一个配置文件控制整个网站
- 🎨 **主题切换** - 支持亮色/暗色主题
- 🔍 **全站搜索** - 快速搜索所有内容
- 📱 **响应式设计** - 完美适配各种设备
- 🖼️ **多种展示模式** - 卡片、时间线、画廊、树形结构

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/yourusername/your-repo.git
cd your-repo
```

### 2. 修改配置

编辑 `site.config.json`：

```json
{
  "site": {
    "title": "你的网站名称",
    "author": "你的名字"
  }
}
```

### 3. 添加内容

在 `content/` 文件夹中编辑 Markdown 文件。

### 4. 部署

推送到 GitHub，启用 GitHub Pages 即可自动部署。

## 📁 项目结构

```
├── index.html              # 主入口（无需修改）
├── site.config.json        # 网站配置 ⭐
├── assets/                 # 静态资源
│   ├── css/style.css
│   └── js/app.js
├── content/                # 内容文件夹 ⭐
│   ├── home.md             # 首页
│   ├── about.md            # 关于
│   ├── projects/           # 项目（文件夹类型）
│   │   ├── _index.json     # 索引文件
│   │   └── *.md            # 项目文件
│   └── blog/               # 博客（文件夹类型）
│       ├── _index.json
│       └── *.md
└── .github/workflows/      # GitHub Actions
```

## ⚙️ 配置说明

### 页面类型

**Markdown 页面** - 单个 Markdown 文件：
```json
{
  "id": "about",
  "title": "关于我",
  "icon": "fas fa-user",
  "type": "markdown",
  "source": "content/about.md"
}
```

**文件夹页面** - 包含多个子页面：
```json
{
  "id": "projects",
  "title": "项目",
  "icon": "fas fa-code",
  "type": "folder",
  "source": "content/projects",
  "options": {
    "include": ["*.md"],
    "exclude": ["_draft/*"],
    "showAsCards": true
  }
}
```

### 文件夹索引 (_index.json)

每个文件夹页面需要一个 `_index.json`：

```json
[
  {
    "file": "project-1.md",
    "title": "项目标题",
    "description": "项目描述",
    "date": "2024-01-15",
    "tags": ["标签1", "标签2"]
  }
]
```

### 展示模式

| 选项 | 效果 |
|------|------|
| `showAsCards` | 卡片网格 |
| `showAsTimeline` | 时间线 |
| `showAsGallery` | 图片画廊 |
| `preserveFolderStructure` | 树形结构 |

## 📝 Markdown 格式

支持 YAML frontmatter：

```markdown
---
title: 文章标题
date: 2024-01-15
tags: [标签1, 标签2]
---

# 正文内容
```

## 🎨 自定义主题

在 `site.config.json` 中修改颜色：

```json
{
  "site": {
    "theme": {
      "primaryColor": "#667eea",
      "secondaryColor": "#764ba2",
      "accentColor": "#f093fb"
    }
  }
}
```

## 📤 部署到 GitHub Pages

1. 推送代码到 GitHub
2. 进入仓库 Settings → Pages
3. Source 选择 "GitHub Actions"
4. 等待自动部署完成

## 📄 License

MIT License
