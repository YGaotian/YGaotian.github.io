/**
 * 构建脚本：自动扫描 content 文件夹生成 site.config.json
 * 
 * 使用方法：node build.js
 * 
 * 文件夹结构示例：
 * content/
 *   ABOUT ME/           <- 文件夹名 = 分组标题
 *     Welcome.md        <- 文件名 = 页面标题（或从 frontmatter 读取 title）
 *     My research.md
 *   MY PROJECT/
 *     Project A.md
 * 
 * 如果 md 文件有 frontmatter 中的 title，则使用 frontmatter 的 title
 * 否则使用文件名（去掉 .md 后缀）
 */

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = './content';
const OUTPUT_FILE = './site.config.json';
const THEME_CONFIG_FILE = './theme.config.json';

// 从 theme.config.json 读取站点标题
let siteTitle = "Yan Gao-Tian's Cafe";
try {
    const themeConfig = JSON.parse(fs.readFileSync(THEME_CONFIG_FILE, 'utf-8'));
    if (themeConfig.logo && themeConfig.logo.title) {
        siteTitle = themeConfig.logo.title;
    }
} catch (e) {
    console.warn('⚠️  未找到 theme.config.json，使用默认标题');
}

// 读取现有配置（保留 site 部分）
let existingConfig = { site: { title: siteTitle } };
try {
    const existing = fs.readFileSync(OUTPUT_FILE, 'utf-8');
    existingConfig = JSON.parse(existing);
    // 用 theme.config.json 的标题覆盖
    existingConfig.site = { title: siteTitle };
} catch (e) {
    // 文件不存在，使用默认值
}

// 从 Markdown 文件中提取 frontmatter 的 title
function extractTitle(filePath, fallbackTitle) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const match = content.match(/^---\n[\s\S]*?title:\s*["']?(.+?)["']?\s*\n[\s\S]*?---/);
        if (match && match[1]) {
            return match[1].trim();
        }
    } catch (e) {
        // 读取失败，使用文件名
    }
    return fallbackTitle;
}

// 扫描 content 文件夹
function scanContentFolder() {
    const navGroups = [];
    
    // 获取所有子文件夹
    const folders = fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    
    for (const folder of folders) {
        const folderPath = path.join(CONTENT_DIR, folder);
        
        // 获取文件夹内的所有 .md 和 .pdf 文件
        const files = fs.readdirSync(folderPath)
            .filter(file => file.endsWith('.md') || file.endsWith('.pdf'))
            .sort(); // 按文件名排序
        
        if (files.length === 0) continue;
        
        const pages = files.map(file => {
            const isPdf = file.endsWith('.pdf');
            
            // 去掉文件后缀，并去掉序号前缀（如 001_、01_、1_）
            let fallbackTitle = file.replace(/\.(md|pdf)$/, '');
            fallbackTitle = fallbackTitle.replace(/^\d+[_\-]\s*/, ''); // 去掉开头的数字序号
            
            const source = `content/${folder}/${file}`;
            const fullPath = path.join(folderPath, file);
            
            // PDF 文件直接使用文件名作为标题，Markdown 文件尝试从 frontmatter 提取
            const title = isPdf ? fallbackTitle : extractTitle(fullPath, fallbackTitle);
            
            const pageConfig = {
                title: title,
                source: source
            };
            
            // PDF 文件添加 type 字段
            if (isPdf) {
                pageConfig.type = 'pdf';
            }
            
            return pageConfig;
        });
        
        navGroups.push({
            title: folder, // 文件夹名作为分组标题
            pages: pages
        });
    }
    
    return navGroups;
}

// 生成配置
const navGroups = scanContentFolder();

const config = {
    site: existingConfig.site,
    navGroups: navGroups
};

// 写入文件
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(config, null, 2));

console.log('✅ site.config.json 已生成！');
console.log(`   共 ${navGroups.length} 个分组，${navGroups.reduce((sum, g) => sum + g.pages.length, 0)} 个页面`);
navGroups.forEach(g => {
    console.log(`   - ${g.title}: ${g.pages.length} 个页面`);
});
