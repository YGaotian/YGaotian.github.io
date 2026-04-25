// WebGL Cloud Renderer — 3-color turbulent clouds for rectangular banner
// Adapted from ChatGPT voice orb shader: 3D Perlin noise, domain warping, FBM

const VERT_SRC = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG_SRC = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec3 u_color3;
uniform vec3 u_color4;
uniform float u_sharpness;
uniform float u_warpScale;
uniform float u_detail;
uniform float u_orbitRadius;

// --- 3D Perlin noise ---
vec4 permute(vec4 x) { return mod((x * 34.0 + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 fade(vec3 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec3 P) {
    vec3 Pi0 = floor(P), Pi1 = Pi0 + 1.0;
    Pi0 = mod(Pi0, 289.0); Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P), Pf1 = Pf0 - 1.0;
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = vec4(Pi0.z), iz1 = vec4(Pi1.z);
    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0), ixy1 = permute(ixy + iz1);
    vec4 gx0 = ixy0/7.0, gy0 = fract(floor(gx0)/7.0)-0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5)-abs(gx0)-abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0*(step(vec4(0.0),gx0)-0.5);
    gy0 -= sz0*(step(vec4(0.0),gy0)-0.5);
    vec4 gx1 = ixy1/7.0, gy1 = fract(floor(gx1)/7.0)-0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5)-abs(gx1)-abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1*(step(vec4(0.0),gx1)-0.5);
    gy1 -= sz1*(step(vec4(0.0),gy1)-0.5);
    vec3 g000=vec3(gx0.x,gy0.x,gz0.x), g100=vec3(gx0.y,gy0.y,gz0.y);
    vec3 g010=vec3(gx0.z,gy0.z,gz0.z), g110=vec3(gx0.w,gy0.w,gz0.w);
    vec3 g001=vec3(gx1.x,gy1.x,gz1.x), g101=vec3(gx1.y,gy1.y,gz1.y);
    vec3 g011=vec3(gx1.z,gy1.z,gz1.z), g111=vec3(gx1.w,gy1.w,gz1.w);
    vec4 norm0 = taylorInvSqrt(vec4(dot(g000,g000),dot(g010,g010),dot(g100,g100),dot(g110,g110)));
    g000*=norm0.x; g010*=norm0.y; g100*=norm0.z; g110*=norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001,g001),dot(g011,g011),dot(g101,g101),dot(g111,g111)));
    g001*=norm1.x; g011*=norm1.y; g101*=norm1.z; g111*=norm1.w;
    float n000=dot(g000,Pf0), n100=dot(g100,vec3(Pf1.x,Pf0.yz));
    float n010=dot(g010,vec3(Pf0.x,Pf1.y,Pf0.z)), n110=dot(g110,vec3(Pf1.xy,Pf0.z));
    float n001=dot(g001,vec3(Pf0.xy,Pf1.z)), n101=dot(g101,vec3(Pf1.x,Pf0.y,Pf1.z));
    float n011=dot(g011,vec3(Pf0.x,Pf1.yz)), n111=dot(g111,Pf1);
    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000,n100,n010,n110), vec4(n001,n101,n011,n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    return 2.2 * mix(n_yz.x, n_yz.y, fade_xyz.x);
}

// --- 2D noise + FBM ---
float rand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }
float noise(vec2 p) {
    vec2 ip = floor(p), u = fract(p);
    u = u*u*(3.0-2.0*u);
    return mix(mix(rand(ip), rand(ip+vec2(1,0)), u.x),
               mix(rand(ip+vec2(0,1)), rand(ip+vec2(1,1)), u.x), u.y);
}

#define NUM_OCTAVES 5
float fbm(vec2 x) {
    float v = 0.0, a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < NUM_OCTAVES; ++i) {
        v += a * noise(x);
        x = rot * x * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

// Rotate a 2D point around origin
vec2 rot(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(p.x*c - p.y*s, p.x*s + p.y*c);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    float time = u_time;

    // Aspect-corrected coordinates
    vec2 st = vec2(uv.x * aspect, uv.y);

    // === Domain warping — controlled by u_warpScale (overall) and u_detail (high-freq) ===
    // Layer 1: large warp
    float w1x = cnoise(vec3(st * 0.3, time * 0.45)) * 1.8 * u_warpScale;
    float w1y = cnoise(vec3(st * 0.3 + 50.0, time * 0.4)) * 1.8 * u_warpScale;
    vec2 warped = st + vec2(w1x, w1y);

    // Layer 2: medium warp
    float w2x = cnoise(vec3(warped * 0.6 + 20.0, time * 0.5)) * 0.95 * u_warpScale;
    float w2y = cnoise(vec3(warped * 0.6 + 70.0, time * 0.45)) * 0.95 * u_warpScale;
    warped += vec2(w2x, w2y);

    // Layer 3: boundary detail
    float w3x = cnoise(vec3(warped * 3.0 + 40.0, time * 0.65)) * 0.4 * u_detail;
    float w3y = cnoise(vec3(warped * 3.0 + 90.0, time * 0.6)) * 0.4 * u_detail;
    warped += vec2(w3x, w3y);

    // Layer 4: fine broken fragments
    float w4x = cnoise(vec3(warped * 6.0 + 120.0, time * 0.7)) * 0.1 * u_detail;
    float w4y = cnoise(vec3(warped * 6.0 + 170.0, time * 0.65)) * 0.1 * u_detail;
    warped += vec2(w4x, w4y);

    // === Four color centers that orbit widely — swap positions over time ===
    // Large circular orbits so colors come from all directions
    float orbit = aspect * u_orbitRadius;
    vec2 center = vec2(aspect * 0.5, 0.5);

    // Each center orbits at different speeds for irregular motion
    vec2 c1 = center + vec2(cos(time * 0.23) * orbit, sin(time * 0.19) * orbit * 0.8);
    vec2 c2 = center + vec2(cos(time * 0.17 + 1.57) * orbit, sin(time * 0.25 + 1.57) * orbit * 0.8);
    vec2 c3 = center + vec2(cos(time * 0.21 + 3.14) * orbit, sin(time * 0.15 + 3.14) * orbit * 0.8);
    vec2 c4 = center + vec2(cos(time * 0.14 + 4.71) * orbit, sin(time * 0.22 + 4.71) * orbit * 0.8);

    // Stronger secondary wobble — more chaotic
    c1 += vec2(sin(time * 0.5) * 0.2, cos(time * 0.4 + 1.0) * 0.15);
    c2 += vec2(cos(time * 0.45 + 2.0) * 0.2, sin(time * 0.55) * 0.15);
    c3 += vec2(sin(time * 0.42 + 4.0) * 0.2, cos(time * 0.38 + 3.0) * 0.15);
    c4 += vec2(cos(time * 0.48 + 5.0) * 0.2, sin(time * 0.43 + 2.0) * 0.15);

    // Distance in warped space
    float d1 = length(warped - c1);
    float d2 = length(warped - c2);
    float d3 = length(warped - c3);
    float d4 = length(warped - c4);

    // Voronoi competition — crispness controlled by u_sharpness
    float inv1 = pow(1.0 / (d1 + 0.01), u_sharpness);
    float inv2 = pow(1.0 / (d2 + 0.01), u_sharpness);
    float inv3 = pow(1.0 / (d3 + 0.01), u_sharpness);
    float inv4 = pow(1.0 / (d4 + 0.01), u_sharpness);
    float invTotal = inv1 + inv2 + inv3 + inv4;

    float wt1 = inv1 / invTotal;
    float wt2 = inv2 / invTotal;
    float wt3 = inv3 / invTotal;
    float wt4 = inv4 / invTotal;

    vec3 color = u_color1 * wt1 + u_color2 * wt2 + u_color3 * wt3 + u_color4 * wt4;

    gl_FragColor = vec4(color, 1.0);
}
`;

class CloudRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl', { alpha: false });
        if (!gl) {
            console.warn('WebGL not supported, falling back to static background');
            return;
        }
        this.gl = gl;
        this.animate = this.animate.bind(this);
        this.init();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        // Watch parent size changes (e.g., --header-height updated by layout.config.json after load)
        if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
            this._ro = new ResizeObserver(() => this.resize());
            this._ro.observe(canvas.parentElement);
        }
    }

    init() {
        const gl = this.gl;

        // Compile shaders
        const vs = this.compile(gl.VERTEX_SHADER, VERT_SRC);
        const fs = this.compile(gl.FRAGMENT_SHADER, FRAG_SRC);
        this.prog = gl.createProgram();
        gl.attachShader(this.prog, vs);
        gl.attachShader(this.prog, fs);
        gl.linkProgram(this.prog);
        if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
            console.error('Shader link error:', gl.getProgramInfoLog(this.prog));
            return;
        }
        gl.useProgram(this.prog);

        // Full-screen quad
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
        const a = gl.getAttribLocation(this.prog, 'a_pos');
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

        // Uniform locations
        this.uRes = gl.getUniformLocation(this.prog, 'u_resolution');
        this.uTime = gl.getUniformLocation(this.prog, 'u_time');
        this.uColor1 = gl.getUniformLocation(this.prog, 'u_color1');
        this.uColor2 = gl.getUniformLocation(this.prog, 'u_color2');
        this.uColor3 = gl.getUniformLocation(this.prog, 'u_color3');
        this.uColor4 = gl.getUniformLocation(this.prog, 'u_color4');
        this.uSharpness = gl.getUniformLocation(this.prog, 'u_sharpness');
        this.uWarpScale = gl.getUniformLocation(this.prog, 'u_warpScale');
        this.uDetail = gl.getUniformLocation(this.prog, 'u_detail');
        this.uOrbitRadius = gl.getUniformLocation(this.prog, 'u_orbitRadius');

        // Default colors (overridden by config)
        this.colors = [
            [0.75, 0.90, 1.0],
            [1.0, 0.85, 0.88],
            [0.88, 0.97, 0.78],
            [1.0, 0.88, 0.70]
        ];

        // Default animation params (overridden by layout.config.json)
        this.params = {
            speed: 1.0,
            orbitRadius: 0.35,
            sharpness: 18.0,
            warpScale: 1.0,
            detail: 1.0
        };

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    compile(type, src) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('Shader error:', gl.getShaderInfoLog(s));
        }
        return s;
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.ceil(rect.width * dpr);
        this.canvas.height = Math.ceil(rect.height * dpr);
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    setColors(colors) {
        this.colors = colors;
    }

    setParams(params) {
        Object.assign(this.params, params);
    }

    animate(ts) {
        if (!this.gl) return;
        const gl = this.gl;
        const p = this.params;
        gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uTime, ts * 0.001 * p.speed);
        gl.uniform3fv(this.uColor1, this.colors[0]);
        gl.uniform3fv(this.uColor2, this.colors[1]);
        gl.uniform3fv(this.uColor3, this.colors[2]);
        gl.uniform3fv(this.uColor4, this.colors[3]);
        gl.uniform1f(this.uSharpness, p.sharpness);
        gl.uniform1f(this.uWarpScale, p.warpScale);
        gl.uniform1f(this.uDetail, p.detail);
        gl.uniform1f(this.uOrbitRadius, p.orbitRadius);
        gl.clearColor(1.0, 0.98, 0.94, 1.0); // cream — no black ever
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        this.animFrame = requestAnimationFrame(this.animate);
    }

    start() { this.animFrame = requestAnimationFrame(this.animate); }
    stop() { if (this.animFrame) cancelAnimationFrame(this.animFrame); }
}

// Init — load colors from theme.config.json
document.addEventListener('DOMContentLoaded', async () => {
    const container = document.querySelector('.header-clouds');
    if (!container) return;
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
    container.appendChild(canvas);
    const renderer = new CloudRenderer(canvas);

    // Parse rgba/rgb/hex/array color into [r,g,b] floats 0-1
    function parseColor(c) {
        if (Array.isArray(c)) return c.slice(0, 3);
        if (typeof c !== 'string') return null;
        const m = c.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
        if (m) return [parseFloat(m[1]) / 255, parseFloat(m[2]) / 255, parseFloat(m[3]) / 255];
        const h = c.match(/^#?([0-9a-f]{6})$/i);
        if (h) {
            const n = parseInt(h[1], 16);
            return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
        }
        return null;
    }

    // Load cloud colors from config
    try {
        const resp = await fetch('theme.config.json');
        const config = await resp.json();
        if (config.cloudColors) {
            const cc = config.cloudColors;
            const defaults = [[0.75, 0.90, 1.0], [0.90, 0.80, 0.70], [0.88, 0.97, 0.78], [1.0, 0.90, 0.70]];
            renderer.setColors([
                parseColor(cc.color1) || defaults[0],
                parseColor(cc.color2) || defaults[1],
                parseColor(cc.color3) || defaults[2],
                parseColor(cc.color4) || defaults[3]
            ]);
        }
    } catch (e) {
        console.warn('Could not load cloud colors from config, using defaults');
    }

    // Load cloud animation params from layout.config.json
    try {
        const resp = await fetch('layout.config.json');
        const layout = await resp.json();
        if (layout.clouds) {
            renderer.setParams(layout.clouds);
        }
    } catch (e) {
        console.warn('Could not load cloud params from layout config, using defaults');
    }

    renderer.start();
});
