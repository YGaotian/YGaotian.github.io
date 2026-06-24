/* Layered watercolor reveal. Fields are precomputed once; every frame only
 * evaluates inexpensive alpha ramps, keeping the ink edge visible on mobile. */
(function () {
    'use strict';
    const canvas = document.getElementById('image-background');
    const context = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !context) return;

    const images = ['BG_bot.png', 'BG_mid.png', 'BG_top.png'].map(name => {
        const image = new Image(); image.src = `assets/images/${name}`; return image;
    });
    const maskCanvas = document.createElement('canvas');
    const maskContext = maskCanvas.getContext('2d');
    const layerCanvas = document.createElement('canvas');
    const layerContext = layerCanvas.getContext('2d');
    // Small individual washes cover the viewport naturally as they meet.
    const seeds = [[.08,.10],[.36,.08],[.64,.11],[.92,.08],[.08,.38],[.36,.36],[.64,.40],[.92,.37],[.08,.66],[.36,.64],[.64,.68],[.92,.65],[.08,.91],[.36,.89],[.64,.92],[.92,.89]];
    const sourceDelay = seeds.map((_, index) => index * 210);
    const layerDelay = 900;
    const sourceDuration = 6500;
    const finishAt = sourceDuration + sourceDelay.at(-1) + layerDelay;
    const frameInterval = 1000 / 24;
    const start = performance.now();
    let fields = [], ready = false, lastFrame = -Infinity;

    const smooth = value => value * value * (3 - 2 * value);
    const clamp01 = value => Math.max(0, Math.min(1, value));
    const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123; return n - Math.floor(n); };
    const noise = (x, y) => {
        const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
        const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
        return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    };
    const resize = () => {
        const density = 1;
        canvas.width = Math.max(1, Math.round(innerWidth * density));
        canvas.height = Math.max(1, Math.round(innerHeight * density));
        canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
        maskCanvas.width = Math.max(1, Math.round(canvas.width * .24));
        maskCanvas.height = Math.max(1, Math.round(canvas.height * .24));
        layerCanvas.width = canvas.width; layerCanvas.height = canvas.height;
        fields = seeds.map(() => ({ distance: new Float32Array(maskCanvas.width * maskCanvas.height), edge: new Float32Array(maskCanvas.width * maskCanvas.height) }));
        const aspect = maskCanvas.width / maskCanvas.height;
        for (let y = 0; y < maskCanvas.height; y++) for (let x = 0; x < maskCanvas.width; x++) {
            const u = x / maskCanvas.width, v = y / maskCanvas.height, pixel = y * maskCanvas.width + x;
            seeds.forEach((seed, index) => {
                const px = (u - seed[0]) * aspect, py = v - seed[1];
                const radius = Math.hypot(px, py);
                const angle = Math.atan2(py, px) / Math.PI / 2;
                // d0/d1 are the exact polar noise structure of the supplied mask.
                const lowFrequency = (38.0 + hash(index * 2.7, 4.1) * 67.0) * .60;
                const highFrequency = (91.0 + hash(index * 5.3, 8.7) * 143.0) * .60;
                const d0 = noise((angle + index * 7.3) * lowFrequency, radius * (.16 + hash(index, 2.0) * .12) * lowFrequency);
                const d1 = noise((angle * 6.5 - index * 3.1) * highFrequency, radius * (.07 + hash(index, 9.0) * .09) * highFrequency);
                const f = fields[index];
                const maxSize = .34 + hash(index * 8.3, 1.7) * .15;
                f.distance[pixel] = radius / maxSize;
                f.edge[pixel] = .3 + d0 * .3 + d1 * .06;
            });
        }
    };
    const sourceProgress = (now, layer, index) => clamp01((now - start - layer * layerDelay - sourceDelay[index]) / sourceDuration);
    const layerProgress = [new Float32Array(seeds.length), new Float32Array(seeds.length)];
    const drawMask = progresses => {
        const data = maskContext.createImageData(maskCanvas.width, maskCanvas.height);
        for (let pixel = 0; pixel < fields[0].distance.length; pixel++) {
            let combined = 0;
            for (let source = 0; source < fields.length; source++) {
                const progress = progresses[source];
                if (!progress) continue;
                const f = fields[source];
                const proc = Math.max(.001, progress * 8.0);
                const scale = Math.pow(proc, .2);
                const local = f.distance[pixel] / scale;
                const fac = Math.max(0, f.edge[pixel] - local);
                const core = clamp01(Math.pow(fac, .5) * 5.0);
                combined = 1 - (1 - combined) * (1 - core);
            }
            data.data[pixel * 4 + 3] = Math.round(combined * 255);
        }
        maskContext.putImageData(data, 0, 0);
    };
    const drawLayer = (image, progresses) => {
        layerContext.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        const scale = Math.max(layerCanvas.width / image.width, layerCanvas.height / image.height);
        const width = image.width * scale, height = image.height * scale;
        layerContext.drawImage(image, (layerCanvas.width - width) * .5, (layerCanvas.height - height) * .5, width, height);
        layerContext.globalCompositeOperation = 'destination-in';
        drawMask(progresses);
        layerContext.drawImage(maskCanvas, 0, 0, layerCanvas.width, layerCanvas.height);
        layerContext.globalCompositeOperation = 'source-over';
        context.drawImage(layerCanvas, 0, 0);
    };
    const draw = now => {
        if (!ready || !fields.length) return;
        // BG_bot is the stable base layer; only the two upper images animate.
        const base = images[0];
        const baseScale = Math.max(canvas.width / base.width, canvas.height / base.height);
        const baseWidth = base.width * baseScale, baseHeight = base.height * baseScale;
        context.drawImage(base, (canvas.width - baseWidth) * .5, (canvas.height - baseHeight) * .5, baseWidth, baseHeight);
        images.slice(1).forEach((image, layer) => {
            const progress = layerProgress[layer];
            for (let index = 0; index < seeds.length; index++) progress[index] = sourceProgress(now, layer, index);
            drawLayer(image, progress);
        });
        window.dispatchEvent(new Event('imagebackgroundframe'));
    };
    const animate = now => {
        const elapsed = now - start;
        if (now - lastFrame >= frameInterval || elapsed >= finishAt) { lastFrame = now; draw(now); }
        if (elapsed < finishAt) requestAnimationFrame(animate);
    };
    Promise.all(images.map(image => new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; }))).then(() => {
        ready = true; resize(); draw(performance.now()); requestAnimationFrame(animate);
    }).catch(error => console.error('Background images failed to load:', error));
    let resizeTimer = 0;
    addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { resize(); draw(performance.now()); }, 160); }, { passive: true });
})();
