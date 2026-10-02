// เรียก Pixel Lab MCP (https://api.pixellab.ai/mcp) ผ่าน HTTP เพื่อเจนหรือเจนแอสเซตซ้ำ
//
// ต้องตั้ง PIXELLAB_API_TOKEN ใน .env (ถูก ignore แล้ว ห้ามใส่ token ในโค้ด)
//
//   npm run pixellab -- list                      รายชื่อเครื่องมือ
//   npm run pixellab -- call <tool> '<json>'      เรียกเครื่องมือด้วย arguments ที่ให้
//   npm run pixellab -- gen <ASSET-ID>            เรียกเครื่องมือเจนของแอสเซตนั้นด้วย arguments ใน assets-manifest.json
//   npm run pixellab -- fetch <ASSET-ID> <id>     ดึงผลที่เจนเสร็จแล้วลง assets-src/pixellab/<ASSET-ID>/ (ไม่ใช้เครดิต)
//   npm run pixellab -- make <ASSET-ID> [...]     gen + รอ + (แอนิเมชัน) + fetch ทีละชิ้น ข้ามชิ้นที่มีต้นฉบับแล้ว
//   npm run pixellab -- describe <tool>           คำอธิบายและ schema ของเครื่องมือ
//
// ลำดับงานต่อชิ้น: gen -> รอจนเสร็จ -> fetch -> เปิดดูภาพใน assets-src/pixellab/<ASSET-ID>/ -> npm run assets:build
// fetch เขียน source.json (เครื่องมือ arguments และ id ที่ใช้เจน) ซึ่ง assets:build นำไปลง assets-manifest.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const URL_MCP = "https://api.pixellab.ai/mcp";
const MANIFEST = new URL("../public/assets/assets-manifest.json", import.meta.url);

function authHeader() {
  const token = (process.env.PIXELLAB_API_TOKEN ?? "").trim();
  if (!token) {
    console.error("ไม่พบ PIXELLAB_API_TOKEN (ใส่ในไฟล์ .env ตามตัวอย่างใน .env.example)");
    process.exit(1);
  }
  return /^bearer /i.test(token) ? token : `Bearer ${token}`;
}

let session;

async function rpc(payload, authorize) {
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (authorize) headers.Authorization = authHeader();
  if (session) headers["Mcp-Session-Id"] = session;
  const res = await fetch(URL_MCP, { method: "POST", headers, body: JSON.stringify(payload) });
  session = res.headers.get("mcp-session-id") ?? session;
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  // คำตอบเป็น JSON ตรง ๆ หรือ SSE (บรรทัด "data: {...}")
  const messages = body.trimStart().startsWith("{")
    ? [JSON.parse(body)]
    : body.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5)));
  return messages.find((m) => m.id === payload.id);
}

async function callTool(name, args, quiet = false) {
  const reply = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }, true);
  if (!reply || reply.error) throw new Error(`เรียก ${name} ไม่สำเร็จ: ${JSON.stringify(reply?.error ?? reply)}`);
  const texts = [];
  for (const part of reply.result.content ?? []) {
    // รูปที่ส่งกลับเป็น base64 ไม่พิมพ์ทั้งก้อน
    const line = part.type === "text" ? part.text : `[${part.type} ${part.mimeType ?? ""} ${part.data?.length ?? 0} bytes base64]`;
    if (part.type === "text") texts.push(part.text);
    if (!quiet) console.log(line);
  }
  if (reply.result.isError) {
    if (quiet) throw new Error(texts.join("\n").slice(0, 400));
    process.exit(1);
  }
  return texts.join("\n");
}

const findAsset = (id) => {
  const asset = JSON.parse(readFileSync(MANIFEST, "utf8")).assets.find((a) => a.id === id);
  if (!asset) {
    console.error(`ไม่พบแอสเซต ${id} ใน assets-manifest.json`);
    process.exit(1);
  }
  return asset;
};

async function download(url, file, authorize) {
  const res = await fetch(url, authorize ? { headers: { Authorization: authHeader() } } : {});
  if (!res.ok) throw new Error(`ดาวน์โหลด ${url} ไม่สำเร็จ: HTTP ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`  บันทึก ${file}`);
}

/** ดึงไฟล์ผลลัพธ์ตามชนิดเครื่องมือ: ตัวละคร = ภาพรายทิศ, ไทล์เซต = แผ่นไทล์ + metadata, ภาพเดี่ยว = image.png (พี่บิต = south.png) */
async function fetchAsset(asset, pixellabId) {
  const dir = new URL(`../assets-src/pixellab/${asset.id}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  const out = (name) => new URL(name, dir).pathname;
  const tool = asset.pixellab.fetchTool;
  if (tool === "get_character") {
    const text = await callTool(tool, { character_id: pixellabId, include_preview: false }, true);
    if (!/^status: completed/m.test(text)) throw new Error(`ยังไม่เสร็จ:\n${text.split("\n").slice(0, 3).join("\n")}`);
    const [rotations, animations = ""] = text.split(/^animations \(/m);
    for (const [, direction, url] of rotations.matchAll(/^\s+(south|north|east|west): (https\S+)/gm)) await download(url, out(`${direction}.png`), false);
    // แอนิเมชัน: หัวกลุ่มขึ้นต้นด้วยชื่อ (เช่น "walk — 4 dir ...") ตามด้วยบรรทัดละทิศ เป็นรายการ URL ของเฟรมคั่นด้วยจุลภาค
    let group = null;
    for (const line of animations.split("\n")) {
      const head = line.match(/^\s{2}(\S+) — /);
      if (head) group = head[1];
      const frames = line.match(/^\s{4}(south|north|east|west): (https.+)$/);
      if (!group || !frames) continue;
      mkdirSync(new URL(`${group}/`, dir), { recursive: true });
      const urls = frames[2].split(",").map((url) => url.trim()).filter(Boolean);
      for (const [index, url] of urls.entries()) await download(url, out(`${group}/${frames[1]}_${index}.png`), false);
    }
  } else if (tool === "get_topdown_tileset") {
    const text = await callTool(tool, { tileset_id: pixellabId }, true);
    if (!/^status: completed/m.test(text)) throw new Error(`ยังไม่เสร็จ:\n${text.split("\n").slice(0, 3).join("\n")}`);
    await download(`${URL_MCP}/tilesets/${pixellabId}/image?inline=true`, out("tileset.png"), true);
    await download(`${URL_MCP}/tilesets/${pixellabId}/metadata`, out("metadata.json"), true);
  } else if (tool === "get_image") {
    const text = await callTool(tool, { job_id: pixellabId }, true);
    if (!/^status: completed/m.test(text)) throw new Error(`ยังไม่เสร็จ:\n${text.split("\n").slice(0, 3).join("\n")}`);
    await download(`${URL_MCP}/images/${pixellabId}/download`, out(asset.kind === "sprite" ? "south.png" : "image.png"), true);
  } else {
    throw new Error(`ยังไม่รองรับการดึงผลของ ${tool}`);
  }
  // เก็บ rejected และ postprocess ที่บันทึกไว้ด้วยมือ ถ้า id เดิม
  const sourceFile = out("source.json");
  const previous = existsSync(sourceFile) ? JSON.parse(readFileSync(sourceFile, "utf8")) : {};
  const source = {
    ...(previous.id === pixellabId ? previous : { rejected: previous.rejected }),
    tool: asset.pixellab.tool,
    arguments: asset.pixellab.arguments,
    fetchTool: tool,
    ...(asset.pixellab.animate ? { animate: asset.pixellab.animate } : {}),
    id: pixellabId,
    generatedAt: previous.id === pixellabId ? previous.generatedAt : new Date().toISOString(),
  };
  writeFileSync(sourceFile, `${JSON.stringify(source, null, 2)}\n`);
  console.log(`  บันทึก ${sourceFile}`);
}

const [command, target, json] = process.argv.slice(2);

if (command === "list") {
  const reply = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, false);
  for (const tool of reply.result.tools) console.log(tool.name, "-", (tool.description ?? "").trim().split("\n")[0].slice(0, 110));
} else if (command === "describe" && target) {
  const reply = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, false);
  const tool = reply.result.tools.find((t) => t.name === target);
  console.log(tool ? `${tool.description}\n\n${JSON.stringify(tool.inputSchema, null, 1)}` : `ไม่พบเครื่องมือ ${target}`);
} else if (command === "call" && target) {
  await callTool(target, json ? JSON.parse(json) : {});
} else if (command === "gen" && target) {
  const asset = findAsset(target);
  console.log(`${asset.id} ${asset.name} -> ${asset.pixellab.tool}`);
  await callTool(asset.pixellab.tool, asset.pixellab.arguments);
} else if (command === "make" && target) {
  // เจน รอจนเสร็จ (รวมแอนิเมชันถ้าแอสเซตกำหนดไว้) แล้วดึงผล ทำทีละชิ้นตามรายการที่ให้ ข้ามชิ้นที่มี source.json แล้ว
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const statusOf = async (asset, id) => {
    const tool = asset.pixellab.fetchTool;
    const key = tool === "get_character" ? "character_id" : tool === "get_topdown_tileset" ? "tileset_id" : "job_id";
    return callTool(tool, { [key]: id, ...(tool === "get_character" ? { include_preview: false } : {}) }, true);
  };
  const waitFor = async (asset, id, done) => {
    for (let attempt = 0; attempt < 90; attempt++) {
      const text = await statusOf(asset, id);
      if (/^status: failed/m.test(text)) throw new Error(`${asset.id}: เจนไม่สำเร็จ\n${text.split("\n").slice(0, 4).join("\n")}`);
      if (done(text)) return;
      await sleep(8000);
    }
    throw new Error(`${asset.id}: รอนานเกินไป (id ${id})`);
  };
  for (const assetId of process.argv.slice(3)) {
    const asset = findAsset(assetId);
    if (existsSync(new URL(`../assets-src/pixellab/${asset.id}/source.json`, import.meta.url))) {
      console.log(`${asset.id}: มีต้นฉบับแล้ว ข้าม`);
      continue;
    }
    console.log(`${asset.id} ${asset.name} -> ${asset.pixellab.tool}`);
    // ชิ้นที่ล้มเหลวไม่หยุดชิ้นถัดไป รันคำสั่งเดิมซ้ำได้ (ชิ้นที่เสร็จแล้วถูกข้าม)
    try {
      const reply = await callTool(asset.pixellab.tool, asset.pixellab.arguments, true);
      const id = reply.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
      if (!id) throw new Error(`หา id ในคำตอบไม่พบ\n${reply}`);
      console.log(`  id ${id}`);
      await waitFor(asset, id, (text) => /^status: completed/m.test(text));
      if (asset.pixellab.animate) {
        await callTool("animate_character", { character_id: id, ...asset.pixellab.animate }, true);
        await waitFor(asset, id, (text) => /^animations \(/m.test(text) && !/^pending jobs/m.test(text));
      }
      await fetchAsset(asset, id);
    } catch (error) {
      console.error(`  ✗ ${asset.id}: ${error.message}`);
    }
  }
} else if (command === "fetch" && target && json) {
  const asset = findAsset(target);
  console.log(`${asset.id} ${asset.name} <- ${asset.pixellab.fetchTool} ${json}`);
  await fetchAsset(asset, json);
} else {
  console.error("ใช้: npm run pixellab -- list | describe <tool> | call <tool> '<json>' | gen <ASSET-ID> | fetch <ASSET-ID> <pixellab-id> | make <ASSET-ID> [...]");
  process.exit(1);
}
