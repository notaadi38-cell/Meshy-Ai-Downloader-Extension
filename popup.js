const $ = (selector) => document.querySelector(selector);
const status = (message) => { $("#status").textContent = message; };
let selectedFile = null;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadResources() {
  const list = $("#resource-list");
  list.replaceChildren();
  try {
    const tab = await activeTab();
    if (!tab?.id || !tab.url?.startsWith("https://")) throw new Error("Open a secure webpage first.");
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_MESHY_RESOURCES" });
    const resources = response?.resources || [];
    if (!resources.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = tab.url.includes("meshy.ai") ? "No .meshy resources seen yet. Reload the model page and try again." : "Open a Meshy model page, then refresh this list.";
      list.append(empty);
      return;
    }
    for (const item of resources) {
      const row = document.createElement("div"); row.className = "resource";
      const label = document.createElement("div"); label.className = "resource-name";
      label.textContent = item.path; label.title = `${item.host}${new URL(item.url).pathname}`;
      const host = document.createElement("small"); host.textContent = item.host; label.append(host);
      const button = document.createElement("button"); button.textContent = "Download";
      button.addEventListener("click", () => downloadResource(item, button));
      row.append(label, button); list.append(row);
    }
  } catch (error) {
    const message = document.createElement("p"); message.className = "muted";
    message.textContent = error.message.includes("Receiving end") ? "Reload the Meshy page after installing the extension, then check again." : error.message;
    list.append(message);
  }
}

async function downloadResource(item, button) {
  try {
    const u = new URL(item.url);
    if (u.protocol !== "https:" || !/\.meshy$/i.test(u.pathname) || u.username || u.password) throw new Error("This resource URL is not eligible for download.");
    button.disabled = true;
    await chrome.downloads.download({ url: u.href, filename: safeFilename(item.path), saveAs: true, conflictAction: "uniquify" });
    status("Download started. A Meshy resource is encrypted and is not directly convertible here.");
  } catch (error) { status(`Download failed: ${error.message}`); }
  finally { button.disabled = false; }
}

function safeFilename(name) {
  const base = String(name || "model.meshy").split(/[\\/]/).pop().replace(/[<>:"|?*\x00-\x1f]/g, "_");
  return base.toLowerCase().endsWith(".meshy") ? base : "model.meshy";
}

$("#refresh").addEventListener("click", loadResources);
$("#model-file").addEventListener("change", (event) => {
  selectedFile = event.target.files?.[0] || null;
  $("#convert-controls").hidden = !selectedFile;
  if (selectedFile) $("#file-info").textContent = `${selectedFile.name} · ${formatBytes(selectedFile.size)}`;
  status("");
});
$("#export").addEventListener("click", async () => {
  if (!selectedFile) return;
  const button = $("#export"); button.disabled = true;
  try {
    const format = $("#format").value;
    const input = await selectedFile.arrayBuffer();
    const output = format === "glb" ? input.slice(0) : await convertGlb(input, format);
    const blob = new Blob([output], { type: format === "obj" ? "text/plain" : format === "stl" ? "model/stl" : "model/gltf-binary" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${selectedFile.name.replace(/\.glb$/i, "")}.${format}`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    status(`Exported ${format.toUpperCase()} locally.`);
  } catch (error) { status(`Could not convert model: ${error.message}`); }
  finally { button.disabled = false; }
});

function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

async function convertGlb(buffer, format) {
  if (buffer.byteLength < 20) throw new Error("File is too small to be a GLB.");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error("Expected a glTF 2.0 binary (.glb) file.");
  if (view.getUint32(8, true) !== buffer.byteLength) throw new Error("GLB length header does not match the file.");
  let offset = 12, json = null, bin = null;
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true); offset += 8;
    if (length > buffer.byteLength - offset) throw new Error("GLB chunk extends beyond the file.");
    const chunk = buffer.slice(offset, offset + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk).replace(/[\u0000\s]+$/g, ""));
    else if (type === 0x004e4942) bin = chunk;
    offset += length;
  }
  if (!json || !bin) throw new Error("GLB must contain JSON and binary data chunks.");
  const geometry = readTriangles(json, bin);
  if (!geometry.faces.length) throw new Error("No triangle geometry was found.");
  return format === "obj" ? makeObj(geometry) : makeStl(geometry);
}

function readTriangles(gltf, bin) {
  const dv = new DataView(bin), components = { 5120:[1,true],5121:[1,false],5122:[2,true],5123:[2,false],5125:[4,false],5126:[4,true] };
  const values = (accessorIndex) => {
    const a = gltf.accessors?.[accessorIndex], view = gltf.bufferViews?.[a?.bufferView];
    if (!a || !view || a.type !== "VEC3") throw new Error("Only standard POSITION/index accessors are supported.");
    const [size, signed] = components[a.componentType] || [];
    if (!size) throw new Error("Unsupported GLB accessor type.");
    const n = a.type === "VEC3" ? 3 : 1, stride = view.byteStride || n * size, start = (view.byteOffset || 0) + (a.byteOffset || 0), out = [];
    for (let i=0;i<a.count;i++) { const tuple=[]; for(let c=0;c<n;c++) tuple.push(readComponent(dv,start+i*stride+c*size,a.componentType,signed)); out.push(tuple); }
    return out;
  };
  const positions=[], faces=[];
  for (const mesh of gltf.meshes || []) for (const primitive of mesh.primitives || []) {
    if ((primitive.mode ?? 4) !== 4 || !primitive.attributes || primitive.attributes.POSITION === undefined) continue;
    const local = values(primitive.attributes.POSITION), base = positions.length;
    for (const p of local) positions.push(transformPoint(p, gltf, mesh));
    const indices = primitive.indices === undefined ? local.map((_,i)=>i) : readIndex(gltf,bin,primitive.indices,components,dv);
    if (indices.length % 3) throw new Error("Triangle index count is invalid.");
    for(let i=0;i<indices.length;i+=3) faces.push([base+indices[i],base+indices[i+1],base+indices[i+2]]);
  }
  return { positions, faces };
}

function readComponent(dv, offset, type, signed) {
  if(type===5126) return dv.getFloat32(offset,true);
  if(type===5125) return dv.getUint32(offset,true);
  if(type===5123) return dv.getUint16(offset,true);
  if(type===5122) return dv.getInt16(offset,true);
  if(type===5121) return dv.getUint8(offset);
  return dv.getInt8(offset);
}
function readIndex(gltf,bin,index,components,dv) {
  const a=gltf.accessors?.[index], view=gltf.bufferViews?.[a?.bufferView]; if(!a||!view||a.type!=="SCALAR") throw new Error("Invalid index accessor.");
  const [size]=components[a.componentType]||[]; if(![1,2,4].includes(size)) throw new Error("Unsupported index format.");
  const start=(view.byteOffset||0)+(a.byteOffset||0), out=[]; for(let i=0;i<a.count;i++) out.push(size===1?dv.getUint8(start+i):size===2?dv.getUint16(start+i*2,true):dv.getUint32(start+i*4,true)); return out;
}
function transformPoint(p, gltf, mesh) {
  // Apply the mesh node's translation, rotation and scale when a matching scene node exists.
  const node=(gltf.nodes||[]).find(n=>n.mesh===gltf.meshes.indexOf(mesh));
  if(!node) return p;
  const s=node.scale||[1,1,1], q=node.rotation||[0,0,0,1], t=node.translation||[0,0,0];
  const v=[p[0]*s[0],p[1]*s[1],p[2]*s[2]], u=q.slice(0,3), w=q[3];
  const dot=u[0]*v[0]+u[1]*v[1]+u[2]*v[2], uu=u[0]**2+u[1]**2+u[2]**2;
  const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  return [2*dot*u[0]+(w*w-uu)*v[0]+2*w*cross[0]+t[0],2*dot*u[1]+(w*w-uu)*v[1]+2*w*cross[1]+t[1],2*dot*u[2]+(w*w-uu)*v[2]+2*w*cross[2]+t[2]];
}
function makeObj(g) {
  const lines=["# Exported locally by Model Resource Exporter"];
  for(const p of g.positions) lines.push(`v ${p[0]} ${p[1]} ${p[2]}`);
  for(const f of g.faces) lines.push(`f ${f[0]+1} ${f[1]+1} ${f[2]+1}`);
  return new TextEncoder().encode(lines.join("\n")+"\n");
}
function makeStl(g) {
  const out=new ArrayBuffer(84+g.faces.length*50), dv=new DataView(out);
  new TextEncoder().encodeInto("Model Resource Exporter",new Uint8Array(out,0,80)); dv.setUint32(80,g.faces.length,true);
  let o=84;
  for(const f of g.faces) {
    const a=g.positions[f[0]],b=g.positions[f[1]],c=g.positions[f[2]], u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]], d=Math.hypot(...n)||1; n=n.map(x=>x/d);
    for(const x of [...n,...a,...b,...c]) { dv.setFloat32(o,x,true); o+=4; } dv.setUint16(o,0,true); o+=2;
  }
  return out;
}

loadResources();
