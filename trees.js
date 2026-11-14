(() => {
  'use strict';

  const canvas = document.getElementById('sakuraCanvas');
  const hero = document.querySelector('.hero');
  const leftImage = document.querySelector('.hero-tree--left');
  const rightImage = document.querySelector('.hero-tree--right');
  if (!canvas || !hero || !leftImage || !rightImage) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'high-performance'
  });
  if (!gl) return;

  const vertexSource = `#version 300 es
  precision highp float;
  in vec2 aUv;
  uniform vec2 uResolution;
  uniform vec4 uRect;
  uniform float uTime;
  uniform float uSide;
  uniform float uMotion;
  uniform vec4 uWind;
  out vec2 vUv;

  void main(){
    float sideSign=mix(1.,-1.,uSide);
    float reach=mix(aUv.x,1.-aUv.x,uSide);
    float crown=pow(clamp(1.-aUv.y,0.,1.),1.22);
    float flexibility=smoothstep(.17,.86,crown*.78+reach*.52);
    flexibility*=flexibility;

    float branchPhase=aUv.y*16.7+aUv.x*10.9+uSide*3.73;
    float slow=uWind.x+sin(uTime*.29+uSide*1.9)*.22;
    float delayed=sin(uTime*.61-1.65*reach-.92*crown+uSide*2.4);
    float secondary=sin(uTime*.93+branchPhase+slow*.7);
    float fine=sin(uTime*1.37+branchPhase*1.71-uSide*4.1);
    float localMix=.55+.45*sin(branchPhase*.63+uTime*.17);
    float gust=uWind.y;

    vec2 offset=vec2(0.);
    offset.x=sideSign*(slow*3.1+gust*4.4+delayed*2.15+secondary*1.28*localMix+fine*.48);
    offset.y=gust*1.18+delayed*.72+secondary*.62+fine*.24;
    offset*=flexibility*uMotion;

    float twigMask=smoothstep(.42,.9,crown+.22*reach);
    offset+=vec2(sideSign*secondary,fine*.42)*twigMask*uMotion*.72;

    vec2 pixel=uRect.xy+aUv*uRect.zw+offset;
    vec2 clip=vec2(pixel.x/uResolution.x*2.-1.,1.-pixel.y/uResolution.y*2.);
    gl_Position=vec4(clip,0.,1.);
    vUv=aUv;
  }`;

  const fragmentSource = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uTexture;
  out vec4 fragColor;
  void main(){fragColor=texture(uTexture,vUv);}`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Sakura shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Sakura program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return;
  }

  const columns = 48;
  const rows = 36;
  const vertices = new Float32Array((columns + 1) * (rows + 1) * 2);
  let vertexOffset = 0;
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= columns; x++) {
      vertices[vertexOffset++] = x / columns;
      vertices[vertexOffset++] = y / rows;
    }
  }
  const indices = new Uint16Array(columns * rows * 6);
  let indexOffset = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const a = y * (columns + 1) + x;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices[indexOffset++] = a;
      indices[indexOffset++] = c;
      indices[indexOffset++] = b;
      indices[indexOffset++] = b;
      indices[indexOffset++] = c;
      indices[indexOffset++] = d;
    }
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const uvLocation = gl.getAttribLocation(program, 'aUv');
  gl.enableVertexAttribArray(uvLocation);
  gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  const uniforms = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    rect: gl.getUniformLocation(program, 'uRect'),
    time: gl.getUniformLocation(program, 'uTime'),
    side: gl.getUniformLocation(program, 'uSide'),
    motion: gl.getUniformLocation(program, 'uMotion'),
    wind: gl.getUniformLocation(program, 'uWind'),
    texture: gl.getUniformLocation(program, 'uTexture')
  };

  function createTexture(image) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return texture;
  }

  const windState = {
    strength: 0,
    direction: 0,
    gust: 0,
    leftResponse: 0,
    rightResponse: 0,
    spawnPoints: [],
    randomSpawnPoint() {
      if (!this.spawnPoints.length) return null;
      const point = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
      return { x: point.x + (Math.random() - .5) * 34, y: point.y + (Math.random() - .5) * 18 };
    }
  };
  window.garageSakuraWind = windState;

  let textures = [];
  let layouts = [];
  let dpr = 1;
  let animationId = 0;
  let last = performance.now();
  let elapsed = 0;
  let ready = false;
  let destroyed = false;

  function treeLayout(side, image) {
    const viewportWidth = innerWidth;
    const viewportHeight = innerHeight;
    const heroWidth = hero.clientWidth;
    const ratio = image.naturalHeight / image.naturalWidth;
    let width;
    let x;
    let y;
    if (viewportWidth <= 620) {
      width = viewportWidth * (side === 0 ? 1.08 : 1.05);
      x = side === 0 ? -viewportWidth * .45 : heroWidth + viewportWidth * .48 - width;
      y = side === 0 ? 0 : viewportHeight * .02;
    } else if (viewportWidth <= 900) {
      width = viewportWidth * (side === 0 ? .76 : .70);
      x = side === 0 ? -viewportWidth * .14 : heroWidth + viewportWidth * .18 - width;
      y = side === 0 ? -viewportHeight * .015 : -viewportHeight * .01;
    } else {
      width = Math.min(viewportWidth * (side === 0 ? .58 : .55), side === 0 ? 1050 : 1000);
      x = side === 0 ? -viewportWidth * .035 : heroWidth + viewportWidth * .04 - width;
      y = side === 0 ? -viewportHeight * .015 : -viewportHeight * .01;
    }
    return { x, y, width, height: width * ratio };
  }

  function refreshSpawnPoints() {
    const left = layouts[0];
    const right = layouts[1];
    if (!left || !right) return;
    const points = [
      [left,.28,.08],[left,.5,.12],[left,.72,.18],[left,.87,.2],[left,.58,.31],
      [right,.23,.17],[right,.39,.1],[right,.59,.14],[right,.73,.24],[right,.34,.32]
    ];
    windState.spawnPoints = points.map(([rect, x, y]) => ({ x: rect.x + rect.width * x, y: rect.y + rect.height * y }));
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, innerWidth < 720 ? 1.25 : 1.5);
    const width = Math.max(2, Math.round(hero.clientWidth * dpr));
    const height = Math.max(2, Math.round(hero.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    layouts = [treeLayout(0, leftImage), treeLayout(1, rightImage)];
    refreshSpawnPoints();
  }

  function updateWind(time) {
    const slow = Math.sin(time * .29) * .42 + Math.sin(time * .117 + 1.8) * .25 + Math.sin(time * .053 + .4) * .14;
    const gustWave = Math.max(0, Math.sin(time * .173 - .8));
    const gust = gustWave * gustWave * (.32 + .18 * Math.sin(time * .071 + 2.1));
    windState.direction = slow;
    windState.strength = Math.abs(slow) * .62 + gust;
    windState.gust = gust;
    windState.leftResponse = slow + Math.sin(time * .47 + .6) * .18 + gust * .72;
    windState.rightResponse = -slow * .86 + Math.sin(time * .39 + 2.3) * .16 + gust * .58;
  }

  function drawTree(index) {
    const rect = layouts[index];
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[index]);
    gl.uniform1i(uniforms.texture, 0);
    gl.uniform4f(uniforms.rect, rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr);
    gl.uniform1f(uniforms.side, index);
    gl.uniform1f(uniforms.motion, dpr * (index === 0 ? 1 : .92));
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  }

  function render(time) {
    resize();
    updateWind(time);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, time);
    gl.uniform4f(uniforms.wind, windState.direction, windState.gust, windState.leftResponse, windState.rightResponse);
    drawTree(0);
    drawTree(1);
  }

  function frame(now) {
    if (destroyed || !ready) return;
    const delta = Math.min((now - last) / 1000, .05);
    last = now;
    elapsed += delta;
    render(elapsed);
    animationId = requestAnimationFrame(frame);
  }

  function start() {
    cancelAnimationFrame(animationId);
    if (!ready || destroyed) return;
    last = performance.now();
    if (reducedMotion.matches) render(7.25);
    else animationId = requestAnimationFrame(frame);
  }

  function cleanup() {
    destroyed = true;
    cancelAnimationFrame(animationId);
    textures.forEach(texture => gl.deleteTexture(texture));
    gl.deleteBuffer(vertexBuffer);
    gl.deleteBuffer(indexBuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
  }

  Promise.all([leftImage.decode(), rightImage.decode()]).then(() => {
    if (destroyed) return;
    textures = [createTexture(leftImage), createTexture(rightImage)];
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    ready = true;
    resize();
    render(0);
    document.documentElement.classList.add('sakura-webgl');
    start();
  }).catch(error => console.warn('Sakura assets failed to initialize:', error));

  addEventListener('resize', resize, { passive: true });
  addEventListener('pagehide', cleanup, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(animationId);
    else start();
  });
  reducedMotion.addEventListener?.('change', start);
})();
