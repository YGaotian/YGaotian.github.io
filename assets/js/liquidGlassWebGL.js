/**
 * WebGL2 liquid-glass header renderer.
 *
 * This follows the liquid-glass-studio model more closely than the previous
 * attempt: page layers are uploaded as textures, and scroll only changes
 * shader sampling uniforms. No viewport recapture is performed during scroll.
 */
(function () {
    'use strict';

    const VERT_SRC = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
    v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
    gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

    const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_mainTex;
uniform sampler2D u_sidebarTex;
uniform sampler2D u_backgroundTex;
uniform vec2 u_canvasSize;
uniform vec2 u_backgroundImageSize;
uniform float u_headerBackgroundBlur;
uniform float u_sidebarBackgroundBlur;
uniform vec2 u_headerSize;
uniform vec2 u_headerOrigin;
uniform vec2 u_sidebarGlassOrigin;
uniform vec2 u_sidebarGlassSize;
uniform vec2 u_sidebarRectPos;
uniform vec2 u_sidebarRectSize;
uniform vec2 u_mainTexSize;
uniform vec2 u_sidebarTexSize;
uniform vec2 u_mainTexAlign;
uniform vec2 u_sidebarTexAlign;
uniform vec2 u_mainRectPos;
uniform vec2 u_mainRectSize;
uniform float u_sidebarScrollTop;
uniform float u_mainScrollTop;
uniform vec3 u_mainBg;
uniform vec3 u_sidebarBg;
uniform float u_radius;
uniform vec4 u_headerOptics1;
uniform vec4 u_headerOptics2;
uniform vec4 u_headerOptics3;
uniform vec4 u_sidebarOptics1;
uniform vec4 u_sidebarOptics2;
uniform vec4 u_sidebarOptics3;
uniform float u_glareAngle;
uniform vec4 u_tint;
uniform vec3 u_sidebarGlassColor;
uniform vec3 u_sidebarGlareColor;

const float PI = 3.14159265359;
const float N_R = 0.98;
const float N_G = 1.0;
const float N_B = 1.02;

float roundedRectSDF(vec2 p, vec2 halfSize, float radius) {
    vec2 q = abs(p) - halfSize + radius;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

float rectSDF(vec2 screenPx, vec2 origin, vec2 size) {
    return roundedRectSDF(screenPx - origin - size * 0.5, size * 0.5, u_radius);
}

vec2 rectNormal(vec2 screenPx, vec2 origin, vec2 size) {
    float eps = 1.0;
    float dx = rectSDF(screenPx + vec2(eps, 0.0), origin, size) - rectSDF(screenPx - vec2(eps, 0.0), origin, size);
    float dy = rectSDF(screenPx + vec2(0.0, eps), origin, size) - rectSDF(screenPx - vec2(0.0, eps), origin, size);
    vec2 n = vec2(dx, dy);
    return length(n) > 0.0001 ? normalize(n) : vec2(0.0, -1.0);
}

vec4 sampleBackground(vec2 screenPx, float blurPx) {
    float coverScale = max(u_canvasSize.x / u_backgroundImageSize.x, u_canvasSize.y / u_backgroundImageSize.y);
    vec2 renderedSize = u_backgroundImageSize * coverScale;
    vec2 offset = (u_canvasSize - renderedSize) * 0.5;
    vec2 uv = clamp((screenPx - offset) / renderedSize, vec2(0.0), vec2(1.0));
    vec2 blurTexel = vec2(max(blurPx, 0.75)) / renderedSize;
    // Dense 15×15 Gaussian kernel for the high-radius sidebar glass blur.
    // cross artefacts when the blur radius was increased.
    vec3 background = vec3(0.0);
    float totalWeight = 0.0;
    blurTexel *= 0.14285715;
    for (int y = -7; y <= 7; y++) {
        for (int x = -7; x <= 7; x++) {
            float distanceSquared = float(x * x + y * y);
            float weight = exp(-distanceSquared * 0.08163265);
            vec2 offset = vec2(float(x), float(y)) * blurTexel;
            background += texture(u_backgroundTex, clamp(uv + offset, 0.0, 1.0)).rgb * weight;
            totalWeight += weight;
        }
    }
    background /= totalWeight;
    return vec4(background, 1.0);
}

vec4 compositeOverBackground(vec4 sampleColor, vec2 screenPx, float blurPx) {
    return vec4(mix(sampleBackground(screenPx, blurPx).rgb, sampleColor.rgb, sampleColor.a), 1.0);
}

vec4 sampleSceneWithMode(vec2 screenPx, float excludeSidebarContent, float blurPx) {
    if (
        screenPx.x >= u_sidebarRectPos.x &&
        screenPx.x <= u_sidebarRectPos.x + u_sidebarRectSize.x &&
        screenPx.y >= u_sidebarRectPos.y &&
        screenPx.y <= u_sidebarRectPos.y + u_sidebarRectSize.y
    ) {
        if (excludeSidebarContent > 0.5) {
            return sampleBackground(screenPx, blurPx);
        }
        vec2 local = vec2(screenPx.x - u_sidebarRectPos.x, screenPx.y - u_sidebarRectPos.y + u_sidebarScrollTop) + u_sidebarTexAlign;
        vec2 uv = local / u_sidebarTexSize;
        if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
            return compositeOverBackground(texture(u_sidebarTex, uv), screenPx, blurPx);
        }
        return sampleBackground(screenPx, blurPx);
    }

    if (
        screenPx.x >= u_mainRectPos.x &&
        screenPx.x <= u_mainRectPos.x + u_mainRectSize.x &&
        screenPx.y >= u_mainRectPos.y &&
        screenPx.y <= u_mainRectPos.y + u_mainRectSize.y
    ) {
        vec2 local = vec2(screenPx.x - u_mainRectPos.x, screenPx.y - u_mainRectPos.y + u_mainScrollTop) + u_mainTexAlign;
        vec2 uv = local / u_mainTexSize;
        if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
            vec4 mainScene = compositeOverBackground(texture(u_mainTex, uv), screenPx, blurPx);
            float mainEdgeBlend = smoothstep(u_mainRectPos.x, u_mainRectPos.x + 28.0, screenPx.x);
            return mix(sampleBackground(screenPx, blurPx), mainScene, mainEdgeBlend);
        }
        return sampleBackground(screenPx, blurPx);
    }

    return sampleBackground(screenPx, blurPx);
}

vec4 sampleScene(vec2 screenPx) {
    return sampleSceneWithMode(screenPx, 0.0, u_headerBackgroundBlur);
}

vec4 sampleDispersion(vec2 screenPx, vec2 offsetPx, float excludeSidebarContent, float dispersionGain, float blurPx) {
    vec2 offR = offsetPx * (1.0 - (N_R - 1.0) * dispersionGain);
    vec2 offG = offsetPx * (1.0 - (N_G - 1.0) * dispersionGain);
    vec2 offB = offsetPx * (1.0 - (N_B - 1.0) * dispersionGain);

    vec4 blurR = sampleSceneWithMode(screenPx + offR, excludeSidebarContent, blurPx);
    vec4 blurG = sampleSceneWithMode(screenPx + offG, excludeSidebarContent, blurPx);
    vec4 blurB = sampleSceneWithMode(screenPx + offB, excludeSidebarContent, blurPx);

    return vec4(blurR.r, blurG.g, blurB.b, 1.0);
}

float angleOf(vec2 v) {
    float a = atan(v.y, v.x);
    return a < 0.0 ? a + PI * 2.0 : a;
}

void main() {
    vec2 screenPx = v_uv * u_canvasSize;
    float headerSdf = rectSDF(screenPx, u_headerOrigin, u_headerSize);
    float sidebarSdf = rectSDF(screenPx, u_sidebarGlassOrigin, u_sidebarGlassSize);
    float useSidebar = sidebarSdf < headerSdf ? 1.0 : 0.0;
    float sdf = min(headerSdf, sidebarSdf);
    if (sdf > 0.0) discard;

    vec2 targetOrigin = mix(u_headerOrigin, u_sidebarGlassOrigin, useSidebar);
    vec2 targetSize = mix(u_headerSize, u_sidebarGlassSize, useSidebar);
    vec4 optics1 = mix(u_headerOptics1, u_sidebarOptics1, useSidebar);
    vec4 optics2 = mix(u_headerOptics2, u_sidebarOptics2, useSidebar);
    vec4 optics3 = mix(u_headerOptics3, u_sidebarOptics3, useSidebar);
    float refThickness = optics1.x;
    float refFactor = optics1.y;
    float refScale = optics1.z;
    float dispersionGain = optics1.w;
    float edgeFalloffPower = optics2.x;
    float reflectThickness = optics2.y;
    float reflectFalloffPower = optics2.z;
    float fresnelRange = optics2.w;
    float fresnelGain = optics3.x;
    float glareGain = optics3.y;
    float glassAlpha = optics3.z;
    float sidebarRimGain = optics3.w;
    float sidebarRimLength = u_headerOptics3.w;
    float backgroundBlur = mix(u_headerBackgroundBlur, u_sidebarBackgroundBlur, useSidebar);
    float inside = -sdf;
    vec2 normal = rectNormal(screenPx, targetOrigin, targetSize);
    float excludeSidebarContent = useSidebar;

    float stretchT = clamp(inside / max(refThickness, 1.0), 0.0, 1.0);
    float iorGain = max(refFactor - 1.0, 0.0);
    float remapPower = clamp(edgeFalloffPower / max(iorGain * refScale, 0.01), 0.12, 1.0);
    float sourceInside = refThickness * pow(stretchT, remapPower);
    float stretchPx = max(sourceInside - inside, 0.0) * (0.35 + iorGain * refScale);
    vec4 baseColor = sampleSceneWithMode(screenPx - normal * stretchPx, excludeSidebarContent, backgroundBlur);

    float reflectT = clamp(inside / max(reflectThickness, 1.0), 0.0, 1.0);
    float reflectBand = 1.0 - smoothstep(0.0, 1.0, reflectT);
    float reflectFalloff = pow(reflectBand, reflectFalloffPower);
    vec2 reflectOffset = -normal * reflectFalloff * reflectThickness * (0.45 + iorGain * refScale);
    vec4 reflectionColor = sampleDispersion(screenPx, reflectOffset, excludeSidebarContent, dispersionGain, backgroundBlur);
    float reflectionAlpha = reflectFalloff * glassAlpha;

    vec4 color = vec4(mix(baseColor.rgb, reflectionColor.rgb, clamp(reflectionAlpha, 0.0, 1.0)), 1.0);

    // The sidebar deliberately uses a dark glass treatment. The header is
    // left untinted so the edge animation is seen through clear glass.
    if (useSidebar > 0.5) {
        color.rgb = mix(color.rgb, u_sidebarGlassColor, 0.22);
    }

    color.rgb = mix(color.rgb, u_tint.rgb, u_tint.a);

    float fresnel = pow(1.0 - smoothstep(0.0, fresnelRange, inside), 3.0) * fresnelGain;
    color.rgb = mix(color.rgb, vec3(1.0), clamp(fresnel, 0.0, 0.72));

    float glareAngle = (angleOf(normalize(normal)) - PI * 0.25 + u_glareAngle) * 2.0;
    float glare = pow(clamp(0.5 + sin(glareAngle) * 0.5, 0.0, 1.0), 1.2);
    glare *= pow(1.0 - smoothstep(0.0, refThickness * 1.25, inside), 2.0);
    color.rgb += vec3(0.22, 0.44, 0.58) * glare * glareGain;

    if (useSidebar < 0.5) {
        float headerRim = pow(clamp(0.5 + sin(glareAngle) * 0.5, 0.0, 1.0), 3.0);
        headerRim *= pow(1.0 - smoothstep(0.0, 4.0, inside), 2.0);
        color.rgb += vec3(0.58, 0.82, 1.0) * headerRim * glareGain * 1.8;
    }

    // Directional, partial sidebar rim highlight.  It follows the rounded
    // rectangle normal and is deliberately limited to a narrow angled arc.
    if (useSidebar > 0.5) {
        float sidebarRim = pow(clamp(0.5 + sin(glareAngle) * 0.5, 0.0, 1.0), sidebarRimLength);
        sidebarRim *= pow(1.0 - smoothstep(0.0, 5.0, inside), 2.0);
        color.rgb += u_sidebarGlareColor * sidebarRim * sidebarRimGain;
    }

    float shapeAlpha = 1.0 - smoothstep(-1.0, 1.0, sdf);
    fragColor = vec4(color.rgb, shapeAlpha);
}`;

    class HeaderLiquidGlass {
        constructor() {
            this.canvas = document.getElementById('header-glass-webgl');
            this.header = document.getElementById('top-header');
            this.main = document.querySelector('.main-content');
            this.sidebar = document.querySelector('.sidebar');
            this.mainTexture = null;
            this.sidebarTexture = null;
            this.backgroundTexture = null;
            this.mainTextureSize = [1, 1];
            this.sidebarTextureSize = [1, 1];
            this.backgroundImageSize = [1, 1];
            this.captureTimer = null;
            this.interactionRaf = null;
            this.isCapturing = false;
            this.raf = null;
            this.config = {
                refThickness: 23,
                edgeFalloffPower: 0.6,
                reflectThickness: 12,
                reflectFalloffPower: 0.25,
                refFactor: 1.77,
                refScale: 1.4,
                dispersionGain: 20,
                blurRadius: 1.5,
                glassAlpha: 1,
                shadowStrength: 0.2,
                sampleOffset: [0, 0],
                mainTexAlign: [8, 0],
                sidebarTexAlign: [0, 0],
                fresnelRange: 30,
                fresnelGain: 0,
                glareGain: 0.1,
                glareAngle: -Math.PI / 4,
                tint: [1, 1, 1, 0]
            };
            this.sidebarConfig = { ...this.config };
            this.sidebarConfig.rimGain = 0.72;
            this.sidebarConfig.rimLength = 5.0;
            this.sidebarConfig.glassColor = [0.075, 0.105, 0.145];
            this.sidebarConfig.glareColor = [0.42, 0.72, 1.0];
        }

        async init() {
            document.documentElement.dataset.liquidGlassBoot = 'started';
            window.__headerLiquidGlass = this;
            if (!this.canvas || !this.header || !this.main || !this.sidebar) return;
            this.gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
            if (!this.gl) {
                document.documentElement.dataset.liquidGlassBoot = 'no-webgl2';
                return;
            }
            document.documentElement.dataset.liquidGlassGl = 'ok';

            await this.loadConfig();
            this.setupProgram();
            this.loadBackgroundTexture();
            this.applyGlassStyles();
            this.setupControls();
            this.resize();
            this.bindEvents();
            this.bindGlassInteractions();
            this.uploadSolidSceneTexture();
            await this.captureLayers();
            this.render();
            document.documentElement.dataset.liquidGlassBoot = 'ready';
        }

        async loadConfig() {
            try {
                const response = await fetch('layout.config.json');
                const layout = await response.json();
                const glass = layout?.header?.glass || {};
                const sidebarGlass = layout?.sidebar?.glass || {};
                const numeric = (value, fallback) => {
                    const number = Number(value);
                    return Number.isFinite(number) ? number : fallback;
                };
                const color = (value, fallback) => {
                    if (!/^#[0-9a-f]{6}$/i.test(value || '')) return fallback;
                    const n = parseInt(value.slice(1), 16);
                    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
                };
                Object.assign(this.config, {
                    refThickness: numeric(glass.refThickness, this.config.refThickness),
                    edgeFalloffPower: numeric(glass.edgeFalloffPower, this.config.edgeFalloffPower),
                    reflectThickness: numeric(glass.reflectThickness, this.config.reflectThickness),
                    reflectFalloffPower: numeric(glass.reflectFalloffPower, this.config.reflectFalloffPower),
                    refFactor: numeric(glass.refFactor, this.config.refFactor),
                    refScale: numeric(glass.refScale, this.config.refScale),
                    dispersionGain: numeric(glass.dispersionGain, this.config.dispersionGain),
                    blurRadius: numeric(parseFloat(layout?.header?.blurRadius), this.config.blurRadius),
                    glassAlpha: numeric(glass.glassAlpha, this.config.glassAlpha),
                    shadowStrength: numeric(glass.shadowStrength, this.config.shadowStrength),
                    sampleOffset: [
                        numeric(glass.sampleOffsetX, 0),
                        numeric(glass.sampleOffsetY, 0)
                    ],
                    mainTexAlign: [
                        numeric(glass.mainTextureAlignX, this.config.mainTexAlign[0]),
                        numeric(glass.mainTextureAlignY, this.config.mainTexAlign[1])
                    ],
                    sidebarTexAlign: [
                        numeric(glass.sidebarTextureAlignX, this.config.sidebarTexAlign[0]),
                        numeric(glass.sidebarTextureAlignY, this.config.sidebarTexAlign[1])
                    ],
                    fresnelRange: numeric(glass.refFresnelRange, this.config.fresnelRange),
                    fresnelGain: numeric(glass.refFresnelFactor, 22) / 100,
                    glareGain: numeric(glass.glareFactor, 38) / 100,
                    glareAngle: numeric(glass.glareAngle, this.config.glareAngle)
                });
                Object.assign(this.sidebarConfig, {
                    refThickness: numeric(sidebarGlass.refThickness, this.config.refThickness),
                    edgeFalloffPower: numeric(sidebarGlass.edgeFalloffPower, this.config.edgeFalloffPower),
                    reflectThickness: numeric(sidebarGlass.reflectThickness, this.config.reflectThickness),
                    reflectFalloffPower: numeric(sidebarGlass.reflectFalloffPower, this.config.reflectFalloffPower),
                    refFactor: numeric(sidebarGlass.refFactor, this.config.refFactor),
                    refScale: numeric(sidebarGlass.refScale, this.config.refScale),
                    dispersionGain: numeric(sidebarGlass.dispersionGain, this.config.dispersionGain),
                    blurRadius: numeric(parseFloat(layout?.sidebar?.blurRadius), this.config.blurRadius),
                    glassAlpha: numeric(sidebarGlass.glassAlpha, this.config.glassAlpha),
                    shadowStrength: numeric(sidebarGlass.shadowStrength, this.config.shadowStrength),
                    fresnelRange: numeric(sidebarGlass.refFresnelRange, this.config.fresnelRange),
                    fresnelGain: numeric(sidebarGlass.refFresnelFactor, this.config.fresnelGain * 100) / 100,
                    glareGain: numeric(sidebarGlass.glareFactor, this.config.glareGain * 100) / 100
                    ,rimGain: numeric(sidebarGlass.rimGain, this.sidebarConfig.rimGain)
                    ,rimLength: numeric(sidebarGlass.rimLength, this.sidebarConfig.rimLength)
                    ,glassColor: color(sidebarGlass.glassColor, this.sidebarConfig.glassColor)
                    ,glareColor: color(sidebarGlass.glareColor, this.sidebarConfig.glareColor)
                });
                if (sidebarGlass.textColor) document.documentElement.style.setProperty('--sidebar-item-color', sidebarGlass.textColor);
            } catch (error) {
                console.warn('Could not load liquid glass config:', error);
            }
        }

        cssColor(el, fallbackVar) {
            const root = getComputedStyle(document.documentElement);
            const color = getComputedStyle(el).backgroundColor || root.getPropertyValue(fallbackVar);
            const match = color.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
            return match ? [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255] : [1, 1, 1];
        }

        compile(type, source) {
            const gl = this.gl;
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(gl.getShaderInfoLog(shader));
            }
            return shader;
        }

        setupProgram() {
            const gl = this.gl;
            const program = gl.createProgram();
            gl.attachShader(program, this.compile(gl.VERTEX_SHADER, VERT_SRC));
            gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, FRAG_SRC));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(program));
            }
            this.program = program;
            gl.useProgram(program);

            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const pos = gl.getAttribLocation(program, 'a_pos');
            gl.enableVertexAttribArray(pos);
            gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

            this.uniforms = {};
            [
                'u_mainTex', 'u_sidebarTex', 'u_backgroundTex', 'u_canvasSize', 'u_backgroundImageSize', 'u_headerBackgroundBlur', 'u_sidebarBackgroundBlur', 'u_headerSize', 'u_headerOrigin',
                'u_sidebarGlassOrigin', 'u_sidebarGlassSize',
                'u_mainTexSize', 'u_sidebarTexSize', 'u_mainTexAlign', 'u_sidebarTexAlign',
                'u_mainRectPos', 'u_mainRectSize',
                'u_sidebarRectPos', 'u_sidebarRectSize',
                'u_sidebarScrollTop', 'u_mainScrollTop', 'u_mainBg', 'u_sidebarBg',
                'u_radius', 'u_headerOptics1', 'u_headerOptics2', 'u_headerOptics3',
                'u_sidebarOptics1', 'u_sidebarOptics2', 'u_sidebarOptics3',
                'u_glareAngle', 'u_tint', 'u_sidebarGlassColor', 'u_sidebarGlareColor'
            ].forEach(name => {
                this.uniforms[name] = gl.getUniformLocation(program, name);
            });
            gl.uniform1i(this.uniforms.u_mainTex, 0);
            gl.uniform1i(this.uniforms.u_sidebarTex, 1);
            gl.uniform1i(this.uniforms.u_backgroundTex, 2);
        }

        async loadBackgroundTexture() {
            this.backgroundCanvas = document.getElementById('shader-background');
            if (this.backgroundCanvas && this.backgroundCanvas.width && this.backgroundCanvas.height) {
                this.backgroundImageSize = [this.backgroundCanvas.width, this.backgroundCanvas.height];
                this.uploadBackgroundTexture(this.backgroundCanvas);
                document.documentElement.dataset.liquidGlassBackground = 'ready';
            } else {
                const fallback = new Uint8Array([223, 229, 228, 255]);
                this.uploadBackgroundTexture({ width: 1, height: 1, data: fallback });
                document.documentElement.dataset.liquidGlassBackground = 'fallback';
            }
        }

        applyGlassStyles() {
            const root = document.documentElement;
            root.style.setProperty('--header-blur', `${this.config.blurRadius}px`);
            root.style.setProperty(
                '--header-shadow',
                `0 10px 28px rgba(20, 24, 28, ${this.config.shadowStrength})`
            );
            root.style.setProperty(
                '--sidebar-shadow',
                `0 10px 28px rgba(20, 24, 28, ${Math.max(this.sidebarConfig.shadowStrength * 0.85, 0)})`
            );
        }

        setupControls() {
            const bind = (id, target, key, digits, onInput) => {
                const slider = document.getElementById(id);
                const output = document.getElementById(`${id}-value`);
                if (!slider || !output) return;
                const sync = () => {
                    slider.value = Number(target[key]).toFixed(digits);
                    output.value = Number(target[key]).toFixed(digits);
                };
                sync();
                slider.addEventListener('input', () => {
                    const value = Number(slider.value);
                    target[key] = value;
                    output.value = value.toFixed(digits);
                    onInput(value);
                });
            };

            const header = this.config;
            bind('glass-ref-factor', header, 'refFactor', 2, () => this.render());
            bind('glass-ref-thickness', header, 'refThickness', 0, () => this.render());
            bind('glass-edge-falloff', header, 'edgeFalloffPower', 2, () => this.render());
            bind('glass-reflect-thickness', header, 'reflectThickness', 0, () => this.render());
            bind('glass-reflect-falloff', header, 'reflectFalloffPower', 2, () => this.render());
            bind('glass-dispersion-gain', header, 'dispersionGain', 1, () => this.render());
            bind('glass-fresnel-gain', header, 'fresnelGain', 2, () => this.render());
            bind('glass-glare-gain', header, 'glareGain', 2, () => this.render());
            bind('glass-shadow-gain', header, 'shadowStrength', 2, () => {
                this.applyGlassStyles();
                this.render();
            });
            bind('glass-blur-radius', header, 'blurRadius', 1, () => {
                this.applyGlassStyles();
                this.scheduleCapture(180);
                this.render();
            });
            bind('glass-alpha', header, 'glassAlpha', 2, () => this.render());
            bind('glass-glare-angle', header, 'glareAngle', 2, () => this.render());
            this.setupSidebarControls(bind);
        }

        setupSidebarControls(bind) {
            const panel = document.getElementById('glass-control');
            if (!panel || panel.querySelector('#sidebar-glass-ref-factor')) return;
            const headerSection = document.createElement('section');
            headerSection.className = 'glass-control-section';
            headerSection.innerHTML = '<h2>Header</h2>';
            [...panel.children]
                .filter(node => !node.classList.contains('glass-control-section'))
                .forEach(node => headerSection.appendChild(node));
            panel.insertBefore(headerSection, panel.firstChild);

            const fields = [
                ['ref-factor', 'Refraction', 1.01, 2.20, 0.01, 'refFactor', 2],
                ['ref-thickness', 'Stretch Width', 4, 64, 1, 'refThickness', 0],
                ['edge-falloff', 'Stretch Falloff', 0.15, 2, 0.05, 'edgeFalloffPower', 2],
                ['reflect-thickness', 'Reflect Width', 2, 48, 1, 'reflectThickness', 0],
                ['reflect-falloff', 'Reflect Falloff', 0.25, 4, 0.05, 'reflectFalloffPower', 2],
                ['dispersion-gain', 'Dispersion', 0, 20, 0.1, 'dispersionGain', 1],
                ['fresnel-gain', 'Fresnel', 0, 1, 0.01, 'fresnelGain', 2],
                ['glare-gain', 'Highlight', 0, 1, 0.01, 'glareGain', 2],
                ['shadow-gain', 'Shadow', 0, 0.4, 0.01, 'shadowStrength', 2],
                ['blur-radius', 'Blur', 0, 40, 0.5, 'blurRadius', 1],
                ['alpha', 'Reflect Alpha', 0, 1, 0.01, 'glassAlpha', 2],
                ['rim-gain', 'Rim Glare', 0, 1.5, 0.01, 'rimGain', 2],
                ['rim-length', 'Rim Length', 1, 12, 0.1, 'rimLength', 1]
            ];
            const sidebarSection = document.createElement('section');
            sidebarSection.className = 'glass-control-section';
            sidebarSection.innerHTML = '<h2>Sidebar</h2>' + fields.map(([suffix, label, min, max, step]) =>
                `<label for="sidebar-glass-${suffix}">${label}</label><input id="sidebar-glass-${suffix}" type="range" min="${min}" max="${max}" step="${step}"><output id="sidebar-glass-${suffix}-value"></output>`
            ).join('');
            panel.appendChild(sidebarSection);
            fields.forEach(([suffix, , , , , key, digits]) => {
                const id = `sidebar-glass-${suffix}`;
                bind(id, this.sidebarConfig, key, digits, () => {
                    if (key === 'shadowStrength') this.applyGlassStyles();
                    if (key === 'blurRadius') this.scheduleCapture(180);
                    this.render();
                });
            });
            const toHex = value => `#${value.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
            const addColor = (suffix, label, value, onInput) => {
                const title = document.createElement('label'); title.htmlFor = `sidebar-${suffix}`; title.textContent = label;
                const input = document.createElement('input'); input.type = 'color'; input.id = `sidebar-${suffix}`; input.value = value;
                const output = document.createElement('output'); output.textContent = value;
                input.addEventListener('input', () => { const hex=input.value; const n=parseInt(hex.slice(1),16); onInput([(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]); output.textContent=hex; this.render(); });
                sidebarSection.append(title, input, output);
            };
            addColor('glass-color', 'Glass Color', toHex(this.sidebarConfig.glassColor), value => { this.sidebarConfig.glassColor = value; });
            addColor('glare-color', 'Glare Color', toHex(this.sidebarConfig.glareColor), value => { this.sidebarConfig.glareColor = value; });
            addColor('text-color', 'Text Color', '#000000', value => { document.documentElement.style.setProperty('--sidebar-item-color', `rgb(${value.map(v=>Math.round(v*255)).join(',')})`); });
        }

        bindEvents() {
            window.addEventListener('resize', () => {
                this.resize();
                this.scheduleCapture(350);
            });
            [this.main, this.sidebar].forEach(el => {
                el.addEventListener('scroll', () => this.render(), { passive: true });
            });
            window.addEventListener('hashchange', () => this.scheduleCapture(700));
            window.addEventListener('shaderbackgroundframe', () => {
                if (!this.backgroundCanvas?.width) return;
                this.backgroundImageSize = [this.backgroundCanvas.width, this.backgroundCanvas.height];
                this.uploadBackgroundTexture(this.backgroundCanvas);
                this.render();
            });

            const pageContent = document.getElementById('page-content');
            if (pageContent && typeof MutationObserver !== 'undefined') {
                this.observer = new MutationObserver(() => this.scheduleCapture(600));
                this.observer.observe(pageContent, { childList: true, subtree: true });
            }
        }

        animateGlassGeometry(duration = 240) {
            const start = performance.now();
            cancelAnimationFrame(this.interactionRaf);
            const tick = now => {
                this.render();
                if (now - start < duration) {
                    this.interactionRaf = requestAnimationFrame(tick);
                }
            };
            this.interactionRaf = requestAnimationFrame(tick);
        }

        resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.dpr = dpr;
            this.canvas.style.left = '0px';
            this.canvas.style.top = '0px';
            this.canvas.style.width = window.innerWidth + 'px';
            this.canvas.style.height = window.innerHeight + 'px';
            this.canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
            this.canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }

        scheduleCapture(delay) {
            clearTimeout(this.captureTimer);
            this.captureTimer = setTimeout(() => this.captureLayers(), delay);
        }

        async captureLayers() {
            if (!window.html2canvas || !this.gl || this.isCapturing) return;
            this.isCapturing = true;
            document.documentElement.dataset.liquidGlassCapture = 'started';
            try {
                await this.captureContentLayers();
                document.documentElement.dataset.liquidGlassCapture = 'layers-ready';
                this.render();
            } catch (error) {
                document.documentElement.dataset.liquidGlassCapture = 'failed';
                console.warn('Liquid glass layer capture failed:', error);
            } finally {
                this.isCapturing = false;
            }
        }

        hideChromeInClone(doc) {
            [
                '#top-header',
                '#header-glass-webgl',
                '#glass-control',
                '.search-modal'
            ].forEach(selector => {
                const node = doc.querySelector(selector);
                if (node) node.style.visibility = 'hidden';
            });
        }

        async captureContentLayers() {
            const mainRect = this.main.getBoundingClientRect();
            const sidebarRect = this.sidebar.getBoundingClientRect();
            const mainWidth = Math.max(1, Math.ceil(mainRect.width));
            const mainHeight = Math.max(1, Math.ceil(this.main.scrollHeight));
            const sidebarWidth = Math.max(1, Math.ceil(sidebarRect.width));
            const sidebarHeight = Math.max(1, Math.ceil(this.sidebar.scrollHeight));
            const windowWidth = Math.max(1, Math.ceil(window.innerWidth));
            const windowHeight = Math.max(Math.ceil(window.innerHeight), mainHeight, sidebarHeight);

            const captureOptions = {
                backgroundColor: null,
                scale: 1,
                windowWidth,
                windowHeight,
                scrollX: 0,
                scrollY: 0,
                logging: false,
                useCORS: true,
                onclone: doc => {
                    doc.documentElement.style.height = `${windowHeight}px`;
                    doc.documentElement.style.background = 'transparent';
                    doc.body.style.height = `${windowHeight}px`;
                    doc.body.style.overflow = 'visible';
                    doc.body.style.background = 'transparent';
                    this.hideChromeInClone(doc);

                    const app = doc.querySelector('#app');
                    if (app) {
                        app.style.height = `${windowHeight}px`;
                        app.style.overflow = 'visible';
                    }

                    const clonedMain = doc.querySelector('.main-content');
                    if (clonedMain) {
                        clonedMain.scrollTop = 0;
                        clonedMain.style.height = `${mainHeight}px`;
                        clonedMain.style.overflow = 'visible';
                    }

                    const clonedSidebar = doc.querySelector('.sidebar');
                    if (clonedSidebar) {
                        clonedSidebar.scrollTop = 0;
                        clonedSidebar.style.height = `${sidebarHeight}px`;
                        clonedSidebar.style.overflow = 'visible';
                    }
                }
            };

            const main = await window.html2canvas(document.body, {
                ...captureOptions,
                x: Math.round(mainRect.left),
                y: Math.round(mainRect.top),
                width: mainWidth,
                height: mainHeight
            });

            const sidebar = await window.html2canvas(document.body, {
                ...captureOptions,
                x: Math.round(sidebarRect.left),
                y: Math.round(sidebarRect.top),
                width: sidebarWidth,
                height: sidebarHeight
            });

            const blurredMain = this.blurCanvas(main, this.config.blurRadius);
            const blurredSidebar = this.blurCanvas(sidebar, this.sidebarConfig.blurRadius);

            this.uploadTexture('main', blurredMain);
            this.uploadTexture('sidebar', blurredSidebar);
            document.documentElement.dataset.liquidGlassSceneTexture =
                `main:${blurredMain.width}x${blurredMain.height};sidebar:${blurredSidebar.width}x${blurredSidebar.height}`;
        }

        blurCanvas(source, radius) {
            const blur = Math.max(0, Number(radius) || 0);
            if (!blur || source.data) return source;

            const canvas = document.createElement('canvas');
            canvas.width = source.width;
            canvas.height = source.height;
            const ctx = canvas.getContext('2d');
            if (!ctx || !('filter' in ctx)) return source;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.filter = `blur(${blur}px)`;
            ctx.drawImage(source, 0, 0);
            ctx.filter = 'none';
            return canvas;
        }

        cssColorBytes(el, fallbackVar) {
            const rgb = this.cssColor(el, fallbackVar);
            return rgb.map(v => Math.round(v * 255));
        }

        uploadSolidSceneTexture() {
            const mainBg = this.cssColorBytes(document.body, '--bg-content');
            const data = new Uint8Array([mainBg[0], mainBg[1], mainBg[2], 255]);
            this.uploadTexture('main', { width: 1, height: 1, data });
            this.uploadTexture('sidebar', { width: 1, height: 1, data });
        }

        uploadTexture(layer, source) {
            const gl = this.gl;
            const textureProp = layer === 'sidebar' ? 'sidebarTexture' : 'mainTexture';
            const sizeProp = layer === 'sidebar' ? 'sidebarTextureSize' : 'mainTextureSize';
            if (!this[textureProp]) this[textureProp] = gl.createTexture();
            const texture = this[textureProp];
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            if (source.data) {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data);
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            }
            this[sizeProp] = [source.width, source.height];
            document.documentElement.dataset.liquidGlassTexture = 'ok';
        }

        uploadBackgroundTexture(source) {
            const gl = this.gl;
            if (!this.backgroundTexture) this.backgroundTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            if (source.data) {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data);
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            }
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        }

        render() {
            if (!this.gl || !this.program) return;
            if (this.raf) return;
            this.raf = requestAnimationFrame(() => {
                this.raf = null;
                const gl = this.gl;
                const headerRect = this.header.getBoundingClientRect();
                const mainRect = this.main.getBoundingClientRect();
                const sidebarRect = this.sidebar.getBoundingClientRect();
                const radius = parseFloat(getComputedStyle(this.header).borderTopLeftRadius) || 22;
                const mainBg = this.cssColor(document.body, '--bg-content');
                const sidebarBg = mainBg;
                document.documentElement.dataset.liquidGlassGeometry = JSON.stringify({
                    header: [Math.round(headerRect.left), Math.round(headerRect.top), Math.round(headerRect.width), Math.round(headerRect.height)],
                    main: [Math.round(mainRect.left), Math.round(mainRect.top), Math.round(mainRect.width), Math.round(mainRect.height), Math.round(this.main.scrollTop)],
                    sidebar: [Math.round(sidebarRect.left), Math.round(sidebarRect.top), Math.round(sidebarRect.width), Math.round(sidebarRect.height), Math.round(this.sidebar.scrollTop)],
                    mainTex: this.mainTextureSize,
                    sidebarTex: this.sidebarTextureSize,
                    sampleOffset: this.config.sampleOffset,
                    mainTexAlign: this.config.mainTexAlign,
                    sidebarTexAlign: this.config.sidebarTexAlign,
                    preBlurRadius: this.config.blurRadius,
                    glassAlpha: this.config.glassAlpha,
                    sidebarGlassAlpha: this.sidebarConfig.glassAlpha,
                    refThickness: this.config.refThickness,
                    edgeFalloffPower: this.config.edgeFalloffPower,
                    reflectThickness: this.config.reflectThickness,
                    reflectFalloffPower: this.config.reflectFalloffPower,
                    refScale: this.config.refScale
                });

                gl.useProgram(this.program);
                gl.viewport(0, 0, this.canvas.width, this.canvas.height);
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);

                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.mainTexture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, this.sidebarTexture);
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);

                gl.uniform2f(this.uniforms.u_headerOrigin, headerRect.left, headerRect.top);
                gl.uniform2f(this.uniforms.u_canvasSize, window.innerWidth, window.innerHeight);
                gl.uniform2f(this.uniforms.u_backgroundImageSize, this.backgroundImageSize[0], this.backgroundImageSize[1]);
                gl.uniform1f(this.uniforms.u_headerBackgroundBlur, this.config.blurRadius);
                gl.uniform1f(this.uniforms.u_sidebarBackgroundBlur, this.sidebarConfig.blurRadius);
                gl.uniform2f(this.uniforms.u_headerSize, headerRect.width, headerRect.height);
                gl.uniform2f(this.uniforms.u_sidebarGlassOrigin, sidebarRect.left, sidebarRect.top);
                gl.uniform2f(this.uniforms.u_sidebarGlassSize, sidebarRect.width, sidebarRect.height);
                gl.uniform2f(this.uniforms.u_mainTexSize, this.mainTextureSize[0], this.mainTextureSize[1]);
                gl.uniform2f(this.uniforms.u_sidebarTexSize, this.sidebarTextureSize[0], this.sidebarTextureSize[1]);
                gl.uniform2f(this.uniforms.u_mainTexAlign, this.config.mainTexAlign[0], this.config.mainTexAlign[1]);
                gl.uniform2f(this.uniforms.u_sidebarTexAlign, this.config.sidebarTexAlign[0], this.config.sidebarTexAlign[1]);
                gl.uniform2f(this.uniforms.u_mainRectPos, mainRect.left, mainRect.top);
                gl.uniform2f(this.uniforms.u_mainRectSize, mainRect.width, mainRect.height);
                gl.uniform2f(this.uniforms.u_sidebarRectPos, sidebarRect.left, sidebarRect.top);
                gl.uniform2f(this.uniforms.u_sidebarRectSize, sidebarRect.width, sidebarRect.height);
                gl.uniform1f(this.uniforms.u_sidebarScrollTop, this.sidebar.scrollTop);
                gl.uniform1f(this.uniforms.u_mainScrollTop, this.main.scrollTop);
                gl.uniform3fv(this.uniforms.u_mainBg, mainBg);
                gl.uniform3fv(this.uniforms.u_sidebarBg, sidebarBg);
                gl.uniform1f(this.uniforms.u_radius, radius);
                const setOptics = (prefix, config) => {
                    gl.uniform4f(this.uniforms[`${prefix}Optics1`], config.refThickness, config.refFactor, config.refScale, config.dispersionGain);
                    gl.uniform4f(this.uniforms[`${prefix}Optics2`], config.edgeFalloffPower, config.reflectThickness, config.reflectFalloffPower, config.fresnelRange);
                    gl.uniform4f(this.uniforms[`${prefix}Optics3`], config.fresnelGain, config.glareGain, config.glassAlpha, prefix === 'u_sidebar' ? config.rimGain : this.sidebarConfig.rimLength);
                };
                setOptics('u_header', this.config);
                setOptics('u_sidebar', this.sidebarConfig);
                gl.uniform1f(this.uniforms.u_glareAngle, this.config.glareAngle);
                gl.uniform4fv(this.uniforms.u_tint, this.config.tint);
                gl.uniform3fv(this.uniforms.u_sidebarGlassColor, this.sidebarConfig.glassColor);
                gl.uniform3fv(this.uniforms.u_sidebarGlareColor, this.sidebarConfig.glareColor);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            });
        }
    }

    HeaderLiquidGlass.prototype.bindGlassInteractions = function () {
        const bindPanel = (target, options) => {
            if (!target) return;
            let active = false;
            let pending = false;
            let pointer = null;
            let interactionRect = null;
            let interactionFrame = 0;
            let baseRect = null;

            const readBaseRect = () => {
                const rect = target.getBoundingClientRect();
                return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
            };

            const reset = () => {
                active = false;
                pointer = null;
                interactionRect = null;
                if (interactionFrame) cancelAnimationFrame(interactionFrame);
                interactionFrame = 0;
                pending = false;
                target.classList.remove('is-liquid-glass-hover');
                target.style.setProperty('--glass-drift-x', '0px');
                target.style.setProperty('--glass-drift-y', '0px');
                target.style.setProperty('--glass-scale-x', '1');
                target.style.setProperty('--glass-scale-y', '1');
                target.style.setProperty('--glass-origin-x', options.edgeOnly ? '0%' : '50%');
                target.style.setProperty('--glass-origin-y', options.edgeOnly ? '0%' : '50%');
                this.animateGlassGeometry(420);
            };

            const update = () => {
                pending = false;
                if (!active || !pointer) return;

                const rect = interactionRect || target.getBoundingClientRect();
                const x = Math.max(-1, Math.min(1, (pointer.x - (rect.left + rect.width * 0.5)) / Math.max(rect.width * 0.5, 1)));
                const y = Math.max(-1, Math.min(1, (pointer.y - (rect.top + rect.height * 0.5)) / Math.max(rect.height * 0.5, 1)));
                target.classList.add('is-liquid-glass-hover');
                if (options.edgeOnly) {
                    const left = Math.max(-x, 0) * options.edgeX;
                    const right = Math.max(x, 0) * options.edgeX;
                    const top = Math.max(-y, 0) * options.edgeY;
                    const bottom = Math.max(y, 0) * options.edgeY;
                    target.style.setProperty('--glass-drift-x', `${(-left).toFixed(2)}px`);
                    target.style.setProperty('--glass-drift-y', `${(-top).toFixed(2)}px`);
                    target.style.setProperty('--glass-scale-x', (1 + (left + right) / rect.width).toFixed(5));
                    target.style.setProperty('--glass-scale-y', (1 + (top + bottom) / rect.height).toFixed(5));
                    target.style.setProperty('--glass-origin-x', '0%');
                    target.style.setProperty('--glass-origin-y', '0%');
                } else {
                    const xStrength = 0.35 + Math.abs(x) * 0.65;
                    const yStrength = 0.35 + Math.abs(y) * 0.65;
                    target.style.setProperty('--glass-drift-x', `${(x * options.driftX).toFixed(2)}px`);
                    target.style.setProperty('--glass-drift-y', `${(y * options.driftY).toFixed(2)}px`);
                    target.style.setProperty('--glass-scale-x', (1 + options.scaleX * xStrength).toFixed(4));
                    target.style.setProperty('--glass-scale-y', (1 + options.scaleY * yStrength).toFixed(4));
                    target.style.setProperty('--glass-origin-x', `${((1 - x) * 50).toFixed(1)}%`);
                    target.style.setProperty('--glass-origin-y', `${((1 - y) * 50).toFixed(1)}%`);
                }
                this.animateGlassGeometry(options.duration || 420);
            };

            const queueUpdate = event => {
                if (options.edgeOnly && interactionRect && (
                    event.clientX < interactionRect.left || event.clientX > interactionRect.right ||
                    event.clientY < interactionRect.top || event.clientY > interactionRect.bottom
                )) {
                    reset();
                    return;
                }
                pointer = { x: event.clientX, y: event.clientY };
                if (!active || pending) return;
                pending = true;
                interactionFrame = requestAnimationFrame(() => {
                    interactionFrame = 0;
                    update();
                });
            };

            if (options.edgeOnly) {
                // Keep hit-testing independent from the transformed sidebar. Using
                // pointerenter/leave on the moving element can miss a fast re-entry.
                baseRect = readBaseRect();
                window.addEventListener('resize', () => {
                    if (!active) baseRect = readBaseRect();
                }, { passive: true });
                document.addEventListener('pointermove', event => {
                    const rect = baseRect;
                    const inside = rect && event.clientX >= rect.left && event.clientX <= rect.right &&
                        event.clientY >= rect.top && event.clientY <= rect.bottom;
                    if (!inside) {
                        if (active) reset();
                        return;
                    }
                    if (!active) {
                        active = true;
                        interactionRect = rect;
                    }
                    queueUpdate(event);
                }, { passive: true });
                window.addEventListener('blur', reset);
            } else {
                target.addEventListener('pointerenter', event => {
                    active = true;
                    interactionRect = target.getBoundingClientRect();
                    queueUpdate(event);
                });
                target.addEventListener('pointermove', queueUpdate, { passive: true });
                target.addEventListener('pointerleave', reset);
                target.addEventListener('pointercancel', reset);
            }
        };

        bindPanel(this.header, { driftX: 2, driftY: 2, scaleX: 0, scaleY: 0.022 });
        bindPanel(this.sidebar, { driftX: 0, driftY: 0, scaleX: 0, scaleY: 0, edgeOnly: true, edgeX: 10, edgeY: 10, duration: 760 });
    };

    const boot = () => {
        if (window.headerLiquidGlass) return;
        const renderer = new HeaderLiquidGlass();
        window.headerLiquidGlass = renderer;
        renderer.init();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
