/**
 * 配置驱动的个人主页系统
 * 通过 site.config.json 配置文件和 Markdown 文件组织内容
 */

class SiteApp {
    constructor() {
        this.config = null;
        this.currentPage = null;
        this.contentCache = new Map();
        this.searchIndex = [];
        this.init();
    }

    async init() {
        try {
            await this.loadConfig();
            this.setupTheme();
            this.renderSidebar();
            this.setupEventListeners();
            this.handleRouting();
            this.buildSearchIndex();
        } catch (error) {
            console.error('初始化失败:', error);
            this.showError('网站加载失败，请刷新页面重试');
        }
    }

    async loadConfig() {
        const response = await fetch('site.config.json');
        if (!response.ok) throw new Error('无法加载配置文件');
        this.config = await response.json();
        
        // 应用配置
        document.title = this.config.site.title;
        document.getElementById('site-title').textContent = this.config.site.title;
        
        // 设置 Logo
        const logoImg = document.getElementById('site-logo');
        if (this.config.site.logo) {
            logoImg.src = this.config.site.logo;
            logoImg.onerror = () => {
                logoImg.style.display = 'none';
            };
        } else {
            logoImg.style.display = 'none';
        }

        // 应用主题颜色
        if (this.config.site.theme) {
            const root = document.documentElement;
            if (this.config.site.theme.primaryColor) {
                root.style.setProperty('--primary-color', this.config.site.theme.primaryColor);
            }
            if (this.config.site.theme.secondaryColor) {
                root.style.setProperty('--secondary-color', this.config.site.theme.secondaryColor);
            }
            if (this.config.site.theme.accentColor) {
                root.style.setProperty('--accent-color', this.config.site.theme.accentColor);
            }
        }
    }

    setupTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    }

    updateThemeIcon(theme) {
        const icon = document.querySelector('#theme-toggle i');
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    renderSidebar() {
        const nav = document.getElementById('main-nav');
        const socialLinks = document.getElementById('social-links');

        // 渲染导航菜单
        nav.innerHTML = this.config.pages.map(page => `
            <a href="#${page.id}" class="nav-item" data-page="${page.id}">
                <i class="${page.icon}"></i>
                <span>${page.title}</span>
                ${page.type === 'folder' ? '<i class="fas fa-chevron-right nav-arrow"></i>' : ''}
            </a>
        `).join('');

        // 渲染社交链接
        if (this.config.social) {
            socialLinks.innerHTML = this.config.social.map(link => `
                <a href="${link.url}" target="_blank" title="${link.name}">
                    <i class="${link.icon}"></i>
                </a>
            `).join('');
        }

        // 搜索框显示控制
        const searchContainer = document.getElementById('search-container');
        if (!this.config.navigation?.showSearch) {
            searchContainer.style.display = 'none';
        }

        // 主题切换按钮显示控制
        const themeToggle = document.getElementById('theme-toggle');
        if (!this.config.navigation?.showThemeToggle) {
            themeToggle.style.display = 'none';
        }
    }

    setupEventListeners() {
        // 导航点击
        document.getElementById('main-nav').addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item');
            if (navItem) {
                e.preventDefault();
                const pageId = navItem.dataset.page;
                this.navigateTo(pageId);
            }
        });

        // 主题切换
        document.getElementById('theme-toggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const newTheme = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            this.updateThemeIcon(newTheme);
        });

        // 移动端菜单
        document.getElementById('mobile-menu-toggle').addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('mobile-open');
        });

        // 搜索
        document.getElementById('search-input').addEventListener('focus', () => {
            document.getElementById('search-modal').classList.add('active');
            document.getElementById('search-modal-input').focus();
        });

        document.querySelector('.search-modal-close').addEventListener('click', () => {
            document.getElementById('search-modal').classList.remove('active');
        });

        document.getElementById('search-modal').addEventListener('click', (e) => {
            if (e.target.id === 'search-modal') {
                document.getElementById('search-modal').classList.remove('active');
            }
        });

        document.getElementById('search-modal-input').addEventListener('input', (e) => {
            this.performSearch(e.target.value);
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + K 打开搜索
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.getElementById('search-modal').classList.add('active');
                document.getElementById('search-modal-input').focus();
            }
            // Escape 关闭模态框
            if (e.key === 'Escape') {
                document.getElementById('search-modal').classList.remove('active');
                document.getElementById('lightbox').classList.remove('active');
            }
        });

        // Lightbox
        document.querySelector('.lightbox-close').addEventListener('click', () => {
            document.getElementById('lightbox').classList.remove('active');
        });

        // Hash 变化
        window.addEventListener('hashchange', () => this.handleRouting());
    }

    handleRouting() {
        const hash = window.location.hash.slice(1) || this.config.pages[0]?.id || 'home';
        const parts = hash.split('/');
        const pageId = parts[0];
        const subPath = parts.slice(1).join('/');
        
        this.navigateTo(pageId, subPath);
    }

    async navigateTo(pageId, subPath = '') {
        const page = this.config.pages.find(p => p.id === pageId);
        if (!page) {
            this.showError('页面不存在');
            return;
        }

        // 更新导航状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });

        // 更新 URL
        const newHash = subPath ? `${pageId}/${subPath}` : pageId;
        if (window.location.hash !== `#${newHash}`) {
            history.pushState(null, '', `#${newHash}`);
        }

        // 更新面包屑
        this.updateBreadcrumb(page, subPath);

        // 加载内容
        this.currentPage = page;
        await this.loadPageContent(page, subPath);

        // 关闭移动端菜单
        document.querySelector('.sidebar').classList.remove('mobile-open');

        // 滚动到顶部
        document.getElementById('page-content').scrollTop = 0;
    }

    updateBreadcrumb(page, subPath) {
        const breadcrumb = document.getElementById('breadcrumb');
        let html = `<a href="#${this.config.pages[0]?.id || 'home'}">首页</a>`;
        
        if (page.id !== (this.config.pages[0]?.id || 'home')) {
            html += `<span class="separator">/</span>`;
            if (subPath) {
                html += `<a href="#${page.id}">${page.title}</a>`;
                html += `<span class="separator">/</span>`;
                html += `<span class="current">${this.getFileTitle(subPath)}</span>`;
            } else {
                html += `<span class="current">${page.title}</span>`;
            }
        }
        
        breadcrumb.innerHTML = html;
    }

    getFileTitle(path) {
        const filename = path.split('/').pop();
        return filename.replace(/\.(md|markdown)$/i, '').replace(/-/g, ' ');
    }

    async loadPageContent(page, subPath) {
        const contentEl = document.getElementById('page-content');
        contentEl.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><span>加载中...</span></div>';

        try {
            if (page.type === 'markdown') {
                await this.loadMarkdownPage(page.source);
            } else if (page.type === 'folder') {
                if (subPath) {
                    await this.loadMarkdownPage(`${page.source}/${subPath}`);
                } else {
                    await this.loadFolderPage(page);
                }
            }
        } catch (error) {
            console.error('加载页面失败:', error);
            this.showError('页面加载失败');
        }
    }

    async loadMarkdownPage(source) {
        const contentEl = document.getElementById('page-content');
        
        // 检查缓存
        if (this.contentCache.has(source)) {
            contentEl.innerHTML = this.contentCache.get(source);
            this.postProcessContent();
            return;
        }

        const response = await fetch(source);
        if (!response.ok) {
            throw new Error(`无法加载文件: ${source}`);
        }

        const markdown = await response.text();
        const { meta, content } = this.parseMarkdownWithFrontmatter(markdown);
        
        // 配置 marked
        marked.setOptions({
            highlight: (code, lang) => {
                if (lang && hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return hljs.highlightAuto(code).value;
            },
            breaks: true,
            gfm: true
        });

        let html = '<div class="markdown-body slide-up">';
        
        // 添加页面元信息
        if (meta.title || meta.date || meta.author || meta.tags) {
            html += '<div class="page-meta">';
            if (meta.date) {
                html += `<span class="page-meta-item"><i class="fas fa-calendar"></i>${meta.date}</span>`;
            }
            if (meta.author) {
                html += `<span class="page-meta-item"><i class="fas fa-user"></i>${meta.author}</span>`;
            }
            if (meta.tags && Array.isArray(meta.tags)) {
                html += `<span class="page-meta-item"><i class="fas fa-tags"></i>${meta.tags.join(', ')}</span>`;
            }
            html += '</div>';
        }

        html += marked.parse(content);
        html += '</div>';

        contentEl.innerHTML = html;
        this.contentCache.set(source, html);
        this.postProcessContent();
        this.generateTOC();
    }

    parseMarkdownWithFrontmatter(markdown) {
        const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
        const match = markdown.match(frontmatterRegex);
        
        if (match) {
            const frontmatter = match[1];
            const content = markdown.slice(match[0].length);
            const meta = this.parseYAML(frontmatter);
            return { meta, content };
        }
        
        return { meta: {}, content: markdown };
    }

    parseYAML(yaml) {
        const result = {};
        const lines = yaml.split('\n');
        
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.slice(0, colonIndex).trim();
                let value = line.slice(colonIndex + 1).trim();
                
                // 处理数组
                if (value.startsWith('[') && value.endsWith(']')) {
                    value = value.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''));
                } else {
                    value = value.replace(/['"]/g, '');
                }
                
                result[key] = value;
            }
        }
        
        return result;
    }

    async loadFolderPage(page) {
        const contentEl = document.getElementById('page-content');
        const options = page.options || {};

        try {
            // 尝试加载文件夹索引
            const indexResponse = await fetch(`${page.source}/_index.json`);
            let files = [];
            
            if (indexResponse.ok) {
                files = await indexResponse.json();
            } else {
                // 如果没有索引文件，显示提示
                contentEl.innerHTML = `
                    <div class="markdown-body slide-up">
                        <h1>${page.title}</h1>
                        <p>请在 <code>${page.source}/_index.json</code> 中定义此文件夹的内容索引。</p>
                        <h2>索引文件格式示例</h2>
                        <pre><code class="language-json">[
  {
    "file": "example.md",
    "title": "示例文章",
    "description": "这是一篇示例文章",
    "date": "2024-01-01",
    "tags": ["标签1", "标签2"],
    "image": "cover.jpg"
  }
]</code></pre>
                    </div>
                `;
                hljs.highlightAll();
                return;
            }

            // 根据选项渲染不同样式
            let html = `<div class="markdown-body slide-up"><h1>${page.title}</h1>`;

            if (options.showAsCards) {
                html += this.renderCardsView(files, page);
            } else if (options.showAsTimeline) {
                html += this.renderTimelineView(files, page);
            } else if (options.showAsGallery) {
                html += this.renderGalleryView(files, page);
            } else if (options.preserveFolderStructure) {
                html += this.renderTreeView(files, page);
            } else {
                html += this.renderListView(files, page);
            }

            html += '</div>';
            contentEl.innerHTML = html;
            this.postProcessContent();

        } catch (error) {
            console.error('加载文件夹失败:', error);
            this.showError('无法加载文件夹内容');
        }
    }

    renderCardsView(files, page) {
        const perRow = page.options?.cardsPerRow || 3;
        return `
            <div class="cards-grid" style="grid-template-columns: repeat(auto-fill, minmax(${100/perRow - 5}%, 1fr))">
                ${files.map(file => `
                    <div class="card" onclick="app.navigateTo('${page.id}', '${file.file}')">
                        <div class="card-image">
                            ${file.image 
                                ? `<img src="${page.source}/${file.image}" alt="${file.title}">`
                                : `<i class="fas fa-file-alt"></i>`
                            }
                        </div>
                        <div class="card-content">
                            <h3 class="card-title">${file.title}</h3>
                            ${file.description ? `<p class="card-description">${file.description}</p>` : ''}
                            ${file.tags ? `
                                <div class="card-tags">
                                    ${file.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderTimelineView(files, page) {
        // 按日期排序
        const sorted = [...files].sort((a, b) => {
            const dateA = new Date(a.date || 0);
            const dateB = new Date(b.date || 0);
            return page.options?.sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        return `
            <div class="timeline">
                ${sorted.map(file => `
                    <div class="timeline-item">
                        ${file.date ? `<div class="timeline-date">${file.date}</div>` : ''}
                        <div class="timeline-content">
                            <h3 class="timeline-title">
                                <a href="#${page.id}/${file.file}">${file.title}</a>
                            </h3>
                            ${file.description ? `<p class="timeline-excerpt">${file.description}</p>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderGalleryView(files, page) {
        return `
            <div class="gallery-grid">
                ${files.map((file, index) => `
                    <div class="gallery-item" onclick="app.openLightbox('${page.source}/${file.file || file}', ${index})">
                        <img src="${page.source}/${file.file || file}" alt="${file.title || ''}" loading="lazy">
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderTreeView(files, page) {
        // 构建树形结构
        const tree = this.buildTree(files);
        return `<div class="folder-tree">${this.renderTreeNode(tree, page)}</div>`;
    }

    buildTree(files) {
        const tree = { children: {}, files: [] };
        
        for (const file of files) {
            const parts = (file.path || file.file || '').split('/');
            let current = tree;
            
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!current.children[part]) {
                    current.children[part] = { children: {}, files: [] };
                }
                current = current.children[part];
            }
            
            current.files.push({
                ...file,
                name: parts[parts.length - 1]
            });
        }
        
        return tree;
    }

    renderTreeNode(node, page, path = '') {
        let html = '';
        
        // 渲染子文件夹
        for (const [name, child] of Object.entries(node.children)) {
            const childPath = path ? `${path}/${name}` : name;
            html += `
                <div class="folder-item">
                    <div class="folder-header" onclick="this.parentElement.classList.toggle('expanded')">
                        <i class="fas fa-folder"></i>
                        <span>${name}</span>
                    </div>
                    <div class="folder-children">
                        ${this.renderTreeNode(child, page, childPath)}
                    </div>
                </div>
            `;
        }
        
        // 渲染文件
        for (const file of node.files) {
            const filePath = path ? `${path}/${file.name}` : file.name;
            html += `
                <a href="#${page.id}/${filePath}" class="file-item">
                    <i class="fas fa-file-alt"></i>
                    <span>${file.title || file.name}</span>
                </a>
            `;
        }
        
        return html;
    }

    renderListView(files, page) {
        return `
            <ul>
                ${files.map(file => `
                    <li>
                        <a href="#${page.id}/${file.file}">${file.title || file.file}</a>
                        ${file.description ? ` - ${file.description}` : ''}
                    </li>
                `).join('')}
            </ul>
        `;
    }

    postProcessContent() {
        // 代码高亮
        document.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });

        // Mermaid 图表
        if (this.config.markdown?.enableMermaid) {
            document.querySelectorAll('.language-mermaid').forEach(block => {
                const container = document.createElement('div');
                container.className = 'mermaid';
                container.textContent = block.textContent;
                block.parentElement.replaceWith(container);
            });
            mermaid.init();
        }

        // 图片点击放大
        document.querySelectorAll('.markdown-body img').forEach(img => {
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => {
                this.openLightbox(img.src);
            });
        });

        // 外部链接新窗口打开
        document.querySelectorAll('.markdown-body a').forEach(link => {
            if (link.hostname !== window.location.hostname) {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
        });
    }

    generateTOC() {
        const tocSidebar = document.getElementById('toc-sidebar');
        const tocContent = document.getElementById('toc-content');
        const headings = document.querySelectorAll('.markdown-body h2, .markdown-body h3');

        if (headings.length < 2) {
            tocSidebar.classList.remove('visible');
            document.querySelector('.page-content').classList.remove('with-toc');
            return;
        }

        let html = '';
        headings.forEach((heading, index) => {
            const id = `heading-${index}`;
            heading.id = id;
            const level = heading.tagName.toLowerCase();
            html += `<a href="#${id}" class="level-${level.slice(1)}">${heading.textContent}</a>`;
        });

        tocContent.innerHTML = html;
        tocSidebar.classList.add('visible');
        document.querySelector('.page-content').classList.add('with-toc');

        // TOC 滚动高亮
        this.setupTOCHighlight();
    }

    setupTOCHighlight() {
        const headings = document.querySelectorAll('.markdown-body h2, .markdown-body h3');
        const tocLinks = document.querySelectorAll('.toc-content a');

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    tocLinks.forEach(link => {
                        link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
                    });
                }
            });
        }, { rootMargin: '-80px 0px -80% 0px' });

        headings.forEach(heading => observer.observe(heading));
    }

    openLightbox(src, index = 0) {
        const lightbox = document.getElementById('lightbox');
        const img = document.getElementById('lightbox-img');
        img.src = src;
        lightbox.classList.add('active');
    }

    async buildSearchIndex() {
        this.searchIndex = [];
        
        for (const page of this.config.pages) {
            this.searchIndex.push({
                title: page.title,
                path: `#${page.id}`,
                type: 'page'
            });

            if (page.type === 'folder') {
                try {
                    const response = await fetch(`${page.source}/_index.json`);
                    if (response.ok) {
                        const files = await response.json();
                        for (const file of files) {
                            this.searchIndex.push({
                                title: file.title || file.file,
                                description: file.description,
                                path: `#${page.id}/${file.file}`,
                                type: 'file'
                            });
                        }
                    }
                } catch (e) {
                    // 忽略错误
                }
            }
        }
    }

    performSearch(query) {
        const resultsEl = document.getElementById('search-results');
        
        if (!query.trim()) {
            resultsEl.innerHTML = '<div class="search-no-results">输入关键词开始搜索</div>';
            return;
        }

        const queryLower = query.toLowerCase();
        const results = this.searchIndex.filter(item => 
            item.title.toLowerCase().includes(queryLower) ||
            (item.description && item.description.toLowerCase().includes(queryLower))
        );

        if (results.length === 0) {
            resultsEl.innerHTML = '<div class="search-no-results">没有找到相关结果</div>';
            return;
        }

        resultsEl.innerHTML = results.map(item => `
            <div class="search-result-item" onclick="app.navigateTo('${item.path.slice(1).split('/')[0]}', '${item.path.slice(1).split('/').slice(1).join('/')}'); document.getElementById('search-modal').classList.remove('active');">
                <div class="search-result-title">${item.title}</div>
                <div class="search-result-path">${item.path}</div>
            </div>
        `).join('');
    }

    showError(message) {
        const contentEl = document.getElementById('page-content');
        contentEl.innerHTML = `
            <div class="markdown-body">
                <div style="text-align: center; padding: 4rem 2rem;">
                    <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
                    <h2 style="color: var(--text-secondary);">${message}</h2>
                    <p><a href="#${this.config?.pages[0]?.id || 'home'}">返回首页</a></p>
                </div>
            </div>
        `;
    }
}

// 初始化应用
const app = new SiteApp();
