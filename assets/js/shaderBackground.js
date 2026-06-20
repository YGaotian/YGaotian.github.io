/* Procedural adaptation of the supplied Shadertoy scene.  It is the only page
 * background and exposes its canvas as the liquid-glass renderer's source. */
(() => {
    'use strict';
    const vertex = `attribute vec2 p; varying vec2 uv; void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
    const fragment = `precision highp float;
uniform vec2 iResolution; uniform float iTime; varying vec2 uv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float noise(vec2 x){vec2 f=fract(x),u=f*f*f*(f*(f*6.-15.)+10.);vec2 p=floor(x);return mix(mix(hash(p),hash(p+vec2(1.,0.)),u.x),mix(hash(p+vec2(0.,1.)),hash(p+1.),u.x),u.y);}
float fbm(vec2 x){float a=0.,b=1.,t=0.;for(int i=0;i<8;i++){a+=b*noise(x);t+=b;b*=.7;x*=2.;}return a/t;}
float fbm2(vec2 x){float a=0.,b=1.,t=0.;for(int i=0;i<8;i++){a+=b*noise(x);t+=b;b*=.9;x*=2.;}return a/t;}
vec3 cloud(vec2 p,float time,float level,float disp,float dist,vec3 low,vec3 high){float h=(fbm(p+vec2(time/dist,0.))-.5)*disp;float edge=smoothstep(level-.10,level+.08,p.y-h);return mix(low,high,edge);}
void main(){
 vec2 p=gl_FragCoord.xy/iResolution.y; float t=iTime*4.; vec3 col=vec3(.58,.70,1.);
 col=cloud(p+vec2(32.5,0.),t,.30,.9,10.,vec3(.48,.19,.20),vec3(.95,.45,.30));
 col=cloud(p+vec2(30.,0.),t,.35,1.,15.,col,vec3(.95,.80,.77));
 col=cloud(p+vec2(27.5,0.),t,.35,3.5,20.,col,vec3(.77,.48,.46));
 col=cloud(p+vec2(20.5,0.),t,.50,2.3,30.,col,vec3(.99,.29,.20));
 col=cloud(p+vec2(15.5,0.),t,.75,3.5,45.,col,vec3(1.,.62,.44));
 col=cloud(p+vec2(7.,0.),t,.90,3.,70.,col,vec3(.74,.35,.30));
 col=cloud(p+vec2(3.5,0.),t,1.,5.,100.,col,vec3(1.,.94,.91));
 vec2 q=p; q.y-=.2; vec2 cell=fract(q*9.); float wagon=(1.-step(.45,q.x))*(1.-step(.115,q.y))*step(.103,q.y)*step(.05,1.-abs(cell.x*2.-1.));
 float join=(1.-step(.45,q.x))*(1.-step(.11,q.y))*step(.107,q.y); float roof=(1.-step(.45,q.x))*(1.-step(.117,q.y))*step(.11,q.y)*step(.15,1.-abs(cell.x*2.-1.));
 col=mix(col,vec3(.18,.12,.15),join);col=mix(col,vec3(.48,.19,.20),wagon);col=mix(col,vec3(.18,.12,.15),roof);
 float loco=step(.45,q.x)*(1.-step(.50,q.x))*step(.103,q.y)*(1.-step(.112,q.y)); col=mix(col,vec3(.38,.19,.20),loco);
 vec2 b=q+vec2(t/5.+32.5,0.); b.x=fract(b.x*3.); float bridge=1.;
 bridge*=smoothstep(.001,.003,abs(b.y-pow(b.x-.5,2.)*.15-.12));
 bridge*=min(step(.05,1.-abs(b.x*2.-1.))+step(.17,b.y),1.);
 bridge*=min(smoothstep(.02,.05,1.-abs(b.x*2.-1.))+step(.177,b.y),1.);
 bridge*=min(step(.1,b.y)+smoothstep(-.09,-.085,-b.y-.001/(1.-abs(b.x*2.-1.))),1.);
 bridge*=min(smoothstep(.05,.2,1.-abs(fract(b.x*16.)*2.-1.))+step(.12,b.y-pow(b.x-.5,2.)*.15)+step(-.1,-b.y),1.);
 col=mix(vec3(.29,.09,.08)*smoothstep(-.08,.08,q.y),col,bridge);
 float smoke=fbm2(q+vec2(t/5.+3.5,0.))-.55; if(q.x<.49 && abs(q.y+smoke*.4-.12)<.025)col=vec3(.96,.90,.87);
 vec2 screen=gl_FragCoord.xy/iResolution.xy; col*=.5+.5*pow(16.*screen.x*screen.y*(1.-screen.x)*(1.-screen.y),.2); gl_FragColor=vec4(col,1.);
}`;
    const canvas = document.getElementById('shader-background');
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false });
    if (!gl) return;
    const compile = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const program = gl.createProgram(); gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p'); const resolution = gl.getUniformLocation(program, 'iResolution'); const time = gl.getUniformLocation(program, 'iTime');
    const resize = () => { const dpr=Math.min(devicePixelRatio||1,2); canvas.width=innerWidth*dpr; canvas.height=innerHeight*dpr; gl.viewport(0,0,canvas.width,canvas.height); };
    const render = now => { gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0); gl.uniform2f(resolution,canvas.width,canvas.height); gl.uniform1f(time,now*.001); gl.drawArrays(gl.TRIANGLE_STRIP,0,4); if ((Math.floor(now/100)%2)===0) window.dispatchEvent(new Event('shaderbackgroundframe')); requestAnimationFrame(render); };
    resize(); addEventListener('resize',resize,{passive:true}); requestAnimationFrame(render);
})();
