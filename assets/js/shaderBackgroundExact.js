/* Runs the supplied Shadertoy source verbatim; this file only supplies WebGL2's
 * entry point and deterministic texture channels required by its uniforms. */
(() => {
    const canvas = document.getElementById('shader-background');
    const gl = canvas?.getContext('webgl2', { antialias: false });
    if (!gl) return;
    const vertex = `#version 300 es
in vec2 p; void main(){gl_Position=vec4(p,0.,1.);}`;
    const compile = (type, source) => { const shader=gl.createShader(type); gl.shaderSource(shader,source); gl.compileShader(shader); if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)); return shader; };
    const texture = (size, fill) => { const data=new Uint8Array(size*size*4); for(let i=0;i<data.length;i+=4){const v=fill(i/4);data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;} const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);return t; };
    const noise = texture(1024, i => { const x=Math.sin(i*12.9898)*43758.5453; return Math.floor((x-Math.floor(x))*255); });
    const neutral = texture(1, () => 230);
    const cloudLayers = [
        ['c14', 'Foreground shadow', ['#dd7e7e', '#cb5757', '#d8846f', '#ecb1b1']],
        ['c13', 'Foreground cloud', ['#295417', '#2d7c40', '#78c856']],
        ['c11', 'Blue-white cloud', ['#dcfafe', '#ffffff']],
        ['c7', 'Horizon cloud', ['#c4dcee', '#ffffff', '#fbf4c6']],
        ['c6', 'Horizon highlight', ['#b8e4ff', '#ffffff']]
    ].map(([id, label, colors]) => ({ id, label, colors }));
    const cloudColors = cloudLayers.flatMap(layer => layer.colors.map((hex, shade) => ({
        id: `${layer.id}-${shade}`, label: `${layer.label} ${shade + 1}`, hex, overridden: true
    })));
    const backgroundControls = { saturation: 1.19, contrast: 0.72, brightness: 1.1, hue: 0 };
    const hexToRgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const makeUniformSource = source => {
        let colorIndex = 0;
        return cloudLayers.reduce((result, layer) => {
        const start = new RegExp(`(// ${layer.id}(?:[^\\n]*)\\n[\\s\\S]*?)(?=\\s*// c\\d+|\\s*return vec4)`);
        return result.replace(start, (_, section) => section.replace(/vec3\(([^)]*)\)/g, (_, values) =>
            `mix(vec3(${values}), uCloud${colorIndex}, uCloudOverride${colorIndex++})`
        ));
        }, source);
    };
    const mountCloudControls = () => {
        const panel = document.getElementById('glass-control');
        if (!panel || panel.querySelector('[data-cloud-controls]')) return;
        const section = document.createElement('section');
        section.className = 'glass-control-section';
        section.dataset.cloudControls = 'true';
        section.innerHTML = '<h2>Cloud Layers</h2>';
        cloudColors.forEach((color, index) => {
            const label = document.createElement('label'); label.htmlFor = `cloud-${color.id}`; label.textContent = color.label;
            const input = document.createElement('input'); input.type = 'color'; input.id = `cloud-${color.id}`; input.value = color.hex; input.dataset.cloudIndex = String(index);
            const output = document.createElement('output'); output.textContent = color.hex;
            input.addEventListener('input', () => { color.hex = input.value; color.overridden = true; output.textContent = input.value; });
            section.append(label, input, output);
        });
        panel.appendChild(section);
    };
    const mountBackgroundControls = () => {
        const panel = document.getElementById('glass-control');
        if (!panel || panel.querySelector('[data-background-controls]')) return;
        const section = document.createElement('section');
        section.className = 'glass-control-section'; section.dataset.backgroundControls = 'true'; section.innerHTML = '<h2>Background</h2>';
        [['saturation', 'Saturation', 0, 2, 0.01], ['contrast', 'Contrast', 0, 2, 0.01], ['brightness', 'Brightness', 0, 2, 0.01], ['hue', 'Hue', -180, 180, 1]].forEach(([key, label, min, max, step]) => {
            const title = document.createElement('label'); title.htmlFor = `background-${key}`; title.textContent = label;
            const input = document.createElement('input'); input.type = 'range'; input.id = `background-${key}`; input.min = min; input.max = max; input.step = step; input.value = backgroundControls[key];
            const output = document.createElement('output'); output.textContent = input.value;
            input.addEventListener('input', () => { backgroundControls[key] = Number(input.value); output.textContent = input.value; });
            section.append(title, input, output);
        });
        panel.appendChild(section);
    };
    const mountContentControls = () => {
        const panel = document.getElementById('glass-control');
        if (!panel || panel.querySelector('[data-content-controls]')) return;
        const section = document.createElement('section');
        section.className = 'glass-control-section'; section.dataset.contentControls = 'true'; section.innerHTML = '<h2>Content</h2>';
        const label = document.createElement('label'); label.htmlFor = 'content-text-color'; label.textContent = 'Article Text';
        const input = document.createElement('input'); input.type = 'color'; input.id = 'content-text-color'; input.value = '#182638';
        const output = document.createElement('output'); output.textContent = input.value;
        input.addEventListener('input', () => { document.documentElement.style.setProperty('--text-primary', input.value); output.textContent = input.value; });
        section.append(label, input, output);
        [['block-color', 'Block Color', 'color', '#ffffff', '--article-block-bg'], ['block-blur', 'Block Blur', 'range', '32', '--article-block-blur']].forEach(([id, text, type, value, variable]) => {
            const rowLabel = document.createElement('label'); rowLabel.htmlFor = `content-${id}`; rowLabel.textContent = text;
            const control = document.createElement('input'); control.id = `content-${id}`; control.type = type; control.value = value;
            if (type === 'range') { control.min = '0'; control.max = '40'; control.step = '1'; }
            const rowOutput = document.createElement('output'); rowOutput.textContent = type === 'range' ? `${value}px` : value;
            control.addEventListener('input', () => { const next = type === 'range' ? `${control.value}px` : `${control.value}33`; document.documentElement.style.setProperty(variable, next); rowOutput.textContent = type === 'range' ? next : control.value; });
            section.append(rowLabel, control, rowOutput);
        });
        panel.appendChild(section);
    };
    const mountScrollbarControls = () => {
        const panel = document.getElementById('glass-control');
        if (!panel || panel.querySelector('[data-scrollbar-controls]')) return;
        const section = document.createElement('section'); section.className = 'glass-control-section'; section.dataset.scrollbarControls = 'true'; section.innerHTML = '<h2>Scrollbar</h2>';
        const label = document.createElement('label'); label.htmlFor = 'page-scrollbar-color'; label.textContent = 'Thumb Color';
        const input = document.createElement('input'); input.type = 'color'; input.id = 'page-scrollbar-color'; input.value = '#292829';
        const output = document.createElement('output'); output.textContent = input.value;
        input.addEventListener('input', () => { document.documentElement.style.setProperty('--scrollbar-glass-color', `${input.value}61`); output.textContent = input.value; });
        section.append(label, input, output); panel.appendChild(section);
    };
    fetch('assets/shaders/train-scene.glsl?v=speed-30-1').then(r => r.text()).then(source => {
        source = makeUniformSource(source);
        const fragment = `#version 300 es
precision highp float; uniform vec3 iResolution; uniform float iTime; uniform sampler2D iChannel0; uniform sampler2D iChannel1; uniform float uSaturation; uniform float uContrast; uniform float uBrightness; uniform float uHue; ${cloudColors.map((_, index) => `uniform vec3 uCloud${index}; uniform float uCloudOverride${index};`).join(' ')} out vec4 outColor;
${source}
void main(){ mainImage(outColor, gl_FragCoord.xy); vec3 c=outColor.rgb; float lum=dot(c,vec3(.2126,.7152,.0722)); c=mix(vec3(lum),c,uSaturation); c=(c-.5)*uContrast+.5; c*=uBrightness; vec3 axis=normalize(vec3(1.)); c=c*cos(uHue)+cross(axis,c)*sin(uHue)+axis*dot(axis,c)*(1.-cos(uHue)); outColor=vec4(clamp(c,0.,1.),outColor.a); }`;
        const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
        const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'p');
        const resize=()=>{const d=Math.min(devicePixelRatio||1,2);canvas.width=innerWidth*d;canvas.height=innerHeight*d;gl.viewport(0,0,canvas.width,canvas.height);};
        const cloudUniforms = cloudColors.map((_, index) => ({ color: gl.getUniformLocation(program, `uCloud${index}`), override: gl.getUniformLocation(program, `uCloudOverride${index}`) }));
        const frameInterval=1000/30;
        let lastFrame=-Infinity;
        const paint=now=>{lastFrame=now;gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,noise);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,neutral);gl.uniform1i(gl.getUniformLocation(program,'iChannel0'),0);gl.uniform1i(gl.getUniformLocation(program,'iChannel1'),1);cloudColors.forEach((color,index)=>{gl.uniform3fv(cloudUniforms[index].color,hexToRgb(color.hex));gl.uniform1f(cloudUniforms[index].override,color.overridden?1:0);});gl.uniform1f(gl.getUniformLocation(program,'uSaturation'),backgroundControls.saturation);gl.uniform1f(gl.getUniformLocation(program,'uContrast'),backgroundControls.contrast);gl.uniform1f(gl.getUniformLocation(program,'uBrightness'),backgroundControls.brightness);gl.uniform1f(gl.getUniformLocation(program,'uHue'),backgroundControls.hue*Math.PI/180);gl.uniform3f(gl.getUniformLocation(program,'iResolution'),canvas.width,canvas.height,1);gl.uniform1f(gl.getUniformLocation(program,'iTime'),now*.001);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);window.dispatchEvent(new Event('shaderbackgroundframe'));};
        const draw=now=>{requestAnimationFrame(draw);if(now-lastFrame>=frameInterval)paint(now);};
        mountCloudControls();
        mountBackgroundControls();
        mountContentControls();
        mountScrollbarControls();
        let resizeTimer=0;
        const scheduleResize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{resize();paint(performance.now());},180);};
        resize();paint(performance.now());addEventListener('resize',scheduleResize,{passive:true});requestAnimationFrame(draw);
    }).catch(error => console.error('Background shader failed:',error));
})();
