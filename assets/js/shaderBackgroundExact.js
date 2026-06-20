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
    fetch('assets/shaders/train-scene.glsl').then(r => r.text()).then(source => {
        const fragment = `#version 300 es
precision highp float; uniform vec3 iResolution; uniform float iTime; uniform sampler2D iChannel0; uniform sampler2D iChannel1; out vec4 outColor;
${source}
void main(){ mainImage(outColor, gl_FragCoord.xy); }`;
        const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
        const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'p');
        const resize=()=>{const d=Math.min(devicePixelRatio||1,2);canvas.width=innerWidth*d;canvas.height=innerHeight*d;gl.viewport(0,0,canvas.width,canvas.height);};
        const draw=now=>{gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,noise);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,neutral);gl.uniform1i(gl.getUniformLocation(program,'iChannel0'),0);gl.uniform1i(gl.getUniformLocation(program,'iChannel1'),1);gl.uniform3f(gl.getUniformLocation(program,'iResolution'),canvas.width,canvas.height,1);gl.uniform1f(gl.getUniformLocation(program,'iTime'),now*.001);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);if(Math.floor(now/100)%2===0)window.dispatchEvent(new Event('shaderbackgroundframe'));requestAnimationFrame(draw);};
        resize();addEventListener('resize',resize,{passive:true});requestAnimationFrame(draw);
    }).catch(error => console.error('Background shader failed:',error));
})();
