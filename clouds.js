(() => {
  'use strict';

  const canvas = document.getElementById('cloudCanvas');
  if (!canvas) return;

  const scriptUrl = document.currentScript?.src || '';
  const cloudDebug = new URLSearchParams(location.search).get('cloudDebug') === '1';
  const cloudBuild = '2026-11-14.2';
  const cloudSpeed = 8;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 720px)').matches;
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4;
  const diagnostics = {
    build: cloudBuild,
    scriptUrl,
    debug: cloudDebug,
    speed: cloudSpeed,
    reducedMotion: reducedMotion.matches,
    reducedMotionOverridden: cloudDebug && reducedMotion.matches,
    frameCount: 0,
    uniformUpdates: 0,
    shaderTime: 0,
    pixelSignatures: [],
    webglErrors: [],
    jsErrors: [],
    startedAt: performance.now()
  };
  let debugPanel = null;

  function updateDebugPanel() {
    if (!cloudDebug || !debugPanel) return;
    const seconds = Math.max(.001, (performance.now() - diagnostics.startedAt) / 1000);
    const resource = performance.getEntriesByName(scriptUrl).at(-1);
    const style = getComputedStyle(canvas);
    const fallback = document.querySelector('.cloud-fallback');
    diagnostics.resource = resource ? {
      transferSize: resource.transferSize,
      encodedBodySize: resource.encodedBodySize,
      duration: Math.round(resource.duration * 10) / 10
    } : null;
    diagnostics.canvas = {
      display: style.display,
      opacity: style.opacity,
      zIndex: style.zIndex,
      width: canvas.width,
      height: canvas.height,
      fallbackDisplay: fallback ? getComputedStyle(fallback).display : 'missing'
    };
    debugPanel.textContent = [
      `GARAGE CLOUD DEBUG  build ${diagnostics.build}`,
      `script: ${diagnostics.scriptUrl}`,
      `rAF: ${diagnostics.frameCount} frames  ~${(diagnostics.frameCount / seconds).toFixed(1)} fps`,
      `uniform uTime: ${diagnostics.uniformUpdates} updates  value ${diagnostics.shaderTime.toFixed(2)}`,
      `pixel signatures: ${diagnostics.pixelSignatures.length} distinct`,
      `prefers-reduced-motion: ${diagnostics.reducedMotion}  debug override: ${diagnostics.reducedMotionOverridden}`,
      `WebGL errors: ${diagnostics.webglErrors.length}  JS errors: ${diagnostics.jsErrors.length}`,
      `canvas: ${diagnostics.canvas.width}x${diagnostics.canvas.height} opacity ${diagnostics.canvas.opacity} z ${diagnostics.canvas.zIndex}`,
      `fallback: ${diagnostics.canvas.fallbackDisplay}  speed: ${diagnostics.speed}x`,
      `resource transfer: ${diagnostics.resource?.transferSize ?? 'n/a'} bytes`
    ].join('\n');
  }

  if (cloudDebug) {
    debugPanel = document.createElement('pre');
    debugPanel.id = 'cloud-debug-panel';
    Object.assign(debugPanel.style, {
      position: 'fixed', left: '12px', bottom: '12px', zIndex: '2147483647',
      margin: '0', padding: '10px 12px', maxWidth: 'min(620px, calc(100vw - 24px))',
      color: '#d9ffe0', background: 'rgba(0,12,5,.88)', border: '1px solid rgba(140,255,165,.65)',
      borderRadius: '8px', font: '12px/1.45 Consolas, monospace', whiteSpace: 'pre-wrap', pointerEvents: 'none'
    });
    document.body.appendChild(debugPanel);
    window.__cloudDiagnostics = diagnostics;
    addEventListener('error', event => {
      diagnostics.jsErrors.push(String(event.error || event.message));
      updateDebugPanel();
    });
    addEventListener('unhandledrejection', event => {
      diagnostics.jsErrors.push(String(event.reason));
      updateDebugPanel();
    });
    updateDebugPanel();
  }

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  });

  if (!gl) {
    diagnostics.webglErrors.push('WebGL 2 context unavailable');
    updateDebugPanel();
    document.documentElement.classList.add('no-webgl');
    return;
  }

  const vertexSource = `#version 300 es
  precision highp float;
  const vec2 POS[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
  out vec2 vUv;
  void main(){vec2 p=POS[gl_VertexID];vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;

  const fragmentSource = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uCloudTexture;
  uniform vec2 uResolution;
  uniform float uTime;

  float hash31(vec3 p){
    p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);
  }
  float noise3(vec3 p){
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float fbm(vec3 p){
    float sum=0.,amp=.54;
    mat3 rot=mat3(.00,.80,.60,-.80,.36,-.48,-.60,-.48,.64);
    for(int i=0;i<4;i++){sum+=amp*noise3(p);p=rot*p*2.03+vec3(2.7,4.1,1.9);amp*=.49;}
    return sum;
  }
  void main(){
    vec2 uv=vUv;
    float aspect=uResolution.x/uResolution.y;
    vec2 p=(uv-.5)*vec2(aspect,1.);
    vec4 side=1.-smoothstep(vec4(.13),vec4(.53),vec4(uv.x,1.-uv.x,1.-uv.y,uv.y));
    side*=side;
    float edge=max(max(side.x,side.y),max(side.z,side.w));
    if(edge<.001){fragColor=vec4(0.);return;}

    float t=uTime;
    float n1=fbm(vec3(p*2.05+vec2(t*.011,-t*.007),t*.028));
    float n2=fbm(vec3(p.yx*2.28+vec2(-t*.008,t*.012),7.3+t*.024));
    float curl=noise3(vec3(p*5.1+vec2(t*.018,-t*.014),13.7+t*.019));
    float total=max(.001,side.x+side.y+side.z+side.w);
    vec2 flow=(side.x*vec2(.45,.86)+side.y*vec2(-.38,-.72)+side.z*vec2(.78,-.34)+side.w*vec2(-.64,.29))/total;
    vec2 turbulence=(vec2(n1,n2)-.5)*.034;
    turbulence+=vec2(curl-.5,.5-curl)*.012;
    vec2 drift=flow*(sin(t*.073+vec2(1.1,2.7))*.0065+vec2(.004));
    float belowTop=1.-smoothstep(.74,.9,uv.y);
    float leftBody=side.x*belowTop;
    float rightBody=side.y*belowTop;
    vec2 placement=uv+vec2(.016*leftBody,.024*side.w);
    vec2 warpedUv=clamp(placement+(turbulence+drift)*edge,vec2(.001),vec2(.999));

    vec4 cloud=texture(uCloudTexture,warpedUv);
    vec3 evolveCoordA=vec3(p*3.15,23.4);
    vec3 evolveCoordB=vec3(p.yx*4.65,41.7);
    vec3 foldCoord=vec3(p.x*7.2,p.y*5.8,67.1);
    float evolveA=noise3(evolveCoordA+vec3(t*.041,-t*.027,t*.105))-noise3(evolveCoordA);
    float evolveB=noise3(evolveCoordB+vec3(-t*.032,t*.046,t*.091))-noise3(evolveCoordB);
    float folding=noise3(foldCoord+vec3(t*.068,-t*.052,t*.158))-noise3(foldCoord);
    vec2 bottomRoll=vec2(evolveA*.72+folding,evolveB*.48-folding*.62)*vec2(.017,.012);
    vec2 topSwirl=vec2(evolveB-folding*.28,-evolveA+folding*.22)*vec2(.008,.0065);
    vec2 leftCurl=vec2(evolveA-evolveB,evolveA*.58+folding)*vec2(.008,.012);
    vec2 rightCurl=vec2(evolveB-evolveA,-evolveB*.62+folding)*vec2(.009,.011);
    vec2 internalWarp=(side.x*leftCurl+side.y*rightCurl+side.z*topSwirl+side.w*bottomRoll)/total;
    vec2 secondaryWarp=vec2(-internalWarp.y,internalWarp.x)*.58+vec2(evolveB,-evolveA)*.0035*edge;
    vec4 motionA=texture(uCloudTexture,clamp(warpedUv+internalWarp,vec2(.001),vec2(.999)));
    vec4 motionB=texture(uCloudTexture,clamp(warpedUv+secondaryWarp,vec2(.001),vec2(.999)));
    vec3 baseColor=cloud.a>.001?cloud.rgb/cloud.a:vec3(0.);
    vec3 motionColorA=motionA.a>.001?motionA.rgb/motionA.a:baseColor;
    vec3 motionColorB=motionB.a>.001?motionB.rgb/motionB.a:baseColor;
    motionColorA=mix(baseColor,motionColorA,smoothstep(.025,.18,motionA.a));
    motionColorB=mix(baseColor,motionColorB,smoothstep(.025,.18,motionB.a));
    cloud.rgb=mix(baseColor,mix(motionColorA,motionColorB,.38),.62*edge)*cloud.a;
    float detail=noise3(vec3(p*7.4,19.2+t*.033));
    vec2 wispShift=(vec2(n2,-n1)-.5)*.017*edge;
    vec4 wisp=texture(uCloudTexture,clamp(warpedUv+wispShift,vec2(.001),vec2(.999)));
    float wispMix=.1*smoothstep(.38,.78,detail)*edge;
    cloud.rgb+=(1.-cloud.a)*wisp.rgb*wispMix;
    cloud.a+=(1.-cloud.a)*wisp.a*wispMix;
    float breathing=.94+.06*sin(t*.11+n1*5.7+n2*3.9);
    cloud*=breathing;
    float rightTexture=noise3(vec3(uv*vec2(8.3,5.2),31.7+t*.025));
    float rightDensity=mix(1.,.72+.18*smoothstep(.36,.74,rightTexture),rightBody);
    cloud*=rightDensity;
    float safeX=smoothstep(.055,.105,uv.x)*(1.-smoothstep(.37,.43,uv.x));
    float safeY=smoothstep(.16,.22,uv.y)*(1.-smoothstep(.69,.75,uv.y));
    float contentRelief=1.-.42*safeX*safeY*leftBody;
    cloud*=contentRelief;
    vec3 reflected=vec3(.63,.49,.52)*cloud.a;
    cloud.rgb=mix(cloud.rgb,reflected,.045*(side.y+side.w));
    float tone=.69+.1*side.w+.04*side.y;
    cloud.rgb*=tone;
    cloud.rgb*=mix(1.,.82,rightBody);
    cloud.a*=.94;
    fragColor=clamp(cloud,0.,1.);
  }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'unknown shader compile error';
      diagnostics.webglErrors.push(message);
      updateDebugPanel();
      console.warn('Cloud shader compile error:', message);
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) {
    document.documentElement.classList.add('no-webgl');
    return;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'unknown program link error';
    diagnostics.webglErrors.push(message);
    updateDebugPanel();
    console.warn('Cloud shader link error:', message);
    document.documentElement.classList.add('no-webgl');
    gl.deleteProgram(program);
    return;
  }

  const vao = gl.createVertexArray();
  const texture = gl.createTexture();
  const uniforms = {
    texture: gl.getUniformLocation(program, 'uCloudTexture'),
    resolution: gl.getUniformLocation(program, 'uResolution'),
    time: gl.getUniformLocation(program, 'uTime')
  };
  let scale = mobile || lowPower ? .58 : .78;
  const maxScale = mobile || lowPower ? .76 : 1;
  const minScale = mobile ? .44 : .55;
  let animationId = 0;
  let elapsed = 0;
  let last = performance.now();
  let frames = 0;
  let sampleStart = last;
  let paused = false;
  let destroyed = false;
  let textureReady = false;
  let lastDebugUpdate = 0;

  function sampleFrameSignature() {
    if (!cloudDebug || canvas.width < 2 || canvas.height < 2) return;
    const points = [[.06,.5],[.14,.82],[.3,.94],[.5,.91],[.72,.94],[.92,.72],[.9,.24],[.72,.08],[.5,.06],[.28,.09]];
    const pixel = new Uint8Array(4);
    let signature = 2166136261;
    for (const point of points) {
      gl.readPixels(
        Math.min(canvas.width - 1, Math.max(0, Math.round(point[0] * canvas.width))),
        Math.min(canvas.height - 1, Math.max(0, Math.round(point[1] * canvas.height))),
        1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel
      );
      for (const channel of pixel) signature = Math.imul(signature ^ channel, 16777619) >>> 0;
    }
    const value = signature.toString(16).padStart(8, '0');
    if (!diagnostics.pixelSignatures.includes(value)) {
      diagnostics.pixelSignatures.push(value);
      if (diagnostics.pixelSignatures.length > 120) diagnostics.pixelSignatures.shift();
    }
    const error = gl.getError();
    if (error !== gl.NO_ERROR) diagnostics.webglErrors.push(`gl.getError(): ${error}`);
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.35 : 1.65);
    const displayWidth = canvas.clientWidth || innerWidth;
    const displayHeight = canvas.clientHeight || innerHeight;
    const width = Math.max(2, Math.round(displayWidth * dpr * scale));
    const height = Math.max(2, Math.round(displayHeight * dpr * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function render(time) {
    resize();
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.texture, 0);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    const shaderTime = time * cloudSpeed;
    gl.uniform1f(uniforms.time, shaderTime);
    if (cloudDebug) {
      diagnostics.uniformUpdates++;
      diagnostics.shaderTime = shaderTime;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (cloudDebug && diagnostics.frameCount % 12 === 0) sampleFrameSignature();
  }

  function draw(now) {
    if (destroyed || paused || !textureReady) return;
    const delta = Math.min((now - last) / 1000, .05);
    last = now;
    elapsed += delta;
    render(elapsed);
    if (cloudDebug) {
      diagnostics.frameCount++;
      if (now - lastDebugUpdate > 250) {
        lastDebugUpdate = now;
        updateDebugPanel();
      }
    }
    frames++;
    if (frames >= 90) {
      const fps = frames * 1000 / Math.max(1, now - sampleStart);
      if (fps < 43 && scale > minScale) scale = Math.max(minScale, scale - .07);
      else if (fps > 57 && scale < maxScale) scale = Math.min(maxScale, scale + .035);
      frames = 0;
      sampleStart = now;
    }
    animationId = requestAnimationFrame(draw);
  }

  function start() {
    cancelAnimationFrame(animationId);
    if (!textureReady || destroyed) return;
    diagnostics.reducedMotion = reducedMotion.matches;
    diagnostics.reducedMotionOverridden = cloudDebug && reducedMotion.matches;
    if (reducedMotion.matches && !cloudDebug) render(11.5);
    else {
      last = performance.now();
      sampleStart = last;
      animationId = requestAnimationFrame(draw);
    }
  }

  function cleanup() {
    destroyed = true;
    cancelAnimationFrame(animationId);
    gl.deleteTexture(texture);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
  }

  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    if (destroyed) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    textureReady = true;
    if (cloudDebug) console.info('[GARAGE cloudDebug] texture ready', diagnostics);
    resize();
    start();
  };
  image.onerror = () => document.documentElement.classList.add('no-webgl');
  image.src = 'assets/cloud-frame-reference.png';

  addEventListener('resize', resize, { passive: true });
  addEventListener('pagehide', cleanup, { once: true });
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (paused) cancelAnimationFrame(animationId);
    else start();
  });
  reducedMotion.addEventListener?.('change', start);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    cancelAnimationFrame(animationId);
    document.documentElement.classList.add('no-webgl');
  });
})();
