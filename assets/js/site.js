/**
 * GitBook-style Site Application
 */

class SiteApp {
    constructor() {
        this.config = null;
        this.currentPage = null;
        this.allPages = [];
        this.searchIndex = [];
        this.init();
    }

    async init() {
        try {
            await this.loadConfig();
            this.renderSidebar();
            this.setupEventListeners();
            this.handleRouting();
            this.buildSearchIndex();
        } catch (error) {
            console.error('Init failed:', error);
            this.showError('Failed to load site');
        }
    }

    async loadConfig() {
        // Load site structure config
        const siteResponse = await fetch('site.config.json');
        if (!siteResponse.ok) throw new Error('Cannot load site config');
        this.config = await siteResponse.json();
        
        document.title = this.config.site?.title || 'My Site';
        
        // Load theme config
        try {
            const themeResponse = await fetch('theme.config.json');
            if (themeResponse.ok) {
                this.themeConfig = await themeResponse.json();
                this.applyTheme();
            }
        } catch (e) {
            console.warn('Theme config not found, using defaults');
        }

        // Apply favicon if configured
        if (this.themeConfig?.favicon) {
            let link = document.querySelector("link[rel~='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = this.themeConfig.favicon;
        }

        // Apply logo if configured
        if (this.themeConfig?.logo) {
            const logoIcon = document.querySelector('.logo-icon');
            if (logoIcon) {
                if (this.themeConfig.logo.type === 'image') {
                    logoIcon.innerHTML = `<img src="${this.themeConfig.logo.value}" alt="logo" style="width: 100%; height: 100%; object-fit: contain;">`;
                } else if (this.themeConfig.logo.type === 'emoji') {
                    logoIcon.textContent = this.themeConfig.logo.value;
                    logoIcon.style.fontSize = '1.5rem';
                    logoIcon.style.background = 'transparent';
                } else {
                    logoIcon.textContent = this.themeConfig.logo.value;
                }
            }
            
            // Apply logo title (text next to logo)
            const logoText = document.querySelector('.logo-text');
            if (logoText && this.themeConfig.logo.title) {
                logoText.textContent = this.themeConfig.logo.title;
            }
        }

        // Flatten all pages and normalize with defaults
        if (this.config.navGroups) {
            this.config.navGroups.forEach(group => {
                group.pages.forEach(page => {
                    // Auto-generate id from source filename if not provided
                    if (!page.id && page.source) {
                        const filename = page.source.split('/').pop().replace(/\.[^.]+$/, '');
                        page.id = filename;
                    }
                    // Default type to markdown
                    if (!page.type) {
                        page.type = 'markdown';
                    }
                    // Default icon
                    if (!page.icon) {
                        page.icon = 'far fa-file-alt';
                    }
                    this.allPages.push(page);
                });
            });
        }
    }

    renderSidebar() {
        const nav = document.getElementById('main-nav');
        
        if (this.config.navGroups) {
            nav.innerHTML = this.config.navGroups.map(group => `
                <div class="nav-group">
                    <div class="nav-group-title">${group.title}</div>
                    <div class="nav-group-items">
                        ${group.pages.map(page => `
                            <a href="#${page.id}" class="nav-item" data-page="${page.id}">
                                <i class="${page.icon}"></i>
                                <span>${page.title}</span>
                            </a>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        }
    }

    setupEventListeners() {
        // Logo click - navigate to welcome page
        const logoLink = document.getElementById('site-logo-link');
        if (logoLink) {
            logoLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo('001_Welcome');
            });
        }

        // Navigation clicks
        document.getElementById('main-nav').addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item');
            if (navItem) {
                e.preventDefault();
                const pageId = navItem.dataset.page;
                this.navigateTo(pageId);
            }
        });

        // Search trigger
        const searchTrigger = document.getElementById('search-trigger');
        if (searchTrigger) {
            searchTrigger.addEventListener('click', () => {
                this.openSearchModal();
            });
        }

        // Search modal
        const searchModal = document.getElementById('search-modal');
        if (searchModal) {
            searchModal.addEventListener('click', (e) => {
                if (e.target === searchModal) {
                    this.closeSearchModal();
                }
            });
        }

        const searchInput = document.getElementById('search-modal-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.performSearch(e.target.value);
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.openSearchModal();
            }
            if (e.key === 'Escape') {
                this.closeSearchModal();
            }
        });

        // Hash change
        window.addEventListener('hashchange', () => this.handleRouting());

        // Copy button
        const copyBtn = document.getElementById('copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                this.copyPageContent();
            });
        }
    }

    handleRouting() {
        const hash = window.location.hash.slice(1) || (this.allPages[0]?.id || 'welcome');
        this.navigateTo(hash);
    }

    async navigateTo(pageId) {
        const page = this.allPages.find(p => p.id === pageId);
        if (!page) {
            this.showError('Page not found');
            return;
        }

        // Update navigation state
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });

        // Update URL
        if (window.location.hash !== `#${pageId}`) {
            history.pushState(null, '', `#${pageId}`);
        }

        // Update breadcrumb
        this.updateBreadcrumb(page);

        // Load content
        this.currentPage = page;
        await this.loadPageContent(page);
    }

    updateBreadcrumb(page) {
        const breadcrumb = document.getElementById('breadcrumb');
        
        // Find which group this page belongs to
        let groupTitle = '';
        if (this.config.navGroups) {
            for (const group of this.config.navGroups) {
                if (group.pages.find(p => p.id === page.id)) {
                    groupTitle = group.title;
                    break;
                }
            }
        }
        
        breadcrumb.textContent = groupTitle;
    }

    async loadPageContent(page) {
        const contentEl = document.getElementById('page-content');
        contentEl.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><span>Loading...</span></div>';

        try {
            // Handle PDF pages
            if (page.type === 'pdf') {
                this.loadPDFContent(page);
                return;
            }

            const response = await fetch(page.source);
            if (!response.ok) {
                throw new Error(`Cannot load: ${page.source}`);
            }

            const markdown = await response.text();
            const { meta, content } = this.parseMarkdownWithFrontmatter(markdown);
            
            // Configure marked
            marked.setOptions({
                breaks: true,
                gfm: true
            });

            let html = '<div class="markdown-body fade-in">';
            
            // Page title with icon (use emoji from config, or none if not specified)
            const emoji = page.emoji || '';
            const emojiHtml = emoji ? `<span class="page-icon">${emoji}</span>` : '';
            html += `
                <div class="page-title-wrapper">
                    <h1 class="page-title">${emojiHtml}${meta.title || page.title}</h1>
                </div>
            `;

            // Parse and add content (skip the first h1 if it matches title)
            let parsedContent = marked.parse(content);
            // Remove first h1 if it's the same as title
            parsedContent = parsedContent.replace(/^<h1[^>]*>.*?<\/h1>\s*/i, '');
            
            html += parsedContent;
            html += '</div>';

            contentEl.innerHTML = html;
            this.postProcessContent();

        } catch (error) {
            console.error('Load page failed:', error);
            this.showError('Failed to load page content');
        }
    }

    loadPDFContent(page) {
        const contentEl = document.getElementById('page-content');
        
        // 生成按钮 HTML
        let buttonsHtml = '';
        
        // HuggingFace 链接按钮
        if (page.huggingfaceUrl) {
            buttonsHtml += `
                <a href="${page.huggingfaceUrl}" target="_blank" class="pdf-btn">
                    <i class="fas fa-external-link-alt"></i> View on HuggingFace
                </a>
            `;
        }
        
        // 下载按钮
        const downloadUrl = page.downloadUrl || page.source;
        buttonsHtml += `
            <a href="${downloadUrl}" download class="pdf-btn">
                <i class="fas fa-download"></i> Download
            </a>
        `;
        
        const html = `
            <div class="pdf-viewer fade-in">
                <div class="pdf-header">
                    <h1 class="page-title">${page.title}</h1>
                    <div class="pdf-controls">
                        ${buttonsHtml}
                    </div>
                </div>
                <div class="pdf-container">
                    <iframe src="${page.source}#toolbar=0&navpanes=0" class="pdf-iframe" frameborder="0"></iframe>
                </div>
            </div>
        `;
        contentEl.innerHTML = html;
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
                value = value.replace(/['"]/g, '');
                result[key] = value;
            }
        }
        
        return result;
    }

    postProcessContent() {
        // Code highlighting and copy button
        document.querySelectorAll('pre code').forEach(block => {
            // Force highlight.js to process
            if (!block.classList.contains('hljs')) {
                hljs.highlightElement(block);
            }
            
            // Add line numbers
            const lines = block.innerHTML.split('\n');
            if (lines.length > 1) {
                // Remove last empty line if exists
                if (lines[lines.length - 1] === '') lines.pop();
                
                const numberedLines = lines.map((line, i) => {
                    return `<span class="line-number">${i + 1}</span>${line}`;
                }).join('\n');
                block.innerHTML = numberedLines;
            }
            
            // Wrap pre in a container and add copy button
            const pre = block.parentElement;
            if (!pre.parentElement.classList.contains('code-block-wrapper')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'code-block-wrapper';
                pre.parentNode.insertBefore(wrapper, pre);
                wrapper.appendChild(pre);
                
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-code-btn';
                copyBtn.innerHTML = '<i class="far fa-copy"></i> Copy';
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(block.textContent).then(() => {
                        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                        copyBtn.classList.add('copied');
                        setTimeout(() => {
                            copyBtn.innerHTML = '<i class="far fa-copy"></i> Copy';
                            copyBtn.classList.remove('copied');
                        }, 2000);
                    });
                };
                wrapper.appendChild(copyBtn);
            }
        });

        // External links open in new tab
        document.querySelectorAll('.markdown-body a').forEach(link => {
            if (link.hostname && link.hostname !== window.location.hostname) {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
        });
    }

    buildSearchIndex() {
        this.searchIndex = this.allPages.map(page => ({
            id: page.id,
            title: page.title,
            path: `#${page.id}`
        }));
    }

    openSearchModal() {
        const modal = document.getElementById('search-modal');
        modal.classList.add('active');
        document.getElementById('search-modal-input').focus();
    }

    closeSearchModal() {
        const modal = document.getElementById('search-modal');
        modal.classList.remove('active');
        document.getElementById('search-modal-input').value = '';
        document.getElementById('search-results').innerHTML = '';
    }

    performSearch(query) {
        const resultsEl = document.getElementById('search-results');
        
        if (!query.trim()) {
            resultsEl.innerHTML = '<div class="search-no-results">Type to search...</div>';
            return;
        }

        const queryLower = query.toLowerCase();
        const results = this.searchIndex.filter(item => 
            item.title.toLowerCase().includes(queryLower)
        );

        if (results.length === 0) {
            resultsEl.innerHTML = '<div class="search-no-results">No results found</div>';
            return;
        }

        resultsEl.innerHTML = results.map(item => `
            <div class="search-result-item" onclick="app.navigateTo('${item.id}'); app.closeSearchModal();">
                <div class="search-result-title">${item.title}</div>
                <div class="search-result-path">${item.path}</div>
            </div>
        `).join('');
    }

    copyPageContent() {
        const content = document.querySelector('.markdown-body');
        if (content) {
            navigator.clipboard.writeText(content.innerText).then(() => {
                const btn = document.getElementById('copy-btn');
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                }, 2000);
            });
        }
    }

    showError(message) {
        const contentEl = document.getElementById('page-content');
        contentEl.innerHTML = `
            <div class="markdown-body">
                <div style="text-align: center; padding: 4rem 2rem; color: var(--text-muted);">
                    <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                    <p>${message}</p>
                </div>
            </div>
        `;
    }

    applyTheme() {
        const colors = this.themeConfig?.colors;
        if (!colors) return;
        
        const root = document.documentElement;
        if (colors.headerBgColor) root.style.setProperty('--bg-header', colors.headerBgColor);
        if (colors.headerTextColor) root.style.setProperty('--header-text-color', colors.headerTextColor);
        if (colors.searchBoxBgColor) root.style.setProperty('--search-box-bg', colors.searchBoxBgColor);
        if (colors.searchBoxTextColor) root.style.setProperty('--search-box-text', colors.searchBoxTextColor);
        if (colors.searchBoxIconColor) root.style.setProperty('--search-box-icon', colors.searchBoxIconColor);
        if (colors.sidebarBgColor) root.style.setProperty('--bg-sidebar', colors.sidebarBgColor);
        if (colors.sidebarGroupTitleColor) root.style.setProperty('--sidebar-group-title', colors.sidebarGroupTitleColor);
        if (colors.sidebarItemColor) root.style.setProperty('--sidebar-item-color', colors.sidebarItemColor);
        if (colors.sidebarItemActiveColor) root.style.setProperty('--sidebar-item-active', colors.sidebarItemActiveColor);
        if (colors.sidebarItemActiveBgColor) root.style.setProperty('--sidebar-item-active-bg', colors.sidebarItemActiveBgColor);
        if (colors.contentBgColor) root.style.setProperty('--bg-content', colors.contentBgColor);
        if (colors.contentTextColor) root.style.setProperty('--text-primary', colors.contentTextColor);
        if (colors.linkColor) root.style.setProperty('--text-link', colors.linkColor);
    }
}

// Initialize
const app = new SiteApp();
