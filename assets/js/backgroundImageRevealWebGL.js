/* GPU-only watercolor reveal: BG_bot is the base; BG_mid and BG_top use the
 * supplied polar d0/d1 mask form and are rendered at 24 FPS. */
(function () {
    const canvas = document.getElementById('image-background');
    const gl = canvas?.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return;
    const vert = `#version 300 es
in vec2 p; out vec2 uv; void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0,1);}`;
    const frag = `#version 300 es
precision highp float; in vec2 uv; out vec4 outColor;
uniform vec2 res; uniform float time; uniform sampler2D bot,mid,top; uniform vec4 drops[12]; uniform vec2 freqs[12]; uniform vec2 layerDelay;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
vec2 cover(vec2 p){float imageAspect=2325./1632., viewAspect=res.x/res.y; p-=.5; if(viewAspect>imageAspect)p.y*=imageAspect/viewAspect; else p.x*=viewAspect/imageAspect; return p+.5;}
float drop(vec2 q,float progress,int id){if(progress<=0.)return 0.;float a=atan(q.y,q.x)/atan(0.,-1.)/2.;float v=length(q);float d0=noise(vec2(a*freqs[id].x,v*.2*freqs[id].x));float d1=noise(vec2(a*6.5*freqs[id].y,v*.1*freqs[id].y));float proc=max(.001,progress*8.);float fac=max(0.,.3+d0*.3+d1*.06-v/(drops[id].w*pow(proc,.2)));return clamp(pow(fac,.5)*5.,0.,1.);}
float layerMask(float delay){vec2 scene=cover(uv);float m=0.;for(int i=0;i<12;i++){float p=clamp((time-delay-drops[i].z)/6.5,0.,1.);m=max(m,drop(scene-drops[i].xy,p,i));}return m;}
void main(){vec2 p=cover(uv);vec3 col=texture(bot,p).rgb;float m=layerMask(layerDelay.x);col=mix(col,texture(mid,p).rgb,m);float t=layerMask(layerDelay.y);col=mix(col,texture(top,p).rgb,t);outColor=vec4(col,1.);}`;
    const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vert));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return;
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'p');
    const images=['BG_bot.png','BG_mid.png','BG_top.png'].map(name=>{const img=new Image();img.src=`assets/images/${name}`;return img;});
    const textures=images.map(()=>gl.createTexture());
    const upload=(texture,img)=>{gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);};
    const resize=()=>{const d=Math.min(devicePixelRatio||1,1);canvas.width=Math.max(1,innerWidth*d);canvas.height=Math.max(1,innerHeight*d);canvas.style.width=`${innerWidth}px`;canvas.style.height=`${innerHeight}px`;gl.viewport(0,0,canvas.width,canvas.height);};
    Promise.all(images.map(img=>new Promise((ok,bad)=>{img.onload=ok;img.onerror=bad;}))).then(()=>{
        textures.forEach((t,i)=>upload(t,images[i]));
        // Randomized but evenly distributed drops: location, start order, size
        // and both polar-noise frequencies differ on every page refresh.
        const drops=[], freqs=[];
        for(let y=0;y<3;y++)for(let x=0;x<4;x++){drops.push(.08+x*.28+(Math.random()-.5)*.09,.12+y*.37+(Math.random()-.5)*.10,Math.random()*3.2,.46+Math.random()*.22);freqs.push((38+Math.random()*67)*.6,(91+Math.random()*143)*.6);}
        const delays=[.65+Math.random()*1.0,1.7+Math.random()*1.4];
        const uDrops=gl.getUniformLocation(program,'drops[0]'),uFreqs=gl.getUniformLocation(program,'freqs[0]'),uDelay=gl.getUniformLocation(program,'layerDelay');
        const start=performance.now(),dt=1000/24;let last=-Infinity;
        const draw=now=>{if(now-last<dt)return;last=now;gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);textures.forEach((t,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(gl.getUniformLocation(program,['bot','mid','top'][i]),i);});gl.uniform4fv(uDrops,drops);gl.uniform2fv(uFreqs,freqs);gl.uniform2f(uDelay,delays[0],delays[1]);gl.uniform2f(gl.getUniformLocation(program,'res'),canvas.width,canvas.height);gl.uniform1f(gl.getUniformLocation(program,'time'),(now-start)/1000);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);window.dispatchEvent(new Event('imagebackgroundframe'));};
        resize();addEventListener('resize',()=>{resize();last=-Infinity;draw(performance.now());},{passive:true});const frame=now=>{draw(now);requestAnimationFrame(frame);};requestAnimationFrame(frame);
    }).catch(error=>console.error('Background WebGL failed:',error));
})();
