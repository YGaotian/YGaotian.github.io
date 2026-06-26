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

    const BLUR_FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_source;
uniform vec2 u_texel;
uniform vec2 u_direction;
uniform float u_radius;
void main() {
    vec3 sum = vec3(0.0);
    float total = 0.0;
    for (int i = -8; i <= 8; i++) {
        float x = float(i);
        float weight = exp(-(x * x) / 18.0);
        vec2 offset = u_direction * u_texel * (x / 8.0) * u_radius;
        sum += texture(u_source, clamp(v_uv + offset, 0.0, 1.0)).rgb * weight;
        total += weight;
    }
    fragColor = vec4(sum / total, 1.0);
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
    return vec4(texture(u_backgroundTex, uv).rgb, 1.0);
}

vec4 compositeOverBackground(vec4 sampleColor, vec2 screenPx, float blurPx) {
    return vec4(mix(sampleBackground(screenPx, blurPx).rgb, sampleColor.rgb, sampleColor.a), 1.0);
}

vec4 sampleSceneWithMode(vec2 screenPx, float excludeSidebarContent, float blurPx) {
    // Header combines a fixed watercolor background with a separately captured,
    // transparent article-ink texture that follows only the article scroll.
    if (excludeSidebarContent < 0.5) {
        vec4 background = sampleBackground(screenPx, blurPx);
        if (screenPx.x >= u_mainRectPos.x && screenPx.x <= u_mainRectPos.x + u_mainRectSize.x &&
            screenPx.y >= u_mainRectPos.y && screenPx.y <= u_mainRectPos.y + u_mainRectSize.y) {
            vec2 local = vec2(screenPx.x - u_mainRectPos.x, screenPx.y - u_mainRectPos.y + u_mainScrollTop) + u_mainTexAlign;
            vec2 uv = local / u_mainTexSize;
            if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
                return compositeOverBackground(texture(u_mainTex, uv), screenPx, blurPx);
            }
        }
        return background;
    }
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
            this.backgroundSampleCanvas = document.createElement('canvas');
            this.backgroundSampleContext = this.backgroundSampleCanvas.getContext('2d', { alpha: false });
            this.backgroundSourceTexture = null;
            this.backgroundBlurTempTexture = null;
            this.backgroundFramebuffer = null;
            this.backgroundBlurSize = [0, 0];
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

            this.quadBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
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

            const blurProgram = gl.createProgram();
            gl.attachShader(blurProgram, this.compile(gl.VERTEX_SHADER, VERT_SRC));
            gl.attachShader(blurProgram, this.compile(gl.FRAGMENT_SHADER, BLUR_FRAG_SRC));
            gl.linkProgram(blurProgram);
            if (!gl.getProgramParameter(blurProgram, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(blurProgram));
            this.blurProgram = blurProgram;
            this.blurUniforms = {
                source: gl.getUniformLocation(blurProgram, 'u_source'),
                texel: gl.getUniformLocation(blurProgram, 'u_texel'),
                direction: gl.getUniformLocation(blurProgram, 'u_direction'),
                radius: gl.getUniformLocation(blurProgram, 'u_radius')
            };
        }

        bindQuad(program) {
            const gl = this.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            const pos = gl.getAttribLocation(program, 'a_pos');
            gl.enableVertexAttribArray(pos);
            gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
        }

        async loadBackgroundTexture() {
            this.backgroundCanvas = document.getElementById('image-background');
            if (this.backgroundCanvas?.width && this.backgroundCanvas?.height) {
                this.uploadBackgroundTexture(this.backgroundCanvas);
                document.documentElement.dataset.liquidGlassBackground = 'webgl-image-reveal';
                return;
            }
            const fallback = new Uint8Array([223, 229, 228, 255]);
            this.uploadBackgroundTexture({ width: 1, height: 1, data: fallback });
            document.documentElement.dataset.liquidGlassBackground = 'waiting-webgl-image-reveal';
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
            let resizeTimer = 0;
            window.addEventListener('resize', () => {
                // Keep the glass geometry aligned with the live CSS layout while
                // preserving the existing framebuffer until resizing settles.
                this.canvas.style.width = window.innerWidth + 'px';
                this.canvas.style.height = window.innerHeight + 'px';
                this.render();
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    this.resize();
                    this.render();
                    this.scheduleCapture(350);
                }, 220);
            }, { passive: true });
            [this.main, this.sidebar].forEach(el => {
                el.addEventListener('scroll', () => this.render(), { passive: true });
            });
            window.addEventListener('hashchange', () => this.scheduleCapture(700));
            window.addEventListener('imagebackgroundframe', () => {
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
            const isiPad = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const dpr = Math.min(window.devicePixelRatio || 1, isiPad ? 1.25 : 2);
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
                '#image-background',
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

                    // The header texture must contain article ink only. Remove
                    // all glass/background plates from the clone while retaining
                    // text, code and inline formatting.
                    doc.querySelectorAll('#page-content *, .content-header-bar').forEach(node => {
                        // Code frames are visual content. Keeping their dark
                        // surface in this texture lets the header refract them
                        // instead of rendering only the surrounding text.
                        if (node.matches('pre, pre *')) return;
                        node.style.background = 'transparent';
                        node.style.boxShadow = 'none';
                        node.style.backdropFilter = 'none';
                        node.style.webkitBackdropFilter = 'none';
                    });

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
            let uploadSource = source;
            if (!source.data && this.backgroundSampleContext) {
                const width = Math.max(1, Math.round(source.width * 0.5));
                const height = Math.max(1, Math.round(source.height * 0.5));
                if (this.backgroundSampleCanvas.width !== width) this.backgroundSampleCanvas.width = width;
                if (this.backgroundSampleCanvas.height !== height) this.backgroundSampleCanvas.height = height;
                this.backgroundSampleContext.drawImage(source, 0, 0, width, height);
                uploadSource = this.backgroundSampleCanvas;
            }
            this.backgroundImageSize = [uploadSource.width, uploadSource.height];
            if (!this.backgroundSourceTexture) this.backgroundSourceTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.backgroundSourceTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            if (uploadSource.data) {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, uploadSource.width, uploadSource.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, uploadSource.data);
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, uploadSource);
            }
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            this.runBackgroundBlur(uploadSource.width, uploadSource.height);
        }

        ensureBlurTexture(texture, width, height) {
            const gl = this.gl;
            if (!texture) texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            return texture;
        }

        runBackgroundBlur(width, height) {
            const gl = this.gl;
            if (this.backgroundBlurSize[0] !== width || this.backgroundBlurSize[1] !== height) {
                this.backgroundBlurTempTexture = this.ensureBlurTexture(this.backgroundBlurTempTexture, width, height);
                this.backgroundTexture = this.ensureBlurTexture(this.backgroundTexture, width, height);
                this.backgroundBlurSize = [width, height];
            }
            if (!this.backgroundFramebuffer) this.backgroundFramebuffer = gl.createFramebuffer();
            gl.useProgram(this.blurProgram);
            this.bindQuad(this.blurProgram);
            gl.viewport(0, 0, width, height);
            gl.activeTexture(gl.TEXTURE0);
            gl.uniform1i(this.blurUniforms.source, 0);
            gl.uniform2f(this.blurUniforms.texel, 1 / width, 1 / height);
            const radius = Math.max(this.config.blurRadius, this.sidebarConfig.blurRadius) * width / Math.max(window.innerWidth, 1);
            gl.uniform1f(this.blurUniforms.radius, radius);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.backgroundFramebuffer);

            gl.bindTexture(gl.TEXTURE_2D, this.backgroundSourceTexture);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.backgroundBlurTempTexture, 0);
            gl.uniform2f(this.blurUniforms.direction, 1, 0);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            gl.bindTexture(gl.TEXTURE_2D, this.backgroundBlurTempTexture);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.backgroundTexture, 0);
            gl.uniform2f(this.blurUniforms.direction, 0, 1);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
                this.bindQuad(this.program);
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
            const setGlassVar = (name, value) => {
                target.style.setProperty(name, value);
            };
            let active = false;
            let pending = false;
            let pointer = null;
            let interactionRect = null;
            let interactionFrame = 0;
            let baseRect = null;
            let lastEdgeState = null;
            let settleFrame = 0;

            // Edge interaction state for sidebar
            let edgeInteraction = null; // { edge, startPointer, startDistance, currentAmount }
            let isSettling = false;

            const readBaseRect = () => {
                const rect = target.getBoundingClientRect();
                return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
            };

            const applyRect = rect => {
                if (!baseRect) baseRect = readBaseRect();
                const base = baseRect;
                setGlassVar('--glass-drift-x', `${(rect.left - base.left).toFixed(2)}px`);
                setGlassVar('--glass-drift-y', `${(rect.top - base.top).toFixed(2)}px`);
                setGlassVar('--glass-scale-x', (rect.width / Math.max(base.width, 1)).toFixed(5));
                setGlassVar('--glass-scale-y', (rect.height / Math.max(base.height, 1)).toFixed(5));
                setGlassVar('--glass-origin-x', '0%');
                setGlassVar('--glass-origin-y', '0%');
            };

            const shapeRectForEdge = (edge, amount) => {
                const base = baseRect || readBaseRect();
                const rect = { ...base };
                const horizontal = edge === 'left' || edge === 'right';
                const signed = Number(amount) || 0;
                const minSize = 40;

                if (horizontal) {
                    const width = Math.max(minSize, base.width + signed);
                    const height = (base.width * base.height) / width;
                    const adjacentDelta = (base.height - height) * 0.5;
                    if (edge === 'left') rect.left = base.right - width;
                    if (edge === 'right') rect.right = base.left + width;
                    rect.width = width;
                    rect.top = base.top + adjacentDelta;
                    rect.bottom = base.bottom - adjacentDelta;
                    rect.height = height;
                } else {
                    const height = Math.max(minSize, base.height + signed);
                    const width = (base.width * base.height) / height;
                    const adjacentDelta = (base.width - width) * 0.5;
                    if (edge === 'top') rect.top = base.bottom - height;
                    if (edge === 'bottom') rect.bottom = base.top + height;
                    rect.height = height;
                    rect.left = base.left + adjacentDelta;
                    rect.right = base.right - adjacentDelta;
                    rect.width = width;
                }
                return rect;
            };

            // Signed distance from point to a specific edge of rect
            // Positive = inside, Negative = outside
            const distToEdge = (point, rect, edge) => {
                switch (edge) {
                    case 'left':   return point.x - rect.left;
                    case 'right':  return rect.right - point.x;
                    case 'top':    return point.y - rect.top;
                    case 'bottom': return rect.bottom - point.y;
                }
            };

            // Perpendicular coordinate of the mouse relative to an edge
            const edgeCoord = (point, edge) => {
                switch (edge) {
                    case 'left': case 'right': return point.x;
                    case 'top': case 'bottom':  return point.y;
                }
            };

            // Reset glass vars to identity
            const resetGlassVars = () => {
                settleFrame = 0;
                isSettling = false;
                edgeInteraction = null;
                lastEdgeState = null;
                setGlassVar('--glass-drift-x', '0px');
                setGlassVar('--glass-drift-y', '0px');
                setGlassVar('--glass-scale-x', '1');
                setGlassVar('--glass-scale-y', '1');
                this.render();
            };

            // Elastic recovery: single visible overshoot then settle to zero
            const settleEdge = (edge, amount, duration = 350) => {
                if (!options.edgeOnly || !baseRect) return;
                cancelAnimationFrame(settleFrame);
                isSettling = true;
                const start = performance.now();
                const tick = now => {
                    const t = Math.min(1, (now - start) / duration);
                    // phase [0 → 1.5π]: zero crossing at t≈0.33, overshoot peak at t≈0.67, ends at 0
                    const phase = t * Math.PI * 1.5;
                    const decay = Math.exp(-1.2 * t);
                    const current = amount * decay * Math.cos(phase);
                    applyRect(shapeRectForEdge(edge, current));
                    this.render();
                    if (t < 1 && Math.abs(current) > 0.05) {
                        settleFrame = requestAnimationFrame(tick);
                    } else {
                        resetGlassVars();
                    }
                };
                settleFrame = requestAnimationFrame(tick);
            };

            // Smooth recovery without overshoot
            const smoothRecover = (edge, amount, duration = 200) => {
                if (!options.edgeOnly || !baseRect) return;
                cancelAnimationFrame(settleFrame);
                isSettling = true;
                const start = performance.now();
                const tick = now => {
                    const t = Math.min(1, (now - start) / duration);
                    const ease = 1 - (1 - t) * (1 - t);
                    const current = amount * (1 - ease);
                    applyRect(shapeRectForEdge(edge, current));
                    this.render();
                    if (t < 1) {
                        settleFrame = requestAnimationFrame(tick);
                    } else {
                        resetGlassVars();
                    }
                };
                settleFrame = requestAnimationFrame(tick);
            };

            let lastPointer = null; // track previous pointer for crossing detection

            const updateEdgeInteraction = (point) => {
                const rect = baseRect || readBaseRect();
                const triggerDist = options.enterTrigger || 6;
                const releaseDist = options.releaseThreshold || 40;
                const maxDeform = options.edgePush || 6;

                if (isSettling) { lastPointer = point; return; }

                // If no active interaction, try to start one
                if (!edgeInteraction) {
                    const edges = ['left', 'right', 'top', 'bottom'];
                    for (const edge of edges) {
                        const d = distToEdge(point, rect, edge);
                        const inZone = Math.abs(d) <= triggerDist;
                        // Also detect if mouse crossed this edge between frames
                        let crossed = false;
                        if (!inZone && lastPointer) {
                            const prevD = distToEdge(lastPointer, rect, edge);
                            crossed = (prevD >= 0) !== (d >= 0);
                        }
                        if (inZone || crossed) {
                            // For crossing: interpolate to find the coord at the edge
                            let entryC;
                            if (crossed && lastPointer) {
                                const prevD = distToEdge(lastPointer, rect, edge);
                                const frac = prevD / (prevD - d);
                                const ix = lastPointer.x + (point.x - lastPointer.x) * frac;
                                const iy = lastPointer.y + (point.y - lastPointer.y) * frac;
                                entryC = edgeCoord({ x: ix, y: iy }, edge);
                            } else {
                                entryC = edgeCoord(point, edge);
                            }
                            edgeInteraction = {
                                edge,
                                entryCoord: entryC,
                                entryEdgeDist: crossed ? 0 : d,
                                currentAmount: 0
                            };
                            target.classList.add('is-liquid-glass-hover');
                            break;
                        }
                    }
                    if (!edgeInteraction) { lastPointer = point; return; }
                }

                const edge = edgeInteraction.edge;
                const currentEdgeDist = distToEdge(point, rect, edge);
                const absEdgeDist = Math.abs(currentEdgeDist);

                // Release: mouse too far from original edge
                if (absEdgeDist > releaseDist) {
                    const state = edgeInteraction;
                    const crossed = (state.entryEdgeDist >= 0) !== (currentEdgeDist >= 0);
                    edgeInteraction = null;
                    target.classList.remove('is-liquid-glass-hover');
                    lastPointer = point;
                    if (crossed && Math.abs(state.currentAmount) > 0.3) {
                        settleEdge(state.edge, state.currentAmount, options.settleDuration || 350);
                    } else {
                        smoothRecover(state.edge, state.currentAmount, 200);
                    }
                    return;
                }

                // Edge follows mouse: LINEAR scaling so edge moves proportionally
                // over the entire range from trigger to release, never saturates/stops
                const currentCoord = edgeCoord(point, edge);
                const rawDelta = currentCoord - edgeInteraction.entryCoord;
                let signedDelta;
                if (edge === 'left' || edge === 'top') {
                    signedDelta = -rawDelta;
                } else {
                    signedDelta = rawDelta;
                }
                const effectiveRange = releaseDist + triggerDist;
                let deform = signedDelta * (maxDeform / effectiveRange);

                // Top edge: if deform would overlap header, release immediately
                if (edge === 'top' && this.header) {
                    const headerBottom = this.header.getBoundingClientRect().bottom;
                    const maxTopDeform = Math.max(0, rect.top - headerBottom);
                    if (deform > maxTopDeform) {
                        edgeInteraction = null;
                        target.classList.remove('is-liquid-glass-hover');
                        lastPointer = point;
                        smoothRecover(edge, maxTopDeform, 200);
                        return;
                    }
                }

                edgeInteraction.currentAmount = deform;
                applyRect(shapeRectForEdge(edge, deform));
                lastEdgeState = { edge, amount: deform };
                this.render();
                lastPointer = point;
            };

            const reset = () => {
                active = false;
                pointer = null;
                lastPointer = null;
                interactionRect = null;
                if (interactionFrame) cancelAnimationFrame(interactionFrame);
                interactionFrame = 0;
                pending = false;
                
                if (options.edgeOnly) {
                    if (edgeInteraction && !isSettling) {
                        const state = edgeInteraction;
                        edgeInteraction = null;
                        target.classList.remove('is-liquid-glass-hover');
                        smoothRecover(state.edge, state.currentAmount, 200);
                    } else if (!isSettling) {
                        target.classList.remove('is-liquid-glass-hover');
                        resetGlassVars();
                    }
                } else {
                    if (settleFrame) cancelAnimationFrame(settleFrame);
                    settleFrame = 0;
                    target.classList.remove('is-liquid-glass-hover');
                    setGlassVar('--glass-drift-x', '0px');
                    setGlassVar('--glass-drift-y', '0px');
                    setGlassVar('--glass-scale-x', '1');
                    setGlassVar('--glass-scale-y', '1');
                    setGlassVar('--glass-origin-x', '50%');
                    setGlassVar('--glass-origin-y', '50%');
                    this.animateGlassGeometry(420);
                }
            };

            const update = () => {
                pending = false;
                if (!active || !pointer) return;

                const rect = interactionRect || target.getBoundingClientRect();
                if (!options.edgeOnly) {
                    const x = Math.max(-1, Math.min(1, (pointer.x - (rect.left + rect.width * 0.5)) / Math.max(rect.width * 0.5, 1)));
                    const y = Math.max(-1, Math.min(1, (pointer.y - (rect.top + rect.height * 0.5)) / Math.max(rect.height * 0.5, 1)));
                    const xStrength = 0.35 + Math.abs(x) * 0.65;
                    const yStrength = 0.35 + Math.abs(y) * 0.65;
                    target.classList.add('is-liquid-glass-hover');
                    setGlassVar('--glass-drift-x', `${(x * options.driftX).toFixed(2)}px`);
                    setGlassVar('--glass-drift-y', `${(y * options.driftY).toFixed(2)}px`);
                    setGlassVar('--glass-scale-x', (1 + options.scaleX * xStrength).toFixed(4));
                    setGlassVar('--glass-scale-y', (1 + options.scaleY * yStrength).toFixed(4));
                    setGlassVar('--glass-origin-x', `${((1 - x) * 50).toFixed(1)}%`);
                    setGlassVar('--glass-origin-y', `${((1 - y) * 50).toFixed(1)}%`);
                    this.animateGlassGeometry(options.duration || 420);
                }
            };

            const queueUpdate = event => {
                pointer = { x: event.clientX, y: event.clientY };
                if (!active) return;
                if (pending) return;
                pending = true;
                interactionFrame = requestAnimationFrame(() => {
                    interactionFrame = 0;
                    update();
                });
            };

            if (options.edgeOnly) {
                baseRect = readBaseRect();
                window.addEventListener('resize', () => {
                    if (!edgeInteraction && !isSettling) baseRect = readBaseRect();
                }, { passive: true });
                
                document.addEventListener('pointermove', event => {
                    if (!baseRect) return;
                    const point = { x: event.clientX, y: event.clientY };
                    pointer = point;
                    if (isSettling) { lastPointer = point; return; }
                    active = true;
                    updateEdgeInteraction(point);
                }, { passive: true });
                
                // Recover when mouse leaves the page
                document.documentElement.addEventListener('mouseleave', () => {
                    if (edgeInteraction && !isSettling) {
                        const state = edgeInteraction;
                        edgeInteraction = null;
                        target.classList.remove('is-liquid-glass-hover');
                        smoothRecover(state.edge, state.currentAmount, 200);
                    }
                });
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
        this.bindSidebarCollapse();
    };

    HeaderLiquidGlass.prototype.bindSidebarCollapse = function () {
        const sidebar = this.sidebar;
        if (!sidebar) return;
        const btn = document.getElementById('sidebar-collapse-btn');
        if (!btn) return;

        // Collapsed width = border-radius * 2
        const radius = parseFloat(getComputedStyle(sidebar).borderTopLeftRadius) || 22;
        const COLLAPSED_W = radius * 2;
        let collapsed = false;
        let animating = false;
        let animFrame = 0;
        let baseRect = null;

        const setVar = (n, v) => sidebar.style.setProperty(n, v);

        const readBase = () => {
            const r = sidebar.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        };

        const applyRect = (rect) => {
            const b = baseRect;
            setVar('--glass-drift-x', `${(rect.left - b.left).toFixed(2)}px`);
            setVar('--glass-drift-y', `${(rect.top - b.top).toFixed(2)}px`);
            setVar('--glass-scale-x', (rect.width / Math.max(b.width, 1)).toFixed(5));
            setVar('--glass-scale-y', (rect.height / Math.max(b.height, 1)).toFixed(5));
            setVar('--glass-origin-x', '0%');
            setVar('--glass-origin-y', '0%');
        };

        const resetGlass = () => {
            setVar('--glass-drift-x', '0px');
            setVar('--glass-drift-y', '0px');
            setVar('--glass-scale-x', '1');
            setVar('--glass-scale-y', '1');
        };

        // Build rect: left edge fixed, width & height set, centered vertically around base center
        const buildRect = (b, w, h) => ({
            left: b.left,
            top: b.top + (b.height - h) * 0.5,
            right: b.left + w,
            bottom: b.top + (b.height - h) * 0.5 + h,
            width: w,
            height: h
        });

        const easeOut3 = t => 1 - (1 - t) * (1 - t) * (1 - t);
        const easeInOut3 = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Shared spring parameters – ensures identical overshoot for collapse & expand
        const SP_ALPHA = 5;
        const SP_OMEGA = 2.2 * Math.PI;
        const SP_PEAK = Math.exp(-SP_ALPHA * Math.PI / SP_OMEGA); // ≈ 0.103

        // Get max allowed height so top/bottom never exceed header bottom edge
        const getMaxH = (b) => {
            const headerBottom = this.header ? this.header.getBoundingClientRect().bottom : 0;
            return b.height + 2 * Math.max(0, b.top - headerBottom);
        };

        // Content element for fade
        const navEl = sidebar.querySelector('.main-nav');

        // Refraction interpolation
        const REF_EXPANDED = this.sidebarConfig.refFactor;   // e.g. 1.95
        const REF_COLLAPSED = 1.70;

        // Button geometry: initial CSS position and final centered position
        const BTN_W = 28;
        const btnInitLeft = () => baseRect.width - 8 - BTN_W;    // right:8px equivalent
        const btnFinalLeft = () => baseRect.width / 2 - BTN_W / 2; // centered in collapsed strip

        // Apply button transform to counteract sidebar scale and add flip
        const updateBtn = (b, w, h, progress) => {
            const counterX = b.width / Math.max(w, 1);
            const counterY = b.height / Math.max(h, 1);
            const left = btnInitLeft() + (btnFinalLeft() - btnInitLeft()) * progress;
            // scaleX flips through 0 at progress=0.5 → mirrors the icon
            const flipX = counterX * (1 - 2 * progress);
            btn.style.right = 'auto';
            btn.style.left = `${left.toFixed(1)}px`;
            btn.style.transform = `scaleX(${flipX.toFixed(4)}) scaleY(${counterY.toFixed(4)})`;
            btn.style.transformOrigin = 'center center';
        };

        const resetBtn = () => {
            btn.style.right = '';
            btn.style.left = '';
            btn.style.transform = '';
            btn.style.transformOrigin = '';
        };

        // === COLLAPSE ANIMATION ===
        const doCollapse = () => {
            if (animating || collapsed) return;
            animating = true;
            baseRect = readBase();
            sidebar.classList.add('is-sidebar-animating');
            sidebar.style.overflow = 'hidden';

            const b = baseRect;
            const BULGE = SP_PEAK * (b.width - COLLAPSED_W);
            const maxH = getMaxH(b);
            const delta = Math.min(b.height * BULGE / (b.width + BULGE), (maxH - b.height) / 2);
            const h_min = b.height - delta;
            const h_max = Math.min(b.height + delta, maxH);
            const dur = 850;
            const t0 = performance.now();

            const tick = (now) => {
                const t = Math.min(1, (now - t0) / dur);
                let w, h;

                if (t < 0.12) {
                    const p = easeOut3(t / 0.12);
                    w = b.width + BULGE * p;
                    h = b.height - delta * p;
                } else if (t < 0.65) {
                    const p = easeInOut3((t - 0.12) / 0.53);
                    w = (b.width + BULGE) + (COLLAPSED_W - b.width - BULGE) * p;
                    h = h_min + (h_max - h_min) * p;
                } else {
                    const p = (t - 0.65) / 0.35;
                    w = COLLAPSED_W;
                    const bounceH = b.height + delta * Math.exp(-3 * p) * Math.cos(2 * Math.PI * p);
                    h = Math.min(bounceH, maxH);
                }

                // Fade out content
                if (navEl) navEl.style.opacity = (1 - Math.min(1, t / 0.5)).toFixed(3);

                // Refraction: 1.95 → 1.70
                this.sidebarConfig.refFactor = REF_EXPANDED + (REF_COLLAPSED - REF_EXPANDED) * t;

                // Button: flip + reposition
                updateBtn(b, w, h, t);

                applyRect(buildRect(b, w, h));
                this.render();

                if (t < 1) {
                    animFrame = requestAnimationFrame(tick);
                } else {
                    animFrame = 0;
                    animating = false;
                    collapsed = true;
                    sidebar.classList.remove('is-sidebar-animating');
                    sidebar.classList.add('sidebar-collapsed');
                    if (navEl) navEl.style.opacity = '0';
                    this.sidebarConfig.refFactor = REF_COLLAPSED;
                    updateBtn(b, COLLAPSED_W, b.height, 1);
                    applyRect(buildRect(b, COLLAPSED_W, b.height));
                    this.render();
                }
            };
            animFrame = requestAnimationFrame(tick);
        };

        // === EXPAND ANIMATION ===
        const doExpand = (fromStretch) => {
            if (animating || !collapsed) return;
            animating = true;
            sidebar.classList.remove('sidebar-collapsed');
            sidebar.classList.add('is-sidebar-animating');

            const b = baseRect;
            const maxH = getMaxH(b);
            const BULGE = SP_PEAK * (b.width - COLLAPSED_W);
            const delta = Math.min(b.height * BULGE / (b.width + BULGE), (maxH - b.height) / 2);
            const stretchH = fromStretch ? currentStretch : 0;
            const dur = 775;
            const t0 = performance.now();

            const tick = (now) => {
                const t = Math.min(1, (now - t0) / dur);
                let w, h;

                const spring = 1 - Math.exp(-SP_ALPHA * t) * Math.cos(SP_OMEGA * t);
                w = COLLAPSED_W + (b.width - COLLAPSED_W) * spring;

                // Height: base + overshoot contraction + stretch fade-out
                if (w > b.width) {
                    const overRatio = Math.min((w - b.width) / BULGE, 1);
                    h = b.height - delta * overRatio;
                } else {
                    h = b.height;
                }
                // Stretch fades out smoothly over first 40% of animation
                if (stretchH > 0) {
                    h += stretchH * Math.max(0, 1 - t / 0.4);
                }
                h = Math.min(h, maxH);

                // Fade in content
                const fadeT = stretchH > 0 ? Math.max(0, (t - 0.3) / 0.5) : Math.max(0, (t - 0.2) / 0.5);
                if (navEl) navEl.style.opacity = Math.min(1, fadeT).toFixed(3);

                // Refraction: 1.70 → 1.95
                this.sidebarConfig.refFactor = REF_COLLAPSED + (REF_EXPANDED - REF_COLLAPSED) * t;

                // Button: reverse flip + reposition (progress 1→0)
                updateBtn(b, w, h, 1 - t);

                applyRect(buildRect(b, w, h));
                this.render();

                if (t < 1) {
                    animFrame = requestAnimationFrame(tick);
                } else {
                    animFrame = 0;
                    animating = false;
                    collapsed = false;
                    sidebar.classList.remove('is-sidebar-animating');
                    sidebar.style.overflow = '';
                    if (navEl) navEl.style.opacity = '';
                    this.sidebarConfig.refFactor = REF_EXPANDED;
                    resetBtn();
                    resetGlass();
                    this.render();
                    this.scheduleCapture(200);
                }
            };
            animFrame = requestAnimationFrame(tick);
        };

        // --- Event bindings ---

        // Collapse button: only works when expanded
        btn.addEventListener('click', e => {
            e.stopPropagation();
            if (!collapsed) doCollapse();
        });

        // Mousedown on collapsed strip: stretch → hold → expand directly (with stretch)
        let stretchFrame = 0;
        let currentStretch = 0;
        sidebar.addEventListener('mousedown', e => {
            if (!collapsed || animating) return;
            e.preventDefault();
            sidebar.classList.add('is-sidebar-animating');

            const b = baseRect;
            const stretchTarget = 24;
            const stretchDur = 280;
            let mouseHeld = true;
            let stretchDone = false;
            currentStretch = 0;

            // Phase 1: Stretch out
            const stretchT0 = performance.now();
            const stretchTick = (now) => {
                const st = Math.min(1, (now - stretchT0) / stretchDur);
                const p = easeOut3(st);
                currentStretch = stretchTarget * p;
                applyRect(buildRect(b, COLLAPSED_W, b.height + currentStretch));
                this.render();
                if (st < 1) {
                    stretchFrame = requestAnimationFrame(stretchTick);
                } else {
                    stretchFrame = 0;
                    stretchDone = true;
                    if (!mouseHeld) doExpand(true);
                }
            };
            stretchFrame = requestAnimationFrame(stretchTick);

            const up = () => {
                document.removeEventListener('mouseup', up);
                mouseHeld = false;
                if (stretchDone) doExpand(true);
                // else: stretchTick will call doExpand when it finishes
            };
            document.addEventListener('mouseup', up);
        });

        // Resize: update base rect when not collapsed
        window.addEventListener('resize', () => {
            if (!collapsed && !animating) baseRect = readBase();
        });

        // Mobile: auto-collapse on init
        const isMobile = () => window.innerWidth <= 900;
        if (isMobile()) {
            baseRect = readBase();
            collapsed = true;
            sidebar.classList.add('sidebar-collapsed');
            sidebar.style.overflow = 'hidden';
            if (navEl) navEl.style.opacity = '0';
            this.sidebarConfig.refFactor = REF_COLLAPSED;
            updateBtn(baseRect, COLLAPSED_W, baseRect.height, 1);
            applyRect(buildRect(baseRect, COLLAPSED_W, baseRect.height));
            this.render();
        }
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
