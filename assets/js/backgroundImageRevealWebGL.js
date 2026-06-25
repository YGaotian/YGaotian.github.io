/* GPU-only watercolor reveal:
 * - BG_bot is the fixed base.
 * - BG_mid and BG_top reveal through polar ink masks.
 * - After the reveal finishes, masks are bypassed and the complete
 *   three-layer background is rendered directly.
 * - Once solidified, BG_top is sampled with a continuous BG_depth-driven
 *   backward-UV parallax field. This is intentionally subtle: it bends the
 *   illustration like one flexible surface instead of moving cutout layers.
 */
(function () {
    const canvas = document.getElementById('image-background');
    const gl = canvas?.getContext('webgl2', {
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: true
    });
    if (!gl) return;

    const DROP_COUNT = 12;
    const REVEAL_FPS = 24;
    const SOLID_FPS = 30;
    const ASSET_VERSION = 'image-webgl-15';
    // Runtime-tunable parallax settings. These are intentionally conservative:
    // strength controls maximum UV displacement, depthContrast softens the
    // depth map toward 0.5, blurRadius smooths depth sampling in pixels, and
    // mouseEase controls pointer smoothing.
    const parallaxSettings = {
        strength: 0.014,
        depthContrast: 0.34,
        blurRadius: 6.25,
        mouseEase: 0.175
    };
    window.__backgroundParallaxSettings = parallaxSettings;

    const vert = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
    uv = vec2(p.x * .5 + .5, .5 - p.y * .5);
    gl_Position = vec4(p, 0.0, 1.0);
}`;

    const frag = `#version 300 es
precision highp float;

in vec2 uv;
out vec4 outColor;

uniform vec2 res;
uniform float time;
uniform float solidified;
uniform float parallaxReady;
uniform sampler2D bot;
uniform sampler2D mid;
uniform sampler2D top;
uniform sampler2D depthTex;
uniform vec2 depthSize;
uniform vec2 parallax;
uniform float strength;
uniform float depthContrast;
uniform float blurRadius;
uniform vec4 drops[${DROP_COUNT}];
uniform vec2 freqs[${DROP_COUNT}];
uniform vec2 layerDelay;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

vec2 cover(vec2 p) {
    float imageAspect = 2325.0 / 1632.0;
    float viewAspect = res.x / max(res.y, 1.0);
    p -= 0.5;
    if (viewAspect > imageAspect) {
        p.y *= imageAspect / viewAspect;
    } else {
        p.x *= viewAspect / imageAspect;
    }
    return p + 0.5;
}

float inkDrop(vec2 q, float progress, int id) {
    if (progress <= 0.0) return 0.0;

    float a = atan(q.y, q.x) / atan(0.0, -1.0) / 2.0;
    float v = length(q);
    float d0 = noise(vec2(a * freqs[id].x, v * 0.2 * freqs[id].x));
    float d1 = noise(vec2(a * 6.5 * freqs[id].y, v * 0.1 * freqs[id].y));
    float proc = max(0.001, progress * 8.0);
    float radius = 0.3 + d0 * 0.3 + d1 * 0.06;
    float fac = max(0.0, radius - v / (drops[id].w * pow(proc, 0.2)));
    return clamp(pow(fac, 0.5) * 5.0, 0.0, 1.0);
}

float layerMask(float delay) {
    if (solidified > 0.5) return 1.0;

    vec2 scene = cover(uv);
    float m = 0.0;
    for (int i = 0; i < ${DROP_COUNT}; i++) {
        float progress = clamp((time - delay - drops[i].z) / 6.5, 0.0, 1.0);
        m = max(m, inkDrop(scene - drops[i].xy, progress, i));
    }
    return m;
}

float rawDepth(vec2 p) {
    if (blurRadius <= 0.001) {
        ivec2 texel = ivec2(clamp(floor(p * depthSize), vec2(0.0), depthSize - 1.0));
        return texelFetch(depthTex, texel, 0).r;
    }
    return texture(depthTex, p).r;
}

float sampleDepth(vec2 p) {
    // 3x3 depth smoothing. Increase blurRadius for softer deformation and
    // fewer hard edge artifacts; decrease it for a tighter response.
    // When blurRadius is 0, use exact texelFetch sampling so the control can
    // verify the actual depth map without bilinear interpolation.
    if (blurRadius <= 0.001) {
        return mix(0.5, rawDepth(p), depthContrast);
    }
    vec2 texel = blurRadius / max(res, vec2(1.0));
    float d = 0.0;
    d += rawDepth(clamp(p + texel * vec2(-1.0, -1.0), vec2(0.0), vec2(1.0)));
    d += rawDepth(clamp(p + texel * vec2( 0.0, -1.0), vec2(0.0), vec2(1.0))) * 2.0;
    d += rawDepth(clamp(p + texel * vec2( 1.0, -1.0), vec2(0.0), vec2(1.0)));
    d += rawDepth(clamp(p + texel * vec2(-1.0,  0.0), vec2(0.0), vec2(1.0))) * 2.0;
    d += rawDepth(p) * 4.0;
    d += rawDepth(clamp(p + texel * vec2( 1.0,  0.0), vec2(0.0), vec2(1.0))) * 2.0;
    d += rawDepth(clamp(p + texel * vec2(-1.0,  1.0), vec2(0.0), vec2(1.0)));
    d += rawDepth(clamp(p + texel * vec2( 0.0,  1.0), vec2(0.0), vec2(1.0))) * 2.0;
    d += rawDepth(clamp(p + texel * vec2( 1.0,  1.0), vec2(0.0), vec2(1.0)));
    d /= 16.0;
    // depthContrast softens hard depth jumps. 0.0 = almost flat, 1.0 = raw map.
    return mix(0.5, d, depthContrast);
}

vec3 sampleTop(vec2 p) {
    if (parallaxReady <= 0.001) {
        return texture(top, p).rgb;
    }

    float d = sampleDepth(p);
    // Backward UV sampling: the current fragment asks which source texel should
    // be pulled into this position. Small strength prevents tearing/cropping.
    vec2 aspectFix = vec2(res.y / max(res.x, 1.0), 1.0);
    vec2 shiftedUv = clamp(p - parallax * aspectFix * (d - 0.5) * strength * parallaxReady, vec2(0.0), vec2(1.0));
    return texture(top, shiftedUv).rgb;
}

void main() {
    vec2 p = cover(uv);
    vec3 col = texture(bot, p).rgb;
    col = mix(col, texture(mid, p).rgb, layerMask(layerDelay.x));
    col = mix(col, sampleTop(p), layerMask(layerDelay.y));
    outColor = vec4(col, 1.0);
}`;

    const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw Error(gl.getShaderInfoLog(shader));
        }
        return shader;
    };

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Background WebGL link failed:', gl.getProgramInfoLog(program));
        return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(program, 'p');
    const uniforms = {
        res: gl.getUniformLocation(program, 'res'),
        time: gl.getUniformLocation(program, 'time'),
        solidified: gl.getUniformLocation(program, 'solidified'),
        parallaxReady: gl.getUniformLocation(program, 'parallaxReady'),
        depthSize: gl.getUniformLocation(program, 'depthSize'),
        parallax: gl.getUniformLocation(program, 'parallax'),
        strength: gl.getUniformLocation(program, 'strength'),
        depthContrast: gl.getUniformLocation(program, 'depthContrast'),
        blurRadius: gl.getUniformLocation(program, 'blurRadius'),
        drops: gl.getUniformLocation(program, 'drops[0]'),
        freqs: gl.getUniformLocation(program, 'freqs[0]'),
        layerDelay: gl.getUniformLocation(program, 'layerDelay')
    };

    const images = ['BG_bot.png', 'BG_mid.png', 'BG_top.png', 'BG_depth.png'].map(name => {
        const img = new Image();
        const localBust = window.__designControlsEnabled ? `-${Date.now()}` : '';
        img.src = `assets/images/${name}?v=${ASSET_VERSION}${localBust}`;
        return img;
    });
    const textures = images.map(() => gl.createTexture());

    const upload = (texture, img) => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    };

    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 1);
        canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
        canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const makeDrops = () => {
        const drops = [];
        const freqs = [];
        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 4; x++) {
                drops.push(
                    0.08 + x * 0.28 + (Math.random() - 0.5) * 0.09,
                    0.12 + y * 0.37 + (Math.random() - 0.5) * 0.10,
                    Math.random() * 3.2,
                    0.46 + Math.random() * 0.22
                );
                freqs.push(
                    (38 + Math.random() * 67) * 0.6,
                    (91 + Math.random() * 143) * 0.6
                );
            }
        }
        return { drops, freqs };
    };

    Promise.all(images.map(img => new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    }))).then(() => {
        textures.forEach((texture, i) => upload(texture, images[i]));

        const { drops, freqs } = makeDrops();
        const delays = [0.65 + Math.random() * 1.0, 1.7 + Math.random() * 1.4];
        const revealDoneAt = Math.max(delays[0], delays[1]) + 3.2 + 6.5;
        const start = performance.now();
        let last = -Infinity;
        let solidified = false;
        const targetParallax = { x: 0, y: 0 };
        const currentParallax = { x: 0, y: 0 };
        const draw = now => {
            const currentTime = (now - start) / 1000;
            if (!solidified && currentTime >= revealDoneAt) solidified = true;
            currentParallax.x += (targetParallax.x - currentParallax.x) * parallaxSettings.mouseEase;
            currentParallax.y += (targetParallax.y - currentParallax.y) * parallaxSettings.mouseEase;

            const fps = solidified ? SOLID_FPS : REVEAL_FPS;
            if (now - last < 1000 / fps) return;
            last = now;

            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.enableVertexAttribArray(pos);
            gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

            textures.forEach((texture, i) => {
                gl.activeTexture(gl.TEXTURE0 + i);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.uniform1i(gl.getUniformLocation(program, ['bot', 'mid', 'top', 'depthTex'][i]), i);
            });

            gl.uniform2f(uniforms.res, canvas.width, canvas.height);
            gl.uniform1f(uniforms.time, currentTime);
            gl.uniform1f(uniforms.solidified, solidified ? 1 : 0);
            gl.uniform1f(uniforms.parallaxReady, Math.max(0, Math.min(1, (currentTime - delays[1] - 4.8) / 1.6)));
            gl.uniform2f(uniforms.depthSize, images[3].naturalWidth || images[3].width, images[3].naturalHeight || images[3].height);
            gl.uniform2f(uniforms.parallax, currentParallax.x, currentParallax.y);
            gl.uniform1f(uniforms.strength, parallaxSettings.strength);
            gl.uniform1f(uniforms.depthContrast, parallaxSettings.depthContrast);
            gl.uniform1f(uniforms.blurRadius, parallaxSettings.blurRadius);
            gl.uniform4fv(uniforms.drops, drops);
            gl.uniform2fv(uniforms.freqs, freqs);
            gl.uniform2f(uniforms.layerDelay, delays[0], delays[1]);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            window.dispatchEvent(new Event('imagebackgroundframe'));
        };

        const frame = now => {
            draw(now);
            requestAnimationFrame(frame);
        };

        resize();
        window.addEventListener('resize', () => {
            resize();
            last = -Infinity;
            draw(performance.now());
        }, { passive: true });

        window.addEventListener('pointermove', event => {
            targetParallax.x = ((event.clientX / Math.max(window.innerWidth, 1)) - 0.5) * 2.0;
            targetParallax.y = ((event.clientY / Math.max(window.innerHeight, 1)) - 0.5) * 2.0;
        }, { passive: true });

        window.addEventListener('pointerleave', () => {
            targetParallax.x = 0;
            targetParallax.y = 0;
        }, { passive: true });

        setupParallaxControls(parallaxSettings);
        requestAnimationFrame(frame);
    }).catch(error => console.error('Background WebGL failed:', error));

    function setupParallaxControls(settings) {
        if (!window.__designControlsEnabled) return;
        const panel = document.getElementById('glass-control');
        if (!panel || panel.querySelector('#parallax-strength')) return;

        // Remove stale background/color-control sections from older experiments
        // if a hot-reloaded page still has them in the DOM. Current background
        // shader only exposes the continuous depth parallax parameters below.
        panel.querySelectorAll('[data-obsolete-control-section="clouds"], [data-obsolete-control-section="background-color"]')
            .forEach(node => node.remove());

        const section = document.createElement('section');
        section.className = 'glass-control-section';
        section.innerHTML = '<h2>Parallax</h2>';

        const fields = [
            ['strength', 'Strength', 0, 0.04, 0.001, 3],
            ['depthContrast', 'Depth Contrast', 0, 1, 0.01, 2],
            ['blurRadius', 'Depth Blur', 0, 12, 0.25, 2],
            ['mouseEase', 'Mouse Ease', 0.01, 0.25, 0.005, 3]
        ];

        fields.forEach(([key, label, min, max, step, digits]) => {
            const id = `parallax-${key}`;
            const title = document.createElement('label');
            title.htmlFor = id;
            title.textContent = label;
            const input = document.createElement('input');
            input.id = id;
            input.type = 'range';
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.value = Number(settings[key]).toFixed(digits);
            const output = document.createElement('output');
            output.id = `${id}-value`;
            output.value = Number(settings[key]).toFixed(digits);
            input.addEventListener('input', () => {
                settings[key] = Number(input.value);
                output.value = Number(settings[key]).toFixed(digits);
            });
            section.append(title, input, output);
        });

        panel.appendChild(section);
    }
})();
